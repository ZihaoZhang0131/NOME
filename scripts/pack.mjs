import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run this with npm run pack.');
function npm(args) { return execFileSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }); }
const metadata = JSON.parse(npm(['pack', '--dry-run', '--json']))[0];
for (const file of metadata.files) {
  assert.ok(file.path === 'README.md' || file.path === 'package.json' || file.path.startsWith('skills/nome/'), `Unexpected package file: ${file.path}`);
  assert.ok(!/(^|\/)(store\.json|\.nome-install\.json|\.env|\.write-lock)$/.test(file.path), `Private runtime file in package: ${file.path}`);
  assert.ok(!/(\.tmp|\.tgz)$/.test(file.path), `Temporary file in package: ${file.path}`);
  const source = await fs.readFile(path.join(root, file.path), 'utf8');
  assert.ok(!/\/Users\/[^/\s"']+\//.test(source), `Personal machine path in package: ${file.path}`);
}
await fs.mkdir(path.join(root, 'dist'), { recursive: true });
const result = JSON.parse(npm(['pack', '--json', '--pack-destination', 'dist']))[0];
console.log(JSON.stringify({ artifact: path.join(root, 'dist', result.filename), files: result.files.length, integrity: result.integrity, containsPersonalData: false }, null, 2));
