#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { VERSION, assert, view, fail } from './lib/model.mjs';
import { readStore, resolveDataDir, applyRequest, undoRequest, forgetRequest, historyView } from './lib/store.mjs';
import { targets, inspectTarget, install, uninstall } from './lib/install.mjs';
import { discoverSources } from './lib/sources.mjs';
import { startServer, openBrowser } from './lib/server.mjs';

const HELP = `NOME ${VERSION} · 本地个人档案

用法：node <skill目录>/scripts/nome.mjs <command> [options]
安装 npm 包后也可使用 nome <command>。

  install | upgrade | uninstall  --agent codex|claude|both
  doctor                         检查环境、档案与安装状态（只读）
  sources --agent codex|claude    列出有限范围内的记忆来源
          [--path FILE ...] [--memory-dir DIR] [--content]
  read [--domain DOMAIN] [--drafts] [--include-inactive]
  history                        查看不含正文的变更记录
  apply | undo | forget --file FILE|-   提交经过用户授权的 JSON
  serve [--open] [--demo] [--port 43821]

通用：--data-dir DIR（默认 NOME_DATA_DIR 或 ~/.nome）
安装/来源/检查：--home DIR（供隔离安装或测试）
领域：context, experience, goals, values, constraints, preferences
修改协议与完整示例：references/protocol.md
`;
function output(value) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
async function input(file) {
  assert(file, '修改操作需要 --file FILE 或 --file -。');
  let raw;
  if (file === '-') {
    const chunks = []; let size = 0;
    for await (const chunk of process.stdin) { size += chunk.length; assert(size <= 1024 * 1024, '输入不得超过 1 MiB。'); chunks.push(chunk); }
    raw = Buffer.concat(chunks).toString('utf8');
  } else {
    const stat = await fs.stat(file); assert(stat.isFile() && stat.size <= 1024 * 1024, '输入必须为不超过 1 MiB 的 JSON 文件。');
    raw = await fs.readFile(file, 'utf8');
  }
  try { return JSON.parse(raw); } catch { fail('INVALID_JSON', '输入不是有效的 JSON。'); }
}
try {
  assert(Number(process.versions.node.split('.')[0]) >= 22, 'NOME 需要 Node.js 22 或更高版本。');
  const { values: flags, positionals } = parseArgs({ allowPositionals: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean' },
    agent: { type: 'string' }, home: { type: 'string' }, 'data-dir': { type: 'string' }, domain: { type: 'string' },
    drafts: { type: 'boolean' }, 'include-inactive': { type: 'boolean' }, file: { type: 'string' },
    path: { type: 'string', multiple: true }, 'memory-dir': { type: 'string' }, content: { type: 'boolean' },
    open: { type: 'boolean' }, demo: { type: 'boolean' }, port: { type: 'string' }
  } });
  const command = positionals[0];
  assert(positionals.length <= 1, '只接受一个子命令；内容请通过 --file 传入。');
  const common = ['help', 'version', 'data-dir'];
  const allowed = {
    install: ['agent', 'home'], upgrade: ['agent', 'home'], uninstall: ['agent', 'home'],
    doctor: ['home'], sources: ['agent', 'home', 'path', 'memory-dir', 'content'],
    read: ['domain', 'drafts', 'include-inactive'], history: [], apply: ['file'], undo: ['file'], forget: ['file'],
    serve: ['open', 'demo', 'port']
  };
  if (flags.version) output({ version: VERSION });
  else if (flags.help || !command) process.stdout.write(HELP);
  else {
    assert(Object.hasOwn(allowed, command), `未知命令 ${command}。使用 --help 查看。`);
    for (const key of Object.keys(flags)) assert([...common, ...allowed[command]].includes(key), `${command} 不支持 --${key}。`);
    const dataDir = resolveDataDir(flags['data-dir']);
    if (['install', 'upgrade'].includes(command)) output(await install({ agent: flags.agent, home: flags.home, upgrade: command === 'upgrade' }));
    else if (command === 'uninstall') output(await uninstall({ agent: flags.agent, home: flags.home }));
    else if (command === 'doctor') {
      let profile;
      try { const store = await readStore(dataDir); profile = { ok: true, revision: store.revision, records: store.profile.records.length, drafts: store.profile.drafts.length }; }
      catch (error) { profile = { ok: false, error: error.message }; }
      let writeLocked = false;
      try { await fs.stat(path.join(dataDir, '.write-lock')); writeLocked = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      output({ version: VERSION, node: process.version, dataDir, profile, writeLocked, installations: await Promise.all(targets('both', flags.home).map(inspectTarget)) });
      if (!profile.ok || writeLocked) process.exitCode = 1;
    } else if (command === 'sources') output(await discoverSources({ agent: flags.agent, home: flags.home, paths: flags.path, memoryDir: flags['memory-dir'], content: flags.content }));
    else if (command === 'read') output(view(await readStore(dataDir), { domain: flags.domain, drafts: flags.drafts, includeInactive: flags['include-inactive'] }));
    else if (command === 'history') output(historyView(await readStore(dataDir)));
    else if (command === 'apply') output(await applyRequest(dataDir, await input(flags.file)));
    else if (command === 'undo') output(await undoRequest(dataDir, await input(flags.file)));
    else if (command === 'forget') output(await forgetRequest(dataDir, await input(flags.file)));
    else if (command === 'serve') {
      const port = flags.port === undefined ? 43821 : Number(flags.port);
      assert(Number.isInteger(port) && port >= 0 && port <= 65535, 'port 必须为 0–65535 的整数。');
      const running = await startServer({ dataDir, demo: flags.demo, port });
      output({ url: running.url, mode: flags.demo ? 'demo' : 'local', readOnly: true });
      if (flags.open && !await openBrowser(running.url)) process.stderr.write(`浏览器未自动打开，请访问 ${running.url}\n`);
      const stop = async () => { await running.close(); process.exit(0); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
    }
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error.code || 'NOME_ERROR', message: error.message })}\n`);
  process.exitCode = 1;
}
