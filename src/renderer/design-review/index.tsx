import { workflowPresetSettings } from '../../shared/workflow-presets';
import { createRoot } from 'react-dom/client';
import { createEmptyRuntimeState } from '../overlay/App';
import type { OverlayStatus, SpeakeasyAPI, SpeakeasySettings, WidgetEdge } from '../../shared/types';
import { normalizeWidgetThemeId, WIDGET_THEME_OPTIONS } from '../../shared/widget-themes';
import { isWidgetSizeId, WIDGET_SIZE_OPTIONS } from '../../shared/widget-sizes';
import { measureRenderedContrast } from './contrast';

// This entry is bundled only for mac-staging and runs without Electron preload.
// Every effect is in memory; the native review session rejects network/media.
const query = new URLSearchParams(location.search);
const reactRoot = createRoot(document.getElementById('root')!);
let disposeInspection = () => {};
if (import.meta.hot) import.meta.hot.dispose(() => { disposeInspection(); reactRoot.unmount(); });
const surface = query.get('surface') ?? 'settings';
const edge = (query.get('edge') ?? 'right') as WidgetEdge;
let status = (query.get('status') ?? 'idle') as OverlayStatus;
const statusListeners = new Set<(status: OverlayStatus) => void>();
const embedded = query.get('embed') === '1';
if (embedded) document.documentElement.dataset.reviewEmbed = surface;
document.documentElement.dataset.reviewEdge = edge;
document.documentElement.dataset.reviewBackdrop = query.get('backdrop') === 'dark' ? 'dark' : 'light';
const state = createEmptyRuntimeState();
Object.assign(state, { edition: 'product', releaseChannel: 'preview',
  capabilities: { byoApiKey: false, productAuth: true, hostedUsage: true, autoUpdate: true } });
Object.assign(state.platform, { operatingSystem: 'macos', architecture: 'arm64', distribution: 'mac-direct', packaged: true });
Object.assign(state.auth, { status: query.get('auth') === 'out' ? 'signed-out' : 'signed-in', email: 'alex@example.com', message: '' });
Object.assign(state.usage, { status: 'ready', plan: 'free', remainingSuccessfulDictations: 4, hardLimitSuccessfulDictations: 5, resetAt: '2026-09-07T00:00:00Z' });
Object.assign(state.billing, { status: 'active', plan: 'free', message: 'Your current allowance is shown above.' });
Object.assign(state.updater, { status: query.get('update') === 'available' ? 'available' : 'idle', availableVersion: '0.1.35', message: 'Sample update state. No download occurs in this review.' });
if (query.get('edition') === 'oss') {
  state.edition = 'oss';
  Object.assign(state.capabilities, { byoApiKey: true, productAuth: false, hostedUsage: false, autoUpdate: false });
}
const statsParam = query.get('stats');
if (statsParam) {
  const [dictations, words] = statsParam.split(':').map(Number);
  if (Number.isFinite(dictations) && dictations > 0 && Number.isFinite(words)) {
    Object.assign(state.dictationStats, {
      totalDictations: dictations, totalWords: words,
      firstDictationAt: '2026-09-11T00:00:00Z', lastDictationAt: '2026-09-14T00:00:00Z'
    });
  }
}
Object.assign(state.diagnostics, { appName: 'speakeasy (staging)', appVersion: '0.1.34',
  edition: 'product', releaseChannel: 'preview', hotkeyMode: 'push-to-hold', microphonePermission: 'granted',
  accessibilityPermission: 'granted', signedIn: state.auth.status === 'signed-in',
  lastErrorCode: query.get('error') ?? 'none' });
