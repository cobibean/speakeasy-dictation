import { getThemeCssVariables, getWidgetTheme, type WidgetTheme } from '../../shared/widget-themes';

export function applyAppTheme(id: WidgetTheme) {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(getThemeCssVariables(id))) root.style.setProperty(name, value);
  root.dataset.widgetTheme = id;
  root.dataset.themeTone = getWidgetTheme(id).dark ? 'dark' : 'light';
  root.style.colorScheme = getWidgetTheme(id).dark ? 'dark' : 'light';
}
