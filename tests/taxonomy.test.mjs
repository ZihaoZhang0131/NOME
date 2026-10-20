import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { newStore, LEGACY_DOMAIN_IDS } from '../skills/nome/scripts/lib/legacy.mjs';
import { readProfile, applyRequest, migrationPreview } from '../skills/nome/scripts/lib/store.mjs';
import { temporary, request, write } from './helpers.mjs';
const at = '2026-01-01T00:00:00.000Z';
const record = (domain, content, id, status = 'imported') => ({ domain, content, id, status, source: { type: 'document', reference: 'old-reference' }, createdAt: at, updatedAt: at, confirmedAt: status === 'confirmed' ? at : null });
async function fixture(t, legacy = false) {
  const dir = await temporary(t); const store = newStore();
  if (legacy) {
    store.schemaVersion = 1;
    store.profile.domains = Object.fromEntries(LEGACY_DOMAIN_IDS.map(id => [id, { state: 'active', updatedAt: null }]));
    store.profile.records = [record('context', 'Old identity', 'identity'), record('goals', 'Old goal', 'goal'), record('experience', 'Ambiguous', 'ambiguous')];
  } else {
    store.profile.records = [record('identity', 'Kept text', 'one'), record('identity', 'Kept text', 'two', 'confirmed'), record('growth', 'Life text', 'life'), record('relationships', 'Hidden text', 'hidden'), record('unclassified', 'Ambiguous text', 'ambiguous')];
    store.profile.domains.relationships.state = 'withheld';
    store.profile.drafts = [record('motivation', 'Draft text', 'draft')];
  }
  const raw = JSON.stringify(store); await fs.writeFile(path.join(dir, 'store.json'), raw);
  return { dir, raw };
}
test('old JSON requires explicit migration; preview is read-only and excludes drafts and hidden content', async t => {
  const { dir, raw } = await fixture(t);
  await assert.rejects(readProfile(dir), { code: 'MIGRATION_REQUIRED' });
  const preview = await migrationPreview(dir);
  assert.equal(preview.candidates.length, 2);
  assert.equal(preview.candidates.find(d => d.path.startsWith('identity')).markdown, 'Kept text\n');
  assert.deepEqual(preview.excluded, { drafts: 1, unclassified: 1, inactive: 1 });
  assert.ok(!JSON.stringify(preview.candidates).includes('old-reference'));
  assert.equal(await fs.readFile(path.join(dir, 'store.json'), 'utf8'), raw);
  assert.deepEqual(await fs.readdir(dir), ['store.json']);
});
test('selected migration becomes plain Markdown and old JSON no longer affects reads', async t => {
  const { dir, raw } = await fixture(t); const p = await migrationPreview(dir);
  await applyRequest(dir, { ...request(p.baseHash, [write('identity/index.md', '# Identity\n\nSelected prose\n')], 'migrate'), legacyHash: p.legacyHash }, { migration: true });
  assert.equal(await fs.readFile(path.join(dir, 'store.json'), 'utf8'), raw);
  assert.equal((await readProfile(dir)).documents.length, 1);
  await fs.writeFile(path.join(dir, 'store.json'), 'broken backup');
  assert.equal((await readProfile(dir)).documents[0].markdown, '# Identity\n\nSelected prose\n');
  assert.deepEqual((await fs.readdir(dir)).sort(), ['profile', 'store.json']);
});
test('migration detects changed legacy input and refuses normal writes or repeat migrations', async t => {
  const { dir, raw } = await fixture(t); const p = await migrationPreview(dir);
  await assert.rejects(applyRequest(dir, request()), { code: 'MIGRATION_REQUIRED' });
  await fs.writeFile(path.join(dir, 'store.json'), raw + '\n');
  const payload = { ...request(p.baseHash, p.candidates.map(d => write(d.path, d.markdown)), 'migrate'), legacyHash: p.legacyHash };
  await assert.rejects(applyRequest(dir, payload, { migration: true }), { code: 'CONTENT_CONFLICT' });
  const next = await migrationPreview(dir); payload.legacyHash = next.legacyHash;
  await applyRequest(dir, payload, { migration: true });
  await assert.rejects(applyRequest(dir, { ...payload, baseHash: (await readProfile(dir)).hash }, { migration: true }), { code: 'MIGRATION_CONFLICT' });
});
test('v1 migration keeps ambiguous categories outside proposed formal chapters', async t => {
  const { dir, raw } = await fixture(t, true); const p = await migrationPreview(dir);
  assert.deepEqual(p.candidates.map(d => d.path).sort(), ['identity/index.md', 'motivation/index.md']);
  assert.equal(p.excluded.unclassified, 1); assert.equal(await fs.readFile(path.join(dir, 'store.json'), 'utf8'), raw);
});
test('corrupt or unknown legacy versions stay unchanged with actionable errors', async t => {
  const dir = await temporary(t); const file = path.join(dir, 'store.json');
  for (const raw of ['broken', JSON.stringify({ schemaVersion: 999 })]) {
    await fs.writeFile(file, raw); await assert.rejects(migrationPreview(dir)); assert.equal(await fs.readFile(file, 'utf8'), raw);
  }
});
test('legacy changes during migration staging cancel the switch and preserve the new legacy text', async t => {
  const { dir, raw } = await fixture(t); const p = await migrationPreview(dir);
  await assert.rejects(applyRequest(dir, { ...request(p.baseHash, p.candidates.map(d => write(d.path, d.markdown)), 'migrate'), legacyHash: p.legacyHash }, {
    migration: true, beforeCommit: () => fs.writeFile(path.join(dir, 'store.json'), raw + '\n')
  }), { code: 'CONTENT_CONFLICT' });
  assert.equal(await fs.readFile(path.join(dir, 'store.json'), 'utf8'), raw + '\n'); assert.deepEqual(await fs.readdir(dir), ['store.json']);
});
