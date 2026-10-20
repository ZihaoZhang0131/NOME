import { randomUUID } from 'node:crypto';

export const VERSION = '0.1.0';
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
export function view(store, { domain, includeInactive = false, drafts = false } = {}) {
  if (domain) assert(RECORD_DOMAIN_IDS.includes(domain), '未知领域。');
  const selected = DOMAIN_IDS.filter(d => !domain || domain === d);
  const eligible = r => selected.includes(r.domain) && (includeInactive || store.profile.domains[r.domain].state === 'active');
  const pending = r => r.domain === 'unclassified' && (includeInactive || !r.legacyDomain || store.profile.legacyDomains[r.legacyDomain].state === 'active');
  return {
    schemaVersion: store.schemaVersion, revision: store.revision, updatedAt: store.updatedAt,
    domains: DOMAINS.filter(d => selected.includes(d.id)).map(d => ({ ...d, ...store.profile.domains[d.id] })),
    records: store.profile.records.filter(eligible),
    ...(drafts ? { drafts: store.profile.drafts.filter(eligible) } : {}),
    ...(!domain || domain === 'unclassified' ? { unclassified: { records: store.profile.records.filter(pending), ...(drafts ? { drafts: store.profile.drafts.filter(pending) } : {}) } } : {})
  };
}
export function requestAuthorization(auth, intent) {
  keys(auth, ['userRequested', 'intent', 'confirmed'], 'authorization');
  assert(auth.userRequested === true, '只有用户明确要求才能写入档案。', 'AUTHORIZATION_REQUIRED');
  const allowed = intent ? [intent] : ['initialize', 'update', 'save-interview', 'save-progress'];
  assert(allowed.includes(auth.intent), 'authorization.intent 与操作不符。', 'AUTHORIZATION_REQUIRED');
  if (auth.confirmed !== undefined) assert(typeof auth.confirmed === 'boolean', 'confirmed 必须为布尔值。');
}
export function validateRequest(request) {
  keys(request, ['baseRevision', 'authorization', 'operations'], 'request');
  assert(Number.isSafeInteger(request.baseRevision) && request.baseRevision >= 0, '必须提供读取时的 baseRevision。');
  requestAuthorization(request.authorization);
  assert(Array.isArray(request.operations) && request.operations.length > 0 && request.operations.length <= 100, 'operations 必须包含 1–100 项。');
  for (const op of request.operations) {
    if (op.type === 'upsert') {
      keys(op, ['type', 'target', 'record'], 'operation');
      assert(op.target === undefined || ['records', 'drafts'].includes(op.target), 'target 无效。');
      validateRecord(op.record, false);
      if (op.record.status === 'confirmed') {
        assert(op.target !== 'drafts', '草稿不能标为已确认。');
        assert(request.authorization.confirmed === true, '已确认记录需要用户明确确认内容。', 'CONFIRMATION_REQUIRED');
      }
      if (request.authorization.intent === 'save-progress') assert(op.target === 'drafts', '保存问答进度只能写入草稿。');
      if (['initialize', 'save-interview'].includes(request.authorization.intent) && op.target !== 'drafts') {
        assert(request.authorization.confirmed === true, '初始化或问答结果须经用户确认后保存。', 'CONFIRMATION_REQUIRED');
      }
    } else if (op.type === 'domain') {
      keys(op, ['type', 'domain', 'state'], 'operation');
      assert(DOMAIN_IDS.includes(op.domain) && STATES.includes(op.state), '领域或状态无效。');
      assert(request.authorization.intent !== 'save-progress', '保存进度不能修改正式领域状态。');
      if (['initialize', 'save-interview'].includes(request.authorization.intent)) assert(request.authorization.confirmed === true, '请先确认领域状态。', 'CONFIRMATION_REQUIRED');
    } else { fail('INVALID_INPUT', '未知修改操作；彻底删除请使用 forget。'); }
  }
}
function identity(r) { return JSON.stringify([r.domain, r.content.trim(), r.source.type, r.source.reference || '']); }
export function applyOperations(profile, request, now) {
  const next = structuredClone(profile);
  const changedIds = new Set();
  for (const op of request.operations) {
    if (op.type === 'domain') {
      if (next.domains[op.domain].state !== op.state) next.domains[op.domain] = { state: op.state, updatedAt: now };
      continue;
    }
    const target = op.target || 'records';
    const input = { ...op.record };
    const all = [...next.records, ...next.drafts];
    const existing = input.id ? all.find(r => r.id === input.id) : all.find(r => identity(r) === identity(input));
    // Reclassification alone must preserve the exact original text, including whitespace.
    if (!existing || input.content !== existing.content) input.content = input.content.trim();
    const recordId = existing?.id || input.id || randomUUID();
    if (existing && existing.status === 'confirmed' && (input.status !== 'confirmed' || target === 'drafts')) {
      // Re-importing the same known fact is harmless; changing it is a conflict.
      if (identity(existing) === identity(input)) continue;
      fail('RECORD_CONFLICT', '不能用未确认信息覆盖已确认记录；请先向用户核实。');
    }
    const updated = {
      ...input, id: recordId, createdAt: existing?.createdAt || now, updatedAt: now,
      confirmedAt: input.status === 'confirmed' ? now : null
    };
    if (existing && next[target].some(r => r.id === recordId) && identity(existing) === identity(input) && existing.status === input.status) continue;
    next.records = next.records.filter(r => r.id !== recordId);
    next.drafts = next.drafts.filter(r => r.id !== recordId);
    next[target].push(updated); changedIds.add(recordId);
  }
  validateProfile(next);
  return { profile: next, changedIds: [...changedIds] };
}
