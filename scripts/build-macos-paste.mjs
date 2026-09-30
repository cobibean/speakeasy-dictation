import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform === 'darwin') {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const headers = path.resolve(path.dirname(process.execPath), '../include/node');
  if (!fs.existsSync(path.join(headers, 'node_api.h'))) {
    throw new Error('Node-API headers are required. Use the Node version in .nvmrc with its development headers.');
  }
  const output = path.join(root, 'dist/main/native/macos-paste.node');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  execFileSync('xcrun', ['clang', '-x', 'objective-c', '-bundle', '-undefined', 'dynamic_lookup',
    '-O2', '-Wall', '-Wextra', '-Werror', '-DNAPI_VERSION=8',
    '-mmacosx-version-min=13.0', '-I', headers,
    '-framework', 'ApplicationServices', '-framework', 'Carbon', '-framework', 'AppKit',
    path.join(root, 'src/main/native/macos-paste.c'), '-o', output], { stdio: 'inherit' });
}
