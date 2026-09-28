import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/** Later files override earlier files; explicit process values override files. */
export const loadBuildEnvironment = (environment = process.env, cwd = process.cwd()) => {
  const explicit = environment.SPEAKEASY_BUILD_ENV_FILE;
  const files = explicit ? [explicit] : ['.env', '.env.local', '.env.product', '.env.product.local'];
  const values = {};
  for (const file of files) {
    const filePath = path.resolve(cwd, file);
    if (!fs.existsSync(filePath)) {
      if (explicit) throw new Error('The explicit SPEAKEASY_BUILD_ENV_FILE does not exist.');
      continue;
    }
    Object.assign(values, parseEnv(fs.readFileSync(filePath, 'utf8')));
  }
  return { ...values, ...environment };
};
