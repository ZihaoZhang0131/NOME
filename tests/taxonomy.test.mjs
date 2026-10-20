import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { DOMAINS, LEGACY_DOMAIN_IDS, newStore, upgradeStore, validateStore, view } from '../skills/nome/scripts/lib/model.mjs';
import { readStore, applyRequest, undoRequest, forgetRequest } from '../skills/nome/scripts/lib/store.mjs';
import { profileView } from '../skills/nome/assets/profile-view.js';
import { temporary, request, maintenance } from './helpers.mjs';

const at = '2026-01-10T08:00:00.000Z';
function legacyProfile() {
  return { domains: Object.fromEntries(LEGACY_DOMAIN_IDS.map(id => [id, { state: id === 'constraints' ? 'withheld' : 'active', updatedAt: at }])), records: [], drafts: [] };
}
function legacyStore() {
  const before = legacyProfile();
  const after = structuredClone(before);
  after.records = LEGACY_DOMAIN_IDS.map(domain => ({ id: `old-${domain}`, domain, content: `  原文：${domain}\n不改写。  `, source: { type: 'user', reference: `原始来源-${domain}` }, status: 'confirmed', createdAt: at, updatedAt: at, confirmedAt: at }));
  after.drafts = [{ ...after.records[1], id: 'old-draft', source: { type: 'user', reference: '原始草稿来源' }, status: 'imported', confirmedAt: null }];
  return { schemaVersion: 1, revision: 1, updatedAt: at, profile: after, history: [{ revision: 1, action: 'apply', intent: 'initialize', at, changedIds: after.records.map(r => r.id), before, after: structuredClone(after) }] };
}
function restoreOriginal(profile) {
  const restore = records => records.map(({ legacyDomain, ...record }) => ({ ...record, domain: legacyDomain }));
  return { domains: profile.legacyDomains, records: restore(profile.records), drafts: restore(profile.drafts) };
}
async function storedLegacy(t) {
  const dir = await temporary(t);
  await fs.writeFile(path.join(dir, 'store.json'), JSON.stringify(legacyStore()));
  return dir;
}

test('six role categories use the requested names and definitions and support independent writes', async t => {
  assert.deepEqual(DOMAINS.map(d => [d.id, d.name, d.description]), [
    ['identity', '身份与处境', '我现在扮演什么角色，处于什么阶段。'],
    ['motivation', '动机与价值', '我想要什么，什么值得我投入。'],
    ['traits', '特质与偏好', '我通常怎么做事，喜欢和回避什么。'],
    ['capabilities', '能力与经验', '我能做什么，有哪些实践证据。'],
    ['relationships', '关系与连接', '谁对我重要，我与哪些群体有关。'],
    ['growth', '经历与变化', '什么塑造了我，我正在怎样改变。']
  ]);
  const dir = await temporary(t);
  await applyRequest(dir, request(0, DOMAINS.map(d => ({ id: d.id, domain: d.id, content: d.description, source: { type: 'user' }, status: 'confirmed' }))));
  const store = await readStore(dir);
  for (const domain of DOMAINS) assert.equal(view(store, { domain: domain.id }).records[0].content, domain.description);
  for (const domain of LEGACY_DOMAIN_IDS) await assert.rejects(applyRequest(dir, request(1, [{ id: 'invalid', domain, content: '不应写入旧分类', source: { type: 'user' }, status: 'confirmed' }])));
});

test('v1 conversion is lossless for content, metadata, original states and every history snapshot', () => {
  const old = legacyStore(); const original = structuredClone(old);
  const next = upgradeStore(old);
  assert.deepEqual(old, original);
  assert.equal(next.schemaVersion, 2); assert.equal(next.revision, old.revision); assert.equal(next.updatedAt, at);
  assert.deepEqual(next.profile.records.map(r => r.domain), ['identity', 'unclassified', 'motivation', 'motivation', 'unclassified', 'traits']);
  assert.deepEqual(restoreOriginal(next.profile), old.profile);
  assert.deepEqual(restoreOriginal(next.history[0].before), old.history[0].before);
  assert.deepEqual(restoreOriginal(next.history[0].after), old.history[0].after);
  assert.deepEqual(upgradeStore(next), next);
  validateStore(next);
});

