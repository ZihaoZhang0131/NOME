import { randomUUID } from 'node:crypto';

export const VERSION = '0.1.0';
export const DOMAINS = [
  { id: 'context', name: '当前处境', description: '正在经历什么，处在人生的哪个阶段', prompts: ['当前角色与阶段', '最近最在意的事情'] },
  { id: 'experience', name: '经历与能力', description: '做过的事，以及有依据的优势', prompts: ['重要经历', '能力与具体例子'] },
  { id: 'goals', name: '目标与方向', description: '近期想推进的事，和更长远的方向', prompts: ['近期目标', '长期方向'] },
  { id: 'values', name: '价值取舍', description: '在选择中优先考虑什么', prompts: ['重视的事情', '不愿牺牲的边界'] },
  { id: 'constraints', name: '现实约束', description: '计划需要尊重的时间、资源和责任', prompts: ['可用时间与资源', '需要顾及的责任'] },
  { id: 'preferences', name: '协作偏好', description: '怎样沟通，怎样一起把事情做好', prompts: ['沟通方式', '执行与反馈方式'] }
];
export const DOMAIN_IDS = DOMAINS.map(d => d.id);
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
export function newStore() { return { schemaVersion: 1, revision: 0, updatedAt: null, profile: newProfile(), history: [] }; }
export function validateSource(source) {
  keys(source, ['type', 'reference'], 'source');
  assert(SOURCE_TYPES.includes(source.type), 'source.type 无效。');
  if (source.reference !== undefined) string(source.reference, 'source.reference', 1000);
}
export function validateRecord(record, stored = true) {
  keys(record, stored
    ? ['id', 'domain', 'content', 'source', 'status', 'createdAt', 'updatedAt', 'confirmedAt']
    : ['id', 'domain', 'content', 'source', 'status'], 'record');
  if (stored || record.id !== undefined) id(record.id);
  assert(DOMAIN_IDS.includes(record.domain), 'record.domain 无效。');
  string(record.content, 'record.content');
  validateSource(record.source);
  assert(STATUSES.includes(record.status), 'record.status 无效。');
  if (stored) {
    assert(timestamp(record.createdAt) && timestamp(record.updatedAt), '记录时间无效。');
    assert(record.status === 'confirmed' ? timestamp(record.confirmedAt) : record.confirmedAt === null, '确认时间与记录状态不一致。');
  }
}
export function validateProfile(profile) {
  keys(profile, ['domains', 'records', 'drafts'], 'profile');
  keys(profile.domains, DOMAIN_IDS, 'domains');
  for (const domain of DOMAIN_IDS) {
    keys(profile.domains[domain], ['state', 'updatedAt'], domain);
    assert(STATES.includes(profile.domains[domain].state), `${domain} 状态无效。`);
    assert(profile.domains[domain].updatedAt === null || timestamp(profile.domains[domain].updatedAt), '领域时间无效。');
  }
  const seen = new Set();
  for (const collection of ['records', 'drafts']) {
    assert(Array.isArray(profile[collection]), `${collection} 必须为数组。`);
    for (const r of profile[collection]) {
      validateRecord(r);
      assert(!seen.has(r.id), '档案中存在重复 ID。'); seen.add(r.id);
      if (collection === 'drafts') assert(r.status !== 'confirmed', '草稿不能标为已确认。');
    }
  }
}
export function validateStore(store) {
  keys(store, ['schemaVersion', 'revision', 'updatedAt', 'profile', 'history'], 'store');
  assert(store.schemaVersion === 1, '不支持此档案版本；请升级 NOME，不要覆盖现有数据。', 'UNSUPPORTED_SCHEMA');
  assert(Number.isSafeInteger(store.revision) && store.revision >= 0, '档案 revision 无效。');
  assert(store.updatedAt === null || timestamp(store.updatedAt), '档案更新时间无效。');
  validateProfile(store.profile);
  assert(Array.isArray(store.history), 'history 必须为数组。');
  let previousRevision = 0;
  for (const event of store.history) {
    keys(event, ['revision', 'action', 'at', 'intent', 'changedIds', 'before', 'after', 'undoOf'], 'history event');
    assert(Number.isSafeInteger(event.revision) && event.revision > previousRevision && event.revision <= store.revision, '历史版本无效。');
    previousRevision = event.revision;
    assert(['apply', 'undo', 'forget'].includes(event.action) && timestamp(event.at), '历史事件无效。');
    assert(['initialize', 'update', 'save-interview', 'save-progress', 'undo', 'forget'].includes(event.intent), '历史意图无效。');
    assert(Array.isArray(event.changedIds), '历史 ID 无效。'); event.changedIds.forEach(id);
    validateProfile(event.before); validateProfile(event.after);
    if (event.undoOf !== undefined) assert(Number.isSafeInteger(event.undoOf) && event.undoOf < event.revision, 'undoOf 无效。');
  }
}
export function view(store, { domain, includeInactive = false, drafts = false } = {}) {
  if (domain) assert(DOMAIN_IDS.includes(domain), '未知领域。');
  const selected = DOMAIN_IDS.filter(d => !domain || domain === d);
  const eligible = r => selected.includes(r.domain) && (includeInactive || store.profile.domains[r.domain].state === 'active');
  return {
    schemaVersion: store.schemaVersion, revision: store.revision, updatedAt: store.updatedAt,
    domains: DOMAINS.filter(d => selected.includes(d.id)).map(d => ({ ...d, ...store.profile.domains[d.id] })),
    records: store.profile.records.filter(eligible),
    ...(drafts ? { drafts: store.profile.drafts.filter(eligible) } : {})
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
    const input = { ...op.record, content: op.record.content.trim() };
    const all = [...next.records, ...next.drafts];
    const existing = input.id ? all.find(r => r.id === input.id) : all.find(r => identity(r) === identity(input));
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
