import type { CleanupStrength } from './types.js';

export const WORKFLOW_PRESETS = [
  {
    id: 'coding',
    label: 'Coding agents (Cursor, Claude Code, Codex)',
    strength: 'balanced' as CleanupStrength,
    tip: 'Balanced Polish removes filler and is designed to keep names, paths and identifiers.'
  },
  {
    id: 'chat',
    label: 'Chat (Slack, Teams, Messages)',
    strength: 'minimal' as CleanupStrength,
    tip: 'Minimal Polish keeps your tone and just removes the ums.'
  },
  {
    id: 'writing',
    label: 'Writing (email, docs)',
    strength: 'strong' as CleanupStrength,
    tip: 'Strong Polish tightens sentences and punctuation.'
  }
];

export const getWorkflowPreset = (id: unknown) =>
  WORKFLOW_PRESETS.find(preset => preset.id === id);

export const workflowPresetSettings = (id: unknown): { polishBeforePaste: true; cleanupStrength: CleanupStrength } => {
  const preset = getWorkflowPreset(id);
  if (!preset) throw new Error('Unknown workflow preset.');
  return { polishBeforePaste: true, cleanupStrength: preset.strength };
};
