// Read-only v1/v2 decoding for the explicit migration preview.
export const DOMAINS = [
  { id: 'identity', name: '身份与处境', description: '我现在扮演什么角色，处于什么阶段。', prompts: ['当前角色与责任', '所处阶段与生活条件'] },
  { id: 'motivation', name: '动机与价值', description: '我想要什么，什么值得我投入。', prompts: ['愿望与目标', '投入的理由与取舍'] },
  { id: 'traits', name: '特质与偏好', description: '我通常怎么做事，喜欢和回避什么。', prompts: ['常见的做事方式', '喜欢与回避的情境'] },
  { id: 'capabilities', name: '能力与经验', description: '我能做什么，有哪些实践证据。', prompts: ['做过的实践', '具体行为、成果与证据'] },
  { id: 'relationships', name: '关系与连接', description: '谁对我重要，我与哪些群体有关。', prompts: ['重要的人与相处方式', '所属群体与连接'] },
  { id: 'growth', name: '经历与变化', description: '什么塑造了我，我正在怎样改变。', prompts: ['塑造自己的经历', '转折、变化与新的理解'] }
];
export const DOMAIN_IDS = DOMAINS.map(d => d.id);
export const LEGACY_DOMAIN_IDS = ['context', 'experience', 'goals', 'values', 'constraints', 'preferences'];
// Deliberately conservative: mixed experience/ability and constraints need the user's classification.
export const LEGACY_DOMAIN_MAP = { context: 'identity', goals: 'motivation', values: 'motivation', preferences: 'traits' };
const RECORD_DOMAIN_IDS = [...DOMAIN_IDS, 'unclassified'];
export const STATES = ['active', 'withheld', 'not_applicable'];
export const STATUSES = ['confirmed', 'imported', 'inferred'];
export const SOURCE_TYPES = ['user', 'codex-memory', 'claude-memory', 'document', 'inference'];

