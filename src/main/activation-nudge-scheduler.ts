// Check while the menu-bar app stays open, including after the first dictation.
// Due time and the persisted one-shot flag are owned by the check itself.
export const startActivationNudgeScheduler = (check: () => void): (() => void) => {
  const initial = setTimeout(check, 15_000);
  const interval = setInterval(check, 60_000);
  initial.unref();
  interval.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(interval);
  };
};
