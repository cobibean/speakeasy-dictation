import { createRequire } from 'node:module';
import { PasteFocusRecoveryError } from './paste-executor.js';
import { PasteTargetStore } from './paste-target-store.js';

// The opaque AX handle never crosses IPC; renderer capture IDs are only keys.
export type MacPasteTarget = object | null;
interface MacPasteBridge { capture(): MacPasteTarget; paste(target: object): boolean; }
let bridge: MacPasteBridge | null | undefined;
const loadBridge = (): MacPasteBridge | null => {
  if (bridge === undefined) {
    try { bridge = createRequire(import.meta.url)('../native/macos-paste.node') as MacPasteBridge; }
    catch { bridge = null; }
  }
  return bridge;
};
export const captureMacPasteTarget = (): MacPasteTarget => {
  if (process.platform !== 'darwin') return null;
  try { return loadBridge()?.capture() ?? null; } catch { return null; }
};
export const pasteToMacTarget = (target: MacPasteTarget): void => {
  if (!target || !loadBridge()?.paste(target)) throw new PasteFocusRecoveryError();
};
const targets = new PasteTargetStore<MacPasteTarget>();
export const rememberMacPasteTarget = (captureId: string): void => {
  targets.remember(captureId, captureMacPasteTarget());
};
export const takeMacPasteTarget = (captureId: string): MacPasteTarget => targets.take(captureId) ?? null;
export const forgetMacPasteTarget = (captureId: string): void => targets.forget(captureId);
