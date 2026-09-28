import fs from 'node:fs';
import path from 'node:path';
import { loadBuildEnvironment } from './build-environment.mjs';
import {
  createProductPublicConfig,
  getMissingProductConfigKeys,
  isWindowsHostedProductPackage,
  isWindowsW5ReleasePackage
} from './product-public-config.mjs';

const windowsStoreSpike = process.env.SPEAKEASY_WINDOWS_STORE_SPIKE === '1';
const environment = windowsStoreSpike ? process.env : loadBuildEnvironment();
const hostedWindows = isWindowsHostedProductPackage(environment);
const w5Release = isWindowsW5ReleasePackage(environment);
const missing = getMissingProductConfigKeys(environment);
if (
  !windowsStoreSpike &&
  (environment.SPEAKEASY_REQUIRE_PRODUCT_CONFIG === '1' || hostedWindows || w5Release) &&
  missing.length > 0
) {
  throw new Error(
    `Missing required product build env: ${missing.join(', ')}. ` +
      'Set them in the shell, .env.local, .env.product, or .env.product.local.'
  );
}

const config = createProductPublicConfig(environment);
const outPath = path.join(process.cwd(), 'dist/main/main/product-public-config.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(`${outPath}.tmp`, `${JSON.stringify(config, null, 2)}\n`, {
  mode: 0o600
});
fs.renameSync(`${outPath}.tmp`, outPath);

console.log(
  `Generated product public config (${config.buildProfile}; ${missing.length} required values missing).`
);
