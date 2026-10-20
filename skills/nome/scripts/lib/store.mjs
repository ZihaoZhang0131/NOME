import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { assert, fail, documentPath, markdown, profileHash, MAX_FILE_BYTES, MAX_PROFILE_BYTES, validateRequest } from './model.mjs';
import { upgradeStore } from './legacy.mjs';

export const resolveDataDir = value => path.resolve(value || process.env.NOME_DATA_DIR || path.join(os.homedir(), '.nome'));
async function stat(file) {
  try { return await fs.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function directory(file) {
  const info = await stat(file);
  if (info) assert(info.isDirectory() && !info.isSymbolicLink(), `${file} 必须为普通目录。`, 'UNSAFE_PATH');
  return Boolean(info);
}
async function unlocked(dataDir) {
  if (await stat(path.join(dataDir, '.write-lock'))) fail('WRITE_LOCKED', '档案正在写入或上次写入未完成。请稍后重试，或使用 doctor 检查后显式 recover。');
}
async function readDocuments(root) {
  if (!await directory(root)) return [];
  const documents = [];
  let total = 0;
  for (const domain of (await fs.readdir(root)).filter(name => name !== '.DS_Store').sort()) {
    documentPath(`${domain}/index.md`);
    const dir = path.join(root, domain);
    await directory(dir);
    for (const name of (await fs.readdir(dir)).filter(name => name !== '.DS_Store').sort()) {
      const relative = documentPath(`${domain}/${name}`);
      const file = path.join(root, relative);
      const info = await stat(file);
      assert(info?.isFile() && !info.isSymbolicLink(), '档案不能包含符号链接或特殊文件。', 'UNSAFE_PATH');
      assert(info.size <= MAX_FILE_BYTES && (total += info.size) <= MAX_PROFILE_BYTES, '档案文件过大。', 'PROFILE_TOO_LARGE');
      const value = await fs.readFile(file, 'utf8');
      markdown(value);
      documents.push({ path: relative, markdown: value });
    }
  }
  return documents;
}
async function checkDataDir(dataDir) { await directory(dataDir); }
export async function readProfile(dataDir) {
  await checkDataDir(dataDir); await unlocked(dataDir);
  const root = path.join(dataDir, 'profile');
  const exists = await directory(root);
  if (!exists && await stat(path.join(dataDir, 'store.json'))) fail('MIGRATION_REQUIRED', '发现旧档案。请在 Agent 对话中要求迁移为 Markdown，原文件保持不变。');
  const documents = await readDocuments(root);
  await unlocked(dataDir);
  return { documents, hash: profileHash(documents) };
}
export async function migrationPreview(dataDir) {
  await checkDataDir(dataDir); await unlocked(dataDir);
  const file = path.join(dataDir, 'store.json');
  const info = await stat(file);
  assert(info?.isFile() && !info.isSymbolicLink() && info.size <= 32 * MAX_FILE_BYTES, '没有可读取的普通旧档案文件。', 'INVALID_LEGACY');
  const raw = await fs.readFile(file, 'utf8');
  let store;
  try { store = JSON.parse(raw); } catch { fail('CORRUPT_STORE', '旧档案 JSON 已损坏；原文件保持不变。'); }
  store = upgradeStore(store);
  const active = r => r.domain !== 'unclassified' && store.profile.domains[r.domain]?.state === 'active';
  const grouped = new Map();
  for (const record of store.profile.records.filter(active)) {
    const values = grouped.get(record.domain) || [];
    if (!values.includes(record.content.trim())) values.push(record.content.trim());
    grouped.set(record.domain, values);
  }
  const candidates = [...grouped].map(([domain, values]) => ({ path: `${domain}/index.md`, markdown: values.join('\n\n') + '\n' }));
  const documents = await readDocuments(path.join(dataDir, 'profile'));
  return { baseHash: profileHash(documents), legacyHash: digestLegacy(raw), candidates,
    excluded: { drafts: store.profile.drafts.length, unclassified: store.profile.records.filter(r => r.domain === 'unclassified').length,
      inactive: store.profile.records.filter(r => r.domain !== 'unclassified' && !active(r)).length },
    guidance: '仅预览；先在对话中合并重复、解决冲突并选择保留内容，再提交 migrate --file。旧文件作为回退副本保留，不参与新档案读取。' };
}
function digestLegacy(raw) { return profileHash([{ path: 'store.json', markdown: raw }]); }

// Both readers and writers respect the lock. The entire directory switches as one
// transaction; originals exist only inside the temporary lock until commit finishes.
export async function applyRequest(dataDir, request, { migration = false, beforeCommit } = {}) {
  validateRequest(request, migration ? 'migrate' : null);
  await checkDataDir(dataDir);
  await fs.mkdir(dataDir, { recursive: true, mode: 0o700 });
  const lock = path.join(dataDir, '.write-lock');
  try { await fs.mkdir(lock, { mode: 0o700 }); }
  catch (error) { if (error.code === 'EEXIST') fail('WRITE_LOCKED', '另一次写入尚未结束，请稍后重新读取。'); throw error; }
  const root = path.join(dataDir, 'profile');
  const stage = path.join(lock, 'stage');
  const original = path.join(lock, 'original');
  let moved = false;
  let committed = false;
  try {
    await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, host: os.hostname() }), { mode: 0o600 });
    const existed = await directory(root);
    const old = await readDocuments(root);
    assert(profileHash(old) === request.baseHash, '档案已变化，请重新读取并合并修改。', 'CONTENT_CONFLICT');
    if (migration) {
      assert(!existed, '已有 Markdown 档案，不重复迁移。', 'MIGRATION_CONFLICT');
      const file = path.join(dataDir, 'store.json');
      const legacyInfo = await stat(file);
      assert(legacyInfo?.isFile() && !legacyInfo.isSymbolicLink() && legacyInfo.size <= 32 * MAX_FILE_BYTES, '旧档案文件无效。', 'INVALID_LEGACY');
      assert(digestLegacy(await fs.readFile(file, 'utf8')) === request.legacyHash, '旧档案已变化，请重新预览迁移。', 'CONTENT_CONFLICT');
    } else if (!existed && await stat(path.join(dataDir, 'store.json'))) {
      fail('MIGRATION_REQUIRED', '旧档案需要显式迁移，未修改原文件。');
    }
    const next = new Map(old.map(d => [d.path, d.markdown]));
    for (const op of request.operations) {
      if (op.type === 'delete') next.delete(op.path);
      else next.set(op.path, op.markdown);
    }
    const documents = [...next].sort(([a], [b]) => a.localeCompare(b)).map(([path, markdown]) => ({ path, markdown }));
    for (const domain of new Set(documents.map(d => d.path.split('/')[0]))) {
      assert(next.has(`${domain}/index.md`), '含章节文件的模块必须保留 index.md 入口。');
    }
    const changed = profileHash(documents) !== profileHash(old);
    if (!changed && (existed || !migration)) return { changed: false, files: [] };
    await fs.mkdir(stage, { mode: 0o700 });
    for (const doc of documents) {
      await fs.mkdir(path.dirname(path.join(stage, doc.path)), { recursive: true, mode: 0o700 });
      const handle = await fs.open(path.join(stage, doc.path), 'wx', 0o600);
      try { await handle.writeFile(doc.markdown); await handle.sync(); } finally { await handle.close(); }
    }
    await readDocuments(stage);
    await beforeCommit?.();
    if (migration) assert(digestLegacy(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8')) === request.legacyHash, '旧档案在迁移期间发生变化，请重新预览。', 'CONTENT_CONFLICT');
    assert(profileHash(await readDocuments(root)) === request.baseHash, '档案在写入期间被外部编辑，请重新读取。', 'CONTENT_CONFLICT');
    if (existed) { await fs.rename(root, original); moved = true; }
    try { await fs.rename(stage, root); committed = true; }
    catch (error) { if (moved) { await fs.rename(original, root); moved = false; } throw error; }
    return { changed: true, files: request.operations.filter(op => (old.find(d => d.path === op.path)?.markdown) !== next.get(op.path)).map(op => op.path),
      ...(migration ? { legacyRetained: true } : {}) };
  } finally {
    // If restoration failed, retain the original and lock for explicit recovery.
    if (!moved || committed) await fs.rm(lock, { recursive: true, force: true });
  }
}
export async function recoverWrite(dataDir) {
  await checkDataDir(dataDir);
  const lock = path.join(dataDir, '.write-lock');
  if (!await directory(lock)) return { recovered: false };
  let owner;
  try { owner = JSON.parse(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')); }
  catch { fail('UNKNOWN_LOCK', '无法识别写入进程；请人工检查，未清除锁。'); }
  assert(owner.host === os.hostname() && Number.isSafeInteger(owner.pid) && owner.pid > 0, '写锁不属于可识别的本机进程。', 'UNKNOWN_LOCK');
  try { process.kill(owner.pid, 0); fail('WRITE_LOCKED', '写入进程仍然存在，未清除锁。'); }
  catch (error) { if (error.code !== 'ESRCH') throw error; }
  const root = path.join(dataDir, 'profile');
  const original = path.join(lock, 'original');
  if (!await directory(root) && await directory(original)) await fs.rename(original, root);
  await fs.rm(lock, { recursive: true });
  return { recovered: true };
}
