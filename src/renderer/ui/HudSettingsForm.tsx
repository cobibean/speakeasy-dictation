import ThemePreview from './ThemePreview';
import { CheckIcon } from '@radix-ui/react-icons';
import { useEffect, useRef, useState, type JSX } from 'react';
import type {
  CleanupStrength,
  ProductSupportCategory,
  SpeakeasyRuntimeState,
  UsageState
} from '../../shared/types';
import { getHotkeyOptionsForPlatform } from '../../shared/hotkeys';
import { WIDGET_SIZE_OPTIONS, type WidgetSize } from '../../shared/widget-sizes';
import { WIDGET_THEME_OPTIONS, type WidgetTheme } from '../../shared/widget-themes';
import {
  BILLING_CATALOG,
  formatBillingDate,
  formatUsageRemaining,
  formatUsageReset
} from '../../shared/billing-presentation';
import {
  estimateTypingMinutes,
  formatShareText
} from '../../shared/dictation-stats';

import { WORKFLOW_PRESETS } from '../../shared/workflow-presets';
import type { SettingsCategory } from '../../shared/types';


interface HudSettingsFormProps {
  categoryRequest?: { category: SettingsCategory };
  apiKey: string;
  productAuthEmail: string;
  showApiKey: boolean;
  hasApiKey: boolean;
  polishBeforePaste: boolean;
  cleanupStrength: CleanupStrength;
  hotkey: string;
  widgetSize: WidgetSize;
  widgetTheme: WidgetTheme;
  widgetOpacity: number;
  showWidgetOverFullScreenApps: boolean;
  status: 'idle' | 'saving' | 'saved' | 'error';
  isDirty: boolean;
  runtimeState: SpeakeasyRuntimeState;
  authBusy: boolean;
  onApiKeyChange: (value: string) => void;
  onProductAuthEmailChange: (value: string) => void;
  onToggleApiKeyVisibility: () => void;
  onPolishBeforePasteChange: (value: boolean) => void;
  onCleanupStrengthChange: (value: CleanupStrength) => void;
  onHotkeyChange: (value: string) => void;
  onWidgetSizeChange: (value: WidgetSize) => void;
  onWidgetThemeChange: (value: WidgetTheme) => void;
  onFullScreenVisibilityChange: (value: boolean) => Promise<void>;
  onWidgetOpacityChange: (value: number) => void;
  onSave: () => Promise<void> | void;
  onRequestMagicLink: () => Promise<void> | void;
  onSignOut: () => Promise<void> | void;
  canRestartForUpdate?: () => boolean;
  onCheckForUpdates: () => Promise<void> | void;
  onQuit: () => void;
}

const getUsageLabel = (usageState: UsageState): string => {
  if (usageState.status === 'disabled') {
    return 'Unavailable';
  }

  const label = formatUsageRemaining(usageState);
  return label === 'Usage pending' ? usageState.message || 'Pending' : label;
};

