import { createStreamingPcm, type StreamingPcmCapture } from './streaming-pcm';
import { createRecordingFeedback, prepareRecordingSounds, playRecordingCue } from '../recording-feedback';
import type { SettingsCategory } from '../../shared/types';
import { applyAppTheme } from '../ui/app-theme';
import { cleanupFallbackMessage } from '../../shared/cleanup-outcome';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type JSX } from 'react';
import HudSettingsForm from '../ui/HudSettingsForm';
import { reconcileSettingDraft } from '../ui/settings-draft';
import CursorSpine from '../ui/CursorSpine';
import type {
  CleanupStrength,
  OverlayStatus,
  OverlayAttachment,
  SpeakeasyRuntimeState,
  SpeakeasySettings,
  WidgetForm
} from '../../shared/types';
import { createCaptureId, createLatencyMark } from '../../shared/latency';
import type { LatencyMark } from '../../shared/latency';
import { DEFAULT_HOTKEY_ID } from '../../shared/hotkeys';
import { DEFAULT_WIDGET_SIZE_ID, type WidgetSize } from '../../shared/widget-sizes';
import { getQuietWidgetLayout } from '../../shared/quiet-widget-layout';
import { DEFAULT_WIDGET_THEME_ID, type WidgetTheme } from '../../shared/widget-themes';
import { getErrorStatusText } from '../../shared/error-status';
import { MAX_CAPTURE_DURATION_MS } from '../../shared/capture-policy';
import { createCaptureGate } from './capture-gate';
import { createCaptureDeadline, type CaptureDeadline } from './capture-deadline';
import {
  getMicrophoneRecoveryAction,
  getMicrophoneStatusForErrorName
} from './capture-recovery';
import {
  getPreferredMimeType,
  RECORDER_TIMESLICE_MS,
  stopRecorderWithFinalData
} from './audio-capture.js';


export const createEmptyRuntimeState = (): SpeakeasyRuntimeState => ({
  dictationStats: {
    totalDictations: 0,
    totalWords: 0,
    totalDurationMs: 0,
    firstDictationAt: null,
    lastDictationAt: null
  },
  edition: 'oss',
  releaseChannel: 'stable',
  supportUrl: '',
  privacyUrl: '',
  capabilities: {
    byoApiKey: false,
    productAuth: false,
    hostedUsage: false,
    autoUpdate: false
  },
  platform: {
    operatingSystem: 'unsupported',
    architecture: '',
    osRelease: '',
    distribution: 'development',
    packaged: false,
    launchAtLogin: false,
    capabilities: {
      pushToHold: false,
      automaticPaste: false,
      clipboardRecovery: false,
      microphoneRecovery: false,
      storeManagedUpdates: false
    }
  },
  auth: {
    status: 'disabled',
    email: '',
    pendingEmail: '',
    message: ''
  },
  usage: {
    status: 'disabled',
    usedSeconds: 0,
    remainingSeconds: null,
    hardLimitSeconds: null,
    usedSuccessfulDictations: 0,
    reservedSuccessfulDictations: 0,
    remainingSuccessfulDictations: null,
    hardLimitSuccessfulDictations: null,
    resetAt: '',
    message: ''
  },
  billing: {
    status: 'disabled',
    plan: 'free',
    paymentStatus: '',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: '',
    message: ''
  },
  updater: {
    status: 'disabled',
    message: '',
    availableVersion: ''
  },
  nativeReadiness: null,
  diagnostics: {
    appName: 'speakeasy.',
    appVersion: '0.0.0',
    edition: 'oss',
    releaseChannel: 'stable',
    hotkeyLabel: 'Right Option',
    hotkeyMode: 'unavailable',
    microphonePermission: 'unknown',
    accessibilityPermission: 'missing',
    signedIn: false,
    lastErrorCode: 'none'
  },
  accountLifecycle: { status: 'active', message: '' }
});



