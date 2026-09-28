import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { WIDGET_THEME_OPTIONS, isWidgetThemeId, type WidgetTheme } from '../../shared/widget-themes';
import './lab.css';
import type { ContrastCheck } from '../design-review/contrast';

type ThemeReport = {
  type: 'speakeasy-theme-report'; theme: WidgetTheme; background: string; foreground: string;
  accent: string; bookmark: string; settingsBackground: string | null; settingsText: string | null;
  captionBackground: string | null; captionText: string | null; status: string; statusText: string; pip: string;
  contrast: ContrastCheck[];
};
const initial = new URLSearchParams(location.search);
function hex(value: string) {
  const rgb = value.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
  return rgb ? '#' + rgb.slice(1).map(x => Number(x).toString(16).padStart(2, '0')).join('') : value;
}
function Palette({ colors, labels }: { colors: readonly string[]; labels?: string[] }) {
  return <div className="palette">{colors.map((color, index) => <div key={index}>
    <span className="chip" style={{ background: color }} />
    {labels && <small>{labels[index]}</small>}<code>{hex(color)}</code>
  </div>)}</div>;
}
function Contrast({ checks }: { checks?: ContrastCheck[] }) {
  if (!checks?.length) return null;
  const failed = checks.filter(check => !check.pass);
  return <details className="contrast-result" data-pass={failed.length === 0}>
    <summary>Rendered contrast: {failed.length ? `${failed.length} failed` : `pass · ${checks.length} checks`}</summary>
    {checks.map(check => <div key={check.role}>{check.role}: {check.ratio}:1 (minimum {check.minimum}:1)</div>)}
  </details>;
}
function App() {
  const [status, setStatus] = useState(initial.get('status') ?? 'listening');
  const [size, setSize] = useState('medium');
  const [edge, setEdge] = useState('right');
  const [opacity, setOpacity] = useState('90');
  const [backdrop, setBackdrop] = useState('light');
  const [seed, setSeed] = useState<WidgetTheme>('paper-ink');
  const [reports, setReports] = useState<Partial<Record<WidgetTheme, ThemeReport>>>({});
  const [settingsReport, setSettingsReport] = useState<ThemeReport | null>(null);
  const [revision, setRevision] = useState(0);
  const [settingsScale, setSettingsScale] = useState(1);
  const settingsFrame = useRef<HTMLIFrameElement>(null);
  const settingsViewport = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = settingsViewport.current;
    if (!element) return;
    const resize = new ResizeObserver(() => setSettingsScale(Math.min(1, element.clientWidth / 764)));
    resize.observe(element);
    return () => resize.disconnect();
  }, []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data as ThemeReport;
      if (event.origin !== location.origin || data?.type !== 'speakeasy-theme-report' || !isWidgetThemeId(data.theme)) return;
      if (event.source === settingsFrame.current?.contentWindow) setSettingsReport(data);
      else if ([...(gallery.current?.querySelectorAll('iframe') ?? [])].some(frame => frame.contentWindow === event.source)) {
        setReports(previous => ({ ...previous, [data.theme]: data }));
      }
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  function url(theme: WidgetTheme, surface = 'widget') {
    return '/design-review/index.html?' + new URLSearchParams({
      embed: '1', surface, theme, size, edge: surface === 'settings' ? 'left' : edge,
      status: surface === 'settings' || status === 'fallback' ? 'idle' : status === 'manual-paste' ? 'error' : status,
      error: status === 'manual-paste' ? 'paste-clipboard-only' : 'none',
      opacity, backdrop, category: 'appearance', fallback: status === 'fallback' ? '1' : '0', revision: surface === 'settings' ? String(revision) : '0'
    });
  }
  function inspect(theme: WidgetTheme) {
    setSettingsReport(null); setSeed(theme); setRevision(value => value + 1);
    inspector.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const selected = settingsReport?.theme ?? seed;
  return <main>
    <header className="lab-header"><div><p className="eyebrow">speakeasy. / appearance review</p>
      <h1>Theme lab</h1><p>One theme across the widget and settings. Compare the shared palette with actual rendering and measured contrast.</p>
    </div><span className="offline">Local fixtures · no app settings changed</span></header>
    <section className="controls" aria-label="Preview controls">
      <label>Widget state<select value={status} onChange={e => { setReports({}); setStatus(e.target.value); }}>
        {['idle', 'listening', 'transcribing', 'polishing', 'microphone-denied', 'microphone-unavailable', 'error', 'fallback', 'manual-paste'].map(x => <option key={x} value={x}>{x === 'fallback' ? 'Cleanup fallback' : x === 'manual-paste' ? 'Manual paste' : x}</option>)}
      </select></label>
      <label>Size<select value={size} onChange={e => setSize(e.target.value)}>{['small', 'medium', 'large'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Edge<select value={edge} onChange={e => setEdge(e.target.value)}>{['right', 'left', 'top'].map(x => <option key={x}>{x}</option>)}</select></label>
      <label>Opacity<select value={opacity} onChange={e => setOpacity(e.target.value)}>{['35', '60', '90', '100'].map(x => <option key={x} value={x}>{x}%</option>)}</select></label>
      <label>Desktop background<select value={backdrop} onChange={e => setBackdrop(e.target.value)}><option value="light">Light</option><option value="dark">Dark</option></select></label>
      <button onClick={() => inspector.current?.scrollIntoView({ behavior: 'smooth' })}>Open settings inspector ↓</button>
    </section>
    <p className="method">Palettes come from the shared theme catalog. Rendered colors and contrast are measured from each mounted widget. The translucent rail blends with the desktop; symbols and status dots keep opaque backing. High contrast stays opaque.</p>
    <nav className="theme-jumps" aria-label="Jump to theme">{WIDGET_THEME_OPTIONS.map(theme => <a key={theme.id} href={`#theme-${theme.id}`}>{theme.label}</a>)}</nav>
    <div className="theme-grid" ref={gallery} style={{ '--frame-height': edge === 'top' ? '160px' : size === 'large' ? '560px' : '380px' } as CSSProperties}>
      {WIDGET_THEME_OPTIONS.map((theme, index) => {
        const report = reports[theme.id];
        return <article key={theme.id} id={`theme-${theme.id}`} className="theme-card">
          <div className="card-heading"><h2><small>{String(index + 1).padStart(2, '0')}</small>{theme.label}</h2><button onClick={() => inspect(theme.id)}>Inspect {theme.label}</button></div>
          <div className="palette-block"><h3>Shared palette · {theme.description}</h3><Palette colors={theme.swatches} labels={['Body', 'Symbol', 'Signal']} /></div>
          <iframe title={`${theme.label} widget`} src={url(theme.id)} inert sandbox="allow-scripts allow-same-origin" allow="microphone 'none'; camera 'none'" />
          <div className="palette-block"><h3>Rendered widget · base colors</h3>{report ? <><Palette colors={[report.background, report.foreground, report.accent]} labels={['Body', 'Symbol', 'Signal']} /><p className="observed-state">Observed: {report.statusText}</p><Contrast checks={report.contrast} /></> : <p role="status">Reading renderer…</p>}</div>
        </article>;
      })}
    </div>
    <section ref={inspector} className="inspector">
      <div className="inspector-heading"><div><p className="eyebrow">Same renderer / real controls / in-memory saves</p><h2>Settings + widget</h2></div>
        <label>Inspect theme<select value={selected} onChange={e => inspect(e.target.value as WidgetTheme)}>{WIDGET_THEME_OPTIONS.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label></div>
      <p>Use Appearance below to switch themes. Watch the bookmark at the left edge and the settings surface together. Save feedback is the app’s actual UI; stored changes last only in this frame.</p>
      <p className="method">Native layout: 764 × 600 · preview scale: {Math.round(settingsScale * 100)}%</p>
      <div ref={settingsViewport} className="settings-scroll" style={{ height: 600 * settingsScale }}><iframe ref={settingsFrame} style={{ transform: `scale(${settingsScale})` }} title="Interactive settings and widget" src={url(seed, 'settings')} sandbox="allow-scripts allow-same-origin" allow="microphone 'none'; camera 'none'" /></div>
      <div className="readout" aria-live="polite"><strong>Selected: {selected}</strong><span>Widget body: <code>{settingsReport ? hex(settingsReport.background) : '…'}</code></span><span>Settings surface: <code>{settingsReport?.settingsBackground ? hex(settingsReport.settingsBackground) : '…'}</code></span><span>Settings text: <code>{settingsReport?.settingsText ? hex(settingsReport.settingsText) : '…'}</code></span></div>
      <Contrast checks={settingsReport?.contrast} />
    </section>
    <footer>Browser preview verifies colors, layout, and fixture interactions. Native window behavior, recording, service calls, and persistence in the installed app require separate app verification.</footer>
  </main>;
}
const root = createRoot(document.getElementById('lab')!);
root.render(<App />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
