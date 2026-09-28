import { access } from 'node:fs/promises';

export const waitForPath = async (
  targetPath,
  {
    timeoutMs = 30_000,
    intervalMs = 100,
    now = Date.now,
    check = (path) => access(path)
  } = {}
) => {
  const deadline = now() + timeoutMs;

  while (true) {
    try {
      await check(targetPath);
      return;
    } catch (error) {
      if (now() >= deadline) {
        throw new Error(`Timed out waiting for ${targetPath}.`, { cause: error });
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
};
