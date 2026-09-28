import { clipboard } from 'electron';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SpeakeasyError } from './errors.js';
import {
  ClipboardOnlyPasteError,
  pasteTextWithExecutor,
  type PastePlatform
} from './paste-executor.js';
import { getPasteRecoveryMessage } from '../shared/paste-recovery.js';

export {
  ClipboardOnlyPasteError,
  getPasteCommand,
  pasteTextWithExecutor
} from './paste-executor.js';

const execFileAsync = promisify(execFile);

export const pasteText = async (
  text: string,
  platform: NodeJS.Platform = process.platform
): Promise<void> => {
  if (platform !== 'darwin' && platform !== 'win32') {
    throw new SpeakeasyError(
      'paste-failed',
      `Paste is not supported on platform "${platform}".`
    );
  }

  try {
    await pasteTextWithExecutor(text, clipboard, execFileAsync, platform as PastePlatform);
  } catch (error) {
    if (error instanceof ClipboardOnlyPasteError) {
      throw new SpeakeasyError(
        'paste-clipboard-only',
        getPasteRecoveryMessage(platform),
        error
      );
    }

    throw error;
  }
};
