import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { readStore, applyRequest, undoRequest, forgetRequest, historyView } from '../skills/nome/scripts/lib/store.mjs';
import { view } from '../skills/nome/scripts/lib/model.mjs';
import { temporary, record, request, maintenance } from './helpers.mjs';

test('empty reads neither create files nor mutate any state', async t => {
  const dir = path.join(await temporary(t), 'absent');
  const store = await readStore(dir);
  assert.equal(store.revision, 0); assert.equal(view(store).records.length, 0);
  assert.equal(historyView(store).events.length, 0);
  await assert.rejects(fs.stat(dir), { code: 'ENOENT' });
});
test('explicit updates are versioned, source-backed, and repeatable without extra writes', async t => {
  const dir = await temporary(t);
  assert.deepEqual(await applyRequest(dir, request()), { changed: true, revision: 1, ids: ['learning-time'] });
  const stored = await readStore(dir); const before = await fs.readFile(path.join(dir, 'store.json'));
  assert.equal(stored.profile.records[0].source.type, 'user');
  assert.ok(stored.profile.records[0].confirmedAt);
  assert.equal((await applyRequest(dir, request(1))).changed, false);
  assert.deepEqual(await fs.readFile(path.join(dir, 'store.json')), before);
  if (process.platform !== 'win32') assert.equal((await fs.stat(path.join(dir, 'store.json'))).mode & 0o777, 0o600);
});
test('missing user authorization and unconfirmed facts are rejected', async t => {
  const dir = await temporary(t);
  const cases = [request(), request(), request()];
  cases[0].authorization.userRequested = false;
  delete cases[1].authorization;
  cases[2].authorization.confirmed = false;
  for (const change of cases) await assert.rejects(applyRequest(dir, change));
  assert.equal((await readStore(dir)).revision, 0);
});
test('initial import requires save approval and does not turn memories into confirmed facts', async t => {
  const dir = await temporary(t);
  const imported = record({ id: undefined, source: { type: 'codex-memory', reference: 'fictional-memory.md' }, status: 'imported' });
  delete imported.id;
  const unapproved = request(0, [imported], { intent: 'initialize', confirmed: false });
  await assert.rejects(applyRequest(dir, unapproved), { code: 'CONFIRMATION_REQUIRED' });
  await applyRequest(dir, request(0, [imported], { intent: 'initialize' }));
  let store = await readStore(dir);
  assert.equal(store.profile.records[0].confirmedAt, null);
  assert.equal(store.profile.records[0].status, 'imported');
  await applyRequest(dir, request(1, [imported], { intent: 'initialize' }));
  store = await readStore(dir); assert.equal(store.revision, 1); assert.equal(store.profile.records.length, 1);
});
test('saved interview drafts are excluded from advice and promote with stable IDs', async t => {
  const dir = await temporary(t);
  const draft = record({ status: 'imported' });
  await applyRequest(dir, request(0, [draft], { intent: 'save-progress', confirmed: false, target: 'drafts' }));
  let store = await readStore(dir);
  assert.equal(view(store).records.length, 0); assert.equal(view(store).drafts, undefined);
  assert.equal(view(store, { drafts: true }).drafts.length, 1);
  await applyRequest(dir, request(1, [record()], { intent: 'save-interview' }));
  store = await readStore(dir);
  assert.equal(store.profile.drafts.length, 0); assert.equal(store.profile.records[0].id, draft.id);
  assert.equal(store.profile.records[0].createdAt, store.history[0].after.drafts[0].createdAt);
});
test('save-progress cannot modify official records or domain states', async t => {
  const dir = await temporary(t);
  await assert.rejects(applyRequest(dir, request(0, [record({ status: 'imported' })], { intent: 'save-progress' })));
  const change = request(0, [], { intent: 'save-progress' }); change.operations = [{ type: 'domain', domain: 'motivation', state: 'withheld' }];
  await assert.rejects(applyRequest(dir, change));
});
test('uncertain imports cannot replace a confirmed record and whole batch remains atomic', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const before = await fs.readFile(path.join(dir, 'store.json'));
  await assert.rejects(applyRequest(dir, request(1, [record({ id: 'new-record', content: '另一个事实' }), record({ status: 'imported', content: '旧记忆说有 20 小时。' })])), { code: 'RECORD_CONFLICT' });
  assert.deepEqual(await fs.readFile(path.join(dir, 'store.json')), before);
});
test('stale versions and concurrent writers cannot lose updates', async t => {
  const dir = await temporary(t);
  const results = await Promise.allSettled([applyRequest(dir, request()), applyRequest(dir, request(0, [record({ id: 'another' })]))]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  assert.equal((await readStore(dir)).revision, 1);
  await assert.rejects(applyRequest(dir, request()), { code: 'REVISION_CONFLICT' });
});
test('skipped domains are excluded from advice but remain recoverable on explicit reactivation', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const change = request(1); change.operations = [{ type: 'domain', domain: 'identity', state: 'withheld' }];
  await applyRequest(dir, change);
  assert.equal(view(await readStore(dir)).records.length, 0);
  assert.equal(view(await readStore(dir), { includeInactive: true }).records.length, 1);
  change.baseRevision = 2; change.operations[0].state = 'active'; await applyRequest(dir, change);
  assert.equal(view(await readStore(dir)).records.length, 1);
});
test('undo supports multiple changes and branches without resetting revision numbers', async t => {
  const dir = await temporary(t);
  await applyRequest(dir, request());
  await applyRequest(dir, request(1, [record({ content: '每周 8 小时' })]));
  await undoRequest(dir, maintenance(2, 'undo'));
  assert.equal((await readStore(dir)).profile.records[0].content, record().content);
  await applyRequest(dir, request(3, [record({ content: '每周 2 小时' })]));
  await undoRequest(dir, maintenance(4, 'undo'));
  await undoRequest(dir, maintenance(5, 'undo'));
  const store = await readStore(dir); assert.equal(store.revision, 6); assert.equal(store.profile.records.length, 0);
  await assert.rejects(undoRequest(dir, maintenance(6, 'undo')), { code: 'NOTHING_TO_UNDO' });
});
test('forget scrubs current records, drafts, source text and all historical snapshots', async t => {
  const dir = await temporary(t);
  const sensitive = record({ content: 'UNIQUE_PRIVATE_CONTENT', source: { type: 'user', reference: 'UNIQUE_PRIVATE_SOURCE' } });
  await applyRequest(dir, request(0, [sensitive]));
  await applyRequest(dir, request(1, [record({ id: 'retained', content: '保留资料' })]));
  await applyRequest(dir, request(2, [record({ id: 'draft-only', content: 'UNIQUE_DRAFT_CONTENT', status: 'imported' })], { intent: 'save-progress', target: 'drafts', confirmed: false }));
  await forgetRequest(dir, maintenance(3, 'forget', ['learning-time', 'draft-only']));
  let raw = await fs.readFile(path.join(dir, 'store.json'), 'utf8');
  for (const text of ['UNIQUE_PRIVATE_CONTENT', 'UNIQUE_PRIVATE_SOURCE', 'UNIQUE_DRAFT_CONTENT', 'learning-time', 'draft-only']) assert.ok(!raw.includes(text));
  assert.equal((await readStore(dir)).profile.records[0].id, 'retained');
  await undoRequest(dir, maintenance(4, 'undo'));
  raw = await fs.readFile(path.join(dir, 'store.json'), 'utf8');
  assert.ok(!raw.includes('UNIQUE_PRIVATE')); assert.equal((await readStore(dir)).profile.records.length, 0);
});
test('corrupted or future schemas are preserved on failed writes', async t => {
  for (const raw of ['{ broken', '{"schemaVersion":999}']) {
    const dir = await temporary(t); const file = path.join(dir, 'store.json'); await fs.writeFile(file, raw);
    await assert.rejects(applyRequest(dir, request()));
    assert.equal(await fs.readFile(file, 'utf8'), raw);
    await assert.rejects(fs.stat(path.join(dir, '.write-lock')), { code: 'ENOENT' });
  }
});
test('invalid operation, long content, unknown fields, domain and malformed IDs fail without changes', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const before = await fs.readFile(path.join(dir, 'store.json'));
  const changes = [
    request(1, [record({ content: 'x'.repeat(6001) })]), request(1, [record({ domain: 'unknown' })]),
    request(1, [record({ id: '../escape' })]), request(1, [record({ extra: true })])
  ];
  const unknown = request(1); unknown.operations.push({ type: 'delete-all' }); changes.push(unknown);
  for (const change of changes) await assert.rejects(applyRequest(dir, change));
  assert.deepEqual(await fs.readFile(path.join(dir, 'store.json')), before);
});
test('advice reads, history and draft reads do not touch the store bytes or modification time', async t => {
  const dir = await temporary(t); await applyRequest(dir, request());
  const file = path.join(dir, 'store.json'); const before = await fs.readFile(file); const mtime = (await fs.stat(file)).mtimeMs;
  for (let i = 0; i < 3; i++) { view(await readStore(dir), { domain: 'identity' }); historyView(await readStore(dir)); view(await readStore(dir), { drafts: true }); }
  assert.deepEqual(await fs.readFile(file), before); assert.equal((await fs.stat(file)).mtimeMs, mtime);
});
