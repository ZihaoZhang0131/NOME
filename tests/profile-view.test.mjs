import test from 'node:test';
import assert from 'node:assert/strict';
import { profileView } from '../skills/nome/assets/profile-view.js';

const fixture = () => ({
  domains: ['context', 'experience', 'goals', 'values', 'constraints', 'preferences'].map(id => ({ id, state: 'active' })),
  records: [], drafts: []
});
const record = (id, domain, status = 'confirmed') => ({ id, domain, status, content: id });

test('empty atlas shows six unexplored domains without invented records', () => {
  const profile = fixture(); const before = structuredClone(profile);
  const result = profileView(profile);
  assert.equal(result.known, 0); assert.equal(result.remaining, 6);
  assert.equal(result.records, 0); assert.equal(result.drafts, 0);
  assert.ok(result.domains.every(domain => domain.state === 'empty' && domain.preview === null));
  assert.deepEqual(profile, before);
});
test('coverage counts domains once, keeps imports and drafts unconfirmed and prefers confirmed previews', () => {
  const profile = fixture();
  profile.records = [record('old', 'context', 'imported'), record('now', 'context'), record('more', 'context'), record('memory', 'experience', 'imported')];
  profile.drafts = [record('interview', 'goals', 'inferred')];
  const result = profileView(profile);
  assert.equal(result.known, 1); assert.equal(result.remaining, 5);
  assert.equal(result.records, 4); assert.equal(result.drafts, 1);
  assert.equal(result.domains[0].preview.id, 'now');
  assert.equal(result.domains[0].pending.length, 1);
  assert.equal(result.domains[1].state, 'pending');
  assert.equal(result.domains[2].state, 'draft');
});
test('skipped domains never expose content even if a caller supplies it', () => {
  const profile = fixture();
  profile.domains[0].state = 'withheld'; profile.domains[1].state = 'not_applicable';
  profile.records = [record('private', 'context'), record('irrelevant', 'experience')];
  profile.drafts = [record('private-draft', 'context', 'inferred')];
  const result = profileView(profile);
  assert.equal(result.skipped, 2); assert.equal(result.known, 0); assert.equal(result.remaining, 4);
  assert.equal(result.records, 0); assert.equal(result.drafts, 0);
  for (const domain of result.domains.slice(0, 2)) {
    assert.equal(domain.preview, null); assert.deepEqual(domain.records, []); assert.deepEqual(domain.drafts, []);
  }
});
test('all skipped domains are a valid choice, not six missing domains', () => {
  const profile = fixture(); profile.domains.forEach(domain => { domain.state = 'withheld'; });
  const result = profileView(profile);
  assert.equal(result.skipped, 6); assert.equal(result.known, 0); assert.equal(result.remaining, 0);
});
