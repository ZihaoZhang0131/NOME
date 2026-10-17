'use strict';
const $ = id => document.getElementById(id);
let profile = null;
let selected = 'all';
const sourceNames = { user: '用户直接提供', 'codex-memory': 'Codex 记忆', 'claude-memory': 'Claude Code 记忆', document: '用户指定资料', inference: 'Agent 推测' };
const statusNames = { confirmed: '已确认', imported: '待核实资料', inferred: '推测 · 待核实' };
const statusLabel = record => record.status === 'imported' && record.source.type.endsWith('-memory') ? '记忆导入 · 待核实' : statusNames[record.status];
const formatDate = value => value ? new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '尚未确认';
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function recordsFor(domain) { return profile.records.filter(r => r.domain === domain); }
function renderNavigation() {
  const nav = $('navigation');
  const focused = document.activeElement?.dataset?.domain;
  nav.replaceChildren();
  for (const [index, domain] of [{ id: 'all', name: '全部概览' }, ...profile.domains].entries()) {
    const button = el('button', 'nav-button'); button.type = 'button'; button.dataset.domain = domain.id;
    button.setAttribute('aria-pressed', String(selected === domain.id));
    button.append(el('span', 'nav-index', index ? String(index).padStart(2, '0') : '◦'), el('span', '', domain.name));
    if (index) button.append(el('span', 'nav-count', domain.state === 'active' ? String(recordsFor(domain.id).length) : '—'));
    button.addEventListener('click', () => { selected = domain.id; render(); });
    nav.append(button);
    if (focused === domain.id) button.focus({ preventScroll: true });
  }
}
function renderRecord(record) {
  const item = el('li', 'record');
  item.append(el('p', 'record-content', record.content));
  if (record.status !== 'confirmed') item.append(el('p', 'record-status', statusLabel(record)));
  const details = el('details'); details.append(el('summary', '', '来源与时间'));
  const list = el('dl');
  const fields = [ ['来源', sourceNames[record.source.type] || record.source.type], ['状态', statusLabel(record)], ['最后确认', formatDate(record.confirmedAt)], ['更新于', formatDate(record.updatedAt)] ];
  if (record.source.reference) fields.splice(1, 0, ['参考', record.source.reference]);
  for (const [name, value] of fields) list.append(el('dt', '', name), el('dd', '', value));
  details.append(list); item.append(details); return item;
}
function renderDomain(domain, index) {
  const section = el('section', 'domain');
  const titleId = `domain-${domain.id}`;
  section.setAttribute('aria-labelledby', titleId);
  const records = recordsFor(domain.id);
  const drafts = profile.drafts.filter(r => r.domain === domain.id);
  const confirmed = records.some(r => r.status === 'confirmed');
  const pending = records.some(r => r.status !== 'confirmed');
  let label = confirmed ? '已有确认资料' : pending ? '待核实' : '待了解';
  let badgeClass = confirmed ? 'confirmed' : pending ? 'pending' : '';
  if (domain.state !== 'active') { label = domain.state === 'withheld' ? '暂不提供' : '不适用'; badgeClass = ''; }
  const head = el('div', 'domain-top');
  const heading = el('h3', '', domain.name); heading.id = titleId;
  head.append(el('span', 'domain-number', String(index + 1).padStart(2, '0')), heading, el('span', `badge ${badgeClass}`, label));
  section.append(head, el('p', 'domain-description', domain.description));
  if (domain.state !== 'active') {
    const empty = el('div', 'empty', domain.state === 'withheld' ? '你选择暂不提供这一方面。' : '这个领域目前不适用于你。');
    empty.append(el('small', '', '不会作为信息缺失，也不会用于生成建议。')); section.append(empty);
  } else {
    if (records.length) { const list = el('ul', 'record-list'); records.forEach(r => list.append(renderRecord(r))); section.append(list); }
    else { const empty = el('div', 'empty', '还没有正式记录'); empty.append(el('small', '', domain.prompts.join(' · '))); section.append(empty); }
    if (drafts.length) {
      section.append(el('p', 'draft-title', `${drafts.length} 条已保存草稿 · 尚未纳入正式档案`));
      drafts.forEach(r => section.append(el('p', 'draft-content', r.content)));
    }
  }
  return section;
}
function render() {
  renderNavigation();
  const active = profile.domains.filter(d => d.state === 'active');
  const known = active.filter(d => recordsFor(d.id).some(r => r.status === 'confirmed')).length;
  $('coverage').replaceChildren(document.createTextNode(`${known} `), el('small', '', `/ ${active.length}`));
  const skipped = profile.domains.length - active.length;
  $('coverage-note').textContent = skipped ? `${skipped} 个主动跳过的领域不计入；每个领域仍可继续补充。` : known ? '已有资料不代表全部了解，可以随时补充。' : '从你现在最关心的事情开始就好。';
  $('pending-count').textContent = profile.records.filter(r => r.status !== 'confirmed' && active.some(d => d.id === r.domain)).length;
  $('draft-count').textContent = profile.drafts.filter(r => active.some(d => d.id === r.domain)).length;
  $('coverage-track').replaceChildren(...profile.domains.map(d => el('span', `track-cell ${d.state !== 'active' ? 'skipped' : recordsFor(d.id).some(r => r.status === 'confirmed') ? 'confirmed' : ''}`)));
  $('section-title').textContent = selected === 'all' ? '了解你的六个方面' : profile.domains.find(d => d.id === selected).name;
  $('updated').textContent = profile.updatedAt ? `更新于 ${formatDate(profile.updatedAt)}` : '尚未保存正式变更';
  $('revision').textContent = profile.demo ? '演示模式 · 不读取个人档案' : `档案版本 ${profile.revision} · 只读视图`;
  $('demo-badge').hidden = !profile.demo;
  $('domains').replaceChildren(...profile.domains.map((d, i) => selected === 'all' || selected === d.id ? renderDomain(d, i) : null).filter(Boolean));
  $('dashboard').hidden = false;
}
async function refresh() {
  $('refresh').disabled = true; $('error').hidden = true;
  try {
    const response = await fetch('/api/profile', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '读取失败');
    profile = result; render();
  } catch (error) {
    $('dashboard').hidden = true;
    $('error').textContent = `未能读取档案：${error.message}。请检查服务后点击刷新。`;
    $('error').hidden = false;
  } finally { $('loading').hidden = true; $('refresh').disabled = false; }
}
$('refresh').addEventListener('click', refresh);
refresh();
