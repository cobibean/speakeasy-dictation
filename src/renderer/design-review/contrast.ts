export interface ContrastCheck { role: string; foreground: string; background: string; ratio: number; minimum: number; pass: boolean }
const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
const luminance = (value: string) => channels(value).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);

/** Measured CSS, not catalog values. Decorative animated waveform opacity is excluded. */
export function measureRenderedContrast(): ContrastCheck[] {
  const checks: ContrastCheck[] = [];
  const visible = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)]
    .find(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
  const add = (role: string, foreground: string, background: string, minimum: number) => {
    const a = luminance(foreground), b = luminance(background);
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    checks.push({ role, foreground, background, ratio: Math.round(ratio * 100) / 100, minimum, pass: ratio >= minimum });
  };
  const text = (role: string, selector: string, surface: string = selector) => {
    const element = visible(selector), background = visible(surface);
    if (element && background) add(role, getComputedStyle(element).color, getComputedStyle(background).backgroundColor, 4.5);
  };
  text('Widget symbol', '.spine-settings-trigger');
  text('Status caption', '.spine-status-label');
  const pip = visible('.spine-state-pip');
  if (pip) {
    const css = getComputedStyle(pip);
    const halo = css.boxShadow.match(/rgba?\([^)]+\)/)?.[0];
    if (halo) add('Status dot / opaque backing', css.backgroundColor, halo, 3);
  }
  text('Settings heading', '.hud-control-title', '.quiet-settings');
  text('Settings secondary text', '.hud-control-caption', '.quiet-settings');
  text('Settings theme label', '.hud-theme-label', '.quiet-settings');
  text('Selected navigation', '.quiet-settings-nav [aria-current]');
  text('Selected size', '.hud-size-button.is-selected');
  text('Input', '.hud-input');
  text('Select', '.hud-select');
  text('Save action', '.hud-save-button:not(:disabled)');
  text('Save feedback', '.hud-footer-status', '.hud-footer');
  return checks;
}
