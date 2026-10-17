import * as fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]))).flat();
}
const checked = [...await files(path.join(root, 'skills')), ...await files(path.join(root, 'scripts')), ...await files(path.join(root, 'tests'))];
for (const file of checked) {
  if (/\.(mjs|js)$/.test(file)) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  if (file.endsWith('.json')) JSON.parse(await fs.readFile(file, 'utf8'));
  if (file.endsWith('.md')) {
    const content = await fs.readFile(file, 'utf8');
    for (const match of content.matchAll(/\]\(([^\s)]+)\)/g)) {
      const link = match[1]; if (/^(https?:|#)/.test(link)) continue;
      await fs.access(path.resolve(path.dirname(file), link.split('#')[0]));
    }
  }
}
const metadata = await fs.readFile(path.join(root, 'skills/nome/SKILL.md'), 'utf8');
assert.match(metadata, /^---\nname: nome\ndescription: .+\n---/);
assert.ok(!metadata.includes('TODO'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
assert.equal(Object.keys(manifest.dependencies || {}).length, 0);
console.log(`Checked ${checked.length} files: JavaScript syntax, JSON, relative documentation links, skill manifest, zero runtime dependencies.`);
