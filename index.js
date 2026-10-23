import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDistPath = path.join(__dirname, 'apps', 'api', 'dist', 'server.js');

if (!fs.existsSync(serverDistPath)) {
  console.log('API build not found. Running build command...');
  execSync('pnpm turbo run build --filter=@vaultmap/api...', {
    cwd: __dirname,
    stdio: 'inherit',
  });
}

await import('./apps/api/dist/server.js');
