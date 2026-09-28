/** Owner-selected motion study 10. Shared with the saved animation lab. */
export const AFTERGLOW = {
  id: 'resonance',
  name: 'Afterglow',
  duration: 1200,
  easing: 'cubic-bezier(.45,0,.15,1)',
  listeningPeriod: 2410,
  processingPeriod: 3590,
  enter: [{ transform: 'scale(1,.86)', opacity: 0 }, { transform: 'scale(1,1)', opacity: 1 }],
  exit: [{ transform: 'scale(1,1)', opacity: 1 }, { transform: 'scale(1,.96)', opacity: .35 }, { transform: 'scale(1,.92)', opacity: 0 }],
  gather: [1, 1.02, .98, 1].map(value => ({ transform: `scale(1,${value})`, opacity: 1 }))
} as const;
