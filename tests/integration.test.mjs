import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { install, uninstall, targets, inspectTarget } from '../skills/nome/scripts/lib/install.mjs';
import { discoverSources } from '../skills/nome/scripts/lib/sources.mjs';
import { startServer } from '../skills/nome/scripts/lib/server.mjs';
import { applyRequest, readProfile } from '../skills/nome/scripts/lib/store.mjs';
import { VERSION } from '../skills/nome/scripts/lib/model.mjs';
import { temporary, write, request, cli, exec } from './helpers.mjs';

test('both host installations run standalone, upgrades preserve data and uninstall preserves profiles', async t => {
  const root = await temporary(t); const home = path.join(root, 'home with spaces'); const data = path.join(root, 'data');
  await applyRequest(data, request()); const before = await fs.readFile(path.join(data, 'profile/identity/index.md'));
  const first = await install({ agent: 'both', home }); assert.equal(first.targets.length, 2);
  assert.equal((await install({ agent: 'both', home })).targets[0].result, 'unchanged');
  for (const target of targets('both', home)) {
    const { stdout } = await exec(process.execPath, [path.join(target.path, 'scripts/nome.mjs'), 'read', '--data-dir', data]);
    assert.equal(JSON.parse(stdout).domains[0].documents[0].path, 'identity/index.md');
    const markerPath = path.join(target.path, '.nome-install.json');
    const marker = JSON.parse(await fs.readFile(markerPath, 'utf8')); marker.version = '0.0.1'; await fs.writeFile(markerPath, JSON.stringify(marker));
  }
  assert.equal((await install({ agent: 'both', home, upgrade: true })).targets[0].result, 'upgraded');
  for (const target of targets('both', home)) assert.equal((await inspectTarget(target)).version, VERSION);
  await uninstall({ agent: 'both', home });
  assert.deepEqual(await fs.readFile(path.join(data, 'profile/identity/index.md')), before);
  for (const target of targets('both', home)) assert.equal((await inspectTarget(target)).state, 'missing');
});
test('unknown installation, symlink and mixed-host conflict never overwrite user content', async t => {
  const home = await temporary(t); const [codex, claude] = targets('both', home);
  await fs.mkdir(claude.path, { recursive: true }); await fs.writeFile(path.join(claude.path, 'mine.txt'), 'keep');
  await assert.rejects(install({ agent: 'both', home }), { code: 'INSTALL_CONFLICT' });
  await assert.rejects(uninstall({ agent: 'both', home }), { code: 'INSTALL_CONFLICT' });
  assert.equal((await inspectTarget(codex)).state, 'missing');
  assert.equal(await fs.readFile(path.join(claude.path, 'mine.txt'), 'utf8'), 'keep');
  await fs.mkdir(path.dirname(codex.path), { recursive: true }); await fs.symlink(claude.path, codex.path, 'dir');
  await assert.rejects(install({ agent: 'codex', home }), { code: 'INSTALL_CONFLICT' });
});
test('failed installation staging leaves existing versions intact', async t => {
  const home = await temporary(t); await install({ agent: 'both', home });
  await assert.rejects(install({ agent: 'both', home, upgrade: true, source: path.join(home, 'missing-source') }));
  for (const target of targets('both', home)) assert.equal((await inspectTarget(target)).state, 'installed');
});
test('local sources distinguish usable, empty, missing and oversized inputs without writing a profile', async t => {
  const home = await temporary(t); const root = path.join(home, '.codex/memories'); await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'memory_summary.md'), ' \n'); await fs.writeFile(path.join(root, 'MEMORY.md'), 'Personal memory');
  const result = await discoverSources({ agent: 'codex', home, content: true });
  assert.equal(result.available, true); assert.deepEqual(result.sources.map(s => s.status), ['empty', 'available', 'missing']);
  assert.equal(result.sources[1].content, 'Personal memory');
  const meta = await discoverSources({ agent: 'codex', home }); assert.equal(meta.sources[1].content, undefined);
  await fs.writeFile(path.join(root, 'MEMORY.md'), 'x'.repeat(65537));
  const noContent = await discoverSources({ agent: 'codex', home, content: true });
  assert.equal(noContent.available, false); assert.equal(noContent.sources[1].status, 'too_large'); assert.match(noContent.next, /指定其他来源/);
  assert.deepEqual(await fs.readdir(home), ['.codex']);
});
test('known Codex SQLite memory is readable when default text indexes are absent', async t => {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { t.skip('Node SQLite unavailable'); return; }
  const home = await temporary(t); const root = path.join(home, '.codex'); await fs.mkdir(root);
  const file = path.join(root, 'memories_1.sqlite'); const db = new DatabaseSync(file);
  db.exec('CREATE TABLE stage1_outputs (thread_id TEXT PRIMARY KEY, generated_at INTEGER, raw_memory TEXT)');
  db.prepare('INSERT INTO stage1_outputs VALUES (?, ?, ?)').run('fixture', 1, 'Fictional preference'); db.close();
  const before = await fs.readFile(file); const found = await discoverSources({ agent: 'codex', home, content: true });
  assert.equal(found.available, true); assert.equal(found.sources.at(-1).content, 'Fictional preference'); assert.deepEqual(await fs.readFile(file), before);
  const emptyDb = new DatabaseSync(file); emptyDb.exec('DELETE FROM stage1_outputs'); emptyDb.close();
  assert.equal((await discoverSources({ agent: 'codex', home })).sources.at(-1).status, 'empty');
});
test('unsupported database formats and binary files do not get described as empty memories', async t => {
  const root = await temporary(t); const file = path.join(root, 'memories_1.sqlite'); await fs.writeFile(file, 'not sqlite');
  const result = await discoverSources({ agent: 'codex', paths: [file], content: true });
  assert.equal(result.sources[0].status, 'unreadable'); assert.equal(result.available, false);
  const binary = path.join(root, 'binary.md'); await fs.writeFile(binary, Buffer.from([0, 1]));
  assert.equal((await discoverSources({ agent: 'codex', paths: [binary] })).sources[0].status, 'not_text');
});
test('explicit sources and Claude project sources stay bounded to the requested context', async t => {
  const home = await temporary(t); const project = path.join(home, 'project'); const memory = path.join(home, 'specified-memory');
  await fs.mkdir(project); await fs.mkdir(memory); await fs.mkdir(path.join(home, '.claude'));
  await fs.writeFile(path.join(home, '.claude/CLAUDE.md'), 'User preferences'); await fs.writeFile(path.join(project, 'CLAUDE.md'), 'Project rules'); await fs.writeFile(path.join(memory, 'MEMORY.md'), 'Explicit project memory');
  const result = await discoverSources({ agent: 'claude', home, cwd: project, memoryDir: memory, content: true });
  assert.equal(result.sources.filter(s => s.status === 'available').length, 3);
  assert.ok(!result.sources.some(s => s.path.includes('/projects/')));
  assert.equal((await discoverSources({ agent: 'claude', paths: [path.join(home, 'absent')] })).sources[0].status, 'missing');
});
test('source permission failures are reported as unreadable', { skip: process.platform === 'win32' || process.getuid?.() === 0 }, async t => {
  const root = await temporary(t); const file = path.join(root, 'private.md'); await fs.writeFile(file, 'private'); await fs.chmod(file, 0o000);
  try { assert.equal((await discoverSources({ agent: 'codex', paths: [file] })).sources[0].status, 'unreadable'); }
  finally { await fs.chmod(file, 0o600); }
});
test('read-only API serves actual Markdown edits without exposing internal profile metadata', async t => {
  const dir = path.join(await temporary(t), 'data'); const running = await startServer({ dataDir: dir, port: 0 }); t.after(() => running.close());
  assert.equal(running.server.address().address, '127.0.0.1');
  assert.equal((await fetch(running.url)).status, 200);
  for (const route of ['markdown.js', 'profile-view.js', 'textures/2k_mercury.jpg']) assert.equal((await fetch(`${running.url}/${route}`)).status, 200);
  const initial = await (await fetch(`${running.url}/api/profile`)).json();
  assert.deepEqual(Object.keys(initial).sort(), ['demo', 'domains']); assert.equal(initial.domains.length, 6);
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
  await applyRequest(dir, request());
  const file = path.join(dir, 'profile/identity/index.md'); await fs.writeFile(file, '# Changed externally\n\nNew text');
  const current = await (await fetch(`${running.url}/api/profile`)).json();
  assert.equal(current.domains[0].documents[0].markdown, '# Changed externally\n\nNew text');
  assert.deepEqual(Object.keys(current.domains[0].documents[0]).sort(), ['markdown', 'path']);
  assert.equal((await fetch(`${running.url}/api/profile`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${running.url}/api/profile`, { headers: { Origin: 'https://external.example' } })).status, 403);
  assert.equal((await fetch(`${running.url}/api/profile`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const invalidHost = await new Promise((resolve, reject) => { http.get(`${running.url}/api/profile`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject); });
  assert.equal(invalidHost, 403);
  for (const privatePath of ['store.json', 'profile/identity/index.md', '.write-lock/owner.json']) assert.equal((await fetch(`${running.url}/${privatePath}`)).status, 404);
});
test('demo is separate from personal data, occupied ports fall back and legacy reads report migration', async t => {
  const dir = await temporary(t); const file = path.join(dir, 'store.json'); await fs.writeFile(file, 'broken');
  const first = await startServer({ dataDir: dir, demo: true, port: 0 }); t.after(() => first.close());
  const second = await startServer({ dataDir: dir, demo: true, port: first.server.address().port }); t.after(() => second.close());
  assert.notEqual(first.url, second.url);
  const demo = await (await fetch(`${second.url}/api/profile`)).json(); assert.equal(demo.demo, true); assert.ok(demo.domains[0].documents.length);
  assert.equal(await fs.readFile(file, 'utf8'), 'broken');
  const local = await startServer({ dataDir: dir, port: 0 }); t.after(() => local.close());
  const response = await fetch(`${local.url}/api/profile`); assert.equal(response.status, 500); assert.equal((await response.json()).code, 'MIGRATION_REQUIRED');
});
test('CLI saves payload files, respects scope flags and reports old data explicitly', async t => {
  const root = await temporary(t); const dir = path.join(root, 'data'); const file = path.join(root, 'change.json'); await fs.writeFile(file, JSON.stringify(request()));
  assert.equal(JSON.parse((await cli(['apply', '--file', file, '--data-dir', dir])).stdout).changed, true);
  const result = JSON.parse((await cli(['read', '--domain', 'identity', '--data-dir', dir])).stdout); assert.equal(result.domains.length, 1);
  await assert.rejects(cli(['read', '--drafts', '--data-dir', dir]));
  await assert.rejects(cli(['apply', '--data-dir', dir]));
  await assert.rejects(cli(['read', '--domain', 'unclassified', '--data-dir', dir]));
  const old = path.join(root, 'old'); await fs.mkdir(old); await fs.writeFile(path.join(old, 'store.json'), 'broken');
  await assert.rejects(cli(['doctor', '--data-dir', old, '--home', root]), error => { assert.equal(JSON.parse(error.stdout).profile.code, 'MIGRATION_REQUIRED'); return true; });
});