if (query.get('fallback') === '1') state.diagnostics.lastCleanupOutcome = 'timeout';
const size = query.get('size');
const opacity = Number(query.get('opacity') ?? 90);
let settings: SpeakeasySettings = {
  dictationSounds: true, groqApiKey: '', productAuthEmail: 'alex@example.com', polishBeforePaste: true,
  cleanupStrength: 'minimal', hotkey: 'right-option', widgetForm: 'pill',
  widgetSize: isWidgetSizeId(size) ? size : 'small', widgetTheme: normalizeWidgetThemeId(query.get('theme')),
  showWidgetOverFullScreenApps: true,
  widgetOpacity: Number.isFinite(opacity) ? Math.min(100, Math.max(35, opacity)) : 90, widgetPosition: { x: 0, y: 0 }
};
const listeners = new Set<(settings: SpeakeasySettings) => void>();
const noop = () => () => {};
const notice = (message: string) => { document.getElementById('review-notice')!.textContent = message; };
const sampleOnly = async () => notice('Sample action only — no external request was made.');
const onboardingState = () => ({
  auth: { secureStorageAvailable: true, secureStorageStatus: 'ready', signedInEmail: '',
    pendingEmail: query.get('previewAuth') === 'pending' ? 'alex@example.com' : '', pendingStatus: query.get('previewAuth') === 'pending' ? 'email_sent' : 'none',
    transactionId: '', expiresAt: '', message: 'Offline sample. No email is sent.' },
  setup: { destination: 'onboarding', earliestIncompleteStep: 2, reason: 'account-required' },
  server: null, mode: 'first-run',
  device: { microphoneStatus: 'unknown', accessibilityStatus: 'missing', operatingSystem: 'macos', hotkeyId: settings.hotkey, hotkeyVerified: false },
  canClose: false, requestedStep: null
});
window.speakeasy = new Proxy({
  designReview: true,
  getSettings: async () => ({ ...settings }),
  getRuntimeState: async () => state,
  getHostedOnboardingState: async () => onboardingState(),
  resumeHostedOnboardingAuth: async () => onboardingState(),
  completeOnboardingWelcome: async () => onboardingState(),
  setSettings: async (key: keyof SpeakeasySettings, value: never) => {
    if ((document.getElementById('fail-save') as HTMLInputElement)?.checked) throw Error('Simulated save failure');
    settings = { ...settings, [key]: value };
    listeners.forEach(fn => fn({ ...settings }));
  },
  applyWorkflowPreset: async (id: string) => {
    if ((document.getElementById('fail-save') as HTMLInputElement)?.checked) throw Error('Simulated save failure');
    settings = { ...settings, ...workflowPresetSettings(id) };
    listeners.forEach(fn => fn({ ...settings }));
  },
  onSettingsChanged: (callback: (settings: SpeakeasySettings) => void) => {
    listeners.add(callback); return () => listeners.delete(callback);
  },
  onOverlayAttachmentChanged: (callback: (value: { edge: WidgetEdge; offset: number }) => void) => {
    queueMicrotask(() => callback({ edge, offset: .42 })); return () => {};
  },
  onStatusUpdate: (callback: (value: OverlayStatus) => void) => {
    statusListeners.add(callback);
    queueMicrotask(() => callback(status)); return () => { statusListeners.delete(callback); };
  },
  onOpenPanel: (callback: (category?: 'help') => void) => {
    if (surface === 'settings') queueMicrotask(() => callback(query.get('category') === 'help' ? 'help' : undefined));
    const openHelp = () => callback('help');
    window.addEventListener('review-open-help', openHelp);
    return () => window.removeEventListener('review-open-help', openHelp);
  },
  setOverlayLayout: async (layout: { width: number; height: number }) => {
    const root = document.getElementById('root')!;
    root.style.width = layout.width + 'px'; root.style.height = layout.height + 'px';
  },
  quitApp: sampleOnly,
  debugLog: () => {},
}, {
  get(target, key) {
    if (key in target) return Reflect.get(target, key);
    return String(key).startsWith('on') ? noop : sampleOnly;
  }
}) as unknown as SpeakeasyAPI;

function picker(label: string, key: string, options: string[][], selected: string) {
  const item = document.createElement('label'); item.textContent = label + ' ';
  const select = document.createElement('select'); select.setAttribute('aria-label', label);
  for (const [value, text] of options) select.add(new Option(text, value, false, selected === value));
  select.onchange = () => {
    const params = new URLSearchParams(location.search); params.set(key, select.value);
    params.set('previewPlatform', 'macos');
    if (key === 'status') {
      status = select.value as OverlayStatus;
      history.replaceState({}, '', '?' + params);
      statusListeners.forEach(listener => listener(status));
    } else {
      location.search = params.toString();
    }
  };
  item.append(select); document.getElementById('review-tools')!.append(item);
}
document.getElementById('review-tools')!.innerHTML = '<strong>Offline design review · sample data</strong><span id="review-notice">No account, billing, audio or provider requests.</span>';
const inspect = document.createElement('button');
inspect.textContent = 'Inspect layout';
inspect.onclick = async () => {
  await document.fonts.ready;
  const visible = (element: HTMLElement) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const details = [...document.querySelectorAll<HTMLElement>('#root .spine-settings-trigger, #root .spine-status-label, #root .hud-control-title, #root .hud-control-caption, #root .hud-save-button, #root .chapter-rail li, #root .primary-button')]
    .filter(visible).map(el => ({ text: el.textContent?.trim() || el.getAttribute('aria-label'),
      width: Math.round(el.getBoundingClientRect().width), height: Math.round(el.getBoundingClientRect().height),
      font: getComputedStyle(el).fontFamily, px: getComputedStyle(el).fontSize, color: getComputedStyle(el).color,
      background: getComputedStyle(el).backgroundColor }));
  let output = document.getElementById('layout-report');
  if (!output) { output = document.createElement('pre'); output.id = 'layout-report'; document.getElementById('review-tools')!.append(output); }
  output.textContent = JSON.stringify({ viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, details }, null, 2);
  inspect.textContent = 'Refresh layout inspection';
};
document.getElementById('review-tools')!.append(inspect);
picker('Surface', 'surface', [['settings', 'Settings'], ['widget', 'Widget'], ['onboarding', 'Onboarding']], surface);
  const label = document.createElement('label'); label.innerHTML = '<input id="fail-save" type="checkbox"> Simulate save failure';
  document.getElementById('review-tools')!.append(label);
