import { createRecordingFeedback, prepareRecordingSounds, playRecordingCue } from '../recording-feedback';
import { WORKFLOW_PRESETS, getWorkflowPreset } from '../../shared/workflow-presets';
import { cleanupFallbackMessage, type CleanupOutcome } from '../../shared/cleanup-outcome';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { CheckIcon, SpeakerLoudIcon, KeyboardIcon } from '@radix-ui/react-icons';
import { createCaptureId } from '../../shared/latency';
import {
  getHotkeyLabelForPlatform,
  getHotkeyOptionsForPlatform
} from '../../shared/hotkeys';
import {
  choosePracticeAttemptAllowance,
  practiceAttemptUsesGrant,
  type PracticeAttemptAllowance
} from '../../shared/practice-allowance';
import { CURRENT_HOSTED_PROCESSING_CONSENT_VERSION } from '../../shared/setup-bootstrap';
import {
  formatUsageRemaining,
  formatUsageReset
} from '../../shared/billing-presentation';
import type {
  HostedOnboardingState,
  OverlayStatus,
  OnboardingPracticeCaptureResult
} from '../../shared/types';
import {
  getPreferredMimeType,
  RECORDER_TIMESLICE_MS,
  stopRecorderWithFinalData
} from '../overlay/audio-capture';
import { MAX_CAPTURE_DURATION_MS } from '../../shared/capture-policy';
import { toHostedOnboardingErrorMessage } from './error-message';
import { confirmPracticePaste } from './practice-paste';
import {
  shouldConfirmHostedAuth,
  shouldRetryRecoveryHotkey
} from './state-transitions';
import {
  BrandLockup,
  EdgeBookmark,
  Keycap,
  StatusGlyph,
  Waveform
} from './components/BrandPrimitives';
import speakeasySymbol from '../assets/brand/symbol-color.svg';
import groqBadge from '../assets/brand/groq-powered-light.svg';
import { PlanPicker, type SelectedPlan } from '../ui/PlanPicker';
import {
  getPlatformSetupSteps,
  toCanonicalSetupStep,
  toVisibleSetupStep
} from './platform-steps';

const CHAPTERS = ['Welcome', 'Trust', 'Configure', 'Practice', 'Ready'] as const;
const WELCOME_SAVE_MESSAGE = 'Setup progress saves automatically.';

type SetupNoticeTone = 'neutral' | 'progress' | 'success' | 'error';

type SetupNotice = {
  step: number;
  message: string;
  tone: SetupNoticeTone;
};

const PREVIEW_QUERY = import.meta.env.DEV || window.speakeasy?.designReview === true
  ? new URLSearchParams(window.location.search)
  : null;
const PREVIEW_STEP = PREVIEW_QUERY
  ? (() => {
      const value = Number(PREVIEW_QUERY.get('previewStep'));
      return Number.isInteger(value) && value >= 1 && value <= 11 ? value : null;
    })()
  : null;
const PREVIEW_STATUS = PREVIEW_QUERY?.get('previewStatus') as OverlayStatus | null;
const PREVIEW_MODE = PREVIEW_QUERY?.get('previewMode');
const PREVIEW_MICROPHONE = PREVIEW_QUERY?.get('previewMic');
const PREVIEW_PRACTICE = PREVIEW_QUERY?.get('previewPractice');
const PREVIEW_AUTH = PREVIEW_QUERY?.get('previewAuth');
const STEP_COPY = [
  null,
  {
    title: 'Your voice, in your words.',
    lede: 'Hold your key, speak naturally, and release. Dictate into ordinary editable fields, with clipboard recovery when needed.'
  },
  {
    title: 'Start with your email.',
    lede: 'We’ll send a secure link to create your account or sign you in. No password needed.'
  },
  {
    title: 'Your voice is processed, not kept.',
    lede: 'Review the hosted path before speakeasy. ever receives your voice.'
  },
  {
    title: 'Let speakeasy. hear you.',
    lede: 'Windows will ask for microphone access. Audio is captured only while you hold your key.'
  },
  {
    title: 'Choose your push-to-talk key.',
    lede: 'Right Alt is the Windows default and stays out of the way while you work.'
  },
  {
    title: 'Make sure your key feels right.',
    lede: ''
  },
  {
    title: 'Try it once.',
    lede: ''
  },
  {
    title: 'Send your first message.',
    lede: ''
  },
  {
    title: 'You’re ready to speak anywhere.',
    lede: ''
  }
] as const;

const MAC_STEP_COPY = [
  null,
  STEP_COPY[1],
  STEP_COPY[2],
  STEP_COPY[3],
  {
    title: 'Let speakeasy. hear you.',
    lede: 'macOS will ask for microphone access. Audio is captured only while you hold your key.'
  },
  {
    title: 'Let your key reach speakeasy.',
    lede: 'Accessibility lets speakeasy. detect Right Option while you work in another app.'
  },
  {
    title: 'Choose your push-to-talk key.',
    lede: 'Right Option is the Mac default and stays out of the way while you work.'
  },
  STEP_COPY[6],
  STEP_COPY[7],
  {
    title: 'Try it once.',
    lede: 'Hold your key, speak, then release. Your words will appear in the practice field.'
  },
  { title: 'Choose your plan.', lede: 'Keep going for free, or choose more dictation time. You can change your plan later.' },
  STEP_COPY[9]
] as const;

const emptyState: HostedOnboardingState = {
  auth: {
    secureStorageAvailable: true,
    secureStorageStatus: 'ready',
    signedInEmail: '',
    pendingEmail: '',
    pendingStatus: 'none',
    transactionId: '',
    expiresAt: '',
    message: 'Sign in with email.'
  },
  setup: {
    destination: 'onboarding',
    earliestIncompleteStep: 1,
    reason: 'account-required'
  },
  server: null,
  mode: 'first-run',
  device: {
    microphoneStatus: 'unknown',
    accessibilityStatus: 'not-required',
    operatingSystem: 'windows',
    hotkeyId: 'right-option',
    hotkeyVerified: false
  },
  canClose: false,
  requestedStep: null
};

const createInitialState = (): HostedOnboardingState => ({
  ...emptyState,
  auth: {
    ...emptyState.auth,
    secureStorageAvailable: PREVIEW_AUTH !== 'storage-error',
    secureStorageStatus: PREVIEW_AUTH === 'storage-error' ? 'unavailable' : 'ready',
    pendingEmail: PREVIEW_AUTH === 'pending' ? 'you@example.com' : '',
    pendingStatus: PREVIEW_AUTH === 'pending' ? 'email_sent' : PREVIEW_AUTH === 'failed' ? 'failed' : 'none',
    transactionId: PREVIEW_AUTH === 'pending' ? 'preview-transaction' : '',
    message: PREVIEW_AUTH === 'pending' ? 'Secure link sent. This screen will update when sign-in finishes.' : emptyState.auth.message
  },
  mode: PREVIEW_MODE === 'review' || PREVIEW_MODE === 'recovery'
    ? PREVIEW_MODE
    : 'first-run',
  requestedStep: PREVIEW_MODE === 'recovery' ? PREVIEW_STEP : null,
  device: {
    ...emptyState.device,
    operatingSystem: PREVIEW_QUERY?.get('previewPlatform') === 'macos' ? 'macos' : emptyState.device.operatingSystem,
    accessibilityStatus: PREVIEW_QUERY?.get('previewAccessibility') === 'granted' ? 'granted' : 'missing',
    microphoneStatus: PREVIEW_MICROPHONE === 'granted' ||
      PREVIEW_MICROPHONE === 'denied' ||
      PREVIEW_MICROPHONE === 'unavailable'
      ? PREVIEW_MICROPHONE
      : 'unknown'
  }
});

