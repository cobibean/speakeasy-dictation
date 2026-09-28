import type { OverlayStatus, WidgetEdge } from '../../shared/types';
import { AFTERGLOW } from './afterglow-preset';

type Presentation = { status: OverlayStatus; edge: WidgetEdge; reduced: boolean; opacity: number };
const isLive = (status: OverlayStatus) => ['listening', 'transcribing', 'polishing'].includes(status);

/** Own only these animations; never cancel settings, focus, or other UI motion. */
export function createAfterglow(root: HTMLElement) {
  const rail = root.querySelector<HTMLElement>('.spine-extension')!;
  const field = root.querySelector<HTMLElement>('.spine-signal-field')!;
  const pip = root.querySelector<HTMLElement>('.spine-state-pip')!;
  const caption = root.querySelector<HTMLElement>('.spine-status-label')!;
  const marks = [...root.querySelectorAll<HTMLElement>('.spine-signal-mark')];
  let railAnimation: Animation | undefined;
  let captionAnimation: Animation | undefined;
  let ambient: Animation[] = [];
  let previous: Presentation | undefined;
  const stopAmbient = () => { ambient.forEach(a => a.cancel()); ambient = []; };
  const cancel = () => { railAnimation?.cancel(); captionAnimation?.cancel(); stopAmbient(); };

  return {
    update(next: Presentation) {
      const shown = getComputedStyle(rail);
      const current = { transform: shown.transform, opacity: shown.opacity };
      const top = next.edge === 'top';
      const active = next.status !== 'idle';
      const live = isLive(next.status);
      const alpha = next.opacity / 100;
      const frames = (values: readonly { transform: string; opacity: number }[]): Keyframe[] => values.map(f => ({
        transform: top ? f.transform.replace(/scale\(1,([^)]*)\)/, 'scale($1,1)') : f.transform,
        opacity: f.opacity * alpha
      }));
      const animateRail = (keyframes: Keyframe[], duration: number = AFTERGLOW.duration) => {
        railAnimation = rail.animate(keyframes, { duration, easing: AFTERGLOW.easing, fill: 'both' });
        // Native hit regions use layout boxes, not a sampled frame of this effect.
      };
      railAnimation?.cancel();
      rail.style.opacity = active ? String(alpha) : '0';
      rail.style.transform = 'none';
      field.style.transition = next.reduced ? 'none' : '';
      field.style.transform = live && next.status !== 'listening' ? (top ? 'scaleY(.65)' : 'scaleX(.65)') : 'none';

      if (next.reduced || (active && !live)) {
        cancel();
      } else if (!active) {
        if (previous && previous.status !== 'idle') {
          animateRail([current, ...frames(AFTERGLOW.exit).slice(1)]);
          const exit = railAnimation;
          void exit?.finished.then(() => { if (railAnimation === exit) stopAmbient(); }).catch(() => {});
        } else {
          stopAmbient();
        }
      } else {
        if (next.status === 'listening' && previous?.status !== 'listening') {
          animateRail(Number(current.opacity) < .01 ? frames(AFTERGLOW.enter) : [current, ...frames(AFTERGLOW.enter).slice(1)]);
        } else if (next.status === 'transcribing' && previous?.status === 'listening') {
          animateRail([current, ...frames(AFTERGLOW.gather).slice(1)]);
        } else {
          animateRail([current, { transform: 'none', opacity: alpha }], 840);
        }
        if (!ambient.length || previous?.edge !== next.edge) {
          stopAmbient();
          ambient = marks.map((mark, i) => mark.animate(
            [.3, 1, .7, .9, .3].map((scale, index) => ({ transform: `${top ? 'scaleY' : 'scaleX'}(${scale})`, opacity: [.2, 1, .4, .65, .2][index] })),
            { duration: AFTERGLOW.listeningPeriod, iterations: Infinity, easing: 'ease-in-out', delay: -((i % 2) * 220 + i * 30) }
          ));
          ambient.push(pip.animate([
            { opacity: .65, transform: 'scale(.9)' }, { opacity: 1, transform: 'scale(1.12)' }, { opacity: .65, transform: 'scale(.9)' }
          ], { duration: 3000, iterations: Infinity, easing: 'ease-in-out' }));
        }
        ambient.slice(0, marks.length).forEach(a => a.updatePlaybackRate(next.status === 'listening' ? 1 : AFTERGLOW.listeningPeriod / AFTERGLOW.processingPeriod));
      }
      captionAnimation?.cancel();
      if (live && !next.reduced && previous?.status !== next.status) {
        captionAnimation = caption.animate([
          { opacity: .6, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 500, easing: AFTERGLOW.easing });
      }
      previous = next;
    },
    dispose: cancel
  };
}
