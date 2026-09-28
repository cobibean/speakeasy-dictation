import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
export { getDefaultPolishPrompt, getPolishProfile } from './polish-prompts.js';

const parseEnvFile = (contents: string): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const line of contents.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    result[key] = value;
  }

  return result;
};

export const loadEnvFile = (appPath: string): void => {
  // Packaged builds must never read a disk `.env`. Production secrets come from
  // build-time injection (and, for the product backend, from Vercel env vars) —
  // never from a file shipped inside the `.app` bundle. See hardening item 2.
  if (app.isPackaged) {
    return;
  }

  const candidatePaths = [
    path.join(appPath, '.env'),
    path.join(process.cwd(), '.env')
  ];

  for (const candidatePath of candidatePaths) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const parsed = parseEnvFile(fs.readFileSync(candidatePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
};

export const getDefaultGroqApiKey = (): string => process.env.GROQ_API_KEY ?? '';

export const getGroqPolishModel = (): string =>
  process.env.GROQ_POLISH_MODEL || 'openai/gpt-oss-120b';