const HudSettingsForm = ({
  categoryRequest,
  apiKey,
  productAuthEmail,
  showApiKey,
  hasApiKey,
  polishBeforePaste,
  cleanupStrength,
  hotkey,
  widgetSize,
  widgetTheme,
  widgetOpacity,
  showWidgetOverFullScreenApps,
  status,
  isDirty,
  runtimeState,
  authBusy,
  onApiKeyChange,
  onProductAuthEmailChange,
  onToggleApiKeyVisibility,
  onPolishBeforePasteChange,
  onCleanupStrengthChange,
  onHotkeyChange,
  onWidgetSizeChange,
  onWidgetThemeChange,
  onWidgetOpacityChange,
  onFullScreenVisibilityChange,
  onSave,
  onRequestMagicLink,
  onSignOut,
  canRestartForUpdate = () => true,
  onCheckForUpdates,
  onQuit
}: HudSettingsFormProps): JSX.Element => {
  const { capabilities, auth, usage, billing, updater, diagnostics, accountLifecycle } = runtimeState;
  const [billingBusy, setBillingBusy] = useState(false);
  const [billingError, setBillingError] = useState('');
  const openCheckout = async (plan: 'standard' | 'pro') => {
    if (billingBusy) return;
    setBillingBusy(true);
    setBillingError('');
    try { await window.speakeasy?.openCheckout(plan); }
    catch { setBillingError('Checkout could not open. Please try again.'); }
    finally { setBillingBusy(false); }
  };
  const [category, setCategory] = useState('dictation');
  const paneRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (categoryRequest) setCategory(categoryRequest.category);
  }, [categoryRequest]);
  useEffect(() => { paneRef.current?.scrollTo({ top: 0 }); }, [category]);
  const [fullScreenBusy, setFullScreenBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const runImmediateChange = async (action: () => void | Promise<void>) => {
    setSaveError('');
    try { await action(); } catch { setSaveError('Could not save that setting. Try again.'); }
  };
  const [supportCategory, setSupportCategory] = useState<ProductSupportCategory>('access');
  const supportRef = useRef<HTMLDetailsElement>(null);
  const [supportMessage, setSupportMessage] = useState('');
  const [dictatedContent, setDictatedContent] = useState('');
  const [attachDictatedContent, setAttachDictatedContent] = useState(false);
  const [attachmentWarningAccepted, setAttachmentWarningAccepted] = useState(false);
  const [supportReceipt, setSupportReceipt] = useState<{ ticketId: string; submittedAt: string; status: string } | null>(null);
  const [supportStatuses, setSupportStatuses] = useState<Array<{ ticketId: string; submittedAt: string; status: string }>>([]);
  const [supportBusy, setSupportBusy] = useState(false);
  const [supportError, setSupportError] = useState('');
  const [exportBusy, setExportBusy] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const exportBundle = async (): Promise<void> => {
    setExportBusy(true);
    setExportStatus('');
    try {
      if (!window.speakeasy) throw new Error('Desktop bridge unavailable');
      const saved = await window.speakeasy.exportSupportEvidence();
      setExportStatus(saved ? 'Support bundle saved. Share the JSON file with your support agent.' : 'Export canceled.');
    } catch { setExportStatus('Could not save the support bundle. Try another location.'); }
    finally { setExportBusy(false); }
  };
  const [actionMessage, setActionMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [deletionReceipt, setDeletionReceipt] = useState('');
  const [deletionBusy, setDeletionBusy] = useState(false);
  const hotkeyOptions = getHotkeyOptionsForPlatform(
    runtimeState.platform.operatingSystem
  );
  const recoveryStep = diagnostics.lastErrorCode === 'auth-required'
    ? 2
    : diagnostics.lastErrorCode === 'consent-required'
      ? 3
      : diagnostics.lastErrorCode === 'microphone-denied' ||
          diagnostics.lastErrorCode === 'microphone-unavailable'
        ? 4
        : diagnostics.lastErrorCode === 'hotkey-unavailable' ||
            diagnostics.lastErrorCode === 'accessibility-required'
          ? 5
          : diagnostics.lastErrorCode === 'paste-failed' ||
              diagnostics.lastErrorCode === 'paste-clipboard-only'
            ? 8
          : null;

  const submitSupport = async (): Promise<void> => {
    setSupportBusy(true);
    setSupportError('');
    try {
      const receipt = await window.speakeasy?.submitSupportRequest({
        category: supportCategory,
        message: supportMessage,
        dictatedContent,
        attachDictatedContent,
        attachmentWarningAccepted
      });
      if (receipt) {
        setSupportReceipt(receipt);
        setSupportMessage('');
        setDictatedContent('');
        setAttachDictatedContent(false);
        setAttachmentWarningAccepted(false);
      }
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Support request failed.');
    } finally {
      setSupportBusy(false);
    }
  };

  const loadSupportStatuses = async (): Promise<void> => {
    setSupportBusy(true);
    setSupportError('');
    try {
      setSupportStatuses(await window.speakeasy?.getSupportTicketStatuses() ?? []);
    } catch (error) {
      setSupportError(error instanceof Error ? error.message : 'Support status could not be loaded.');
    } finally {
      setSupportBusy(false);
    }
  };

  const deleteAccount = async (): Promise<void> => {
    if (confirmation !== 'DELETE') return;
    setDeletionBusy(true);
    setActionMessage('');
    try {
      const result = await window.speakeasy?.deleteProductAccount(confirmation);
      if (result) setDeletionReceipt(result.receipt);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Account deletion could not be completed.');
    } finally {
      setDeletionBusy(false);
    }
  };

  const retryDeletion = async (): Promise<void> => {
    setDeletionBusy(true);
    setActionMessage('');
    try {
      const result = await window.speakeasy?.retryProductAccountDeletion();
      if (result) setDeletionReceipt(result.receipt);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Deletion cleanup is still pending.');
    } finally {
      setDeletionBusy(false);
    }
  };

  return (
    <div className="hud-panel-content quiet-settings no-drag">
      <nav className="quiet-settings-nav" aria-label="Settings categories">
        {[
          ['dictation', 'Dictation'], ['appearance', 'Appearance'],
          ['account', 'Account & billing'], ['help', updater.status === 'downloaded' ? 'Help & updates • Ready' : 'Help & updates']
        ].map(([id, label]) => (
          <button type="button" key={id} data-settings-category={id} aria-current={category === id ? 'page' : undefined}
            onClick={() => setCategory(id)}>{label}</button>
        ))}
      </nav>
      <div ref={paneRef} className="quiet-settings-pane" inert={status === 'saving'}>
      {capabilities.byoApiKey ? (
        <section className="hud-section" hidden={category !== 'account'}>
          <div className="hud-section-header">
            <div>
              <div className="hud-section-kicker">Connection</div>
              <h2 className="hud-section-title">Groq API key</h2>
            </div>
            <div
              className={`hud-badge hud-technical-label ${hasApiKey ? 'hud-badge-ready' : 'hud-badge-missing'}`}
            >
              {hasApiKey ? 'Loaded' : 'Missing'}
            </div>
          </div>

          <div className="hud-input-row">
            <input
              id="speakeasy-groq-api-key"
              aria-label="Groq API key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(event) => onApiKeyChange(event.target.value)}
              className="hud-input no-drag"
              placeholder="gsk_..."
            />
            <button type="button" onClick={onToggleApiKeyVisibility} className="hud-inline-button no-drag">
              {showApiKey ? 'Hide' : 'Show'}
            </button>
          </div>

          {runtimeState.edition === 'oss' ? (
            <div className="hud-static-card">
              <div className="hud-control-title">Prefer not to manage a key?</div>
              <div className="hud-control-caption hud-body-copy">
                The hosted speakeasy. signs in with email — 5 free dictations a week, or $5/month for 12 hours. Same transcription and Polish.
              </div>
              <button
                type="button"
                className="hud-inline-button no-drag"
                onClick={() => void window.speakeasy?.openExternal('https://speakeasywords.com/pricing?utm_source=oss-app&utm_medium=settings')}
              >
                Get the hosted app
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {capabilities.productAuth ? (
        <section className="hud-section" hidden={category !== 'account'}>
          <div className="hud-section-header">
            <div>
              <div className="hud-section-kicker">Account</div>
              <h2 className="hud-section-title">Your account</h2>
            </div>
            <div
              className={`hud-badge hud-technical-label ${
                auth.status === 'signed-in' ? 'hud-badge-ready' : auth.status === 'error' ? 'hud-badge-missing' : 'hud-badge-pending'
              }`}
            >
              {auth.status === 'signed-in' ? 'Signed in' : auth.status === 'link-sent' ? 'Link sent' : 'Sign In Required'}
            </div>
          </div>

          {auth.status === 'signed-in' ? (
            <div className="quiet-account-identity">
              <strong>{auth.email || productAuthEmail || 'Account email unavailable'}</strong>
              <p className="hud-control-caption">{auth.message}</p>
            </div>
          ) : <form className="hud-field no-drag" onSubmit={(event) => {
            event.preventDefault();
            void runImmediateChange(onRequestMagicLink);
          }}>
            <div className="hud-control-title">Email</div>
            <div className="hud-control-caption hud-body-copy">{auth.message}</div>
            <div className="hud-input-row">
              <input
                id="speakeasy-account-email"
                aria-label="Account email"
                type="email"
                value={productAuthEmail}
                onChange={(event) => onProductAuthEmailChange(event.target.value)}
                className="hud-input no-drag"
                placeholder="name@example.com"
              />
              <button
                type="submit"
                className="hud-inline-button no-drag"
                disabled={authBusy || !productAuthEmail.trim()}
              >
                {authBusy ? 'Sending…' : 'Send sign-in link'}
              </button>
            </div>
          </form>}

          <div className="hud-static-card" hidden={auth.status !== 'signed-in'}>
            <div className="hud-control-title">Usage</div>
            <div className="hud-control-caption hud-body-copy">{getUsageLabel(usage)}</div>
            <div className="hud-control-caption hud-body-copy">{formatUsageReset(usage.resetAt)}</div>
          </div>

          <div className="hud-static-card" role="status" aria-live="polite" hidden={auth.status !== 'signed-in'}>
            <div className="hud-control-title">
              {billing.plan === 'free' ? 'Free plan' : `${billing.plan === 'pro' ? 'Pro' : 'Standard'} plan`}
              {billing.cancelAtPeriodEnd && billing.currentPeriodEnd
                ? ` · Cancels ${formatBillingDate(billing.currentPeriodEnd)}`
                : ''}
            </div>
            <div className="hud-control-caption hud-body-copy">
              {billing.status === 'confirming'
                ? 'Confirming your plan…'
                : billing.status === 'payment_issue'
                  ? 'Payment issue. Your confirmed paid access remains available during Stripe recovery.'
                  : billing.message}
            </div>
            {(billing.status === 'confirming' || billing.status === 'payment_issue') ? (
              <button
                type="button"
                onClick={() => void window.speakeasy?.refreshBilling()}
                className="hud-inline-button hud-inline-button-accent no-drag"
              >
                Check again
              </button>
            ) : null}
          </div>

          <div className="hud-inline-actions" hidden={auth.status !== 'signed-in'}>
            <button
              type="button"
              onClick={() => void window.speakeasy?.openBillingPortal()}
              className="hud-inline-button no-drag"
              disabled={auth.status !== 'signed-in'}
            >
              {billing.status === 'payment_issue' ? 'Update payment method' : 'Manage billing'}
            </button>
            {billing.plan !== 'free' ? (
              <button
                type="button"
                onClick={() => {
                  setSupportCategory('refund');
                  setCategory('help');
                  if (supportRef.current) supportRef.current.open = true;
                }}
                className="hud-inline-button no-drag"
              >
                Request refund
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void runImmediateChange(onSignOut)}
              className="hud-inline-button no-drag"
              disabled={auth.status !== 'signed-in'}
            >
              Sign out
            </button>
          </div>

          {auth.status === 'signed-in' ? (
            <div className="hud-field no-drag">
              <section aria-label="Available plans"><h3 className="hud-control-title">Choose your plan</h3>
              {BILLING_CATALOG.map((plan) => (
                <div className="hud-static-card" key={plan.id}>
                  <div className="hud-control-title">{plan.name} · {plan.price}</div>
                  <div className="hud-control-caption hud-body-copy">{plan.allowance}</div>
                  {plan.id !== 'free' && billing.plan === 'free' ? (
                    <button
                      type="button"
                      onClick={() => void openCheckout(plan.id)}
                      disabled={billingBusy}
                      className="hud-inline-button hud-inline-button-accent no-drag"
                    >
                      {billingBusy ? 'Opening Stripe…' : `Choose ${plan.name}`}
                    </button>
                  ) : null}
                </div>
              ))}
              {billingError ? <p role="alert">{billingError}</p> : null}
              <div className="hud-control-caption hud-body-copy">
                Prices are in USD plus applicable taxes. Stripe shows the final currency, tax, and total before payment. No processing, service, platform, or card surcharge.
              </div>
              <div className="hud-control-caption hud-body-copy">
                Refund Promise: one full refund per account when requested within 14 calendar days of a subscription charge, returned to the original payment method. An approved full refund cancels your subscription immediately and returns your account to Free. Billing corrections and legal rights are separate.
              </div>
              {billing.plan !== 'free' ? (
                <div className="hud-control-caption hud-body-copy">
                  Billing Portal shows the exact immediate charge, recurring price, and effective date before confirmation. Standard to Pro is immediate with disclosed proration; Pro to Standard and cancellation take effect at renewal.
                </div>
              ) : null}
              </section>
            </div>
          ) : null}

          {auth.status === 'signed-in' ? (
            <details className="hud-static-card no-drag">
              <summary className="hud-control-title">Hosted processing consent</summary>
              <div className="hud-control-caption hud-body-copy">
                Turning off hosted processing stops future dictation on every signed-in device. It does not sign you out, cancel billing, or delete your account.
              </div>
              <button
                type="button"
                className="hud-inline-button no-drag"
                onClick={() => void window.speakeasy?.withdrawHostedProcessingConsent()
                  .then(() => setActionMessage('Hosted processing is off on every device. Use Open recovery to consent again.'))
                  .catch((error: unknown) => setActionMessage(error instanceof Error ? error.message : 'Consent could not be changed.'))}
              >
                Turn off hosted processing
              </button>
            </details>
          ) : null}

          <details className="hud-static-card no-drag" hidden={auth.status !== 'signed-in' && accountLifecycle.status !== 'deletion-pending'}>
            <summary className="hud-control-title">Delete account</summary>
            <div className="hud-control-caption hud-body-copy">
              Delete your account permanently? This ends your subscription. Limited payment and tax records must be kept.
            </div>
            <button type="button" className="hud-inline-button" onClick={() => void window.speakeasy?.openOnboardingPrivacy()}>
              Learn more
            </button>
            <div className="hud-control-caption hud-body-copy">
              Deletion requires a sign-in from the last 10 minutes. Send and open a fresh sign-in link if needed.
            </div>
            <button type="button" className="hud-inline-button" onClick={() => void runImmediateChange(onRequestMagicLink)} disabled={authBusy}>
              Send fresh sign-in link
            </button>
            <label className="hud-field">
              <span className="hud-control-title">Type DELETE to confirm</span>
              <input className="hud-input" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            <button
              type="button"
              className="hud-inline-button"
              disabled={deletionBusy || auth.status !== 'signed-in' || confirmation !== 'DELETE'}
              onClick={() => void deleteAccount()}
            >
              {deletionBusy ? 'Deleting' : 'Delete permanently'}
            </button>
            {accountLifecycle.status === 'deletion-pending' ? (
              <button type="button" className="hud-inline-button hud-inline-button-accent" disabled={deletionBusy} onClick={() => void retryDeletion()}>
                Retry deletion cleanup
              </button>
            ) : null}
          </details>

          {actionMessage ? <div className="hud-control-caption hud-body-copy" role="status">{actionMessage}</div> : null}
          {deletionReceipt ? (
            <div className="hud-static-card" role="status">
              <div className="hud-control-title">Account deleted. Limited payment and tax records remain.</div>
              <div className="hud-control-caption hud-body-copy">speakeasy. did not change system microphone permission or clipboard history.</div>
              <button type="button" className="hud-inline-button" onClick={() => void window.speakeasy?.copyAccountDeletionReceipt(deletionReceipt)}>
                Copy receipt
              </button>
              <button type="button" className="hud-inline-button" onClick={() => setDeletionReceipt('')}>Close</button>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="hud-section quiet-dictation" hidden={category !== 'dictation'}>
        <div className="hud-field no-drag">
          <div className="hud-control-title">Workflow preset</div>
          <div className="hud-control-caption hud-body-copy">
            Sets Polish before paste and cleanup strength for the way you use speakeasy. Saved with your settings.
          </div>
          <select
            aria-label="Workflow preset"
            value={
              polishBeforePaste
                ? (WORKFLOW_PRESETS.find((preset) => preset.strength === cleanupStrength)?.id ?? 'custom')
                : 'custom'
            }
            onChange={(event) => {
              const preset = WORKFLOW_PRESETS.find((option) => option.id === event.target.value);
              if (!preset) return;
              onPolishBeforePasteChange(true);
              onCleanupStrengthChange(preset.strength);
            }}
            className="hud-select"
          >
            {WORKFLOW_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
            <option value="custom" disabled>Polish off</option>
          </select>
          <div className="hud-control-caption hud-control-tip hud-body-copy">
            {WORKFLOW_PRESETS.find((preset) =>
              polishBeforePaste && preset.strength === cleanupStrength
            )?.tip ?? 'Tune Polish and cleanup strength below.'}
          </div>
        </div>

        <label className="hud-field no-drag">
          <div className="hud-control-title">Hotkey</div>
          <div className="hud-control-caption hud-body-copy">
            Hold this key to record, release to transcribe. Changes apply immediately.
          </div>
          <select
            value={hotkey}
            onChange={(event) => void runImmediateChange(() => onHotkeyChange(event.target.value))}
            className="hud-select"
          >
            {hotkeyOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="hud-toggle-row no-drag">
          <div>
            <div className="hud-control-title">Polish before paste</div>
            <div className="hud-control-caption hud-body-copy">Lightly clean up your words before pasting.</div>
          </div>
          <span className={`hud-switch ${polishBeforePaste ? 'is-on' : ''}`}>
            <input
              type="checkbox"
              checked={polishBeforePaste}
              onChange={(event) => onPolishBeforePasteChange(event.target.checked)}
            />
            <span className="hud-switch-thumb" />
          </span>
        </label>

        <label className="hud-field no-drag">
          <div className="hud-control-title">Cleanup strength</div>
          <div className="hud-control-caption hud-body-copy">Remove filler and fix punctuation while preserving your meaning.</div>
          <select
            value={cleanupStrength}
            onChange={(event) => onCleanupStrengthChange(event.target.value as CleanupStrength)}
            className="hud-select"
          >
            <option value="minimal">Minimal</option>
            <option value="balanced">Balanced</option>
            <option value="strong">Strong</option>
          </select>
        </label>
      </section>

      <section className="hud-section" hidden={category !== 'appearance'}>
        <div className="hud-section-header">
          <div>
            <div className="hud-section-kicker">Appearance</div>
            <h2 className="hud-section-title">Make it comfortable</h2>
          </div>
        </div>

        {runtimeState.platform.operatingSystem === 'macos' && (
          <label className="hud-toggle-row no-drag">
            <div>
              <div className="hud-control-title">Show widget over full-screen apps</div>
              <div className="hud-control-caption hud-body-copy" id="fullscreen-widget-description">Keep the widget visible when another app is in full screen. Saved immediately.</div>
            </div>
            <span className={`hud-switch ${showWidgetOverFullScreenApps ? 'is-on' : ''}`}>
              <input
                type="checkbox"
                aria-label="Show widget over full-screen apps"
                aria-describedby="fullscreen-widget-description"
                checked={showWidgetOverFullScreenApps}
                disabled={fullScreenBusy}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setFullScreenBusy(true);
                  void runImmediateChange(() => onFullScreenVisibilityChange(enabled))
                    .finally(() => setFullScreenBusy(false));
                }}
              />
              <span className="hud-switch-thumb" />
            </span>
          </label>
        )}

        <label className="hud-field hud-opacity-field no-drag">
          <div className="hud-opacity-heading">
            <div>
              <div className="hud-control-title">Widget opacity</div>
              <div className="hud-control-caption hud-body-copy">{widgetTheme === 'high-contrast' ? 'High contrast keeps the widget fully opaque. Your opacity setting applies to other themes.' : 'Preview the bookmark opacity. Save changes to keep it. Status and settings stay readable.'}</div>
            </div>
            <output htmlFor="speakeasy-widget-opacity">{widgetTheme === 'high-contrast' ? 100 : widgetOpacity}%</output>
          </div>
          <input
            id="speakeasy-widget-opacity"
            className="hud-opacity-control"
            type="range"
            disabled={widgetTheme === 'high-contrast'}
            min="30"
            max="90"
            step="5"
            value={widgetOpacity}
            aria-valuetext={`${widgetTheme === 'high-contrast' ? 100 : widgetOpacity}% opacity`}
            onInput={(event) => onWidgetOpacityChange(Number(event.currentTarget.value))}
          />
        </label>

        <div className="hud-field no-drag">
          <div className="hud-control-title">Widget size</div>
          <div className="hud-size-group" role="group" aria-label="Widget size">
            {WIDGET_SIZE_OPTIONS.map((option) => {
              const selected = option.id === widgetSize;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`hud-size-button ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => void runImmediateChange(() => onWidgetSizeChange(option.id))}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hud-field no-drag">
          <div className="hud-control-title">Theme</div>
          <p className="hud-control-caption">Applies to the widget and all settings. Saved immediately.</p>
          <div className="hud-theme-grid" role="group" aria-label="Theme">
            {WIDGET_THEME_OPTIONS.map((option) => {
              const selected = option.id === widgetTheme;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`hud-theme-button ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => void runImmediateChange(() => onWidgetThemeChange(option.id))}
                  aria-label={option.label}
                  title={option.description}
                >
                  <ThemePreview theme={option} />
                  {selected && <CheckIcon className="theme-selected-mark" aria-hidden="true" />}
                  <span className="hud-theme-label">{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="hud-section" hidden={category !== 'help'}>
        <h2 className="hud-section-title">Help & updates</h2>

        <div className="hud-static-card">
          <div className="hud-control-title">Your dictation</div>
          {runtimeState.dictationStats.totalDictations === 0 ? (
            <div className="hud-control-caption hud-body-copy">Your first dictation will show up here.</div>
          ) : (
            <>
              <div className="hud-control-caption hud-body-copy">
                {runtimeState.dictationStats.totalDictations.toLocaleString('en-US')} dictations · {runtimeState.dictationStats.totalWords.toLocaleString('en-US')} words · about {estimateTypingMinutes(runtimeState.dictationStats.totalWords)} min of typing at 40 wpm
              </div>
              <div className="hud-inline-actions">
                <button
                  type="button"
                  className="hud-inline-button no-drag"
                  onClick={() => void window.speakeasy?.openExternal(
                    `https://x.com/intent/post?text=${encodeURIComponent(formatShareText(runtimeState.dictationStats))}`
                  )}
                >
                  Share on X
                </button>
              </div>
            </>
          )}
        </div>

        <div className="hud-inline-actions">
          <button type="button" className="hud-inline-button" onClick={() => void window.speakeasy?.openOnboardingSupport()}>Contact support</button>
          <button type="button" className="hud-inline-button" onClick={() => void window.speakeasy?.openOnboardingPrivacy()}>Privacy & terms</button>
            {capabilities.productAuth && !recoveryStep ? (
              <button
                type="button"
                onClick={() => void window.speakeasy?.runSetupReview()}
                className="hud-inline-button no-drag"
                disabled={auth.status !== 'signed-in'}
              >
                Run setup again
              </button>
            ) : null}
        </div>
          {capabilities.productAuth && recoveryStep ? (
            <div className="hud-static-card" role="status">
              <div className="hud-control-title">
                {recoveryStep === 8 ? 'Paste needs attention' : 'Run setup again'}
              </div>
              <div className="hud-control-caption hud-body-copy">
                {recoveryStep === 8
                  ? `If your text is on the clipboard, press ${runtimeState.platform.operatingSystem === 'macos' ? 'Command+V' : 'Ctrl+V'} once, then recheck automatic paste before dictating again.`
                  : 'Continue from the setup step you need. Your saved preferences stay in place.'}
              </div>
              <button
                type="button"
                onClick={() => void window.speakeasy?.runSetupRecovery(recoveryStep)}
                className="hud-inline-button hud-inline-button-accent no-drag"
              >
                {recoveryStep === 8 ? 'Open recovery' : 'Continue setup'}
              </button>
            </div>
          ) : null}

          <details ref={supportRef} className="hud-static-card no-drag">
            <summary className="hud-control-title">Support</summary>
            <div className="hud-control-caption hud-body-copy">
              Diagnostics are privacy-safe by default. No response-time promise is made.
            </div>
            <label className="hud-field">
              <span className="hud-control-title">Category</span>
              <select
                className="hud-select"
                value={supportCategory}
                onChange={(event) => setSupportCategory(event.target.value as ProductSupportCategory)}
              >
                <option value="access">Access or sign-in</option>
                <option value="billing">Billing</option>
                <option value="refund">Refund</option>
                <option value="deletion">Account deletion</option>
                <option value="security">Security or privacy</option>
                <option value="ai_output">AI output</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="hud-field">
              <span className="hud-control-title">What happened?</span>
              <textarea
                className="hud-input hud-textarea"
                value={supportMessage}
                maxLength={4000}
                onChange={(event) => setSupportMessage(event.target.value)}
              />
            </label>
            {supportCategory === 'ai_output' ? (
              <div className="hud-field">
                <label className="hud-toggle-row">
                  <span>
                    <span className="hud-control-title">Attach dictated content</span>
                    <span className="hud-control-caption hud-body-copy">Dictated content is excluded unless you attach it here.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={attachDictatedContent}
                    onChange={(event) => setAttachDictatedContent(event.target.checked)}
                  />
                </label>
                {attachDictatedContent ? (
                  <>
                    <textarea
                      aria-label="Dictated content attachment"
                      className="hud-input hud-textarea"
                      value={dictatedContent}
                      maxLength={10000}
                      onChange={(event) => setDictatedContent(event.target.value)}
                    />
                    <label className="hud-control-caption hud-body-copy">
                      <input
                        type="checkbox"
                        checked={attachmentWarningAccepted}
                        onChange={(event) => setAttachmentWarningAccepted(event.target.checked)}
                      />{' '}
                      I understand this sends the attached dictated content to support.
                    </label>
                  </>
                ) : null}
              </div>
            ) : null}
            <div className="hud-inline-actions">
              <button
                type="button"
                className="hud-inline-button hud-inline-button-accent"
                disabled={supportBusy || auth.status !== 'signed-in' || !supportMessage.trim()}
                onClick={() => void submitSupport()}
              >
                {supportBusy ? 'Sending' : 'Send support request'}
              </button>
              <button type="button" className="hud-inline-button" onClick={() => void loadSupportStatuses()} disabled={supportBusy || auth.status !== 'signed-in'}>
                Check status
              </button>
            </div>
            {supportReceipt ? (
              <div className="hud-static-card" role="status">
                <div className="hud-control-title">Received</div>
                <div className="hud-control-caption hud-body-copy hud-technical-label">Ticket ID: {supportReceipt.ticketId}</div>
                <div className="hud-control-caption hud-body-copy">Submitted: {new Date(supportReceipt.submittedAt).toLocaleString()}</div>
                <div className="hud-control-caption hud-body-copy">Status: {supportReceipt.status}</div>
              </div>
            ) : null}
            {supportStatuses.map((ticket) => (
              <div className="hud-control-caption hud-body-copy hud-technical-label" key={ticket.ticketId}>
                {ticket.ticketId} · {ticket.status} · {new Date(ticket.submittedAt).toLocaleDateString()}
              </div>
            ))}
            {supportError ? <div className="hud-control-caption hud-body-copy" role="alert">{supportError}</div> : null}
          </details>


        <details className="hud-static-card"><summary className="hud-control-title">Diagnostics & permissions</summary>

        <div className="hud-section-header">
          <div>
            <div className="hud-section-kicker">Diagnostics</div>
            <h2 className="hud-section-title hud-wordmark">
              {diagnostics.appName} {diagnostics.appVersion}
            </h2>
          </div>
        </div>

        <div className="hud-diagnostics-grid">
          <div className="hud-static-card">
            <div className="hud-control-title">Edition</div>
            <div className="hud-control-caption hud-body-copy hud-technical-label">
              {diagnostics.edition} / {diagnostics.releaseChannel}
              <br />
              {runtimeState.platform.operatingSystem} / {runtimeState.platform.architecture}
              <br />
              {runtimeState.platform.distribution}
            </div>
          </div>
          <div className="hud-static-card">
            <div className="hud-control-title">Permissions</div>
            <div className="hud-control-caption hud-body-copy hud-technical-label">
              Mic: {diagnostics.microphonePermission}
              <br />
              Accessibility: {diagnostics.accessibilityPermission}
            </div>
          </div>
          <div className="hud-static-card">
            <div className="hud-control-title">Hotkey mode</div>
            <div className="hud-control-caption hud-body-copy hud-technical-label">{diagnostics.hotkeyMode}</div>
          </div>
          <div className="hud-static-card">
            <div className="hud-control-title">Last error</div>
            <div className="hud-control-caption hud-body-copy hud-technical-label">{diagnostics.lastErrorCode}</div>
          </div>
        </div>
        <div className="hud-control-caption hud-body-copy">
          This report excludes email, account/session tokens, device identifiers, dictated text, generated text, clipboard content, window titles, and API keys.
        </div>
        <div className="hud-inline-actions">
          <button type="button" className="hud-inline-button no-drag" onClick={() => void window.speakeasy?.copySupportEvidence()}>
            Copy diagnostics
          </button>
          <button type="button" className="hud-inline-button no-drag" disabled={exportBusy} onClick={() => void exportBundle()}>
            {exportBusy ? 'Exporting…' : 'Export support bundle'}
          </button>
        </div>
        <div className="hud-control-caption hud-body-copy" role="status">{exportStatus}</div>
        <div className="hud-control-caption hud-body-copy">The support bundle includes recent errors and event history across restarts. Logs stay on this Mac until you share them.</div>
        </details>
        <button type="button" onClick={onQuit} className="hud-inline-button hud-quit-button">Quit speakeasy.</button>
      </section>

      {capabilities.autoUpdate ? (
        <details className="hud-section hud-section-collapsible no-drag" hidden={category !== 'help'} open={['available', 'downloading', 'downloaded', 'error'].includes(updater.status)}>
          <summary className="hud-section-summary">
            <div>
              <div className="hud-section-kicker">Updates</div>
              <h2 className="hud-section-title">App updates</h2>
            </div>
            <div className="hud-section-summary-meta">
              <span
                className={`hud-badge hud-technical-label ${
                  updater.status === 'available'
                    ? 'hud-badge-ready'
                    : updater.status === 'error'
                      ? 'hud-badge-pending'
                      : 'hud-badge-missing'
                }`}
              >
                {updater.status === 'downloaded' ? 'Ready to restart' : updater.status === 'downloading' ? `${updater.progress ?? 0}%` : updater.status === 'available' ? `v${updater.availableVersion}` : updater.status}
              </span>
              <span className="hud-section-chevron" aria-hidden="true" />
            </div>
          </summary>

          <div className="hud-static-card">
            <div className="hud-control-title hud-technical-label">Installed version {runtimeState.diagnostics.appVersion}</div>
            <div className="hud-control-caption hud-control-caption-log hud-body-copy">{updater.message}</div>
          </div>

          {updater.status === 'downloaded' && isDirty ? <p className="hud-control-caption">Save your settings before restarting.</p> : null}
          <div className="hud-inline-actions">
            {updater.downloadUrl && updater.status !== 'downloading' ? (
              <button
                type="button"
                onClick={() => void window.speakeasy?.openDownload()}
                className="hud-inline-button hud-inline-button-accent no-drag"
              >
                Download installer
              </button>
            ) : null}
            {updater.status === 'downloaded' ? (
              <button type="button" disabled={isDirty || status === 'saving'}
                onClick={() => {
                  if (!canRestartForUpdate()) { setActionMessage('Finish your recording or dictation before restarting.'); return; }
                  void window.speakeasy?.installUpdate();
                }} className="hud-inline-button hud-inline-button-accent no-drag">
                Update and restart
              </button>
            ) : null}
            <button type="button" disabled={['checking', 'downloading', 'downloaded'].includes(updater.status)} onClick={() => void onCheckForUpdates()} className="hud-inline-button no-drag">
              Check now
            </button>
          </div>
        </details>
      ) : null}

      </div>
      <div className="hud-footer no-drag">
        <div
          className="hud-footer-status hud-technical-label"
          data-state={saveError ? 'error' : status}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {saveError || (status === 'error' ? 'Could not save. Try again.' : status === 'saving' ? 'Saving changes…' : isDirty ? 'Unsaved changes' : status === 'saved' ? 'Changes saved' : 'All changes saved')}
        </div>
        <div className="hud-footer-actions">
          <button type="button" onClick={async () => {
            setSaveError('');
            try { await onSave(); } catch { setSaveError('Could not save. Your edits are still here.'); }
          }} disabled={!isDirty || status === 'saving'} className="hud-save-button">
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
};

export default HudSettingsForm;
