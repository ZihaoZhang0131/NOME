import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { readStore } from './store.mjs';
import { newStore, view, validateStore } from './model.mjs';

const assetRoot = fileURLToPath(new URL('../../assets/', import.meta.url));
const resources = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']]
]);
export async function startServer({ dataDir, demo = false, port = 43821 } = {}) {
  const assets = new Map(await Promise.all([...resources].map(async ([route, [file, type]]) => [route, { body: await fs.readFile(path.join(assetRoot, file)), type }])));
  let demoStore;
  if (demo) {
    demoStore = newStore();
    demoStore.profile = JSON.parse(await fs.readFile(path.join(assetRoot, 'demo.json'), 'utf8'));
    validateStore(demoStore);
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    const reply = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type }); res.end(typeof body === 'object' && !Buffer.isBuffer(body) ? JSON.stringify(body) : body);
    };
    const address = server.address();
    const expectedHost = `127.0.0.1:${address.port}`;
    if (req.headers.host !== expectedHost || (req.headers.origin && req.headers.origin !== `http://${expectedHost}`) || req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: '只允许从本机 NOME 页面访问。' });
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return reply(405, { error: '此页面只读。请在 Agent 对话中明确要求更新。' }); }
    if (!req.url.startsWith('/') || req.url.startsWith('//')) return reply(400, { error: '请求无效。' });
    const route = new URL(req.url, `http://${expectedHost}`).pathname;
    try {
      if (route === '/api/profile') {
        const store = demoStore || await readStore(dataDir);
        return reply(200, { ...view(store, { drafts: true }), demo, version: '0.1.0' });
      }
      if (route === '/health') return reply(200, { ok: true, mode: demo ? 'demo' : 'local' });
      const asset = assets.get(route);
      if (asset) return reply(200, asset.body, asset.type);
      return reply(404, { error: '页面不存在。' });
    } catch (e) { return reply(500, { error: e.code?.startsWith('E') ? '无法读取档案，请检查本机文件权限。' : e.message, code: e.code || 'READ_FAILED' }); }
  });
  server.requestTimeout = 10000;
  async function listen(selectedPort) {
    await new Promise((resolve, reject) => {
      const onError = error => { server.off('listening', onListen); reject(error); };
      const onListen = () => { server.off('error', onError); resolve(); };
      server.once('error', onError); server.once('listening', onListen);
      server.listen(selectedPort, '127.0.0.1');
    });
  }
  try { await listen(port); } catch (e) { if (e.code !== 'EADDRINUSE' || port === 0) throw e; await listen(0); }
  return { server, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections(); }) };
}
export async function openBrowser(url) {
  const command = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : ['xdg-open', [url]];
  return new Promise(resolve => {
    const child = spawn(command[0], command[1], { stdio: 'ignore', shell: false });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 5000);
    child.once('error', () => { clearTimeout(timer); resolve(false); });
    child.once('exit', code => { clearTimeout(timer); resolve(code === 0); });
  });
}
