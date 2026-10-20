#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { VERSION, assert, profileView } from './lib/model.mjs';
import { readProfile, resolveDataDir, applyRequest, migrationPreview, recoverWrite } from './lib/store.mjs';
import { targets, inspectTarget, install, uninstall } from './lib/install.mjs';
import { discoverSources } from './lib/sources.mjs';
import { startServer, openBrowser } from './lib/server.mjs';

const HELP = `NOME ${VERSION} · 本地个人档案

用法：node <skill目录>/scripts/nome.mjs <command> [options]
  install | upgrade | uninstall --agent codex|claude|both
  doctor                        只读检查环境与档案
  sources --agent codex|claude   查找本地记忆；--content 读取正文
          [--path FILE ...] [--memory-dir DIR]
  read [--domain DOMAIN]         读取正式 Markdown 和写入校验值
  apply --file FILE|-            保存明确授权的文档修改
  migrate [--file FILE|-]        无 file 时只预览旧档案迁移
  recover                       确认写入进程已退出后恢复中断写入
  serve [--open] [--demo] [--port 43821]
通用：--data-dir DIR（默认 NOME_DATA_DIR 或 ~/.nome）
安装/来源/检查：--home DIR（隔离安装或测试）
文档路径、写入与迁移示例见 references/protocol.md
`;
const output = value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
async function input(file) {
  assert(file, '请使用 --file FILE 或 --file -。');
  let raw;
  if (file === '-') {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; assert(size <= 8 * 1024 * 1024, '输入不得超过 8 MiB。'); chunks.push(chunk); }
    raw = Buffer.concat(chunks).toString('utf8');
  } else {
    const info = await fs.stat(file); assert(info.isFile() && info.size <= 8 * 1024 * 1024, '输入必须为不超过 8 MiB 的 JSON 文件。');
    raw = await fs.readFile(file, 'utf8');
  }
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error('输入不是有效 JSON。'), { code: 'INVALID_JSON' }); }
}
try {
  assert(Number(process.versions.node.split('.')[0]) >= 22, 'NOME 需要 Node.js 22 或更高版本。');
  const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    agent: { type: 'string' }, home: { type: 'string' }, 'data-dir': { type: 'string' }, domain: { type: 'string' },
    file: { type: 'string' }, path: { type: 'string', multiple: true }, 'memory-dir': { type: 'string' }, content: { type: 'boolean' },
    open: { type: 'boolean' }, demo: { type: 'boolean' }, port: { type: 'string' }
  } });
  const command = positionals[0];
  assert(positionals.length <= 1, '只接受一个子命令。');
  const allowed = {
    install: ['agent', 'home'], upgrade: ['agent', 'home'], uninstall: ['agent', 'home'],
    doctor: ['home'], sources: ['agent', 'home', 'path', 'memory-dir', 'content'], read: ['domain'], apply: ['file'], migrate: ['file'], recover: [], serve: ['open', 'demo', 'port']
  };
  if (flags.version) output({ version: VERSION });
  else if (flags.help || !command) process.stdout.write(HELP);
  else {
    assert(Object.hasOwn(allowed, command), `未知命令 ${command}。使用 --help 查看。`);
    for (const key of Object.keys(flags)) assert(['help', 'version', 'data-dir', ...allowed[command]].includes(key), `${command} 不支持 --${key}。`);
    const dataDir = resolveDataDir(flags['data-dir']);
    if (['install', 'upgrade'].includes(command)) output(await install({ agent: flags.agent, home: flags.home, upgrade: command === 'upgrade' }));
    else if (command === 'uninstall') output(await uninstall({ agent: flags.agent, home: flags.home }));
    else if (command === 'doctor') {
      let profile;
      try { const value = await readProfile(dataDir); profile = { ok: true, documents: value.documents.length }; }
      catch (error) { profile = { ok: false, error: error.message, code: error.code }; }
      let writeLocked = false;
      try { await fs.lstat(path.join(dataDir, '.write-lock')); writeLocked = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      output({ version: VERSION, node: process.version, dataDir, profile, writeLocked, installations: await Promise.all(targets('both', flags.home).map(inspectTarget)) });
      if (!profile.ok || writeLocked) process.exitCode = 1;
    } else if (command === 'sources') output(await discoverSources({ agent: flags.agent, home: flags.home, paths: flags.path, memoryDir: flags['memory-dir'], content: flags.content }));
    else if (command === 'read') { const p = await readProfile(dataDir); output(profileView(p.documents, flags.domain)); }
    else if (command === 'apply') output(await applyRequest(dataDir, await input(flags.file)));
    else if (command === 'migrate') output(flags.file ? await applyRequest(dataDir, await input(flags.file), { migration: true }) : await migrationPreview(dataDir));
    else if (command === 'recover') output(await recoverWrite(dataDir));
    else if (command === 'serve') {
      const port = flags.port === undefined ? 43821 : Number(flags.port);
      assert(Number.isInteger(port) && port >= 0 && port <= 65535, 'port 必须为 0–65535 的整数。');
      const running = await startServer({ dataDir, demo: flags.demo, port });
      output({ url: running.url, mode: flags.demo ? 'demo' : 'local', readOnly: true });
      if (flags.open && !await openBrowser(running.url)) process.stderr.write(`请在浏览器打开 ${running.url}\n`);
      const stop = async () => { await running.close(); process.exit(0); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
    }
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.code || 'NOME_ERROR', message: error.message })}\n`);
  process.exitCode = 1;
}