const App = (): JSX.Element => {
  const [status, setStatus] = useState<OverlayStatus>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [categoryRequest, setCategoryRequest] = useState<{ category: SettingsCategory }>();
  const [widgetForm, setWidgetForm] = useState<WidgetForm>('pill');
  const [apiKey, setApiKey] = useState('');
  const [productAuthEmail, setProductAuthEmail] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [dictationSounds, setDictationSounds] = useState(true);
  const [polishBeforePaste, setPolishBeforePaste] = useState(true);
  const [cleanupStrength, setCleanupStrength] = useState<CleanupStrength>('minimal');
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY_ID);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>(DEFAULT_WIDGET_SIZE_ID);
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme>(DEFAULT_WIDGET_THEME_ID);
  const [showWidgetOverFullScreenApps, setShowWidgetOverFullScreenApps] = useState(true);
  const [widgetOpacity, setWidgetOpacity] = useState(90);
  const [attachment, setAttachment] = useState<OverlayAttachment>({ edge: 'right', offset: 0.42 });
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [authBusy, setAuthBusy] = useState(false);
  const [runtimeState, setRuntimeState] = useState<SpeakeasyRuntimeState>(createEmptyRuntimeState);
  const [cleanupNoticeVisible, setCleanupNoticeVisible] = useState(false);
  const [initialApiKey, setInitialApiKey] = useState('');
  const [initialProductAuthEmail, setInitialProductAuthEmail] = useState('');
  const [initialPolishBeforePaste, setInitialPolishBeforePaste] = useState(true);
  const [initialCleanupStrength, setInitialCleanupStrength] = useState<CleanupStrength>('minimal');
  const [initialWidgetOpacity, setInitialWidgetOpacity] = useState(90);
  const streamingPcmRef = useRef<StreamingPcmCapture | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const captureStartedAtRef = useRef<number | null>(null);
  const captureRequestedAtRef = useRef<number | null>(null);
  const captureIdRef = useRef<string | null>(null);
  const captureReleasedAtRef = useRef<number | null>(null);
  const latencyMarksRef = useRef<LatencyMark[]>([]);
  const wasCircleBeforeCaptureRef = useRef(false);
  const captureGateRef = useRef(createCaptureGate());
  const captureDeadlineCallbackRef = useRef<() => void>(() => undefined);
  const captureDeadlineRef = useRef<CaptureDeadline | null>(null);
  if (captureDeadlineRef.current === null) {
    captureDeadlineRef.current = createCaptureDeadline({
      schedule: (callback, durationMs) => window.setTimeout(callback, durationMs),
      cancel: (timerId) => window.clearTimeout(timerId),
      onElapsed: () => captureDeadlineCallbackRef.current()
    });
  }
  const captureInterruptedRef = useRef<'microphone-unavailable' | 'idle' | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelToggleRef = useRef<HTMLButtonElement | null>(null);
  const lastSettingsRef = useRef<SpeakeasySettings | null>(null);

  const hasApiKey = apiKey.trim().length > 0;
  const isDirty =
    apiKey.trim() !== initialApiKey ||
    productAuthEmail.trim() !== initialProductAuthEmail ||
    polishBeforePaste !== initialPolishBeforePaste ||
    cleanupStrength !== initialCleanupStrength;
  const settingsDirty = isDirty || widgetOpacity !== initialWidgetOpacity;
  const lastCleanupOutcome = runtimeState.diagnostics.lastCleanupOutcome;
  const cleanupFallback = status === 'idle' && cleanupNoticeVisible && !!cleanupFallbackMessage(lastCleanupOutcome);
  // Diagnostics retain the result; the visible notice has an independent lifetime.
  // The pipeline clears the outcome before each request, including repeated fallbacks.
  useEffect(() => {
    setCleanupNoticeVisible(!!cleanupFallbackMessage(lastCleanupOutcome));
  }, [lastCleanupOutcome]);
  useEffect(() => {
    if (status === 'listening') setCleanupNoticeVisible(false);
  }, [status]);
  useEffect(() => {
    if (!cleanupFallback) return;
    const timer = window.setTimeout(() => setCleanupNoticeVisible(false), 30_000);
    return () => window.clearTimeout(timer);
  }, [cleanupFallback, lastCleanupOutcome]);
  const layout = useMemo(() => getQuietWidgetLayout(attachment.edge, widgetSize, panelOpen), [attachment.edge, widgetSize, panelOpen]);

  const stopTracks = (mediaStream: MediaStream | null) => {
    mediaStream?.getTracks().forEach((track) => track.stop());
  };

  const clearCaptureDeadline = () => {
    captureDeadlineRef.current?.clear();
  };

  const resetCapture = (mediaStream: MediaStream | null) => {
    clearCaptureDeadline();
    streamingPcmRef.current?.cancel(); streamingPcmRef.current = null;
    stopTracks(mediaStream);
    streamRef.current = null;
    setStream(null);
    recorderRef.current = null;
    chunksRef.current = [];
  };

  const syncSettings = (settings: SpeakeasySettings) => {
    const previous = lastSettingsRef.current;
    lastSettingsRef.current = settings;
    setApiKey(value => reconcileSettingDraft(value, previous?.groqApiKey, settings.groqApiKey));
    setInitialApiKey(settings.groqApiKey);
    setProductAuthEmail(value => reconcileSettingDraft(value, previous?.productAuthEmail, settings.productAuthEmail));
    setInitialProductAuthEmail(settings.productAuthEmail);
    setPolishBeforePaste(value => reconcileSettingDraft(value, previous?.polishBeforePaste, settings.polishBeforePaste));
    setInitialPolishBeforePaste(settings.polishBeforePaste);
    setCleanupStrength(value => reconcileSettingDraft(value, previous?.cleanupStrength, settings.cleanupStrength));
    setInitialCleanupStrength(settings.cleanupStrength);
    setShowWidgetOverFullScreenApps(settings.showWidgetOverFullScreenApps ?? true);
    setDictationSounds(settings.dictationSounds ?? true);
    setHotkey(settings.hotkey);
    setWidgetForm(settings.widgetForm);
    setWidgetSize(settings.widgetSize ?? DEFAULT_WIDGET_SIZE_ID);
    setWidgetTheme(settings.widgetTheme ?? DEFAULT_WIDGET_THEME_ID);
    setWidgetOpacity(value => reconcileSettingDraft(value, previous?.widgetOpacity, settings.widgetOpacity ?? 90));
    setInitialWidgetOpacity(settings.widgetOpacity ?? 90);
  };

  const persistWidgetForm = async (nextForm: WidgetForm) => {
    setWidgetForm(nextForm);
    if (window.speakeasy) {
      await window.speakeasy.setSettings('widgetForm', nextForm);
    }
  };

  // The push-to-talk key re-binds in the main process the moment it changes, so
  // persist immediately rather than waiting for the Save button.
  const persistHotkey = async (nextHotkey: string) => {
    const previousHotkey = hotkey;
    setHotkey(nextHotkey);
    if (window.speakeasy) {
      try {
        await window.speakeasy.setSettings('hotkey', nextHotkey);
      } catch (error) {
        setHotkey(previousHotkey);
        throw error;
      }
    }
  };

  const persistFullScreenVisibility = async (enabled: boolean) => {
    // Wait for the main process to apply and broadcast the saved value.
    await window.speakeasy?.setSettings('showWidgetOverFullScreenApps', enabled);
  };

  const persistWidgetTheme = async (nextTheme: WidgetTheme) => {
    const previousTheme = widgetTheme;
    setWidgetTheme(nextTheme);
    if (window.speakeasy) {
      try { await window.speakeasy.setSettings('widgetTheme', nextTheme); }
      catch (error) { setWidgetTheme(previousTheme); throw error; }
    }
  };

  const persistWidgetSize = async (nextSize: WidgetSize) => {
    const previousSize = widgetSize;
    setWidgetSize(nextSize);
    if (window.speakeasy) {
      try { await window.speakeasy.setSettings('widgetSize', nextSize); }
      catch (error) { setWidgetSize(previousSize); throw error; }
    }
  };

  const ensurePill = async () => {
    if (widgetForm === 'circle') {
      await persistWidgetForm('pill');
    }
  };

  const startCapture = async (mainCaptureId?: string) => {
    const captureToken = captureGateRef.current.requestStart();
    if (captureToken === null) {
      window.speakeasy?.debugLog(
        `Capture start ignored while state=${captureGateRef.current.getState()}`
      );
      return;
    }
    if (lastSettingsRef.current?.dictationSounds !== false) prepareRecordingSounds();
    captureRequestedAtRef.current = performance.now();
    const currentCaptureId = mainCaptureId ?? createCaptureId();
    captureIdRef.current = currentCaptureId;
    window.speakeasy?.logCaptureEvent('requested', captureIdRef.current);
    latencyMarksRef.current = [];

    let pendingStream: MediaStream | null = null;
    try {
      const wasCircleBeforeCapture = widgetForm === 'circle';
      wasCircleBeforeCaptureRef.current = wasCircleBeforeCapture;
      await ensurePill();
      if (panelRef.current?.contains(document.activeElement)) {
        panelToggleRef.current?.focus();
      }
      setPanelOpen(false);
      void window.speakeasy?.warmProductSession?.().catch(() => undefined);

      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio: true
      });
      pendingStream = nextStream;
      void window.speakeasy?.reportMicrophoneStatus('granted');

      if (!captureGateRef.current.isStarting(captureToken)) { stopTracks(nextStream); return; }
      streamRef.current = nextStream;
      const streamingPcm = await createStreamingPcm(nextStream, currentCaptureId, () => {
        if (captureIdRef.current === currentCaptureId && captureGateRef.current.getState() === 'recording') stopCapture();
      });
      if (!captureGateRef.current.isStarting(captureToken)) { streamingPcm?.cancel(); stopTracks(nextStream); return; }
      streamingPcmRef.current = streamingPcm;
      const preferredMimeType = getPreferredMimeType();
      const recorder = preferredMimeType
        ? new MediaRecorder(nextStream, { mimeType: preferredMimeType })
        : new MediaRecorder(nextStream);

      if (!captureGateRef.current.markRecording(captureToken)) {
        window.speakeasy?.debugLog('Capture start canceled before media became ready');
        streamingPcm?.cancel(); streamingPcmRef.current = null;
        stopTracks(nextStream);
        return;
      }

      captureReleasedAtRef.current = null;
      captureInterruptedRef.current = null;
      streamRef.current = nextStream;
      setStream(nextStream);
      captureStartedAtRef.current = Date.now();
      window.speakeasy?.debugLog(
        `Capture media ready: tracks=${nextStream.getAudioTracks().length}`
      );

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      const feedback = createRecordingFeedback(playRecordingCue, () => lastSettingsRef.current?.dictationSounds !== false);
      recorder.onstart = () => { if (recorder.state === 'recording') feedback.started(); };
      recorder.onstop = async () => {
        clearCaptureDeadline();
        let streamError: unknown;
        if (captureInterruptedRef.current) streamingPcm?.cancel();
        else { try { await streamingPcm?.finish(); } catch (error) { streamError = error; streamingPcm?.cancel(); } }
        streamingPcmRef.current = null;
        const onStopAtMs = performance.now();
        if (captureReleasedAtRef.current !== null) {
          latencyMarksRef.current.push(
            createLatencyMark('renderer.release_to_onstop', captureReleasedAtRef.current, onStopAtMs)
          );
        }

        const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm';
        const chunks = chunksRef.current;
        const blobStartedAtMs = performance.now();
        const audioBlob = new Blob(chunks, { type: mimeType });
        latencyMarksRef.current.push(
          createLatencyMark('renderer.blob_construction', blobStartedAtMs, performance.now(), {
            audioBytes: audioBlob.size,
            chunkCount: chunks.length
          })
        );
        const durationMs = captureStartedAtRef.current ? Date.now() - captureStartedAtRef.current : 0;
        window.speakeasy?.debugLog(
          `Capture stopped: durationMs=${durationMs} audioBytes=${audioBlob.size} chunks=${chunks.length}`
        );
        window.speakeasy?.logCaptureEvent('stopped', captureIdRef.current);
        chunksRef.current = [];
        resetCapture(nextStream);
        if (captureInterruptedRef.current) feedback.cancel();
        else feedback.stopped();

        if (captureInterruptedRef.current) {
          const recoveryStatus = captureInterruptedRef.current;
          captureInterruptedRef.current = null;
          captureStartedAtRef.current = null;
          captureRequestedAtRef.current = null;
          captureIdRef.current = null;
          captureReleasedAtRef.current = null;
          latencyMarksRef.current = [];
          captureGateRef.current.endProcessing();
          setStatus(recoveryStatus);
          void window.speakeasy?.reportMicrophoneStatus(
            recoveryStatus === 'microphone-unavailable' ? 'unavailable' : 'unknown'
          );
          if (recoveryStatus === 'idle' && wasCircleBeforeCaptureRef.current) {
            wasCircleBeforeCaptureRef.current = false;
            await persistWidgetForm('circle');
          } else {
            wasCircleBeforeCaptureRef.current = false;
          }
          return;
        }

        if (!audioBlob.size || !window.speakeasy) {
          window.speakeasy?.debugLog('Capture produced no audio bytes');
          setStatus('idle');
          captureStartedAtRef.current = null;
          captureRequestedAtRef.current = null;
          captureIdRef.current = null;
          captureReleasedAtRef.current = null;
          latencyMarksRef.current = [];
          captureGateRef.current.endProcessing();
          if (wasCircleBeforeCaptureRef.current) {
            wasCircleBeforeCaptureRef.current = false;
            void persistWidgetForm('circle');
          }
          return;
        }

        setStatus('transcribing');

        let completedSuccessfully = false;
        try {
          if (streamError) throw streamError;
          const arrayBufferStartedAtMs = performance.now();
          const audioBuffer = await audioBlob.arrayBuffer();
          latencyMarksRef.current.push(
            createLatencyMark('renderer.array_buffer', arrayBufferStartedAtMs, performance.now(), {
              audioBytes: audioBuffer.byteLength
            })
          );

          const captureId = captureIdRef.current ?? createCaptureId();
          await window.speakeasy.processAudioCapture({
            streaming: !!streamingPcm,
            audioBuffer,
            mimeType,
            durationMs,
            captureId,
            clientLatencyMarks: latencyMarksRef.current
          });
          completedSuccessfully = true;
          setStatus('idle');
        } catch (error) {
          console.error('Failed to process captured audio:', error);
          setStatus('error');
        } finally {
          captureGateRef.current.endProcessing();
          captureStartedAtRef.current = null;
          captureRequestedAtRef.current = null;
          captureIdRef.current = null;
          captureReleasedAtRef.current = null;
          latencyMarksRef.current = [];
          if (completedSuccessfully && wasCircleBeforeCaptureRef.current) {
            wasCircleBeforeCaptureRef.current = false;
            await persistWidgetForm('circle');
          }
        }
      };

      const interruptCapture = (interruption: 'track-ended' | 'recorder-error') => {
        const action = getMicrophoneRecoveryAction(
          captureGateRef.current.getState(),
          interruption
        );
        if (action !== 'interrupt-recording') {
          return;
        }
        window.speakeasy?.logCaptureEvent('failed', captureIdRef.current, 'microphone-unavailable');
        captureInterruptedRef.current = 'microphone-unavailable';
        captureReleasedAtRef.current = performance.now();
        clearCaptureDeadline();
        captureGateRef.current.requestStop();
        setStatus('microphone-unavailable');
        window.speakeasy?.debugLog(`Capture interrupted: ${interruption}`);
        if (recorder.state !== 'inactive') {
          stopRecorderWithFinalData(recorder);
        }
      };
      nextStream.getAudioTracks().forEach((track) => {
        track.addEventListener('ended', () => interruptCapture('track-ended'), { once: true });
      });
      recorder.onerror = () => interruptCapture('recorder-error');
      recorder.start(RECORDER_TIMESLICE_MS);
      recorderRef.current = recorder;
      setStatus('listening');
      window.speakeasy?.logCaptureEvent('listening', captureIdRef.current);
      if (captureRequestedAtRef.current !== null) {
        latencyMarksRef.current.push(
          createLatencyMark(
            'renderer.recording_request_to_listening',
            captureRequestedAtRef.current,
            performance.now()
          )
        );
      }
      captureDeadlineCallbackRef.current = () => {
        if (recorder.state === 'inactive') {
          return;
        }
        window.speakeasy?.debugLog('Capture duration cap reached; processing capped audio');
        stopCapture();
      };
      captureDeadlineRef.current?.arm(MAX_CAPTURE_DURATION_MS);
      window.speakeasy?.debugLog(
        `Capture recording: mimeType=${recorder.mimeType || preferredMimeType || 'browser-default'}`
      );
    } catch (error) {
      if (!captureGateRef.current.fail(captureToken)) {
        stopTracks(pendingStream);
        window.speakeasy?.debugLog('Ignored stale capture-start failure');
        return;
      }
      resetCapture(pendingStream);
      window.speakeasy?.logCaptureEvent('failed', captureIdRef.current, error instanceof DOMException && error.name === 'NotAllowedError' ? 'microphone-denied' : 'microphone-unavailable');
      console.error('Failed to start audio capture:', error);
      window.speakeasy?.debugLog(
        `Capture start failed: type=${error instanceof DOMException ? error.name : 'unknown'}`
      );
      captureStartedAtRef.current = null;
      captureRequestedAtRef.current = null;
      captureIdRef.current = null;
      captureReleasedAtRef.current = null;
      latencyMarksRef.current = [];
      const microphoneStatus = getMicrophoneStatusForErrorName(
        error instanceof DOMException ? error.name : ''
      );
      if (microphoneStatus === 'denied') {
        void window.speakeasy?.reportMicrophoneStatus(microphoneStatus);
        setStatus('microphone-denied');
      } else if (microphoneStatus === 'unavailable') {
        void window.speakeasy?.reportMicrophoneStatus(microphoneStatus);
        setStatus('microphone-unavailable');
      } else {
        void window.speakeasy?.reportMicrophoneStatus('unknown');
        setStatus('error');
      }
    }
  };

  const stopCapture = () => {
    clearCaptureDeadline();
    const stopAction = captureGateRef.current.requestStop();
    const recorder = recorderRef.current;
    if (stopAction === 'cancel-start') {
      window.speakeasy?.debugLog('Capture release canceled pending microphone start');
      setStatus('idle');
      captureRequestedAtRef.current = null;
      captureIdRef.current = null;
      latencyMarksRef.current = [];
      return;
    }

    if (
      stopAction === 'stop-recording' &&
      recorder &&
      recorder.state !== 'inactive'
    ) {
      const releasedAtMs = performance.now();
      captureReleasedAtRef.current = releasedAtMs;
      setStatus('transcribing');
      latencyMarksRef.current.push(
        createLatencyMark('renderer.release_to_processing', releasedAtMs, performance.now())
      );
      window.speakeasy?.debugLog('Capture release received');
      const recorderStopStartedAtMs = performance.now();
      stopRecorderWithFinalData(recorder);
      latencyMarksRef.current.push(
        createLatencyMark('renderer.recorder_stop', recorderStopStartedAtMs, performance.now())
      );
      return;
    }

    window.speakeasy?.debugLog(
      `Capture release ignored while state=${captureGateRef.current.getState()}`
    );
  };

  const saveSettings = async () => {
    if (!window.speakeasy) {
      return;
    }

    setSaveStatus('saving');
    try {
    const trimmedApiKey = apiKey.trim();
    const trimmedProductAuthEmail = productAuthEmail.trim().toLowerCase();
    if (runtimeState.capabilities.byoApiKey) {
      await window.speakeasy.setSettings('groqApiKey', trimmedApiKey);
    }
    await window.speakeasy.setSettings('productAuthEmail', trimmedProductAuthEmail);
    await window.speakeasy.setSettings('polishBeforePaste', polishBeforePaste);
    await window.speakeasy.setSettings('cleanupStrength', cleanupStrength);
    await window.speakeasy.setSettings('widgetOpacity', widgetOpacity);
    setInitialApiKey(trimmedApiKey);
    setInitialProductAuthEmail(trimmedProductAuthEmail);
    setInitialPolishBeforePaste(polishBeforePaste);
    setInitialCleanupStrength(cleanupStrength);
    setInitialWidgetOpacity(widgetOpacity);
    setSaveStatus('saved');
    window.setTimeout(() => setSaveStatus('idle'), 1200);
    } catch (error) {
      setSaveStatus('error');
      throw error;
    }
  };

  const requestMagicLink = async () => {
    if (!window.speakeasy) {
      return;
    }

    setAuthBusy(true);
    try {
      const normalizedEmail = (runtimeState.auth.status === 'signed-in' ? runtimeState.auth.email || productAuthEmail : productAuthEmail).trim().toLowerCase();
      await window.speakeasy.setSettings('productAuthEmail', normalizedEmail);
      await window.speakeasy.requestMagicLinkSignIn({
        email: normalizedEmail
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    await window.speakeasy?.signOutProduct();
  };

  const triggerUpdateCheck = async () => {
    await window.speakeasy?.checkForUpdates();
  };

  const focusPanelStart = (category?: SettingsCategory) => {
    window.requestAnimationFrame(() => {
      const panelContent = panelRef.current?.querySelector<HTMLElement>('.hud-panel-content');
      panelContent?.scrollTo({ top: 0 });
      panelRef.current
        ?.querySelector<HTMLElement>(category ? `[data-settings-category="${category}"]` : 'input, select, button, summary, a[href]')
        ?.focus({ preventScroll: true });
      if (panelContent) {
        panelContent.scrollTop = 0;
      }
    });
  };

  const togglePanel = async () => {
    await ensurePill();
    setPanelOpen((value) => {
      const next = !value;
      if (next) {
        focusPanelStart();
      } else {
        panelToggleRef.current?.focus({ preventScroll: true });
      }
      return next;
    });
  };

  useEffect(() => {
    if (!window.speakeasy) {
      return;
    }

    void Promise.all([
      window.speakeasy.getSettings().then(syncSettings),
      window.speakeasy.getRuntimeState().then((state) => {
        setRuntimeState(state);
      })
    ]);

    const unsubStart = window.speakeasy.onRecordingStart((captureId) => {
      void startCapture(captureId);
    });

    const unsubStop = window.speakeasy.onRecordingStop(() => {
      stopCapture();
    });

    const unsubRecovery = window.speakeasy.onRecordingRecovery((reason) => {
      clearCaptureDeadline();
      const recorder = recorderRef.current;
      const stopAction = captureGateRef.current.requestStop();
      if (stopAction === 'ignore') {
        return;
      }
      window.speakeasy?.debugLog(`Capture lifecycle recovery: ${reason}`);
      void window.speakeasy?.reportMicrophoneStatus('unknown');
      if (
        stopAction === 'stop-recording' &&
        recorder &&
        recorder.state !== 'inactive'
      ) {
        captureInterruptedRef.current = 'idle';
        captureReleasedAtRef.current = performance.now();
        stopRecorderWithFinalData(recorder);
        return;
      }
      if (stopAction === 'cancel-start') {
        resetCapture(streamRef.current);
        if (wasCircleBeforeCaptureRef.current) {
          wasCircleBeforeCaptureRef.current = false;
          void persistWidgetForm('circle');
        }
      }
      setStatus('idle');
    });

    const unsubStatus = window.speakeasy.onStatusUpdate((newStatus) => {
      setStatus(newStatus as OverlayStatus);
    });

    const unsubSettings = window.speakeasy.onSettingsChanged((settings) => {
      syncSettings(settings as SpeakeasySettings);
    });

    const unsubRuntime = window.speakeasy.onRuntimeStateChanged((state) => {
      setRuntimeState(state as SpeakeasyRuntimeState);
    });

    const unsubPanel = window.speakeasy.onOpenPanel((category) => {
      if (category) setCategoryRequest({ category });
      void ensurePill().then(() => {
        setPanelOpen(true);
        focusPanelStart(category);
      });
    });

    const unsubAttachment = window.speakeasy.onOverlayAttachmentChanged((nextAttachment) => {
      setAttachment(nextAttachment);
    });

    return () => {
      unsubStart();
      unsubStop();
      unsubRecovery();
      unsubStatus();
      unsubSettings();
      unsubRuntime();
      unsubPanel();
      unsubAttachment();
    };
  }, [widgetForm]);

  useLayoutEffect(() => {
    applyAppTheme(widgetTheme);
  }, [widgetTheme]);

  useEffect(() => {
    if (!window.speakeasy) {
      return;
    }

    const reportLayout = () => {
      const interactiveRegions = [...document.querySelectorAll<HTMLElement>(
        '.spine-settings-sheet, .spine-bookmark, .spine-extension, button.spine-status-label'
      )].filter(element => getComputedStyle(element).pointerEvents !== 'none')
        .map(element => {
          // Hit-test the final layout box, so animation never leaves a stale
          // shrunken drag target. The idle rail is excluded above.
          return { x: element.offsetLeft, y: element.offsetTop, width: element.offsetWidth, height: element.offsetHeight };
        });
      void window.speakeasy?.setOverlayLayout({ ...layout, interactiveRegions });
    };
    reportLayout();
    window.addEventListener('resize', reportLayout);
    window.addEventListener('animationend', reportLayout);
    return () => {
      window.removeEventListener('resize', reportLayout);
      window.removeEventListener('animationend', reportLayout);
    };
  }, [layout, status, cleanupFallback, attachment.bookmarkOffset?.x, attachment.bookmarkOffset?.y, attachment.railReversed]);

  useEffect(() => {
    const handleDeviceChange = () => {
      const action = getMicrophoneRecoveryAction(
        captureGateRef.current.getState(),
        'devicechange'
      );
      if (action === 'invalidate-device-cache') {
        void window.speakeasy?.reportMicrophoneStatus('unknown');
      }
    };
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      clearCaptureDeadline();
      if (recorderRef.current?.state && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      } else {
        resetCapture(streamRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !panelOpen) {
        return;
      }
      event.preventDefault();
      setPanelOpen(false);
      panelToggleRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [panelOpen]);

  const getStatusText = (): string => {
    switch (status) {
      case 'listening':
        return 'Listening';
      case 'transcribing':
        return 'Transcribing';
      case 'polishing':
        return 'Polishing';
      case 'microphone-denied':
        return 'Mic Access Required';
      case 'microphone-unavailable':
        return 'Microphone Unavailable';
      case 'error':
        return getErrorStatusText(runtimeState.diagnostics.lastErrorCode, navigator.platform);
      default:
        return cleanupFallback ? cleanupFallbackMessage(lastCleanupOutcome) : 'Ready';
    }
  };

  const statusLabel = getStatusText();

  return (
    <div className="hud-root" data-widget-size={widgetSize}>
      <div className="hud-sr-only" role="status" aria-live="polite" aria-atomic="true">
        speakeasy. status: {statusLabel}
      </div>
      <div className="hud-stage">
        <CursorSpine
          edge={attachment.edge}
          bookmarkOffset={attachment.bookmarkOffset}
          railReversed={attachment.railReversed}
          status={status}
          statusLabel={statusLabel}
          cleanupFallback={cleanupFallback}
          onDismissCleanup={() => setCleanupNoticeVisible(false)}
          opacity={widgetOpacity}
          reduceMotion={widgetTheme === 'high-contrast'}
          settingsOpen={panelOpen}
          toggleRef={panelToggleRef}
          onToggleSettings={() => void togglePanel()}
        >
          <div ref={panelRef} className="spine-settings-content">
            <HudSettingsForm
              categoryRequest={categoryRequest}
              apiKey={apiKey}
              productAuthEmail={productAuthEmail}
              showApiKey={showApiKey}
              hasApiKey={hasApiKey}
              dictationSounds={dictationSounds}
              onDictationSoundsChange={async enabled => { await window.speakeasy?.setSettings('dictationSounds', enabled); }}
              polishBeforePaste={polishBeforePaste}
              cleanupStrength={cleanupStrength}
              hotkey={hotkey}
              widgetSize={widgetSize}
              widgetTheme={widgetTheme}
              widgetOpacity={widgetOpacity}
              showWidgetOverFullScreenApps={showWidgetOverFullScreenApps}
              status={saveStatus}
              isDirty={settingsDirty}
              runtimeState={runtimeState}
              authBusy={authBusy}
              onApiKeyChange={setApiKey}
              onProductAuthEmailChange={setProductAuthEmail}
              onToggleApiKeyVisibility={() => setShowApiKey((value) => !value)}
              onPolishBeforePasteChange={setPolishBeforePaste}
              onCleanupStrengthChange={setCleanupStrength}
              onHotkeyChange={persistHotkey}
              onWidgetSizeChange={persistWidgetSize}
              onWidgetThemeChange={persistWidgetTheme}
              onWidgetOpacityChange={setWidgetOpacity}
              onFullScreenVisibilityChange={persistFullScreenVisibility}
              onSave={saveSettings}
              onRequestMagicLink={requestMagicLink}
              onSignOut={signOut}
              canRestartForUpdate={() => captureGateRef.current.getState() === 'idle'}
              onCheckForUpdates={triggerUpdateCheck}
              onQuit={() => window.speakeasy?.quitApp()}
            />
          </div>
        </CursorSpine>
      </div>
    </div>
  );
};

export default App;
