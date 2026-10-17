import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
export const exec = promisify(execFile);
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CLI = path.join(ROOT, 'skills/nome/scripts/nome.mjs');
export async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nome-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
export const record = (overrides = {}) => ({ id: 'learning-time', domain: 'constraints', content: '每周可以学习 4 小时。', source: { type: 'user' }, status: 'confirmed', ...overrides });
export function request(revision = 0, records = [record()], { intent = 'update', confirmed = true, target } = {}) {
  return { baseRevision: revision, authorization: { userRequested: true, intent, confirmed }, operations: records.map(r => ({ type: 'upsert', ...(target ? { target } : {}), record: r })) };
}
export const maintenance = (revision, intent, ids) => ({ baseRevision: revision, authorization: { userRequested: true, intent }, ...(ids ? { ids } : {}) });
export async function cli(args, options = {}) {
  return exec(process.execPath, [CLI, ...args], { cwd: ROOT, ...options });
}
