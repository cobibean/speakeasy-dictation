// Node-API keeps this bridge independent of Electron's V8 ABI. All AX handles
// stay in main; no field contents are read, retained, or sent to the renderer.
#include <node_api.h>
#include <ApplicationServices/ApplicationServices.h>
#include <Carbon/Carbon.h>
#include <stdlib.h>
#include <stdbool.h>
#import <AppKit/AppKit.h>

static const char *failure_reason = "none";

// Some ordinary custom editors do not expose AXFocusedUIElement even though
// their first responder accepts Command-V. In that case retain the app/window
// and require no intervening keyboard/click input, rather than guessing a field or activating
// an app. Counters contain no key codes, text, coordinates, or event contents.
// Pointer movement, scrolling (including momentum), and releasing the hold key
// need not move the insertion point. Function-key auto-repeat is conservatively refused.
static const CGEventType navigation_events[] = {
  kCGEventKeyDown, kCGEventLeftMouseDown, kCGEventRightMouseDown, kCGEventOtherMouseDown,
  kCGEventLeftMouseUp, kCGEventRightMouseUp, kCGEventOtherMouseUp,
  kCGEventLeftMouseDragged, kCGEventRightMouseDragged, kCGEventOtherMouseDragged
};
#define NAVIGATION_EVENT_COUNT (sizeof(navigation_events) / sizeof(navigation_events[0]))

typedef struct {
  AXUIElementRef app, window, field;
  pid_t pid;
  CFRange selection;
  bool has_selection;
  uint32_t input_counts[NAVIGATION_EVENT_COUNT];
} PasteTarget;

static void snapshot_input(PasteTarget *target) {
  for (size_t i = 0; i < NAVIGATION_EVENT_COUNT; i++)
    target->input_counts[i] = CGEventSourceCounterForEventType(kCGEventSourceStateCombinedSessionState, navigation_events[i]);
}

static const char *input_change_reason(const PasteTarget *target) {
  for (size_t i = 0; i < NAVIGATION_EVENT_COUNT; i++)
    if (target->input_counts[i] != CGEventSourceCounterForEventType(kCGEventSourceStateCombinedSessionState, navigation_events[i]))
      return navigation_events[i] == kCGEventKeyDown ? "keyboard-input" : "pointer-input";
  return NULL;
}

static bool foreground_matches(pid_t expected) {
  // NSWorkspace's foreground property is updated by its run loop. A switch can
  // happen during synchronous AX work, before that cache catches up. Use the
  // process manager only as a fresh, content-free safety check before posting.
  ProcessSerialNumber front;
  pid_t pid = 0;
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  OSStatus status = GetFrontProcess(&front);
  if (status == noErr) status = GetProcessPID(&front, &pid);
#pragma clang diagnostic pop
  return status == noErr && pid == expected;
}

static void release_target(PasteTarget *target) {
  if (!target) return;
  if (target->app) CFRelease(target->app);
  if (target->window) CFRelease(target->window);
  if (target->field) CFRelease(target->field);
  free(target);
}

static void finalize_target(napi_env env, void *data, void *hint) {
  (void)env; (void)hint;
  release_target(data);
}

static AXUIElementRef copy_element(AXUIElementRef element, CFStringRef attribute, AXError *error) {
  CFTypeRef value = NULL;
  *error = AXUIElementCopyAttributeValue(element, attribute, &value);
  if (*error != kAXErrorSuccess) {
    if (value) CFRelease(value);
    return NULL;
  }
  if (!value || CFGetTypeID(value) != AXUIElementGetTypeID()) {
    if (value) CFRelease(value);
    return NULL;
  }
  return (AXUIElementRef)value;
}

static bool read_selection(AXUIElementRef field, CFRange *selection) {
  CFTypeRef value = NULL;
  bool valid = AXUIElementCopyAttributeValue(field, kAXSelectedTextRangeAttribute, &value) == kAXErrorSuccess
    && value && CFGetTypeID(value) == AXValueGetTypeID()
    && AXValueGetType((AXValueRef)value) == kAXValueCFRangeType
    && AXValueGetValue((AXValueRef)value, kAXValueCFRangeType, selection);
  if (value) CFRelease(value);
  return valid;
}

static bool editable_field(AXUIElementRef field) {
  CFTypeRef role = NULL, subrole = NULL;
  bool supported = AXUIElementCopyAttributeValue(field, kAXRoleAttribute, &role) == kAXErrorSuccess
    && role && (CFEqual(role, kAXTextAreaRole) || CFEqual(role, kAXTextFieldRole) || CFEqual(role, kAXComboBoxRole));
  AXUIElementCopyAttributeValue(field, kAXSubroleAttribute, &subrole);
  if (subrole && CFEqual(subrole, kAXSecureTextFieldSubrole)) supported = false;
  if (role) CFRelease(role);
  if (subrole) CFRelease(subrole);
  Boolean settable = false;
  return supported && AXUIElementIsAttributeSettable(field, kAXValueAttribute, &settable) == kAXErrorSuccess && settable;
}

