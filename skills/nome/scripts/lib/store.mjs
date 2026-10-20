import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { assert, fail, newStore, upgradeStore, validateStore, validateRequest, applyOperations, requestAuthorization, keys, id } from './model.mjs';

export const resolveDataDir = value => path.resolve(value || process.env.NOME_DATA_DIR || path.join(os.homedir(), '.nome'));
export async function readStore(dataDir) {
  let raw;
  try { raw = await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return newStore(); throw error; }
  let store;
  try { store = JSON.parse(raw); } catch { fail('CORRUPT_STORE', '档案 JSON 已损坏；请保留原文件并检查，NOME 未覆盖它。'); }
  // Compatibility is in memory only; reads never rewrite a user's original file.
  return upgradeStore(store);
}
export async function atomicWrite(dataDir, store) {
  validateStore(store);
  const temp = path.join(dataDir, `.store-${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await fs.open(temp, 'wx', 0o600);
    await handle.writeFile(`${JSON.stringify(store, null, 2)}\n`);
    await handle.sync(); await handle.close(); handle = undefined;
    await fs.rename(temp, path.join(dataDir, 'store.json'));
  } finally { await handle?.close(); await fs.rm(temp, { force: true }); }
}
async function transaction(dataDir, baseRevision, mutation) {
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lock = path.join(dataDir, '.write-lock');
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') fail('WRITE_LOCKED', '另一次写入尚未结束。稍后重试；若进程已退出，请检查 doctor 中的锁状态。'); throw error; }
  try {
    const store = await readStore(dataDir);
    assert(store.revision === baseRevision, `档案版本已变为 ${store.revision}，请重新读取并核对修改。`, 'REVISION_CONFLICT');
    const result = mutation(store, new Date().toISOString());
    if (!result.changed) return { changed: false, revision: store.revision, ids: [] };
    store.revision += 1; store.updatedAt = result.at;
    await atomicWrite(dataDir, store);
    return { changed: true, revision: store.revision, ids: result.changedIds, ...(result.undoOf ? { undoOf: result.undoOf } : {}) };
  } finally { await fs.rm(lock, { recursive: true, force: true }); }
}
export async function applyRequest(dataDir, request) {
  validateRequest(request);
  return transaction(dataDir, request.baseRevision, (store, at) => {
    const before = structuredClone(store.profile);
    const result = applyOperations(before, request, at);
    if (JSON.stringify(before) === JSON.stringify(result.profile)) return { changed: false };
    store.profile = result.profile;
    store.history.push({ revision: store.revision + 1, action: 'apply', intent: request.authorization.intent, at, changedIds: result.changedIds, before, after: structuredClone(store.profile) });
    return { changed: true, at, changedIds: result.changedIds };
  });
}
function validateMaintenance(request, intent) {
  keys(request, intent === 'forget' ? ['baseRevision', 'authorization', 'ids'] : ['baseRevision', 'authorization'], 'request');
  assert(Number.isSafeInteger(request.baseRevision) && request.baseRevision >= 0, '必须提供 baseRevision。');
  requestAuthorization(request.authorization, intent);
}
export async function undoRequest(dataDir, request) {
  validateMaintenance(request, 'undo');
  return transaction(dataDir, request.baseRevision, (store, at) => {
    const undone = new Set(store.history.filter(e => e.action === 'undo').map(e => e.undoOf));
    const target = store.history.findLast(e => e.action === 'apply' && !undone.has(e.revision) && JSON.stringify(e.before) !== JSON.stringify(e.after));
    if (!target) fail('NOTHING_TO_UNDO', '没有可撤销的修改。彻底删除的内容不能恢复。');
    const before = structuredClone(store.profile);
    // Applying a new change after an undo creates a new undo branch.
    store.profile = structuredClone(target.before);
    store.history.push({ revision: store.revision + 1, action: 'undo', intent: 'undo', at, changedIds: target.changedIds, before, after: structuredClone(store.profile), undoOf: target.revision });
    return { changed: true, at, changedIds: target.changedIds, undoOf: target.revision };
  });
}
export async function forgetRequest(dataDir, request) {
  validateMaintenance(request, 'forget');
  assert(Array.isArray(request.ids) && request.ids.length > 0 && request.ids.length <= 100, 'ids 必须包含 1–100 个 ID。');
  request.ids.forEach(id);
  return transaction(dataDir, request.baseRevision, (store, at) => {
    const ids = new Set(request.ids);
    const profiles = [store.profile, ...store.history.flatMap(e => [e.before, e.after])];
    const found = new Set(profiles.flatMap(p => [...p.records, ...p.drafts]).filter(r => ids.has(r.id)).map(r => r.id));
    if (!found.size) return { changed: false };
    for (const profile of profiles) {
      profile.records = profile.records.filter(r => !ids.has(r.id));
      profile.drafts = profile.drafts.filter(r => !ids.has(r.id));
    }
    for (const event of store.history) event.changedIds = event.changedIds.filter(recordId => !ids.has(recordId));
    // Keep only a content-free deletion event; no deleted text or IDs remain in snapshots.
    store.history.push({ revision: store.revision + 1, action: 'forget', intent: 'forget', at, changedIds: [], before: structuredClone(store.profile), after: structuredClone(store.profile) });
    return { changed: true, at, changedIds: [...found] };
  });
}
export function historyView(store) {
  return { revision: store.revision, events: store.history.map(({ before, after, ...event }) => event) };
}
