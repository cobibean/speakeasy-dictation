import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject, type JSX } from 'react';
import { createAfterglow } from './afterglow';
import { useReducedMotion } from './use-reduced-motion';
import './afterglow.css';
import symbolReverse from '../assets/brand/symbol-reverse.svg';
import brandLockup from '../assets/brand/lockup-horizontal-color.svg';
import brandLockupReverse from '../assets/brand/lockup-horizontal-reverse.svg';
import { Cross2Icon } from '@radix-ui/react-icons';
import type { OverlayStatus, WidgetEdge, WidgetPosition } from '../../shared/types';

const SIGNAL_VALUES = [32, 66, 42, 84, 55, 26, 72, 48, 90, 38, 64, 30, 78, 46, 58, 24, 70, 40];

interface CursorSpineProps {
  edge: WidgetEdge;
  bookmarkOffset?: WidgetPosition;
  railReversed?: boolean;
  status: OverlayStatus;
  statusLabel: string;
  cleanupFallback?: boolean;
  onDismissCleanup?: () => void;
  opacity: number;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  toggleRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
  motion?: 'afterglow' | 'preview';
  reduceMotion?: boolean;
}


const SignalField = ({ status }: { status: OverlayStatus }): JSX.Element => (
  <span className="spine-signal-field" aria-hidden="true">
    {SIGNAL_VALUES.map((value, index) => (
      <span
        className="spine-signal-mark"
        key={`${value}-${index}`}
        style={{ '--signal-value': `${value}%`, '--signal-delay': `${index * -42}ms` } as CSSProperties}
      />
    ))}
  </span>
);

const CursorSpine = ({
  edge,
  bookmarkOffset,
  railReversed = false,
  status,
  statusLabel,
  cleanupFallback = false,
  onDismissCleanup,
  opacity,
  settingsOpen,
  onToggleSettings,
  toggleRef,
  children,
  motion = 'afterglow',
  reduceMotion = false
}: CursorSpineProps): JSX.Element => {
  const root = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createAfterglow> | null>(null);
  const systemReduced = useReducedMotion();
  useLayoutEffect(() => {
    if (motion !== 'afterglow' || !root.current) return;
    const instance = createAfterglow(root.current);
    controller.current = instance;
    return () => { instance.dispose(); controller.current = null; };
  }, [motion]);
  useLayoutEffect(() => {
    controller.current?.update({ status, edge, opacity, reduced: systemReduced || reduceMotion });
  }, [status, edge, railReversed, opacity, systemReduced, reduceMotion, motion]);
  return (
  <div
    ref={root}
    className="cursor-spine-widget"
    data-motion={motion}
    data-edge={edge}
    data-status={status}
    data-cleanup-fallback={cleanupFallback}
    data-settings={settingsOpen}
    data-rail-reversed={railReversed}
    style={{
      '--widget-opacity': opacity / 100,
      '--bookmark-x': `${bookmarkOffset?.x ?? 0}px`,
      '--bookmark-y': `${bookmarkOffset?.y ?? 0}px`
    } as CSSProperties}
  >
    <div className="spine-extension app-drag">
      <SignalField status={status} />
      <span className="spine-cap" />
    </div>

    <div className="spine-bookmark app-drag">
      <button
        ref={toggleRef}
        className="spine-settings-trigger no-drag"
        type="button"
        aria-label={settingsOpen ? 'Close settings' : 'Open settings'}
        aria-expanded={settingsOpen}
        aria-controls="speakeasy-settings-panel"
        title={settingsOpen ? 'Close settings' : 'Open settings'}
        onClick={onToggleSettings}
      >
        <img src={symbolReverse} alt="" />
      </button>
      <span className="spine-state-pip" aria-hidden="true" />
    </div>
    {cleanupFallback ? (
      <button
        type="button"
        className="spine-status-label no-drag"
        aria-label={`${statusLabel}. Dismiss notice`}
        title="Dismiss notice"
        onClick={onDismissCleanup}
      >{statusLabel}</button>
    ) : <span className="spine-status-label">{statusLabel}</span>}

    {settingsOpen ? (
      <aside id="speakeasy-settings-panel" className="spine-settings-sheet no-drag" aria-label="speakeasy. settings">
        <header className="spine-settings-header">
          <div className="spine-settings-brand">
            <img className="brand-on-light" src={brandLockup} alt="speakeasy." />
            <img className="brand-on-dark" src={brandLockupReverse} alt="speakeasy." />
          </div>
          <span className="quiet-header-status">{statusLabel}</span>
          <button className="spine-settings-close" type="button" aria-label="Close settings" onClick={onToggleSettings}>
            <Cross2Icon width={20} height={20} aria-hidden="true" />
          </button>
        </header>
        <div className="spine-settings-body">
          {children}
        </div>
      </aside>
    ) : null}
  </div>
  );
};

export default CursorSpine;
