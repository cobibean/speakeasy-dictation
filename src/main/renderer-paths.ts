import { app } from 'electron';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const getPreloadPath = (): string => {
  return path.join(__dirname, 'preload.cjs');
};

export const getRendererUrl = (page: 'onboarding' | 'overlay' | 'settings' | 'design-review'): string => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}/${page}/index.html`;
  }

  const filePath = path.join(app.getAppPath(), 'dist/renderer', page, 'index.html');
  return pathToFileURL(filePath).toString();
};