test('legacy reads and no-op writes leave the original store bytes and mtime intact', async t => {
  const dir = await storedLegacy(t); const file = path.join(dir, 'store.json');
  const before = await fs.readFile(file); const mtime = (await fs.stat(file)).mtimeMs;
  const store = await readStore(dir); view(store); view(store, { drafts: true });
  const noop = request(1, []); noop.operations = [{ type: 'domain', domain: 'identity', state: 'active' }];
  assert.equal((await applyRequest(dir, noop)).changed, false);
  assert.deepEqual(await fs.readFile(file), before); assert.equal((await fs.stat(file)).mtimeMs, mtime);
});

test('ambiguous old records and drafts stay outside the six categories and advice; hidden data stays hidden', () => {
  const store = upgradeStore(legacyStore()); const result = view(store, { drafts: true });
  assert.equal(result.domains.length, 6); assert.equal(result.records.length, 4);
  assert.deepEqual(result.unclassified.records.map(r => r.id), ['old-experience']);
  assert.deepEqual(result.unclassified.drafts.map(r => r.id), ['old-draft']);
  assert.equal(profileView(result).records, 4); assert.equal(profileView(result).drafts, 0);
  assert.equal(view(store).unclassified.drafts, undefined);
  assert.equal(view(store, { domain: 'identity' }).unclassified, undefined);
  const managed = view(store, { domain: 'unclassified', includeInactive: true, drafts: true });
  assert.equal(managed.records.length, 0); assert.equal(managed.domains.length, 0);
  assert.equal(managed.unclassified.records.length, 2);
});

test('merging goals and values never exposes withheld or inapplicable content', () => {
  for (const state of ['withheld', 'not_applicable']) {
    const old = legacyStore(); old.profile.domains.values.state = state;
    const store = upgradeStore(old);
    assert.equal(store.profile.domains.motivation.state, state);
    assert.equal(view(store, { domain: 'motivation' }).records.length, 0);
    assert.equal(view(store, { domain: 'motivation', includeInactive: true }).records.length, 2);
  }
});

test('explicit reclassification retains the ID and source, undo restores pending, forget scrubs converted history', async t => {
  const dir = await storedLegacy(t); const record = (await readStore(dir)).profile.records.find(r => r.id === 'old-experience');
  await applyRequest(dir, request(1, [{ id: record.id, domain: 'capabilities', content: record.content, source: record.source, status: record.status }]));
  let store = await readStore(dir); const moved = view(store, { domain: 'capabilities' }).records[0];
  assert.equal(moved.id, record.id); assert.equal(moved.createdAt, at); assert.deepEqual(moved.source, record.source); assert.equal(moved.content, record.content);
  assert.equal(moved.legacyDomain, undefined); assert.equal(store.schemaVersion, 2);
  assert.equal((JSON.parse(await fs.readFile(path.join(dir, 'store.json')))).schemaVersion, 2);
  await undoRequest(dir, maintenance(2, 'undo'));
  store = await readStore(dir);
  assert.equal(store.profile.records.find(r => r.id === record.id).domain, 'unclassified');
  await forgetRequest(dir, maintenance(3, 'forget', [record.id]));
  const raw = await fs.readFile(path.join(dir, 'store.json'), 'utf8');
  assert.ok(!raw.includes('old-experience')); assert.ok(!raw.includes('原始来源-experience'));
  assert.deepEqual(await fs.readdir(dir), ['store.json']);
});

test('new uncertain content can be stored unclassified without adding a seventh domain', async t => {
  const dir = await temporary(t);
  await applyRequest(dir, request(0, [{ id: 'uncertain', domain: 'unclassified', content: '归属待本人确认', source: { type: 'user' }, status: 'imported' }]));
  const result = view(await readStore(dir));
  assert.equal(result.records.length, 0); assert.equal(result.unclassified.records.length, 1); assert.equal(result.domains.length, 6);
  assert.equal(newStore().schemaVersion, 2);
});

test('invalid legacy data and unknown versions fail without overwriting or discarding fields', async t => {
  for (const mutate of [s => { s.profile.records[0].domain = 'unknown'; }, s => { s.history[0].after.records[0].extra = 'keep'; }, s => { s.schemaVersion = 999; }]) {
    const dir = await temporary(t); const old = legacyStore(); mutate(old); const raw = JSON.stringify(old);
    await fs.writeFile(path.join(dir, 'store.json'), raw);
    await assert.rejects(readStore(dir)); assert.equal(await fs.readFile(path.join(dir, 'store.json'), 'utf8'), raw);
  }
});