if (surface === 'onboarding') {
  picker('Setup step', 'previewStep', Array.from({length: 11}, (_, i) => [String(i+1), String(i+1)]), query.get('previewStep') ?? '1');
  picker('Practice', 'previewPractice', [['', 'Empty'], ['confirmed', 'Complete'], ['pending', 'Pending']], query.get('previewPractice') ?? '');
  picker('Microphone', 'previewMic', [['unknown', 'Not requested'], ['granted', 'Granted'], ['denied', 'Denied'], ['unavailable', 'Unavailable']], query.get('previewMic') ?? 'unknown');
  picker('Auth', 'previewAuth', [['', 'Signed out'], ['pending', 'Link sent'], ['failed', 'Failed'], ['storage-error', 'Storage unavailable']], query.get('previewAuth') ?? '');
  if (!query.has('previewStep')) {
    query.set('previewStep', '1'); query.set('previewPlatform', 'macos');
    history.replaceState({}, '', '?' + query);
  }
  await import('../onboarding/styles.css');
  const { default: App } = await import('../onboarding/App');
  reactRoot.render(<App />);
} else {
  picker('Edge', 'edge', [['right', 'Right'], ['left', 'Left'], ['top', 'Top']], edge);
  picker('Status', 'status', ['idle', 'listening', 'transcribing', 'polishing', 'microphone-denied', 'microphone-unavailable', 'error'].map(x => [x, x]), status);
  picker('Account', 'auth', [['in', 'Signed in'], ['out', 'Signed out']], query.get('auth') ?? 'in');
  picker('Theme', 'theme', WIDGET_THEME_OPTIONS.map(x => [x.id, x.label]), settings.widgetTheme);
  picker('Size', 'size', WIDGET_SIZE_OPTIONS.map(x => [x.id, x.label]), settings.widgetSize);
  await import('../overlay/styles.css');
  const { default: App } = await import('../overlay/App');
  reactRoot.render(<App />);
}
await import('./review.css');

// Inspect the actual mounted renderer. No duplicated runtime palette lives here.
// The lab receives resolved colors after React applies settings and CSS settles.
if (embedded && document.documentElement) {
  let lastReport = '';
  let categoryOpened = false;
  const report = () => {
    const root = document.querySelector<HTMLElement>('.hud-root');
    const trigger = document.querySelector<HTMLElement>('.spine-settings-trigger');
    if (!root || !trigger) return;
    if (!categoryOpened && query.get('category') === 'appearance') {
      const button = [...document.querySelectorAll<HTMLButtonElement>('.quiet-settings-nav button')]
        .find(button => button.textContent === 'Appearance');
      if (button) { categoryOpened = true; button.click(); }
    }
    const css = getComputedStyle(root);
    const color = (selector: string, property: 'color' | 'backgroundColor') => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element)[property] : null;
    };
    const data = {
      type: 'speakeasy-theme-report', theme: document.documentElement.dataset.widgetTheme,
      background: getComputedStyle(trigger).backgroundColor, foreground: getComputedStyle(trigger).color,
      accent: css.getPropertyValue('--spine-widget-accent').trim(),
      bookmark: color('.spine-bookmark', 'backgroundColor'),
      settingsBackground: color('.spine-settings-sheet', 'backgroundColor'),
      settingsText: color('.quiet-settings', 'color'),
      captionBackground: color('.spine-status-label', 'backgroundColor'),
      captionText: color('.spine-status-label', 'color'),
      statusText: document.querySelector('.spine-status-label')?.textContent,
      pip: color('.spine-state-pip', 'backgroundColor'),
      status: document.querySelector('.cursor-spine-widget')?.getAttribute('data-status'),
      contrast: measureRenderedContrast()
    };
    const serialized = JSON.stringify(data);
    if (serialized !== lastReport) { lastReport = serialized; parent.postMessage(data, location.origin); }
  };
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; report(); });
  });
  observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
  // A theme switch can transition control colors after the DOM mutation report.
  // Refresh once those colors settle instead of leaving intermediate ratios visible.
  document.addEventListener('transitionend', report);
  document.addEventListener('transitioncancel', report);
  disposeInspection = () => {
    observer.disconnect();
    document.removeEventListener('transitionend', report);
    document.removeEventListener('transitioncancel', report);
  };
  await document.fonts.ready;
  requestAnimationFrame(report);
}