const chapterIndexForStep = (step: number, hotkeyVerification: number, nativePasteProof: number): number => {
  if (step <= 2) return 0;
  if (step === 3) return 1;
  if (step <= hotkeyVerification) return 2;
  if (step <= nativePasteProof) return 3;
  return 4;
};


const App = (): JSX.Element => {
  const [state, setState] = useState<HostedOnboardingState>(createInitialState);
  const [workflowPreset, setWorkflowPreset] = useState('keep');
  const [loading, setLoading] = useState(PREVIEW_STEP === null);
  const [step, setStep] = useState(PREVIEW_STEP ?? 1);
  const [email, setEmail] = useState('');
  const [selectedHotkey, setSelectedHotkey] = useState('right-option');
  const [busy, setBusy] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<'standard' | 'pro' | null>(null);
  const [openingPlan, setOpeningPlan] = useState<SelectedPlan | null>(null);
  const [error, setError] = useState(PREVIEW_QUERY?.get('previewError') === 'true' ? 'This step could not finish. Your completed setup is safe.' : '');
  const [status, setStatus] = useState<OverlayStatus>(PREVIEW_STATUS ?? 'idle');
  const [statusNotice, setStatusNotice] = useState<SetupNotice | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hotkeyHeld, setHotkeyHeld] = useState(PREVIEW_QUERY?.get('previewHotkey') === 'held');
  const [hotkeyVerified, setHotkeyVerified] = useState(PREVIEW_QUERY?.get('previewHotkey') === 'verified');
  const [practiceCleanupOutcome, setPracticeCleanupOutcome] = useState<CleanupOutcome>();
  const [practiceText, setPracticeText] = useState(PREVIEW_PRACTICE === 'confirmed' || PREVIEW_PRACTICE === 'pending' ? 'I’ll send the notes after lunch.' : '');
  const [practiceSuccessful, setPracticeSuccessful] = useState(PREVIEW_PRACTICE === 'confirmed');
  const [practiceAttemptAllowance, setPracticeAttemptAllowance] =
    useState<PracticeAttemptAllowance | null>(null);
  const [pendingOperationId, setPendingOperationId] = useState(PREVIEW_PRACTICE === 'pending' ? 'preview-operation' : '');
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const helpButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const helpPanelRef = useRef<HTMLElement | null>(null);
  const practiceFieldRef = useRef<HTMLTextAreaElement | null>(null);
  const soundsEnabledRef = useRef(true);
  useEffect(() => {
    void window.speakeasy?.getSettings().then(settings => { soundsEnabledRef.current = settings.dictationSounds !== false; });
    return window.speakeasy?.onSettingsChanged(settings => { soundsEnabledRef.current = settings.dictationSounds !== false; });
  }, []);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const captureStartedAtRef = useRef(0);
  const releaseRequestedRef = useRef(false);
  const deadlineRef = useRef<number | null>(null);
  const stepRef = useRef(step);
  const checkoutPlanRef = useRef(checkoutPlan);
  const confirmingPlanRef = useRef(false);
  checkoutPlanRef.current = checkoutPlan;
  stepRef.current = step;

  const showStatus = (
    message: string,
    tone: SetupNoticeTone = 'progress',
    targetStep = stepRef.current
  ) => {
    setStatusNotice({ step: targetStep, message, tone });
  };

  const activeNotice: SetupNotice | null = error
    ? { step, message: error, tone: 'error' }
    : statusNotice?.step === step
      ? statusNotice
      : step === 1
        ? { step: 1, message: WELCOME_SAVE_MESSAGE, tone: 'neutral' }
        : null;

  const platform = state.device.operatingSystem;
  const platformSteps = getPlatformSetupSteps(platform);
  const isMac = platform === 'macos';
  const stepCount = platformSteps.ready;
  const chapterIndex = chapterIndexForStep(step, platformSteps.hotkeyVerification, platformSteps.nativePasteProof);
  const copy = (isMac ? MAC_STEP_COPY[step] : STEP_COPY[step]) ?? STEP_COPY[1]!;
  const hotkeyLabel = getHotkeyLabelForPlatform(selectedHotkey, isMac ? 'darwin' : 'win32');
  const serverSetup = state.server?.accountDeviceSetup;
  const completedSteps = serverSetup?.completedSteps ?? [];
  const pendingAuth = ['created', 'email_sent', 'callback_received'].includes(
    state.auth.pendingStatus
  );
  const terminalAuth = ['expired', 'canceled', 'superseded', 'failed'].includes(
    state.auth.pendingStatus
  );
  const practiceGrantStatus = state.server?.practiceGrant.status;
  const activeAttemptUsesGrant = practiceAttemptUsesGrant({
    attemptAllowance: practiceAttemptAllowance,
    grantStatus: practiceGrantStatus,
    preview: PREVIEW_STEP !== null
  });
  const practiceBlocked = !activeAttemptUsesGrant && PREVIEW_STEP === null;

  const applyState = (
    next: HostedOnboardingState,
    syncStep = true
  ): HostedOnboardingState => {
    const canonicalStep = next.requestedStep ?? next.setup.earliestIncompleteStep ?? 9;
    const mappedStep = toVisibleSetupStep({
      canonicalStep,
      platform: next.device.operatingSystem,
      accessibilityReady: next.device.accessibilityStatus === 'granted'
    });
    const steps = getPlatformSetupSteps(next.device.operatingSystem);
    const resolvedStep = mappedStep === steps.planSelection && next.mode === 'first-run' &&
      next.server?.billing.plan && next.server.billing.plan !== 'free' ? steps.ready : mappedStep;
    setState(next);
    setEmail((value) => value || next.auth.pendingEmail || next.auth.signedInEmail);
    setSelectedHotkey(next.device.hotkeyId || 'right-option');
    setHotkeyVerified(next.device.hotkeyVerified);
    if (shouldConfirmHostedAuth(syncStep, stepRef.current, Boolean(next.server))) {
      showStatus('Sign-in confirmed. Review hosted processing before continuing.', 'success', resolvedStep);
    } else if (stepRef.current === 2 && next.auth.message) {
      showStatus(next.auth.message, 'progress', 2);
    }
    if (syncStep) {
      setStep(resolvedStep);
    }
    return next;
  };

  const refresh = async (exchange = false, syncStep = true) => {
    if (!window.speakeasy) return state;
    try {
      const next = exchange
        ? await window.speakeasy.resumeHostedOnboardingAuth()
        : await window.speakeasy.getHostedOnboardingState();
      setError('');
      return applyState(next, syncStep);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (PREVIEW_STEP !== null) return;
    void refresh().catch((nextError) => {
      setLoading(false);
      setError(toHostedOnboardingErrorMessage(nextError, 'Unable to load setup.'));
    });
    const unsubscribeWake = window.speakeasy?.onOnboardingProtocolWake(() => {
      void refresh(true).catch((nextError) => {
        setError(toHostedOnboardingErrorMessage(nextError, 'Unable to recover sign-in.'));
      });
    });
    return unsubscribeWake;
  }, []);

  useEffect(() => {
    if (!pendingAuth) return;
    const interval = window.setInterval(() => {
      void refresh(true).catch((nextError) => {
        setError(toHostedOnboardingErrorMessage(nextError, 'Unable to recover sign-in.'));
      });
    }, 3000);
    return () => window.clearInterval(interval);
  }, [pendingAuth, state.auth.transactionId]);

  useEffect(() => window.speakeasy?.onRuntimeStateChanged((runtime) => {
    if (stepRef.current !== getPlatformSetupSteps(runtime.platform.operatingSystem).planSelection) return;
    const requested = checkoutPlanRef.current;
    if (requested && !confirmingPlanRef.current && runtime.billing.plan === requested && runtime.billing.status === 'active') {
      // Refresh itself broadcasts runtime state. Keep that broadcast from
      // recursively starting another bootstrap while this one is in flight.
      confirmingPlanRef.current = true;
      void refresh(false, false).then(() => {
        checkoutPlanRef.current = null;
        setCheckoutPlan(null);
        setStep(getPlatformSetupSteps(runtime.platform.operatingSystem).ready);
      }).catch(() => setError('Your plan could not be refreshed. Check again.'))
        .finally(() => { confirmingPlanRef.current = false; });
    } else if (requested && runtime.billing.status !== 'confirming' && runtime.billing.message) {
      checkoutPlanRef.current = null;
      setCheckoutPlan(null);
      showStatus(runtime.billing.message, 'neutral');
    }
  }), []);

  useEffect(() => {
    headingRef.current?.focus();
    setHelpOpen(false);
    setError('');
  }, [step]);

  useEffect(() => {
    const mode = step === platformSteps.hotkeyVerification
      ? 'verification'
      : step === platformSteps.nativePasteProof
        ? 'practice'
        : 'inactive';
    void window.speakeasy?.setOnboardingHotkeyMode(mode);
  }, [step, platformSteps.hotkeyVerification, platformSteps.nativePasteProof]);

  useEffect(() => {
    const unsubscribeDown = window.speakeasy?.onOnboardingHotkeyDown(() => {
      setHotkeyHeld(true);
      showStatus(`${hotkeyLabel} is held. Release it to finish the check.`, 'progress', platformSteps.hotkeyVerification);
    });
    const unsubscribeUp = window.speakeasy?.onOnboardingHotkeyUp(() => {
      setHotkeyHeld(false);
    });
    const unsubscribeVerified = window.speakeasy?.onOnboardingHotkeyVerified(() => {
      setHotkeyHeld(false);
      setHotkeyVerified(true);
      showStatus(`${hotkeyLabel} works. Continue when you’re ready.`, 'success', platformSteps.hotkeyVerification);
      void refresh(false, false);
    });
    return () => {
      unsubscribeDown?.();
      unsubscribeUp?.();
      unsubscribeVerified?.();
    };
  }, [hotkeyLabel, platformSteps.hotkeyVerification]);

  useEffect(() => {
    const unsubscribeStart = window.speakeasy?.onRecordingStart(() => {
      if (step === platformSteps.nativePasteProof) void startPracticeCapture();
    });
    const unsubscribeStop = window.speakeasy?.onRecordingStop(() => {
      if (step === platformSteps.nativePasteProof) stopPracticeCapture();
    });
    const unsubscribeStatus = window.speakeasy?.onStatusUpdate((next) => {
      if (step === platformSteps.nativePasteProof) setStatus(next);
    });
    return () => {
      unsubscribeStart?.();
      unsubscribeStop?.();
      unsubscribeStatus?.();
    };
  }, [step, practiceBlocked, practiceSuccessful, platformSteps.nativePasteProof]);

  useEffect(() => () => {
    if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const finishPracticeInsertion = async (result: OnboardingPracticeCaptureResult) => {
    const field = practiceFieldRef.current;
    if (!field || !result.text.trim()) {
      await window.speakeasy?.acknowledgeOnboardingPractice(result.operationId, 'paste_failed');
      throw new Error('Practice did not produce text for the safe field.');
    }
    field.value = '';
    setPracticeText('');
    field.focus();
    let insertionConfirmed = false;
    try {
      if (isMac) {
        insertionConfirmed = await confirmPracticePaste(field, result.text, async () => {
          if (!window.speakeasy) throw new Error('Practice paste is unavailable.');
          await window.speakeasy.pasteOnboardingPractice(result.text);
        });
        setPracticeText(field.value);
      } else {
        field.value = result.text;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        setPracticeText(result.text);
        insertionConfirmed = field.value === result.text;
      }
    } catch (pasteError) {
      await window.speakeasy?.acknowledgeOnboardingPractice(result.operationId, 'paste_failed');
      throw pasteError;
    }
    if (!insertionConfirmed) {
      await window.speakeasy?.acknowledgeOnboardingPractice(result.operationId, 'paste_failed');
      throw new Error(
        isMac
          ? 'Automatic paste could not be confirmed in the practice field. Your text is on the clipboard; try Command+V, then try Practice again.'
          : 'Practice text could not be inserted.'
      );
    }
    setPendingOperationId(result.operationId);
    const next = await window.speakeasy?.acknowledgeOnboardingPractice(
      result.operationId,
      'pasted'
    );
    if (next) applyState(next, false);
    setPendingOperationId('');
    setError('');
    setPracticeSuccessful(true);
    setStatus('idle');
    showStatus('Your practice message is ready. Continue when you’re ready.', 'success', platformSteps.nativePasteProof);
  };

  const processPracticeBlob = async (blob: Blob, durationMs: number) => {
    if (!window.speakeasy || !blob.size) {
      setStatus('error');
      setError('No audio was captured. Hold the key a little longer and try again.');
      return;
    }
    try {
      setStatus('transcribing');
      setPracticeCleanupOutcome(undefined);
      showStatus('Transcribing your practice message…', 'progress', platformSteps.nativePasteProof);
      const result = await window.speakeasy.processOnboardingPractice({
        audioBuffer: await blob.arrayBuffer(),
        mimeType: blob.type || 'audio/webm',
        durationMs,
        captureId: createCaptureId(),
        normalAllowanceConfirmed: false
      });
      setPracticeCleanupOutcome(result.cleanupOutcome);
      await finishPracticeInsertion(result);
    } catch (nextError) {
      setStatus('error');
      setError(
        toHostedOnboardingErrorMessage(
          nextError,
          pendingOperationId
            ? 'Your words are in the field, but the practice result could not be saved. Try saving again—no new recording is needed.'
            : 'Practice stopped before your message was ready. Nothing will retry automatically.'
        )
      );
    }
  };

  const startPracticeCapture = async () => {
    if (recorderRef.current || busy || practiceBlocked || practiceSuccessful) return;
    if (practiceAttemptAllowance === null) {
      setPracticeAttemptAllowance(choosePracticeAttemptAllowance(
        practiceGrantStatus,
        PREVIEW_STEP !== null
      ));
    }
    if (soundsEnabledRef.current) prepareRecordingSounds();
    releaseRequestedRef.current = false;
    setError('');
    showStatus('Opening your microphone…', 'progress', platformSteps.nativePasteProof);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await window.speakeasy?.reportMicrophoneStatus('granted');
      if (releaseRequestedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        setStatus('idle');
        showStatus(`Hold ${hotkeyLabel} until you finish speaking.`, 'progress', platformSteps.nativePasteProof);
        return;
      }
      const preferred = getPreferredMimeType();
      const recorder = preferred
        ? new MediaRecorder(stream, { mimeType: preferred })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      captureStartedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      let interrupted = false;
      const feedback = createRecordingFeedback(playRecordingCue, () => soundsEnabledRef.current);
      recorder.onstart = () => { if (recorder.state === 'recording') feedback.started(); };
      recorder.onstop = () => {
        if (deadlineRef.current !== null) window.clearTimeout(deadlineRef.current);
        deadlineRef.current = null;
        const mimeType = recorder.mimeType || preferred || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const durationMs = Date.now() - captureStartedAtRef.current;
        chunksRef.current = [];
        recorderRef.current = null;
        streamRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        if (interrupted) { feedback.cancel(); return; }
        feedback.stopped();
        void processPracticeBlob(blob, durationMs);
      };
      const interrupt = () => {
        interrupted = true;
        feedback.cancel();
        setStatus('microphone-unavailable');
        setError('The microphone stopped responding. Reconnect it and try again.');
        if (recorder.state !== 'inactive') stopRecorderWithFinalData(recorder);
      };
      recorder.onerror = interrupt;
      stream.getAudioTracks().forEach(track => track.addEventListener('ended', interrupt, { once: true }));
      recorder.start(RECORDER_TIMESLICE_MS);
      setStatus('listening');
      showStatus(`Listening while ${hotkeyLabel} is held…`, 'progress', platformSteps.nativePasteProof);
      deadlineRef.current = window.setTimeout(() => {
        stopPracticeCapture();
      }, MAX_CAPTURE_DURATION_MS);
    } catch (nextError) {
      const denied = nextError instanceof DOMException &&
        ['NotAllowedError', 'SecurityError'].includes(nextError.name);
      await window.speakeasy?.reportMicrophoneStatus(denied ? 'denied' : 'unavailable');
      setStatus(denied ? 'microphone-denied' : 'microphone-unavailable');
      setError(
        denied
          ? `Microphone access is off. Open ${isMac ? 'System Settings' : 'Windows Settings'}, allow access, then try again.`
          : 'No working microphone is available.'
      );
    }
  };

  const stopPracticeCapture = () => {
    releaseRequestedRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      setStatus('transcribing');
      showStatus('Preparing your recording…', 'progress', platformSteps.nativePasteProof);
      stopRecorderWithFinalData(recorder);
    }
  };

  const retryPracticeAcknowledgment = async () => {
    if (!pendingOperationId || !window.speakeasy) return;
    setBusy(true);
    setError('');
    try {
      const next = await window.speakeasy.acknowledgeOnboardingPractice(
        pendingOperationId,
        'pasted'
      );
      applyState(next, false);
      setPendingOperationId('');
      setPracticeSuccessful(true);
      setStatus('idle');
      showStatus('Your practice message is ready. Continue when you’re ready.', 'success', platformSteps.nativePasteProof);
    } catch (nextError) {
      setError(toHostedOnboardingErrorMessage(nextError, 'The practice result still could not be saved. Try again or contact support.'));
    } finally {
      setBusy(false);
    }
  };

  const submitSignIn = async () => {
    if (!window.speakeasy || !email.trim()) return;
    setBusy(true);
    setError('');
    try {
      await window.speakeasy.requestMagicLinkSignIn({
        email: email.trim().toLowerCase()
      });
      await refresh();
      showStatus(`Link sent to ${email.trim().toLowerCase()}.`, 'progress', 2);
    } catch (nextError) {
      setError(toHostedOnboardingErrorMessage(nextError, 'Unable to send a sign-in link.'));
    } finally {
      setBusy(false);
    }
  };

  const resetLocalSignIn = async () => {
    if (!window.speakeasy) return;
    const confirmed = window.confirm(
      'Reset sign-in on this Mac?\n\nThis clears only unreadable local sign-in data. Your speakeasy. account, plan, usage, and other devices stay unchanged.'
    );
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      const next = await window.speakeasy.resetHostedLocalSignIn();
      applyState(next);
      setEmail('');
      showStatus('Local sign-in was reset. Request a new secure link.', 'success', 2);
    } catch (nextError) {
      setError(toHostedOnboardingErrorMessage(
        nextError,
        'Local sign-in could not be reset safely. Contact support.'
      ));
    } finally {
      setBusy(false);
    }
  };

  const requestMicrophone = async () => {
    if (!window.speakeasy) return;
    setBusy(true);
    setError('');
    try {
      await window.speakeasy.requestMicrophoneAccess();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      await window.speakeasy.reportMicrophoneStatus('granted');
      const next = state.mode === 'review'
        ? await window.speakeasy.getHostedOnboardingState()
        : await window.speakeasy.advanceHostedOnboarding(4);
      applyState(next, false);
      setStep(isMac ? platformSteps.accessibility! : platformSteps.hotkeyChoice);
      showStatus(
        'Microphone access confirmed on this device.',
        'success',
        isMac ? platformSteps.accessibility! : platformSteps.hotkeyChoice
      );
    } catch (nextError) {
      await window.speakeasy.reportMicrophoneStatus('denied');
      setError(`${isMac ? 'macOS' : 'Windows'} did not allow microphone access. Open System Settings, allow access, then try again.`);
      showStatus(toHostedOnboardingErrorMessage(nextError, 'Microphone access is required.'), 'progress', 4);
    } finally {
      setBusy(false);
    }
  };

  const requestAccessibility = async () => {
    if (!window.speakeasy || !isMac) return;
    setBusy(true);
    setError('');
    try {
      await window.speakeasy.requestAccessibilityAccess();
      const next = await window.speakeasy.getHostedOnboardingState();
      applyState(next, false);
      if (next.device.accessibilityStatus !== 'granted') {
        throw new Error('Accessibility access is still missing.');
      }
      if (
        state.mode === 'recovery' &&
        next.server?.accountDeviceSetup.completedSteps.includes(9)
      ) {
        await window.speakeasy.closeHostedOnboarding();
        return;
      }
      setStep(platformSteps.hotkeyChoice);
      showStatus('Accessibility access confirmed on this Mac.', 'success', platformSteps.hotkeyChoice);
    } catch (nextError) {
      setError(toHostedOnboardingErrorMessage(nextError, 'Accessibility access is required for hold-to-talk.'));
    } finally {
      setBusy(false);
    }
  };

  const saveHotkey = async () => {
    if (!window.speakeasy) return;
    setBusy(true);
    setError('');
    try {
      await window.speakeasy.setSettings('hotkey', selectedHotkey);
      const next = state.mode === 'review'
        ? await window.speakeasy.getHostedOnboardingState()
        : await window.speakeasy.advanceHostedOnboarding(5);
      applyState(next, false);
      setHotkeyVerified(false);
      setStep(platformSteps.hotkeyVerification);
      showStatus(`${hotkeyLabel} registered. Test the physical key now.`, 'success', platformSteps.hotkeyVerification);
    } catch (nextError) {
      setError(toHostedOnboardingErrorMessage(nextError, 'That hotkey could not be registered. Choose another key.'));
    } finally {
      setBusy(false);
    }
  };

  const alreadyComplete = (candidate: number): boolean => {
    if (state.mode === 'review') return [1, 2, 3].includes(candidate);
    if (candidate === 1) return Boolean(state.auth.signedInEmail || state.auth.pendingEmail);
    if (candidate === 2) return Boolean(state.server);
    if (candidate === 3) {
      return completedSteps.includes(3) &&
        state.server?.accountState.consentStatus === 'accepted' &&
        state.server.accountState.consentVersion === CURRENT_HOSTED_PROCESSING_CONSENT_VERSION;
    }
    if (candidate === 4) {
      return completedSteps.includes(4) && state.device.microphoneStatus === 'granted';
    }
    if (candidate === platformSteps.accessibility) {
      return state.device.accessibilityStatus === 'granted';
    }
    const canonicalCandidate = toCanonicalSetupStep(candidate, platform);
    if (canonicalCandidate === 5) {
      if (shouldRetryRecoveryHotkey(state.mode, state.requestedStep)) return false;
      return completedSteps.includes(5) && selectedHotkey === state.device.hotkeyId;
    }
    if (canonicalCandidate === 6) return state.device.hotkeyVerified;
    if (canonicalCandidate === 8) return practiceSuccessful || completedSteps.includes(8);
    return canonicalCandidate !== null && completedSteps.includes(canonicalCandidate);
  };

  const primaryAction = async () => {
    if (!window.speakeasy || busy) return;
    setBusy(true);
    setError('');
    try {
      if (state.mode === 'recovery' && step === 2 && state.server) {
        await window.speakeasy.closeHostedOnboarding();
        return;
      }
      if (alreadyComplete(step) && step < platformSteps.ready) {
        setStep(step + 1);
        return;
      }
      if (step === 1) {
        if (state.mode === 'review') {
          setStep(2);
        } else {
          applyState(await window.speakeasy.completeOnboardingWelcome(), false);
          setStep(2);
        }
      } else if (step === 2 && state.server) {
        setStep(3);
      } else if (step === 3) {
        const next = await window.speakeasy.acceptHostedProcessingConsent();
        applyState(next, false);
        setStep(4);
      } else if (step === 4) {
        await requestMicrophone();
      } else if (step === platformSteps.accessibility) {
        await requestAccessibility();
      } else if (step === platformSteps.hotkeyChoice) {
        await saveHotkey();
      } else if (step === platformSteps.hotkeyVerification && hotkeyVerified) {
        setStep(platformSteps.practiceCoaching);
      } else if (step === platformSteps.practiceCoaching) {
        const next = state.mode === 'review'
          ? await window.speakeasy.getHostedOnboardingState()
          : await window.speakeasy.advanceHostedOnboarding(7);
        applyState(next, false);
        setStep(platformSteps.nativePasteProof);
      } else if (step === platformSteps.nativePasteProof && practiceSuccessful) {
        setStep(platformSteps.planSelection ?? platformSteps.ready);
      } else if (step === platformSteps.planSelection) {
        setStep(platformSteps.ready);
      } else if (step === platformSteps.ready) {
        if (workflowPreset !== 'keep') {
          await window.speakeasy.applyWorkflowPreset(workflowPreset);
        }
        if (state.mode === 'review' || completedSteps.includes(9)) {
          await window.speakeasy.closeHostedOnboarding();
        } else {
          await window.speakeasy.advanceHostedOnboarding(9);
        }
      }
    } catch (nextError) {
      setError(toHostedOnboardingErrorMessage(nextError, 'This step could not be saved. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  const primaryDisabled = useMemo(() => {
    if (busy) return true;
    if (step === platformSteps.planSelection) return !state.server || state.server.billing.plan === 'free';
    if (step === 2) return !state.server;
    if (step === 4) return false;
    if (step === platformSteps.accessibility) return false;
    if (step === platformSteps.hotkeyChoice) return !selectedHotkey;
    if (step === platformSteps.hotkeyVerification) return !hotkeyVerified;
    if (step === platformSteps.nativePasteProof) {
      return !(practiceSuccessful || (state.mode !== 'review' && completedSteps.includes(8)));
    }
    return false;
  }, [busy, hotkeyVerified, practiceSuccessful, selectedHotkey, state.server, step]);

  useEffect(() => {
    if (helpOpen) helpCloseButtonRef.current?.focus();
  }, [helpOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    const panel = helpPanelRef.current;
    if (!panel) return;
    const onHelpKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        panel.querySelectorAll<HTMLElement>('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter((control) => !control.hasAttribute('disabled'));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    panel.addEventListener('keydown', onHelpKeyDown);
    return () => panel.removeEventListener('keydown', onHelpKeyDown);
  }, [helpOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && helpOpen) {
        event.preventDefault();
        setHelpOpen(false);
        helpButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Enter' || helpOpen || primaryDisabled) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest('button, a, input, select, textarea, [role="button"]')
      ) {
        return;
      }
      event.preventDefault();
      void primaryAction();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen, primaryDisabled, primaryAction]);

  const primaryLabel = step === 1
    ? state.mode === 'review' ? 'Review setup' : 'Get started'
    : step === 2
      ? 'Continue'
      : step === 3
        ? 'Agree and continue'
        : step === 4
          ? state.device.microphoneStatus === 'denied'
            ? 'Try again'
            : state.device.microphoneStatus === 'unavailable'
              ? 'Check microphone again'
              : 'Allow microphone'
          : step === platformSteps.accessibility
            ? state.device.accessibilityStatus === 'granted' ? 'Continue' : 'Allow Accessibility'
            : step === platformSteps.hotkeyChoice
              ? selectedHotkey === 'right-option' ? `Use ${isMac ? 'Right Option' : 'Right Alt'}` : 'Save hotkey'
            : step === platformSteps.practiceCoaching
              ? 'Practice now'
              : step === platformSteps.planSelection
                ? `Continue with ${state.server?.billing.plan === 'pro' ? 'Pro' : 'Standard'}`
              : step === platformSteps.ready
                ? state.mode === 'review' ? 'Finish review' : 'Start using speakeasy.'
                : 'Continue';

  const primaryBusyLabel = step === 3
    ? 'Saving consent…'
    : step === 4
      ? `Checking ${isMac ? 'macOS' : 'Windows'}…`
      : step === platformSteps.accessibility
        ? 'Checking Accessibility…'
      : step === platformSteps.hotkeyChoice
        ? 'Registering key…'
        : step === platformSteps.ready
          ? 'Finishing setup…'
          : 'Saving…';

  const unlockCopy = step === 2
    ? 'Continue unlocks after secure sign-in completes.'
    : step === platformSteps.hotkeyVerification
      ? `Continue unlocks after one complete ${hotkeyLabel} press and release.`
    : step === platformSteps.nativePasteProof
        ? 'Continue unlocks when your practice message is ready.'
        : '';

  const selectPlan = async (plan: SelectedPlan) => {
    if (plan === 'free') {
      setCheckoutPlan(null);
      setStep(platformSteps.ready);
      return;
    }
    if (openingPlan || checkoutPlan) return;
    setOpeningPlan(plan);
    setError('');
    try {
      await window.speakeasy?.openCheckout(plan);
      setCheckoutPlan(plan);
      showStatus('Finish checkout in your browser, then return here. Your setup is saved.', 'progress');
    } catch {
      setError('Checkout could not open. Try again, or continue with Free.');
    } finally {
      setOpeningPlan(null);
    }
  };

  const renderTask = () => {
    if (step === platformSteps.planSelection) {
      const currentPlan = state.server?.billing.plan ?? 'free';
      if (currentPlan !== 'free') return (
        <div className="ready-summary">
          <h2>You’re on {currentPlan === 'pro' ? 'Pro' : 'Standard'}.</h2>
          <p>{state.server?.usage ? formatUsageRemaining(state.server.usage) : 'Your paid plan is active.'}</p>
          <p>You can change your plan in Account & billing whenever you need to.</p>
        </div>
      );
      return <>
        <PlanPicker onSelect={(plan) => void selectPlan(plan)} busyPlan={openingPlan} disabled={checkoutPlan !== null} />
        {checkoutPlan ? <div className="help-actions">
          <button type="button" className="secondary-button" disabled={busy} onClick={() => {
            setBusy(true);
            void window.speakeasy?.refreshBilling().then(() => refresh(false, false))
              .then(next => { if (next?.server?.billing.plan === checkoutPlan) { setCheckoutPlan(null); setStep(platformSteps.ready); } })
              .catch(() => setError('Your payment could not be confirmed yet. You can check again or continue with Free.'))
              .finally(() => setBusy(false));
          }}>Check payment</button>
          <button type="button" className="text-button" onClick={() => void selectPlan('free')}>Continue with Free for now</button>
        </div> : null}
      </>;
    }
    if (step === 1) {
      return (
        <div className="welcome-proof">
          <p className="welcome-example">A clear thought, ready to send.</p>
          <div className="three-beat" aria-label="Hold, speak, release">
            <div><span>01</span><strong>Hold</strong><small>Your chosen key</small></div>
            <div><span>02</span><strong>Speak</strong><small>In any app</small></div>
            <div><span>03</span><strong>Release</strong><small>Finished text lands</small></div>
          </div>
        </div>
      );
    }
    if (step === 2) {
      return (
        <form className="task-form" onSubmit={(event) => { event.preventDefault(); void submitSignIn(); }}>
          {state.server ? (
            <div className="result-card" role="status" data-tone="success">
              <StatusGlyph kind="success" />
              <div><strong>Signed in</strong><span>{state.server.email}</span></div>
            </div>
          ) : (
            <>
              {!state.auth.secureStorageAvailable ? (
                <div className="inline-notice" data-tone="error" role="alert">
                  <StatusGlyph kind="error" />
                  <div>
                    <strong>
                      {state.auth.secureStorageStatus === 'corrupt'
                        ? 'Local sign-in data cannot be read'
                        : 'speakeasy. cannot save a secure session'}
                    </strong>
                    <span>
                      {state.auth.secureStorageStatus === 'corrupt'
                        ? 'This problem is limited to this Mac. Reset local sign-in, then request a new secure link.'
                        : 'Make sure your login Keychain is unlocked, then restart speakeasy. once. If this message returns, contact support.'}
                    </span>
                    {state.auth.secureStorageStatus === 'corrupt' ? (
                      <button className="inline-link notice-action" type="button" disabled={busy} onClick={() => void resetLocalSignIn()}>
                        Reset local sign-in
                      </button>
                    ) : null}
                    {state.auth.secureStorageStatus === 'unavailable' ? (
                      <>
                        <button
                          className="inline-link notice-action"
                          type="button"
                          disabled={busy}
                          onClick={() => void window.speakeasy?.getHostedOnboardingState().then((next) => applyState(next, false))}
                        >
                          Retry secure storage
                        </button>
                        <button className="inline-link notice-action" type="button" onClick={() => void window.speakeasy?.restartSpeakeasy()}>
                          Restart speakeasy.
                        </button>
                      </>
                    ) : null}
                    <button className="inline-link notice-action" type="button" onClick={() => void window.speakeasy?.openOnboardingSupport()}>
                      Contact support
                    </button>
                  </div>
                </div>
              ) : null}
              {terminalAuth ? (
                <div className="inline-notice" data-tone="error" role="alert">
                  <StatusGlyph kind="error" />
                  <div>
                    <strong>
                      {state.auth.pendingStatus === 'expired'
                        ? 'That link expired'
                        : state.auth.pendingStatus === 'superseded'
                          ? 'A newer link replaced this one'
                          : state.auth.pendingStatus === 'canceled'
                            ? 'Sign-in was canceled'
                            : 'Sign-in could not finish'}
                    </strong>
                    <span>{state.auth.message || 'Request a fresh secure link to continue.'}</span>
                  </div>
                </div>
              ) : null}
              <label htmlFor="auth-email">Email address</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                value={email}
                disabled={busy || !state.auth.secureStorageAvailable}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button className="primary-button full-button" type="submit" disabled={busy || !email.trim() || !state.auth.secureStorageAvailable}>
                {busy ? 'Sending securely…' : pendingAuth ? 'Resend secure link' : 'Email me a secure link'}
              </button>
              {pendingAuth ? (
                <div className="pending-auth" role="status">
                  <StatusGlyph />
                  <div>
                    <strong>{state.auth.pendingStatus === 'callback_received' ? 'Finishing secure sign-in' : 'Check your inbox'}</strong>
                    <span>{state.auth.message || `We sent a one-time link to ${state.auth.pendingEmail || email}.`}</span>
                  </div>
                  <button
                    className="inline-link"
                    type="button"
                    onClick={() => void window.speakeasy?.cancelHostedOnboardingAuth().then((next) => applyState(next, false))}
                  >
                    Use a different email
                  </button>
                </div>
              ) : null}
            </>
          )}
        </form>
      );
    }
    if (step === 3) {
      return (
        <div className="trust-card">
          <div className="processing-path" aria-label="Audio processing path: your device, speakeasy., Groq">
            <div><StatusGlyph kind="success" /><span>Your device</span></div>
            <span aria-hidden="true">→</span>
            <div><img className="path-speakeasy-logo" src={speakeasySymbol} alt="" aria-hidden="true" /><span>speakeasy.</span></div>
            <span aria-hidden="true">→</span>
            <div><img className="path-groq-logo" src={groqBadge} alt="Powered by Groq" /></div>
          </div>
          <div className="trust-copy">
            <p>Audio travels through speakeasy.’s hosted service to Groq for transcription. If Polish is on, the transcript goes to Groq once more for cleanup.</p>
            <p className="trust-promise"><strong>Audio, transcripts, and generated text are processed, not stored.</strong> Groq is configured not to retain inference audio or text.</p>
            <p>speakeasy. keeps only the minimal account, consent, usage, and billing records needed to run the service.</p>
          </div>
          <button className="inline-link trust-link" type="button" onClick={() => void window.speakeasy?.openOnboardingPrivacy()}>
            Privacy &amp; terms
          </button>
        </div>
      );
    }
    if (step === 4) {
      const denied = state.device.microphoneStatus === 'denied' || status === 'microphone-denied';
      const unavailable = state.device.microphoneStatus === 'unavailable' || status === 'microphone-unavailable';
      return (
        <div className="device-proof" data-state={denied ? 'denied' : unavailable ? 'unavailable' : state.device.microphoneStatus}>
          <div className="permission-orbit"><SpeakerLoudIcon width={32} height={32} aria-hidden="true" /></div>
          <h2>{denied ? 'Microphone access is off' : unavailable ? 'No microphone responded' : state.device.microphoneStatus === 'granted' ? 'Microphone ready' : 'Microphone access'}</h2>
          <p>{denied ? `Allow speakeasy. to use your microphone in ${isMac ? 'System Settings' : 'Windows Settings'}, then return here.` : unavailable ? 'Connect or enable a microphone, then try this check again.' : 'speakeasy. listens only between your physical key press and release.'}</p>
          {denied ? (
            <>
              <button className="secondary-button" type="button" onClick={() => void window.speakeasy?.openMicrophonePrivacySettings()}>
                Open {isMac ? 'System Settings' : 'Windows Settings'}
              </button>
              {isMac ? (
                <button className="inline-link notice-action" type="button" onClick={() => void window.speakeasy?.restartSpeakeasy()}>
                  Restart speakeasy.
                </button>
              ) : null}
            </>
          ) : unavailable ? <p className="device-detail">Permission and working hardware are checked separately.</p> : null}
          <div className="permission-fact"><StatusGlyph kind={state.device.microphoneStatus === 'granted' ? 'success' : 'progress'} /><span>Audio is never captured during this permission check.</span></div>
        </div>
      );
    }
    if (step === platformSteps.accessibility) {
      const granted = state.device.accessibilityStatus === 'granted';
      return (
        <div className="device-proof" data-state={granted ? 'granted' : 'missing'}>
          <div className="permission-orbit"><KeyboardIcon width={32} height={32} aria-hidden="true" /></div>
          <h2>{granted ? 'Accessibility ready' : 'Accessibility access'}</h2>
          <p>speakeasy. uses Accessibility only to detect your hold-to-talk key while another app has focus.</p>
          {!granted ? (
            <>
              <button className="secondary-button" type="button" onClick={() => void window.speakeasy?.openAccessibilityPrivacySettings()}>
                Open System Settings
              </button>
              <button className="inline-link notice-action" type="button" onClick={() => void window.speakeasy?.restartSpeakeasy()}>
                Restart speakeasy.
              </button>
            </>
          ) : null}
          <div className="permission-fact"><StatusGlyph kind={granted ? 'success' : 'progress'} /><span>No audio is captured during this check.</span></div>
        </div>
      );
    }
    if (step === platformSteps.hotkeyChoice) {
      return (
        <div className="hotkey-layout">
          <div className="hotkey-picker">
            <label htmlFor="hotkey-choice">Push-to-talk key</label>
            <select
              id="hotkey-choice"
              value={selectedHotkey}
              onChange={(event) => setSelectedHotkey(event.target.value)}
            >
              {getHotkeyOptionsForPlatform(platform).map((option) => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </select>
            <div className="key-preview"><Keycap label={hotkeyLabel} held={false} /></div>
            <p>Registration is checked before this choice is saved.</p>
          </div>
          <div className="positioning-lesson" aria-label="The speakeasy. bookmark snaps to the left, right, or top physical display edge, never the bottom">
            <div className="mini-display">
              <div className="mini-app"><span /><span /><span /></div>
              <div className="position-guide" aria-hidden="true"><span>left</span><span>top</span><span>right</span><span>never bottom</span></div>
              <EdgeBookmark />
            </div>
            <div>
              <strong>Move it where it stays out of your way.</strong>
              <span>Drag along the left or right edge, or across the top. Drop near an edge to snap. It never snaps to the bottom.</span>
            </div>
          </div>
        </div>
      );
    }
    if (step === platformSteps.hotkeyVerification) {
      return (
        <div className="verification-proof" data-state={hotkeyVerified ? 'verified' : hotkeyHeld ? 'held' : 'waiting'} role="status" aria-label={`Hotkey verification: ${hotkeyVerified ? 'complete' : hotkeyHeld ? 'held' : 'waiting'}`}>
          <div className="verification-key"><Keycap label={hotkeyLabel} held={hotkeyHeld} /></div>
          <div className="verification-line" aria-hidden="true"><span /></div>
          <div>
            <strong>{hotkeyVerified ? 'Key verified' : hotkeyHeld ? 'Now release' : `Hold ${hotkeyLabel}`}</strong>
            <span>No audio is captured or uploaded during this check.</span>
          </div>
        </div>
      );
    }
    if (step === platformSteps.practiceCoaching) {
      return (
        <div className="practice-coaching">
          <div className="practice-gesture" aria-hidden="true">
            <div className="practice-key"><Keycap label={hotkeyLabel} held={false} /></div>
            <div className="practice-signal"><Waveform active={false} /></div>
            <span className="cursor-resolution">|<i>.</i></span>
          </div>
          <ol className="practice-steps">
            <li><span>01</span><div><strong>Focus</strong><small>The safe field on the next screen</small></div></li>
            <li><span>02</span><div><strong>Hold and speak</strong><small>{hotkeyLabel}, then your message</small></div></li>
            <li><span>03</span><div><strong>Release</strong><small>Finished text is inserted directly</small></div></li>
          </ol>
          <p className="quiet-note"><strong>Practice now</strong> only arms the field. Recording begins when you hold the real key.</p>
        </div>
      );
    }
    if (step === platformSteps.nativePasteProof) {
      const active = ['listening', 'transcribing', 'polishing'].includes(status);
      const processing = ['transcribing', 'polishing'].includes(status);
      const failed = status === 'error' || status === 'microphone-denied' || status === 'microphone-unavailable';
      const practiceState = practiceSuccessful
        ? 'complete'
        : pendingOperationId
          ? 'confirmation'
          : failed
            ? 'error'
            : status;
      const completedPracticeText = practiceText.trim();
      const completedPracticeBody = completedPracticeText.replace(/[.!?]+$/, '');
      const completedPracticeEnd = completedPracticeText.match(/[.!?]+$/)?.[0] ?? '.';
      return (
        <div className="practice-stage" data-practice-state={practiceState}>
          <div className="practice-field-heading">
            <label htmlFor="practice-field">Practice message</label>
            <span aria-hidden="true">Hold · speak · release</span>
          </div>
          <div className="practice-composer">
            <div className="practice-editor">
              <textarea
                ref={practiceFieldRef}
                id="practice-field"
                rows={5}
                value={practiceText}
                onChange={(event) => setPracticeText(event.target.value)}
                placeholder="Your first speakeasy. dictation will appear here."
              />
              <span className="signal-flight" aria-hidden="true" />
              {practiceSuccessful ? (
                <p className="practice-final-copy" aria-hidden="true">
                  {completedPracticeBody}<span>{completedPracticeEnd}</span>
                </p>
              ) : null}
            </div>
            <div className="practice-listening-rail" aria-hidden="true">
              <EdgeBookmark active={status === 'listening'} processing={processing} complete={practiceSuccessful} />
              <div className="speech-ribbon"><Waveform active={active} /></div>
            </div>
          </div>
          <div className="composer-status" role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
            <StatusGlyph kind={practiceSuccessful ? 'success' : failed ? 'error' : 'progress'} />
            {error || (status === 'listening'
              ? `Listening — release ${hotkeyLabel} when finished`
              : status === 'transcribing'
                ? 'Transcribing your words…'
                : status === 'polishing'
                  ? 'Polishing the final sentence…'
                  : pendingOperationId
                    ? 'Saving your practice result…'
                    : practiceSuccessful
                      ? cleanupFallbackMessage(practiceCleanupOutcome) || 'Practice message ready'
                      : status === 'microphone-denied'
                        ? 'Microphone access is off'
                        : status === 'microphone-unavailable'
                          ? 'No working microphone is available'
                          : status === 'error'
                            ? 'Practice stopped safely — focus the field and try again'
                            : `Focus this field, then hold ${hotkeyLabel}`)}
          </div>
          <div className="allowance-note" data-warning={practiceBlocked}>
            {practiceBlocked
              ? 'On-the-house Practice is temporarily unavailable. Your normal plan allowance will not be used.'
              : 'Practice is always free and does not use your plan allowance.'}
          </div>
          {practiceBlocked ? (
            <button className="secondary-button" type="button" onClick={() => void window.speakeasy?.openOnboardingSupport()}>
              Contact support
            </button>
          ) : null}
          {status === 'microphone-denied' ? (
            <button className="secondary-button" type="button" onClick={() => void window.speakeasy?.openMicrophonePrivacySettings()}>
              Open {isMac ? 'System Settings' : 'Windows Settings'}
            </button>
          ) : null}
          {isMac && error && /paste|Command\+V/u.test(error) ? (
            <button className="secondary-button" type="button" onClick={() => void window.speakeasy?.openAutomationPrivacySettings()}>
              Open Automation Settings
            </button>
          ) : null}
          {status === 'error' ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setError('');
                setStatus('idle');
                showStatus(`Focus the field, then hold ${hotkeyLabel} to try again.`, 'progress', platformSteps.nativePasteProof);
                practiceFieldRef.current?.focus();
              }}
            >
              Try Practice again
            </button>
          ) : null}
          {pendingOperationId && error ? (
            <button className="secondary-button" type="button" disabled={busy} onClick={() => void retryPracticeAcknowledgment()}>
              Try saving again
            </button>
          ) : null}
        </div>
      );
    }
    const usage = state.server?.usage;
    const reset = usage?.resetAt
      ? formatUsageReset(usage.resetAt).replace(/^Resets\s+/, '')
      : null;
    return (
      <div className="ready-summary">
        <label className="hotkey-picker ready-workflow">
          <span>Workflow preset <small>(optional)</small></span>
          <select aria-label="Workflow preset" value={workflowPreset} disabled={busy}
            onChange={event => setWorkflowPreset(event.target.value)}>
            <option value="keep">Keep current settings</option>
            {WORKFLOW_PRESETS.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          </select>
          <span className="ready-usage-note">{getWorkflowPreset(workflowPreset)?.tip ?? 'Keep your current Polish settings, or choose a starting point. You can change this in Settings.'}</span>
        </label>
        <p className="welcome-example">{practiceText || 'A clear thought, ready to send.'}</p>
        {usage ? (
          <div className="ready-facts">
            <div className="ready-plan"><span>Plan</span><strong>{usage.plan}</strong></div>
            <div className="ready-plan"><span>Allowance</span><strong>{formatUsageRemaining(usage)}</strong></div>
            {reset ? <div className="ready-plan"><span>Resets</span><strong>{reset}</strong></div> : null}
            <div className="ready-plan"><span>Push to talk</span><strong>{hotkeyLabel}</strong></div>
          </div>
        ) : (
          <p className="ready-usage-note">Usage details will appear in Settings.</p>
        )}
        <div className="ready-wayfinding">
          <StatusGlyph kind="success" />
          <div><strong>The bookmark stays at your display edge.</strong><span>Open it for Settings, usage, and support whenever you need them.</span></div>
        </div>
      </div>
    );
  };

  return (
    <main className="setup-shell" data-step={step} data-status={status}>
      <nav className="chapter-rail" aria-label="Setup progress">
        <div className="rail-brand-row">
          <BrandLockup />
          {state.mode !== 'first-run' ? (
            <span className="mode-label" data-mode={state.mode}>
              {state.mode === 'review' ? 'Setup review' : 'Focused recovery'}
            </span>
          ) : <span className="setup-label">{isMac ? 'Mac setup' : 'Windows setup'}</span>}
        </div>
        <p className="rail-summary" tabIndex={0}>
          Step {step} of {stepCount}. {CHAPTERS[chapterIndex]} chapter.
        </p>
        <ol>
          {CHAPTERS.map((chapter, index) => {
            const visualState = index < chapterIndex ? 'complete' : index === chapterIndex ? 'current' : 'upcoming';
            return (
              <li key={chapter} data-state={visualState} aria-current={visualState === 'current' ? 'step' : undefined}>
                <span className="chapter-dot" aria-hidden="true">{visualState === 'complete' ? <CheckIcon /> : index + 1}</span>
                <span>{chapter}</span>
                <span className="sr-only">{visualState}</span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="step-announcer sr-only" aria-live="polite">
        Step {step} of {stepCount}, {CHAPTERS[chapterIndex]}, {copy.title}
      </div>

      <section className="quiet-main" aria-labelledby="setup-title">
        <section className="quiet-copy">
          <div className="copy-top">
            <p className="eyebrow">
              {CHAPTERS[chapterIndex]} <span aria-hidden="true">·</span> Step {step} of {stepCount}
            </p>
            <h1 id="setup-title" ref={headingRef} tabIndex={-1}>{copy.title}</h1>
            <p className="lede">
              {step === platformSteps.hotkeyVerification
                ? `Hold ${hotkeyLabel}, then release it.`
                : step === platformSteps.practiceCoaching
                  ? `Focus the field on the next screen, hold ${hotkeyLabel} while you speak, then release. speakeasy. will transcribe and paste automatically.`
                  : step === platformSteps.nativePasteProof
                    ? `Hold ${hotkeyLabel}, speak naturally, then release. speakeasy. will place your words in this safe practice field.`
                    : step === platformSteps.ready
                      ? `Focus a text field, hold ${hotkeyLabel}, speak, then release.`
                      : copy.lede}
            </p>
            {state.mode === 'review' && step === 1 ? (
              <p className="review-note">Welcome back. Your completed setup remains active if you close this review.</p>
            ) : null}
            {state.mode === 'recovery' ? (
              <p className="review-note" data-tone="recovery">Only this requirement needs attention. Your completed setup and account history are unchanged.</p>
            ) : null}
          </div>

          {step === platformSteps.nativePasteProof ? (
            <div className="gesture-cue">
              <Keycap label={hotkeyLabel} held={status === 'listening'} />
              <span className="gesture-line" aria-hidden="true" />
              <div><strong>Hold · speak · release</strong><span>Use the real motion you’ll use everywhere.</span></div>
            </div>
          ) : null}

          <footer className="quiet-copy-footer">
            {step > 1 ? (
              <button type="button" className="text-button" onClick={() => { setStatusNotice(null); setStep(step - 1); }}>← Back</button>
            ) : <span />}
            <button ref={helpButtonRef} type="button" className="text-button" aria-expanded={helpOpen} onClick={() => setHelpOpen(true)}>
              Need help?
            </button>
          </footer>
        </section>

        <section className="quiet-stage-card" aria-label="Setup task">
          {loading ? (
            <div className="loading-state" role="status">
              <span className="loading-quote" aria-hidden="true">“</span>
              <div><strong>Restoring your setup</strong><span>Your saved progress will appear here.</span></div>
            </div>
          ) : renderTask()}

          {!loading && (step !== 2 || state.server) && (step !== platformSteps.planSelection || (state.server?.billing.plan && state.server.billing.plan !== 'free')) ? (
            <div className="primary-zone">
              <button
                type="button"
                className="primary-button"
                disabled={primaryDisabled}
                onClick={() => void primaryAction()}
              >
                {busy ? primaryBusyLabel : primaryLabel}
              </button>
              {unlockCopy && primaryDisabled ? <p className="unlock-copy">{unlockCopy}</p> : null}
            </div>
          ) : null}

          {step !== platformSteps.nativePasteProof && activeNotice ? (
            <p className="async-status" data-tone={activeNotice.tone} role={activeNotice.tone === 'error' ? 'alert' : 'status'} aria-live={activeNotice.tone === 'error' ? 'assertive' : 'polite'}>
              <StatusGlyph kind={activeNotice.tone} />
              <span>{activeNotice.message}</span>
            </p>
          ) : null}

          {helpOpen ? (
            <aside ref={helpPanelRef} className="help-panel" role="dialog" aria-modal="true" aria-labelledby="help-title">
              <div>
                <p className="task-kicker">Help for step {step}</p>
                <h2 id="help-title">{state.mode === 'recovery' ? 'Only this step needs attention.' : `Help with ${CHAPTERS[chapterIndex]}.`}</h2>
                <p>
                  {state.mode === 'recovery'
                    ? 'Your completed outcomes are safe. Retry only the action shown here; speakeasy. never repeats a recording or paste automatically.'
                    : 'Use the links below for this step. Your saved progress stays in place while help is open.'}
                </p>
                <div className="help-actions">
                  {step === 4 ? <button type="button" onClick={() => void window.speakeasy?.openMicrophonePrivacySettings()}>{isMac ? 'Mac microphone settings' : 'Windows microphone settings'}</button> : null}
                  {step === platformSteps.accessibility ? <button type="button" onClick={() => void window.speakeasy?.openAccessibilityPrivacySettings()}>Mac Accessibility settings</button> : null}
                  <button type="button" onClick={() => void window.speakeasy?.openOnboardingPrivacy()}>Privacy &amp; terms</button>
                  <button type="button" onClick={() => void window.speakeasy?.openOnboardingSupport()}>Contact support</button>
                </div>
              </div>
              <button
                ref={helpCloseButtonRef}
                type="button"
                className="secondary-button"
                onClick={() => { setHelpOpen(false); helpButtonRef.current?.focus(); }}
              >
                Close help
              </button>
            </aside>
          ) : null}
        </section>
      </section>
    </main>
  );
};

export default App;
