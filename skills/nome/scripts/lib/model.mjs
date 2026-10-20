import { createHash } from 'node:crypto';

export const VERSION = '0.2.0';
export const DOMAINS = [
  { id: 'identity', name: '身份与处境' },
  { id: 'motivation', name: '动机与价值' },
  { id: 'traits', name: '特质与偏好' },
  { id: 'capabilities', name: '能力与经验' },
  { id: 'relationships', name: '关系与连接' },
  { id: 'growth', name: '经历与变化' }
];
export const DOMAIN_IDS = DOMAINS.map(d => d.id);
export const MAX_FILE_BYTES = 1024 * 1024;
export const MAX_PROFILE_BYTES = 4 * MAX_FILE_BYTES;
export class NomeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function fail(code, message) { throw new NomeError(code, message); }
export function assert(condition, message, code = 'INVALID_INPUT') { if (!condition) fail(code, message); }
export function keys(value, allowed, label) {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} 必须是对象。`);
  for (const key of Object.keys(value)) assert(allowed.includes(key), `${label} 不支持字段 ${key}。`);
}
export function documentPath(value) {
  assert(typeof value === 'string' && /^[a-z]+\/[a-z0-9][a-z0-9_-]*\.md$/.test(value), '文档路径必须为 domain/filename.md。');
  assert(DOMAIN_IDS.includes(value.split('/')[0]), '未知档案领域。');
  return value;
}
export function markdown(value) {
  assert(typeof value === 'string' && !value.includes('\0') && Buffer.byteLength(value) <= MAX_FILE_BYTES, '正文必须是至多 1 MiB 的 Markdown 文本。');
  assert(!/^\s*---\s*\n[\s\S]*?\n---\s*(\n|$)/.test(value), '档案仅保存正文，不使用 YAML frontmatter。');
  return value;
}
export const digest = value => createHash('sha256').update(value).digest('hex');
export const profileHash = documents => digest(JSON.stringify([...documents].sort((a, b) => a.path.localeCompare(b.path)).map(({ path, markdown }) => [path, markdown])));
export function profileView(documents, domain) {
  if (domain) assert(DOMAIN_IDS.includes(domain), '未知领域。');
  return {
    // A transient concurrency guard, not a stored profile field.
    hash: profileHash(documents),
    domains: DOMAINS.filter(d => !domain || d.id === domain).map(d => ({ ...d,
      documents: documents.filter(doc => doc.path.startsWith(`${d.id}/`))
    }))
  };
}
export function validateRequest(request, intent = null) {
  keys(request, ['baseHash', 'legacyHash', 'authorization', 'operations'], 'request');
  assert(typeof request.baseHash === 'string' && /^[a-f0-9]{64}$/.test(request.baseHash), '必须提供 read 返回的 baseHash。');
  keys(request.authorization, ['userRequested', 'intent'], 'authorization');
  assert(request.authorization.userRequested === true, '需要用户明确要求保存。', 'AUTHORIZATION_REQUIRED');
  assert((intent ? [intent] : ['initialize', 'update', 'save-interview']).includes(request.authorization.intent), '保存意图无效。', 'AUTHORIZATION_REQUIRED');
  if (intent === 'migrate') assert(typeof request.legacyHash === 'string' && /^[a-f0-9]{64}$/.test(request.legacyHash), '迁移需要 legacyHash。');
  else assert(request.legacyHash === undefined, '普通保存不接受 legacyHash。');
  assert(Array.isArray(request.operations) && request.operations.length > 0 && request.operations.length <= 100, 'operations 必须包含 1–100 项。');
  const seen = new Set();
  for (const op of request.operations) {
    keys(op, ['type', 'path', ...(op.type === 'write' ? ['markdown'] : [])], 'operation');
    assert(['write', 'delete'].includes(op.type), '操作必须为 write 或 delete。');
    documentPath(op.path);
    assert(!seen.has(op.path), '一次提交不能重复操作同一文件。'); seen.add(op.path);
    if (op.type === 'write') markdown(op.markdown);
  }
}
