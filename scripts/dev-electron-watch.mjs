import { spawn } from 'node:child_process';
import { getNpmSpawn } from './npm-process.mjs';
import { waitForPath } from './wait-for-path.mjs';

await waitForPath('dist/main/main/index.js');

const invocation = getNpmSpawn('npx', [
  'nodemon',
  '--signal',
  'SIGTERM',
  '--watch',
  'dist/main',
  '--exec',
  'electron .'
]);
const child = spawn(
  invocation.command,
  invocation.args,
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: 'http://localhost:5173'
    }
  }
);

child.on('error', (error) => {
  throw error;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
