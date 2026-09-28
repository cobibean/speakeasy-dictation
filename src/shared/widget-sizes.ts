export const WIDGET_SIZE_IDS = ['small', 'medium', 'large'] as const;

export type WidgetSize = (typeof WIDGET_SIZE_IDS)[number];

export interface WidgetSizeOption {
  /** Stable identifier persisted in settings. */
  id: WidgetSize;
  /** Human-facing label shown in the picker. */
  label: string;
  /** Compact-widget scale relative to the current medium design. */
  scale: number;
}

export const DEFAULT_WIDGET_SIZE_ID: WidgetSize = 'small';

export const WIDGET_SIZE_OPTIONS: readonly WidgetSizeOption[] = [
  {
    id: 'small',
    label: 'Small',
    scale: 0.5
  },
  {
    id: 'medium',
    label: 'Medium',
    scale: 1
  },
  {
    id: 'large',
    label: 'Large',
    scale: 1.5
  }
] as const;

const WIDGET_SIZE_ID_SET = new Set<string>(WIDGET_SIZE_IDS);

export const isWidgetSizeId = (value: unknown): value is WidgetSize =>
  typeof value === 'string' && WIDGET_SIZE_ID_SET.has(value);

export const getWidgetSizeOption = (value: WidgetSize): WidgetSizeOption =>
  WIDGET_SIZE_OPTIONS.find((option) => option.id === value) ?? WIDGET_SIZE_OPTIONS[0];
