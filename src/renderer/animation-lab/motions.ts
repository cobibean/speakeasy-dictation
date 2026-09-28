import { AFTERGLOW } from '../ui/afterglow-preset';
export type Phase = 'idle' | 'listening' | 'transcribing' | 'polishing' | 'done';
export type Motion = { id: string; name: string; character: string; press: string; release: string; duration: number; easing: string; enter: Keyframe[]; exit: Keyframe[]; gather: Keyframe[]; wave: number };
const smooth = 'cubic-bezier(.22,1,.36,1)';
const silk = 'cubic-bezier(.45,0,.15,1)';
const reveal = (bottom: number): Keyframe => ({ clipPath: `inset(0 0 ${bottom}% 0)`, opacity: 1 });
const scale = (y: number, x = 1): Keyframe => ({ transform: `scale(${x},${y})`, opacity: 1 });
export const MOTIONS: Motion[] = [
  { id: 'silk', name: 'Silk draw', character: 'Fluid · composed', duration: 780, easing: silk, wave: 0,
    press: 'The rail unrolls from the bookmark. The signal follows a beat behind.', release: 'The voice settles into a low tide; the rail draws back into its anchor.',
    enter: [reveal(100), reveal(0)], exit: [reveal(0), reveal(100)], gather: [scale(1), scale(.8), scale(1)] },
  { id: 'spring', name: 'Soft spring', character: 'Tactile · cushioned', duration: 920, easing: smooth, wave: 1,
    press: 'A weighted extension stretches gently and settles into place.', release: 'A small compression absorbs the release, like a soft mechanical switch.',
    enter: [scale(.02,.8), scale(1.045,1.03), scale(.99), scale(1)], exit: [scale(1),scale(1.025),scale(.01,.8)], gather: [scale(1),scale(.91,1.12),scale(1.018,.98),scale(1)] },
  { id: 'tide', name: 'Slow tide', character: 'Organic · unhurried', duration: 1100, easing: 'cubic-bezier(.37,0,.63,1)', wave: 2,
    press: 'A long, even inhale opens the rail. The whole signal breathes together.', release: 'The energy ebbs down in one continuous exhale, then recedes.',
    enter: [scale(.02),scale(1)], exit: [scale(1),scale(.02)], gather: [scale(1),scale(.85),scale(1)] },
  { id: 'cascade', name: 'Signal cascade', character: 'Sequenced · precise', duration: 860, easing: smooth, wave: 3,
    press: 'Light travels down the rail in a deliberate, staggered sequence.', release: 'The sequence reverses: each little signal hands its energy back upward.',
    enter: [reveal(100),reveal(0)], exit: [reveal(0),reveal(100)], gather: [scale(1),scale(.96),scale(1)] },
  { id: 'ribbon', name: 'Living ribbon', character: 'Supple · expressive', duration: 1000, easing: silk, wave: 4,
    press: 'A narrow ribbon unfurls, with a soft change in width as it arrives.', release: 'The ribbon narrows into a thread while your words take shape.',
    enter: [scale(.01,.18),scale(.72,.55),scale(1,1)], exit: [scale(1),scale(.75,.3),scale(.01,.15)], gather: [scale(1),scale(1,.45),scale(1,.75)] },
  { id: 'magnetic', name: 'Magnetic return', character: 'Focused · satisfying', duration: 820, easing: smooth, wave: 5,
    press: 'The rail extends with quiet weight; the signal gathers around its center.', release: 'Voice marks converge toward the bookmark, leaving a quiet scanning line.',
    enter: [scale(.05),scale(1)], exit: [scale(1),scale(.02)], gather: [scale(1),scale(.65,1.1),scale(1)] },
  { id: 'bloom', name: 'Warm bloom', character: 'Soft · luminous', duration: 900, easing: silk, wave: 6,
    press: 'The rail comes into focus and a warm pulse blooms from the status light.', release: 'The light softens into a steady glow, then resolves with one small pulse.',
    enter: [{...scale(.92,.6),filter:'blur(3px)',opacity:0},{...scale(1),filter:'blur(0px)',opacity:1}],
    exit: [{...scale(1),filter:'blur(0px)'},{...scale(.96,.6),filter:'blur(3px)',opacity:0}], gather: [scale(1),scale(1,1.12),scale(1)] },
  { id: 'ink', name: 'Ink flow', character: 'Editorial · continuous', duration: 1050, easing: silk, wave: 7,
    press: 'A fine thread leads the way. The signal fills it like ink entering a pen.', release: 'The marks lengthen into a flowing current before finishing at the cursor.',
    enter: [scale(.01,.18),scale(1,.18),scale(1)], exit: [scale(1),scale(1,.18),scale(.01,.18)], gather: [scale(1),scale(1,.4),scale(1)] },
  { id: 'orbit', name: 'Quiet orbit', character: 'Rhythmic · hypnotic', duration: 850, easing: smooth, wave: 8,
    press: 'A wave of energy circles through the rail, with each mark gently following.', release: 'The wave slows into a pendulum: a calm, readable processing rhythm.',
    enter: [reveal(100),reveal(0)], exit: [reveal(0),reveal(100)], gather: [scale(1),scale(.94),scale(1)] },
  { ...AFTERGLOW, character: 'Airy · lingering', wave: 9,
    press: 'The rail arrives softly and paired signals rise like overlapping echoes.', release: 'A final echo travels outward, then the signal gently fades home.',
    enter: [...AFTERGLOW.enter], exit: [...AFTERGLOW.exit], gather: [...AFTERGLOW.gather] }
];

