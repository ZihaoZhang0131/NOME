import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { profileHash } from '../skills/nome/scripts/lib/model.mjs';
export const exec = promisify(execFile);
export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const CLI = path.join(ROOT, 'skills/nome/scripts/nome.mjs');
export async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nome-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); return root;
}
export const write = (path = 'identity/index.md', markdown = '# 身份与处境\n\n每周可以学习四小时。\n') => ({ type: 'write', path, markdown });
export const request = (baseHash = profileHash([]), operations = [write()], intent = 'update') => ({ baseHash, authorization: { userRequested: true, intent }, operations });
export async function cli(args, options = {}) { return exec(process.execPath, [CLI, ...args], { cwd: ROOT, ...options }); }
