import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { readProfile, applyRequest, recoverWrite } from '../skills/nome/scripts/lib/store.mjs';
import { profileHash } from '../skills/nome/scripts/lib/model.mjs';
import { temporary, request, write, exec } from './helpers.mjs';

test('missing profile reads empty without creating files', async t => {
  const root = await temporary(t); const dir = path.join(root, 'absent');
  assert.deepEqual(await readProfile(dir), { documents: [], hash: profileHash([]) });
  assert.deepEqual(await fs.readdir(root), []);
});
test('writes coherent Markdown only, retains exact text, external edits are the source of truth', async t => {
  const dir = await temporary(t); const text = '# 人生\n\n1998 年是经历时间。\n\n## 变化\n\n我选择慢下来。\n';
  await applyRequest(dir, request(undefined, [write('growth/index.md', text)]));
  const file = path.join(dir, 'profile/growth/index.md');
  assert.equal(await fs.readFile(file, 'utf8'), text);
  assert.deepEqual(await fs.readdir(dir), ['profile']);
  await fs.writeFile(file, text + '\n手动补充。\n');
  const current = await readProfile(dir);
  assert.equal(current.documents[0].markdown, text + '\n手动补充。\n');
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
});
test('no-op saves preserve the file modification time and leave no locks or history', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const file = path.join(dir, 'profile/identity/index.md'); const before = await fs.stat(file);
  assert.equal((await applyRequest(dir, request((await readProfile(dir)).hash))).changed, false);
  assert.equal((await fs.stat(file)).mtimeMs, before.mtimeMs);
  assert.deepEqual(await fs.readdir(dir), ['profile']);
});
test('stale hashes refuse overwrite and a failing batch applies no partial changes', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  await assert.rejects(applyRequest(dir, request(undefined, [write('identity/index.md', 'stale')])), { code: 'CONTENT_CONFLICT' });
  const before = await readProfile(dir);
  await assert.rejects(applyRequest(dir, request(before.hash, [write('identity/index.md', 'new'), write('growth/../../outside.md', 'bad')])));
  assert.deepEqual(await readProfile(dir), before);
});
test('a manual edit during staging is preserved and rejects the pending change', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const before = await readProfile(dir);
  await assert.rejects(applyRequest(dir, request(before.hash, [write('identity/index.md', 'AI overwrite')]), {
    beforeCommit: () => fs.writeFile(path.join(dir, 'profile/identity/index.md'), 'User edit')
  }), { code: 'CONTENT_CONFLICT' });
  assert.equal((await readProfile(dir)).documents[0].markdown, 'User edit');
});
test('readers and competing writers cannot observe a partially staged batch', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const before = await readProfile(dir);
  await applyRequest(dir, request(before.hash, [write('identity/index.md', 'new'), write('growth/index.md', 'life')]), {
    beforeCommit: async () => {
      await assert.rejects(readProfile(dir), { code: 'WRITE_LOCKED' });
      await assert.rejects(applyRequest(dir, request(before.hash)), { code: 'WRITE_LOCKED' });
      await assert.rejects(recoverWrite(dir), { code: 'WRITE_LOCKED' });
    }
  });
  assert.equal((await readProfile(dir)).documents.length, 2);
});
test('chapters require an index and whole-module deletion leaves no hidden snapshots', async t => {
  const dir = await temporary(t);
  await assert.rejects(applyRequest(dir, request(undefined, [write('growth/childhood.md', 'childhood')])));
  await applyRequest(dir, request(undefined, [write('growth/index.md', '# 经历\n\n[童年](childhood.md)'), write('growth/childhood.md', 'Private childhood')]));
  const before = await readProfile(dir);
  await assert.rejects(applyRequest(dir, request(before.hash, [{ type: 'delete', path: 'growth/index.md' }])));
  await applyRequest(dir, request(before.hash, before.documents.map(d => ({ type: 'delete', path: d.path }))));
  assert.deepEqual((await readProfile(dir)).documents, []);
  assert.deepEqual(await fs.readdir(path.join(dir, 'profile')), []);
  assert.deepEqual(await fs.readdir(dir), ['profile']);
});
test('missing authorization, old record fields, frontmatter, oversized text and unsafe paths are rejected', async t => {
  const dir = await temporary(t);
  const cases = [
    { ...request(), authorization: { userRequested: false, intent: 'update' } },
    { ...request(), baseHash: 'wrong' },
    { ...request(), operations: [ { type: 'upsert', record: { status: 'imported' } } ] },
    request(undefined, [write('identity/index.md', '---\nstatus: confirmed\n---\ntext')]),
    request(undefined, [write('identity/index.md', 'x'.repeat(1024 * 1024 + 1))]),
    request(undefined, [write('identity/index.md', 'a\0b')]),
    request(undefined, [write('identity/index.md'), write('identity/index.md')]),
    request(undefined, [write('unknown/index.md')]),
    request(undefined, [write('/identity/index.md')]),
    request(undefined, [write('identity\\index.md')]),
    request(undefined, [write('identity/index.md', 'valid'), { type: 'delete', path: 'identity/other.md', markdown: 'hidden' }])
  ];
  for (const payload of cases) await assert.rejects(applyRequest(dir, payload));
  assert.deepEqual(await fs.readdir(dir), []);
});
test('profile and data directory symlinks cannot read or overwrite unrelated files', async t => {
  const root = await temporary(t); const outside = path.join(root, 'outside'); const dir = path.join(root, 'data');
  await fs.mkdir(outside); await fs.mkdir(dir); await fs.writeFile(path.join(outside, 'index.md'), 'keep');
  await fs.symlink(outside, path.join(dir, 'profile'));
  await assert.rejects(readProfile(dir), { code: 'UNSAFE_PATH' });
  await assert.rejects(applyRequest(dir, request()), { code: 'UNSAFE_PATH' });
  const linked = path.join(root, 'linked'); await fs.symlink(outside, linked);
  await assert.rejects(applyRequest(linked, request()), { code: 'UNSAFE_PATH' });
  assert.equal(await fs.readFile(path.join(outside, 'index.md'), 'utf8'), 'keep');
});
test('failed staging cleans transient copies without modifying the original profile', async t => {
  const dir = await temporary(t); await applyRequest(dir, request()); const before = await readProfile(dir);
  await assert.rejects(applyRequest(dir, request(before.hash, [write('identity/index.md', 'new')]), { beforeCommit: () => { throw new Error('simulated failure'); } }));
  assert.deepEqual(await readProfile(dir), before);
  assert.deepEqual(await fs.readdir(dir), ['profile']);
});
test('explicit recovery restores an interrupted directory switch after the writer exited', async t => {
  const dir = await temporary(t); await applyRequest(dir, request()); const before = await readProfile(dir);
  const { stdout } = await exec(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']);
  const lock = path.join(dir, '.write-lock'); await fs.mkdir(lock);
  await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: Number(stdout), host: os.hostname() }));
  await fs.rename(path.join(dir, 'profile'), path.join(lock, 'original')); await fs.mkdir(path.join(lock, 'stage'));
  assert.equal((await recoverWrite(dir)).recovered, true);
  assert.deepEqual(await readProfile(dir), before);
  assert.deepEqual(await fs.readdir(dir), ['profile']);
});
test('unknown locks and chapter symlinks are preserved for manual inspection', async t => {
  const dir = await temporary(t); await fs.mkdir(path.join(dir, '.write-lock'));
  await assert.rejects(recoverWrite(dir), { code: 'UNKNOWN_LOCK' });
  await fs.rm(path.join(dir, '.write-lock'), { recursive: true });
  await applyRequest(dir, request());
  await fs.symlink(path.join(dir, 'profile/identity/index.md'), path.join(dir, 'profile/identity/linked.md'));
  await assert.rejects(readProfile(dir), { code: 'UNSAFE_PATH' });
});
test('Finder housekeeping files do not prevent reading or saving Markdown', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  await fs.writeFile(path.join(dir, 'profile/.DS_Store'), 'finder'); await fs.writeFile(path.join(dir, 'profile/identity/.DS_Store'), 'finder');
  const current = await readProfile(dir); assert.equal(current.documents.length, 1);
  await applyRequest(dir, request(current.hash, [write('identity/index.md', 'Updated')]));
  assert.equal((await readProfile(dir)).documents[0].markdown, 'Updated');
});
test('an over-limit multi-file profile is rejected before replacing any files', async t => {
  const dir = await temporary(t); await applyRequest(dir, request()); const before = await readProfile(dir);
  const operations = ['identity','motivation','traits','capabilities','growth'].map(domain => write(`${domain}/index.md`, 'x'.repeat(1024 * 1024)));
  await assert.rejects(applyRequest(dir, request(before.hash, operations)), { code: 'PROFILE_TOO_LARGE' });
  assert.deepEqual(await readProfile(dir), before); assert.deepEqual(await fs.readdir(dir), ['profile']);
});