static PasteTarget *capture_target(void) {
  failure_reason = "none";
  if (!AXIsProcessTrusted()) { failure_reason = "accessibility-unavailable"; return NULL; }
  if (IsSecureEventInputEnabled()) { failure_reason = "secure-input"; return NULL; }
  PasteTarget *target = calloc(1, sizeof(PasteTarget));
  if (!target) { failure_reason = "allocation-failed"; return NULL; }
  snapshot_input(target);
  // System-wide AXFocusedApplication can fail while the app's AX tree is healthy.
  // Resolve its foreground PID through AppKit, retaining field/selection checks.
  @autoreleasepool {
    target->pid = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
  }
  if (target->pid <= 0) { failure_reason = "frontmost-unavailable"; goto invalid; }
  target->app = AXUIElementCreateApplication(target->pid);
  if (!target->app) { failure_reason = "allocation-failed"; goto invalid; }
  AXUIElementSetMessagingTimeout(target->app, 0.15f);
  AXError window_error, field_error;
  target->window = copy_element(target->app, kAXFocusedWindowAttribute, &window_error);
  target->field = copy_element(target->app, kAXFocusedUIElementAttribute, &field_error);
  if (!target->window) { failure_reason = "window-unavailable"; goto invalid; }
  if (target->field) {
    if (!editable_field(target->field)) { failure_reason = "field-not-editable"; goto invalid; }
    target->has_selection = read_selection(target->field, &target->selection);
  } else {
    // Only genuinely absent metadata qualifies. Never turn an AX timeout,
    // permission error, malformed value, or known noneditable field into paste.
    if (field_error != kAXErrorNoValue && field_error != kAXErrorAttributeUnsupported) {
      failure_reason = "field-unavailable"; goto invalid;
    }
    const char *input_reason = input_change_reason(target);
    if (input_reason) { failure_reason = input_reason; goto invalid; }
  }
  if (!foreground_matches(target->pid)) {
    failure_reason = "app-changed"; goto invalid;
  }
  return target;
invalid:
  release_target(target);
  return NULL;
}

static napi_value capture(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  PasteTarget *target = capture_target();
  if (!target) { napi_get_null(env, &result); return result; }
  if (napi_create_external(env, target, finalize_target, NULL, &result) != napi_ok) {
    release_target(target);
    napi_throw_error(env, NULL, "Unable to retain paste target.");
    return NULL;
  }
  return result;
}

static napi_value paste(napi_env env, napi_callback_info info) {
  napi_value argument, result;
  size_t count = 1;
  PasteTarget *target = NULL;
  bool delivered = false;
  failure_reason = "target-unavailable";
  napi_get_cb_info(env, info, &count, &argument, NULL, NULL);
  if (count != 1 || napi_get_value_external(env, argument, (void **)&target) != napi_ok || !target) goto done;
  PasteTarget *current = capture_target();
  if (!current) goto done;
  // Keep refusal categories content-free so a support log can distinguish a
  // real target change from input or metadata changes without reading any text.
  const char *mismatch = NULL;
  if (current->pid != target->pid || !CFEqual(current->app, target->app)) mismatch = "app-changed";
  else if (!CFEqual(current->window, target->window)) mismatch = "window-changed";
  else if ((target->field == NULL) != (current->field == NULL)) mismatch = "field-metadata-changed";
  else if (target->field) {
    if (!CFEqual(current->field, target->field)) mismatch = "field-changed";
    else if (target->has_selection && (!current->has_selection
      || current->selection.location != target->selection.location
      || current->selection.length != target->selection.length)) mismatch = "selection-changed";
  } else mismatch = input_change_reason(target);
  release_target(current);
  CGEventFlags modifiers = CGEventSourceFlagsState(kCGEventSourceStateHIDSystemState)
    & (kCGEventFlagMaskCommand | kCGEventFlagMaskShift | kCGEventFlagMaskControl | kCGEventFlagMaskAlternate | kCGEventFlagMaskSecondaryFn);
  if (mismatch) { failure_reason = mismatch; goto done; }
  if (modifiers) { failure_reason = "modifier-held"; goto done; }
  failure_reason = "allocation-failed";
  CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStatePrivate);
  if (!source) goto done;
  CGEventRef events[4] = {
    CGEventCreateKeyboardEvent(source, 55, true),
    CGEventCreateKeyboardEvent(source, 9, true),
    CGEventCreateKeyboardEvent(source, 9, false),
    CGEventCreateKeyboardEvent(source, 55, false)
  };
  CFRelease(source);
  bool allocated = events[0] && events[1] && events[2] && events[3];
  // Recheck as close to posting as possible; AX calls and allocation take time.
  const char *late_mismatch = !foreground_matches(target->pid) ? "app-changed"
    : !target->field ? input_change_reason(target) : NULL;
  if (allocated && late_mismatch) {
    allocated = false;
    failure_reason = late_mismatch;
  }
  if (allocated) {
    // Address only the original process; never activate it or post to the new
    // foreground app if focus changes in the gap after AX validation.
    for (int i = 0; i < 4; i++) {
      CGEventSetFlags(events[i], i == 3 ? 0 : kCGEventFlagMaskCommand);
      CGEventPostToPid(target->pid, events[i]);
    }
    delivered = true;
    failure_reason = "none";
  }
  for (int i = 0; i < 4; i++) if (events[i]) CFRelease(events[i]);
done:
  // This reports event submission only. Workflow acceptance proves insertion.
  napi_get_boolean(env, delivered, &result);
  return result;
}

static napi_value failureReason(napi_env env, napi_callback_info info) {
  (void)info;
  napi_value result;
  napi_create_string_utf8(env, failure_reason, NAPI_AUTO_LENGTH, &result);
  return result;
}

static napi_value initialize(napi_env env, napi_value exports) {
  napi_property_descriptor methods[] = {
    {"capture", NULL, capture, NULL, NULL, NULL, napi_default, NULL},
    {"paste", NULL, paste, NULL, NULL, NULL, napi_default, NULL},
    {"failureReason", NULL, failureReason, NULL, NULL, NULL, napi_default, NULL}
  };
  napi_define_properties(env, exports, 3, methods);
  return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, initialize)
