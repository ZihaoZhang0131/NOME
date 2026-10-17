import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { assert, fail, VERSION } from './model.mjs';

export const SKILL_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const MARKER = '.nome-install.json';
export function targets(agent, home = os.homedir()) {
  assert(['codex', 'claude', 'both'].includes(agent), '--agent 必须为 codex、claude 或 both。');
  return (agent === 'both' ? ['codex', 'claude'] : [agent]).map(a => ({ agent: a, path: path.join(home, a === 'codex' ? '.agents' : '.claude', 'skills', 'nome') }));
}
export async function inspectTarget(target) {
  let stat;
  try { stat = await fs.lstat(target.path); } catch (e) { if (e.code === 'ENOENT') return { ...target, state: 'missing' }; throw e; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) return { ...target, state: 'unmanaged' };
  try {
    const marker = JSON.parse(await fs.readFile(path.join(target.path, MARKER), 'utf8'));
    if (marker.product === 'nome' && marker.installFormat === 1 && marker.agent === target.agent && typeof marker.version === 'string') return { ...target, state: 'installed', version: marker.version };
  } catch { /* Unreadable or unknown ownership is not permission to replace. */ }
  return { ...target, state: 'unmanaged' };
}
export async function install({ agent, home, upgrade = false, source = SKILL_ROOT }) {
  const inspected = await Promise.all(targets(agent, home).map(inspectTarget));
  for (const target of inspected) if (target.state === 'unmanaged') fail('INSTALL_CONFLICT', `${target.path} 已存在且不属于 NOME，未覆盖任何目录。`);
  const jobs = inspected.filter(t => t.state === 'missing' || upgrade).map(t => ({ ...t, stage: `${t.path}.stage-${randomUUID()}`, backup: `${t.path}.backup-${randomUUID()}`, swapped: false, backedUp: false }));
  try {
    for (const job of jobs) {
      await fs.mkdir(path.dirname(job.path), { recursive: true });
      await fs.cp(source, job.stage, { recursive: true, dereference: false, errorOnExist: true });
      await fs.writeFile(path.join(job.stage, MARKER), `${JSON.stringify({ product: 'nome', installFormat: 1, version: VERSION, agent: job.agent }, null, 2)}\n`);
      await fs.chmod(path.join(job.stage, 'scripts', 'nome.mjs'), 0o755);
    }
    for (const job of jobs) {
      if (job.state === 'installed') { await fs.rename(job.path, job.backup); job.backedUp = true; }
      await fs.rename(job.stage, job.path); job.swapped = true;
    }
  } catch (error) {
    for (const job of [...jobs].reverse()) {
      if (job.swapped) await fs.rm(job.path, { recursive: true, force: true });
      if (job.backedUp) await fs.rename(job.backup, job.path);
    }
    throw error;
  } finally { for (const job of jobs) await fs.rm(job.stage, { recursive: true, force: true }); }
  for (const job of jobs) if (job.backedUp) await fs.rm(job.backup, { recursive: true, force: true });
  return {
    version: VERSION, targets: inspected.map(t => ({ agent: t.agent, path: t.path, result: jobs.some(j => j.agent === t.agent) ? (t.state === 'missing' ? 'installed' : 'upgraded') : 'unchanged' })),
    next: '在 Codex 中输入 $nome 初始化我的档案；在 Claude Code 中输入 /nome 初始化我的档案。安装未读取或创建个人档案。'
  };
}
export async function uninstall({ agent, home }) {
  const inspected = await Promise.all(targets(agent, home).map(inspectTarget));
  for (const t of inspected) if (t.state === 'unmanaged') fail('INSTALL_CONFLICT', `${t.path} 不属于 NOME，未删除任何目录。`);
  for (const t of inspected) if (t.state === 'installed') await fs.rm(t.path, { recursive: true });
  return { targets: inspected.map(t => ({ ...t, result: t.state === 'installed' ? 'uninstalled' : 'absent' })), data: '个人档案已保留。' };
}
