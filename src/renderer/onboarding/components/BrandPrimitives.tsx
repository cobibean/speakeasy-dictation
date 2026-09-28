import type { JSX } from 'react';
import brandLockup from '../../assets/brand/lockup-horizontal-color.svg';
import symbol from '../../assets/brand/symbol-reverse.svg';
import { CheckIcon, ExclamationTriangleIcon, DotFilledIcon } from '@radix-ui/react-icons';

export const Waveform = ({ active }: { active: boolean }): JSX.Element => (
  <div className="setup-waveform" data-active={active} aria-hidden="true">
    <svg viewBox="0 0 180 72" role="presentation">
      <path pathLength="1" d="M3 36 C12 36 14 20 24 20 S38 55 49 55 S62 10 75 10 S89 61 101 61 S116 18 128 18 S142 49 152 49 S166 36 177 36" />
    </svg>
  </div>
);

export const BrandLockup = (): JSX.Element => (
  <div className="brand-lockup" aria-label="Speakeasy">
    <img src={brandLockup} alt="" aria-hidden="true" />
  </div>
);

export const EdgeBookmark = ({
  active = false,
  processing = false,
  complete = false,
  side = 'right'
}: {
  active?: boolean;
  processing?: boolean;
  complete?: boolean;
  side?: 'left' | 'right' | 'top';
}): JSX.Element => (
  <div
    className="edge-bookmark"
    data-active={active}
    data-processing={processing}
    data-complete={complete}
    data-side={side}
    aria-hidden="true"
  >
    <img className="bookmark-logo" src={symbol} alt="" />
    <span className="bookmark-signal" />
  </div>
);

export const AppEdgeScene = ({
  ready = false,
  sentence = 'A clear thought, ready to send.'
}: {
  ready?: boolean;
  sentence?: string;
}): JSX.Element => {
  const trimmedSentence = sentence.trim();
  const sentenceBody = trimmedSentence.replace(/[.!?]+$/, '');
  const sentenceEnd = trimmedSentence.match(/[.!?]+$/)?.[0] ?? '.';

  return (
  <div
    className="edge-scene"
    aria-label={ready
      ? 'Speakeasy attached to the right edge of the Windows desktop'
      : 'A writing app with Speakeasy attached to the physical display edge'}
  >
    <div className="scene-desktop">
      <div className="scene-window">
        <div className="scene-window-bar"><span /><span /><span /></div>
        <div className="scene-document">
          <span className="scene-line scene-line-long" />
          <span className="scene-line" />
          <span className="scene-sentence">
            {sentenceBody}<span className="coral-period">{sentenceEnd}</span>
          </span>
        </div>
      </div>
      <div className="scene-taskbar" aria-hidden="true">
        <span className="scene-windows-mark"><i /><i /><i /><i /></span>
        <span className="scene-search" />
        <span className="scene-tray" />
      </div>
    </div>
    <div className="desktop-space" />
    <div className="physical-edge"><EdgeBookmark complete={ready} /></div>
  </div>
  );
};

export const StatusGlyph = ({
  kind = 'progress'
}: {
  kind?: 'neutral' | 'progress' | 'success' | 'error';
}): JSX.Element => (
  <span className="status-glyph" data-kind={kind} aria-hidden="true">
    {kind === 'success' ? <CheckIcon /> : kind === 'error' ? <ExclamationTriangleIcon /> : <DotFilledIcon />}
  </span>
);

export const Keycap = ({ label, held }: { label: string; held: boolean }): JSX.Element => {
  const parts = label.toUpperCase().split(' ');
  return (
    <span className="keycap" data-held={held} aria-label={`${label} key${held ? ', held' : ''}`}>
      <span>{parts.length > 1 ? parts[0] : 'KEY'}</span>
      <strong>{parts.slice(1).join(' ') || parts[0]}</strong>
    </span>
  );
};
