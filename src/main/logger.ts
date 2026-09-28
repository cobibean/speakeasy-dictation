import { clearSupportLogs } from './support-logger.js';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

const getLogPath = (): string => {
  const basePath = app.isReady()
    ? app.getPath('logs')
    : path.join(process.env.HOME ?? '/tmp', 'Library', 'Logs');
  return path.join(basePath, 'speakeasy-dev.log');
};

export const clearDebugLog = (): void => {
  clearSupportLogs();
  try {
    fs.rmSync(getLogPath(), { force: true });
  } catch {
    // Ignore cleanup failures for the debug log.
  }
};

export const debugLog = (message: string): void => {
  const line = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(getLogPath()), { recursive: true });
    fs.appendFileSync(getLogPath(), line, 'utf8');
  } catch {
    // Avoid crashing on debug log writes.
  }
  console.log(message);
};

export const debugError = (message: string, error?: unknown): void => {
  const detail =
    error instanceof Error
      ? `${error.name}: ${error.message}${error.stack ? `\n${error.stack}` : ''}`
      : String(error ?? '');
  debugLog(`${message}${detail ? ` ${detail}` : ''}`);
};
