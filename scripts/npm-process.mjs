import path from 'node:path';

const fallbackNpmCliPath = path.join(
  path.dirname(process.execPath),
  'node_modules',
  'npm',
  'bin',
  'npm-cli.js'
);

export const getNpmCliPath = (environment = process.env) =>
  environment.npm_execpath || fallbackNpmCliPath;

export const getNpmSpawn = (
  command,
  args,
  environment = process.env
) => {
  const npmCliPath = getNpmCliPath(environment);
  if (command === 'npm') {
    return {
      command: process.execPath,
      args: [npmCliPath, ...args]
    };
  }
  if (command === 'npx') {
    return {
      command: process.execPath,
      args: [npmCliPath, 'exec', '--', ...args]
    };
  }
  return { command, args };
};