// All motion targets the real CursorSpine markup. Only this offline entry calls it.
export function animateMotion(root: HTMLElement, motion: Motion, phase: Phase, rate: number, reduced: boolean, previous: Phase) {
  const rail = root.querySelector<HTMLElement>('.spine-extension')!;
  const caption = root.querySelector<HTMLElement>('.spine-status-label')!;
  const pip = root.querySelector<HTMLElement>('.spine-state-pip')!;
  const marks = Array.from(root.querySelectorAll<HTMLElement>('.spine-signal-mark'));
  // Capture the presented rail before cancellation, so quick release/reset never snaps.
  const shown = getComputedStyle(rail);
  const current: Keyframe = { transform: shown.transform, clipPath: shown.clipPath, opacity: shown.opacity, filter: shown.filter };
  root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  const active = phase !== 'idle';
  rail.style.opacity = active ? '1' : '0';
  rail.style.transform = 'none'; rail.style.clipPath = 'none'; rail.style.filter = 'none';
  caption.style.opacity = active ? '1' : '0';
  if (reduced) return () => {};
  const animations: Animation[] = [];
  const play = (element: HTMLElement, frames: Keyframe[], duration: number, extra: KeyframeAnimationOptions = {}) => {
    const a = element.animate(frames, { duration: duration / rate, easing: motion.easing, fill: 'both', ...extra });
    animations.push(a); return a;
  };
  if (phase === 'idle') {
    if (previous !== 'idle') play(rail, [current, ...motion.exit.slice(1)], motion.duration);
  } else if (phase === 'listening') {
    play(rail, Number(current.opacity) < .01 ? motion.enter : [current, ...motion.enter.slice(1)], motion.duration);
  } else if (phase === 'transcribing') {
    play(rail, [current, ...motion.gather.slice(1)], motion.duration);
  } else {
    play(rail, [current, scale(1)], motion.duration * .7);
  }
  if (active) play(caption, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'translateY(0)' }], 500);
  if (phase === 'done') {
    play(pip, [{ transform: 'scale(1)', boxShadow:'0 0 0 0 var(--theme-signal)' },{ transform:'scale(1.3)',boxShadow:'0 0 0 7px transparent' },{transform:'scale(1)',boxShadow:'0 0 0 10px transparent'}],900);
  } else if (active) {
    play(pip, [{opacity:.65,transform:'scale(.9)'},{opacity:1,transform:'scale(1.12)'},{opacity:.65,transform:'scale(.9)'}],motion.wave===6?2200:3000,{iterations:Infinity,easing:'ease-in-out'});
  }
  if (phase === 'idle' || phase === 'done') return () => animations.forEach(a => a.cancel());
  const processing = phase !== 'listening';
  marks.forEach((mark, i) => {
    const j = i / Math.max(1, marks.length - 1);
    const wave = motion.wave;
    const duration = processing ? 2600 + wave * 110 : 1600 + wave * 90;
    const height = processing ? .65 : 1;
    let frames: Keyframe[];
    switch (wave) {
      case 1: frames = [{transform:'scaleX(.35)'},{transform:`scaleX(${1.1*height})`},{transform:'scaleX(.35)'}]; break;
      case 2: frames = [{transform:'scaleX(.28)',opacity:.4},{transform:`scaleX(${height})`,opacity:1},{transform:'scaleX(.28)',opacity:.4}]; break;
      case 3: frames = [{transform:'scaleX(.2)',opacity:.2},{transform:`scaleX(${height})`,opacity:1},{transform:'scaleX(.2)',opacity:.2}]; break;
      case 4: frames = [{transform:'scaleX(.3) translateY(-2px)'},{transform:`scaleX(${height}) translateY(2px)`},{transform:'scaleX(.3) translateY(-2px)'}]; break;
      case 5: frames = processing ? [{transform:`translateY(${-j*34}px) scaleX(.25)`,opacity:.2},{transform:'translateY(0) scaleX(.75)',opacity:1},{transform:`translateY(${-j*34}px) scaleX(.25)`,opacity:.2}] : [{transform:'scaleX(.25)'},{transform:`scaleX(${.6+Math.sin(j*Math.PI)*.7})`},{transform:'scaleX(.25)'}]; break;
      case 6: frames = [{transform:'scaleX(.5)',opacity:.3,filter:'blur(.3px)'},{transform:`scaleX(${height})`,opacity:1,filter:'blur(0px)'},{transform:'scaleX(.5)',opacity:.3,filter:'blur(.3px)'}]; break;
      case 7: frames = [{transform:'scale(.35,1)',opacity:.45},{transform:`scale(${height},${processing?4:2.5})`,opacity:1},{transform:'scale(.35,1)',opacity:.45}]; break;
      case 8: frames = [{transform:'scaleX(.25) translateY(-3px)',opacity:.35},{transform:`scaleX(${height}) translateY(3px)`,opacity:1},{transform:'scaleX(.25) translateY(-3px)',opacity:.35}]; break;
      case 9: frames = [{transform:'scaleX(.3)',opacity:.2},{transform:`scaleX(${height})`,opacity:1},{transform:'scaleX(.7)',opacity:.4},{transform:'scaleX(.9)',opacity:.65},{transform:'scaleX(.3)',opacity:.2}]; break;
      default: frames = [{transform:'scaleX(.3)',opacity:.5},{transform:`scaleX(${height})`,opacity:1},{transform:'scaleX(.3)',opacity:.5}];
    }
    const delay = wave === 2 ? 0 : wave === 9 ? (i%2)*220 + i*30 : (wave === 3 && processing ? marks.length-1-i : i) * (wave === 3 ? 85 : 65);
    // A negative phase offset yields continuous rhythm; cascade intentionally enters in order.
    play(mark, frames, duration, { iterations:Infinity, easing:'ease-in-out', delay: (wave===3 && !processing ? delay : -delay)/rate });
  });
  return () => animations.forEach(a => a.cancel());
}