export class NomeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function fail(code, message) { throw new NomeError(code, message); }
export function assert(condition, message, code = 'INVALID_INPUT') { if (!condition) fail(code, message); }
export function object(value, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} 必须是对象。`);
}
export function keys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) assert(allowed.includes(key), `${label} 不支持字段 ${key}。`);
}
export function string(value, label, max = 6000) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label} 必须为 1–${max} 字符的非空文本。`);
}
export function id(value) { assert(typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value), '记录 ID 格式无效。'); }
export function timestamp(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function newProfile() {
  return { domains: Object.fromEntries(DOMAIN_IDS.map(d => [d, { state: 'active', updatedAt: null }])), records: [], drafts: [] };
}
export function newStore() { return { schemaVersion: 2, revision: 0, updatedAt: null, profile: newProfile(), history: [] }; }
export function validateSource(source) {
  keys(source, ['type', 'reference'], 'source');
  assert(SOURCE_TYPES.includes(source.type), 'source.type 无效。');
  if (source.reference !== undefined) string(source.reference, 'source.reference', 1000);
}
export function validateRecord(record, stored = true, legacy = false) {
  keys(record, stored
    ? ['id', 'domain', 'content', 'source', 'status', 'createdAt', 'updatedAt', 'confirmedAt', ...(!legacy ? ['legacyDomain'] : [])]
    : ['id', 'domain', 'content', 'source', 'status'], 'record');
  if (stored || record.id !== undefined) id(record.id);
  assert((legacy ? LEGACY_DOMAIN_IDS : RECORD_DOMAIN_IDS).includes(record.domain), 'record.domain 无效。');
  if (record.legacyDomain !== undefined) assert(LEGACY_DOMAIN_IDS.includes(record.legacyDomain), 'legacyDomain 无效。');
  string(record.content, 'record.content');
  validateSource(record.source);
  assert(STATUSES.includes(record.status), 'record.status 无效。');
  if (stored) {
    assert(timestamp(record.createdAt) && timestamp(record.updatedAt), '记录时间无效。');
    assert(record.status === 'confirmed' ? timestamp(record.confirmedAt) : record.confirmedAt === null, '确认时间与记录状态不一致。');
  }
}
export function validateProfile(profile, legacy = false) {
  keys(profile, ['domains', 'records', 'drafts', ...(!legacy ? ['legacyDomains'] : [])], 'profile');
  const domainIds = legacy ? LEGACY_DOMAIN_IDS : DOMAIN_IDS;
  keys(profile.domains, domainIds, 'domains');
  for (const domain of domainIds) {
    keys(profile.domains[domain], ['state', 'updatedAt'], domain);
    assert(STATES.includes(profile.domains[domain].state), `${domain} 状态无效。`);
    assert(profile.domains[domain].updatedAt === null || timestamp(profile.domains[domain].updatedAt), '领域时间无效。');
  }
  if (profile.legacyDomains !== undefined) {
    keys(profile.legacyDomains, LEGACY_DOMAIN_IDS, 'legacyDomains');
    for (const domain of LEGACY_DOMAIN_IDS) {
      const state = profile.legacyDomains[domain];
      keys(state, ['state', 'updatedAt'], 'legacy domain');
      assert(STATES.includes(state.state) && (state.updatedAt === null || timestamp(state.updatedAt)), '旧领域状态无效。');
    }
  }
  const seen = new Set();
  for (const collection of ['records', 'drafts']) {
    assert(Array.isArray(profile[collection]), `${collection} 必须为数组。`);
    for (const r of profile[collection]) {
      validateRecord(r, true, legacy);
      if (r.legacyDomain !== undefined) assert(profile.legacyDomains, '旧记录缺少原领域状态。');
      assert(!seen.has(r.id), '档案中存在重复 ID。'); seen.add(r.id);
      if (collection === 'drafts') assert(r.status !== 'confirmed', '草稿不能标为已确认。');
    }
  }
}
export function validateStore(store, legacy = false) {
  keys(store, ['schemaVersion', 'revision', 'updatedAt', 'profile', 'history'], 'store');
  assert(store.schemaVersion === (legacy ? 1 : 2), '不支持此档案版本；请升级 NOME，不要覆盖现有数据。', 'UNSUPPORTED_SCHEMA');
  assert(Number.isSafeInteger(store.revision) && store.revision >= 0, '档案 revision 无效。');
  assert(store.updatedAt === null || timestamp(store.updatedAt), '档案更新时间无效。');
  validateProfile(store.profile, legacy);
  assert(Array.isArray(store.history), 'history 必须为数组。');
  let previousRevision = 0;
  for (const event of store.history) {
    keys(event, ['revision', 'action', 'at', 'intent', 'changedIds', 'before', 'after', 'undoOf'], 'history event');
    assert(Number.isSafeInteger(event.revision) && event.revision > previousRevision && event.revision <= store.revision, '历史版本无效。');
    previousRevision = event.revision;
    assert(['apply', 'undo', 'forget'].includes(event.action) && timestamp(event.at), '历史事件无效。');
    assert(['initialize', 'update', 'save-interview', 'save-progress', 'undo', 'forget'].includes(event.intent), '历史意图无效。');
    assert(Array.isArray(event.changedIds), '历史 ID 无效。'); event.changedIds.forEach(id);
    validateProfile(event.before, legacy); validateProfile(event.after, legacy);
    if (event.undoOf !== undefined) assert(Number.isSafeInteger(event.undoOf) && event.undoOf < event.revision, 'undoOf 无效。');
  }
}
export function upgradeStore(store) {
  if (store.schemaVersion !== 1) { validateStore(store); return store; }
  validateStore(store, true);
  const next = structuredClone(store);
  const upgradeProfile = profile => {
    const migrated = newProfile();
    migrated.legacyDomains = structuredClone(profile.domains);
    for (const domain of DOMAIN_IDS) {
      const states = LEGACY_DOMAIN_IDS.filter(old => LEGACY_DOMAIN_MAP[old] === domain).map(old => profile.domains[old]);
      if (!states.length) continue;
      // A merged domain never makes previously withheld information public.
      const state = states.some(s => s.state === 'withheld') ? 'withheld' : states.some(s => s.state === 'not_applicable') ? 'not_applicable' : 'active';
      migrated.domains[domain] = { state, updatedAt: states.map(s => s.updatedAt).filter(Boolean).sort().at(-1) || null };
    }
    for (const collection of ['records', 'drafts']) migrated[collection] = profile[collection].map(record => ({ ...record, domain: LEGACY_DOMAIN_MAP[record.domain] || 'unclassified', legacyDomain: record.domain }));
    return migrated;
  };
  next.schemaVersion = 2;
  next.profile = upgradeProfile(next.profile);
  for (const event of next.history) { event.before = upgradeProfile(event.before); event.after = upgradeProfile(event.after); }
  validateStore(next);
  return next;
}
