import { applyAppTheme } from '../ui/app-theme';
import { useEffect, useLayoutEffect, useRef, useState, type JSX } from 'react';
import HudSettingsForm from '../ui/HudSettingsForm';
import { reconcileSettingDraft } from '../ui/settings-draft';
import type {
  CleanupStrength,
  SpeakeasyRuntimeState,
  SpeakeasySettings
} from '../../shared/types';
import { DEFAULT_HOTKEY_ID } from '../../shared/hotkeys';
import { EMPTY_DICTATION_STATS } from '../../shared/dictation-stats';
import { DEFAULT_WIDGET_SIZE_ID, type WidgetSize } from '../../shared/widget-sizes';
import { DEFAULT_WIDGET_THEME_ID, type WidgetTheme } from '../../shared/widget-themes';

const createEmptyRuntimeState = (): SpeakeasyRuntimeState => ({
  dictationStats: EMPTY_DICTATION_STATS,
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
  const [apiKey, setApiKey] = useState('');
  const [productAuthEmail, setProductAuthEmail] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [polishBeforePaste, setPolishBeforePaste] = useState(true);
  const [cleanupStrength, setCleanupStrength] = useState<CleanupStrength>('minimal');
  const [hotkey, setHotkey] = useState(DEFAULT_HOTKEY_ID);
  const [widgetSize, setWidgetSize] = useState<WidgetSize>(DEFAULT_WIDGET_SIZE_ID);
  const [widgetTheme, setWidgetTheme] = useState<WidgetTheme>(DEFAULT_WIDGET_THEME_ID);
  const [showWidgetOverFullScreenApps, setShowWidgetOverFullScreenApps] = useState(true);
  const [widgetOpacity, setWidgetOpacity] = useState(90);
  const [initialWidgetOpacity, setInitialWidgetOpacity] = useState(90);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSettingsRef = useRef<SpeakeasySettings | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [runtimeState, setRuntimeState] = useState<SpeakeasyRuntimeState>(createEmptyRuntimeState);
  const [initialApiKey, setInitialApiKey] = useState('');
  const [initialProductAuthEmail, setInitialProductAuthEmail] = useState('');
  const [initialPolishBeforePaste, setInitialPolishBeforePaste] = useState(true);
  const [initialCleanupStrength, setInitialCleanupStrength] =
    useState<CleanupStrength>('minimal');

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
    setHotkey(settings.hotkey);
    setWidgetSize(settings.widgetSize ?? DEFAULT_WIDGET_SIZE_ID);
    setWidgetTheme(settings.widgetTheme ?? DEFAULT_WIDGET_THEME_ID);
    setWidgetOpacity(value => reconcileSettingDraft(value, previous?.widgetOpacity, settings.widgetOpacity ?? 90));
    setInitialWidgetOpacity(settings.widgetOpacity ?? 90);
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

    const unsubSettings = window.speakeasy.onSettingsChanged((settings) => {
      syncSettings(settings as SpeakeasySettings);
    });

    const unsubRuntime = window.speakeasy.onRuntimeStateChanged((state) => {
      setRuntimeState(state as SpeakeasyRuntimeState);
    });

    return () => {
      unsubSettings();
      unsubRuntime();
    };
  }, []);

  const hasApiKey = apiKey.trim().length > 0;
  const isDirty =
    apiKey.trim() !== initialApiKey ||
    productAuthEmail.trim() !== initialProductAuthEmail ||
    polishBeforePaste !== initialPolishBeforePaste ||
    cleanupStrength !== initialCleanupStrength ||
    widgetOpacity !== initialWidgetOpacity;

  const saveSettings = async () => {
    if (!window.speakeasy) {
      return;
    }

    setStatus('saving');
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
    setInitialWidgetOpacity(widgetOpacity);
    setInitialApiKey(trimmedApiKey);
    setInitialProductAuthEmail(trimmedProductAuthEmail);
    setInitialPolishBeforePaste(polishBeforePaste);
    setInitialCleanupStrength(cleanupStrength);
    setStatus('saved');
    window.setTimeout(() => setStatus('idle'), 1200);
    } catch (error) {
      setStatus('error');
      throw error;
    }
  };

  // The push-to-talk key re-binds in the main process the moment it changes, so
  // persist immediately rather than waiting for the Save button.
  const persistHotkey = async (nextHotkey: string) => {
    const previousHotkey = hotkey;
    setHotkey(nextHotkey);
    try {
      await window.speakeasy?.setSettings('hotkey', nextHotkey);
    } catch (error) {
      setHotkey(previousHotkey);
      throw error;
    }
  };

  const persistFullScreenVisibility = async (enabled: boolean) => {
    // Wait for the main process to apply and broadcast the saved value.
    await window.speakeasy?.setSettings('showWidgetOverFullScreenApps', enabled);
  };

  const persistWidgetTheme = async (nextTheme: WidgetTheme) => {
    const previousTheme = widgetTheme;
    setWidgetTheme(nextTheme);
    try { await window.speakeasy?.setSettings('widgetTheme', nextTheme); }
    catch (error) { setWidgetTheme(previousTheme); throw error; }
  };

  const persistWidgetSize = async (nextSize: WidgetSize) => {
    const previousSize = widgetSize;
    setWidgetSize(nextSize);
    try { await window.speakeasy?.setSettings('widgetSize', nextSize); }
    catch (error) { setWidgetSize(previousSize); throw error; }
  };

  useLayoutEffect(() => {
    applyAppTheme(widgetTheme);
  }, [widgetTheme]);

  useEffect(() => {
    document.documentElement.dataset.widgetSize = widgetSize;
  }, [widgetSize]);

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

  return (
    <div className="settings-root">
      <div className="settings-shell">
        <div className="settings-header">
          <div className="settings-kicker">{runtimeState.diagnostics.appName}</div>
          <h1>Settings</h1>
        </div>

        <HudSettingsForm
          apiKey={apiKey}
          productAuthEmail={productAuthEmail}
          showApiKey={showApiKey}
          hasApiKey={hasApiKey}
          polishBeforePaste={polishBeforePaste}
          cleanupStrength={cleanupStrength}
          hotkey={hotkey}
          widgetSize={widgetSize}
          widgetTheme={widgetTheme}
          widgetOpacity={widgetOpacity}
          showWidgetOverFullScreenApps={showWidgetOverFullScreenApps}
          status={status}
          isDirty={isDirty}
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
          onCheckForUpdates={triggerUpdateCheck}
          onQuit={() => window.speakeasy?.quitApp()}
        />
      </div>
    </div>
  );
};

export default App;
