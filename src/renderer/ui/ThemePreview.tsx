import type { CSSProperties } from 'react';
import type { WidgetThemeOption } from '../../shared/widget-themes';
import symbol from '../assets/brand/symbol-reverse.svg';

/** A miniature of the bookmark and active rail, on this theme's settings surface. */
export default function ThemePreview({ theme }: { theme: WidgetThemeOption }) {
  return <span className="theme-mini" aria-hidden="true" style={{
    '--mini-surface': theme.colors.surface, '--mini-text': theme.colors.text,
    '--mini-widget': theme.colors.widget, '--mini-symbol': theme.colors.symbol,
    '--mini-signal': theme.colors.signal, '--mini-mask': `url("${symbol}")`
  } as CSSProperties}>
    <span className="theme-mini-lines"><i /><i /></span>
    <span className="theme-mini-bookmark"><span className="theme-mini-symbol" /><span className="theme-mini-pip" /></span>
    <span className="theme-mini-rail"><i /><i /><i /><i /><i /></span>
  </span>;
}
