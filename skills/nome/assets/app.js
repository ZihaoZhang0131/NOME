import { profileView } from './profile-view.js';
import { orbits, orbitPath, satellitePosition } from './orbit.js';
import { paintSphere } from './planet-material.js';
import { cameraPose, cameraTransform } from './camera.js';

const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const sourceNames = { user: '你提供的内容', 'codex-memory': 'Codex 记忆', 'claude-memory': 'Claude Code 记忆', document: '指定资料', inference: 'Agent 推测' };
const statusNames = { confirmed: '已确认', imported: '导入资料 · 待核实', inferred: '推测 · 待核实' };
// Original names are provenance only; all current classification comes from the six API domains.
const legacyNames = { context: '当前处境', experience: '经历与能力', goals: '目标与方向', values: '价值取舍', constraints: '现实约束', preferences: '协作偏好' };
let profile;
let summary;
let selected = 'all';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let motionPaused = false;
let atlasVisible = true;
let pointerFrame = 0;
let cameraAnimation;
let pendingDomain = null;
let navigationVersion = 0;
let satelliteNodes = [];
let satelliteCaptions = [];
let satelliteHovered = false;
let satelliteFocused = false;
let orbitFrame = 0;
let orbitElapsed = 0;
let orbitLastTime = 0;
let orbitScale = 1;
let returnFocusDomain = null;

function placeSatellites() {
  satelliteNodes.forEach((node, index) => {
    const point = satellitePosition(index, orbitElapsed);
    node.style.transform = `translate3d(${point.x * orbitScale}px, ${point.y * orbitScale}px, 0)`;
    node.style.zIndex = String(500 + Math.round(point.z));
    node.style.setProperty('--body-size', `${orbits[index].diameter * orbitScale}px`);
    node.style.setProperty('--light-angle', `${Math.atan2(point.y, point.x) * 180 / Math.PI + 270}deg`);
    const caption = satelliteCaptions[index];
    caption.style.transform = node.style.transform;
    caption.style.setProperty('--body-size', `${orbits[index].diameter * orbitScale}px`);
    caption.classList.toggle('is-above', point.y < 0);
  });
}
function orbitTick(now) {
  orbitElapsed += orbitLastTime ? Math.min(now - orbitLastTime, 64) : 0;
  orbitLastTime = now;
  placeSatellites();
  orbitFrame = requestAnimationFrame(orbitTick);
}
function setOrbitRunning(running) {
  if (running && !orbitFrame && satelliteNodes.length) orbitFrame = requestAnimationFrame(orbitTick);
  if (!running) { cancelAnimationFrame(orbitFrame); orbitFrame = 0; orbitLastTime = 0; }
}

function syncMotion() {
  const stopped = reducedMotion.matches || motionPaused || document.hidden || !atlasVisible || selected !== 'all' || pendingDomain !== null;
  const orbitStopped = stopped || satelliteHovered || satelliteFocused;
  $('atlas').classList.toggle('motion-stopped', orbitStopped);
  setOrbitRunning(!orbitStopped);
  $('atlas').classList.toggle('motion-muted', reducedMotion.matches || motionPaused);
  const toggle = $('atlas').querySelector('.atlas-center');
  if (toggle) {
    toggle.disabled = reducedMotion.matches || selected !== 'all';
    toggle.setAttribute('aria-pressed', String(motionPaused));
    toggle.setAttribute('aria-label', reducedMotion.matches ? '已遵循系统设置，动态效果已关闭' : selected !== 'all' ? '领域星图' : motionPaused ? '继续星图动态' : '暂停星图动态');
    toggle.title = toggle.getAttribute('aria-label');
  }
  if (stopped || !finePointer.matches) resetParallax();
}
function resetParallax() {
  cancelAnimationFrame(pointerFrame);
  pointerFrame = 0;
  $('atlas').style.setProperty('--pointer-x', '0');
  $('atlas').style.setProperty('--pointer-y', '0');
}
function cancelCamera() {
  navigationVersion++;
  const camera = $('atlas').querySelector('.atlas-camera');
  // Commit the visible frame before cancelling so rapid reversal never jumps.
  const current = camera ? getComputedStyle(camera).transform : 'none';
  if (camera) camera.style.transform = current;
  cameraAnimation?.cancel();
  cameraAnimation = undefined;
  pendingDomain = null;
  $('atlas').classList.remove('is-travelling');
  camera?.style.removeProperty('will-change');
  return current;
}
function focusedCamera(id) {
  const index = summary.domains.findIndex(domain => domain.id === id);
  if (index < 0) return 'translate3d(0px, 0px, 0) scale(1)';
  const frame = $('atlas').getBoundingClientRect();
  return cameraTransform(cameraPose({ viewportWidth: innerWidth, viewportHeight: innerHeight,
    left: frame.left, top: frame.top, width: frame.width, height: frame.height,
    point: satellitePosition(index, orbitElapsed), diameter: orbits[index].diameter }));
}


function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgEl(tag, attributes = {}) {
  const node = document.createElementNS(svgNS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}
function date(value, time = false) {
  if (!value) return '尚未确认';
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) });
}
function status(record) {
  return record.status === 'imported' && record.source.type.endsWith('-memory') ? '旧记忆 · 待核实' : statusNames[record.status];
}
function domainNote(domain) {
  if (domain.state === 'withheld') return '由你选择，暂不提供';
  if (domain.state === 'not_applicable') return '当前不适用';
  return [domain.confirmed.length && `${domain.confirmed.length} 条已确认`, domain.pending.length && `${domain.pending.length} 条待核实`, domain.drafts.length && `${domain.drafts.length} 条草稿`].filter(Boolean).join(' · ') || '还没有记录';
}

function renderAtlas() {
  // Equal planet sizes; materials express identity, never profile scores.
  const svg = svgEl('svg', { viewBox: '0 0 600 560', 'aria-hidden': 'true', class: 'atlas-art' });
  const defs = svgEl('defs');
  const glow = svgEl('radialGradient', { id: 'core-light' });
  [['0%', '#ffb961', '.22'], ['45%', '#e87b29', '.07'], ['100%', '#e87b29', '0']].forEach(([offset, color, opacity]) => glow.append(svgEl('stop', { offset, 'stop-color': color, 'stop-opacity': opacity })));
  defs.append(glow); svg.append(defs);
  const stars = svgEl('g', { class: 'atlas-stars' });
  for (let i = 0; i < 96; i++) {
    stars.append(svgEl('circle', { cx: 32 + ((i * 137) % 536), cy: 28 + ((i * 97) % 504), r: i % 9 === 0 ? 1.3 : .6, opacity: .12 + (i % 4) * .12 }));
  }
  svg.append(stars, svgEl('circle', { cx: 300, cy: 280, r: 180, fill: 'url(#core-light)' }));
  const foreground = svgEl('svg', { viewBox: '0 0 600 560', 'aria-hidden': 'true', class: 'atlas-art orbit-foreground' });
  svg.append(svgEl('path', { d: orbitPath(0, false), class: 'satellite-orbit orbit-back' }));
  foreground.append(svgEl('path', { d: orbitPath(0, true), class: 'satellite-orbit' }));
  const nodes = [];
  const captions = [];
  summary.domains.forEach((domain, index) => {
    const button = el('button', `atlas-label atlas-label-${index} state-${domain.state}`);
    button.type = 'button'; button.dataset.domain = domain.id;
    button.setAttribute('aria-pressed', String(selected === domain.id));
    button.setAttribute('aria-label', `探索${domain.name}，${domainNote(domain)}`);
    button.setAttribute('aria-controls', 'detail');
    button.title = `${domain.name} · ${orbits[index].name}`;
    const orb = el('span', 'node-orb');
    const surface = el('canvas', 'planet-surface'); surface.setAttribute('aria-hidden', 'true');
    orb.append(surface);
    paintSphere(surface, orbits[index].texture, { clouds: index === 2 });
    button.append(orb);
    // Labels remain readable above the sun while bodies retain their original depth order.
    const caption = el('div', 'satellite-caption'); caption.dataset.domain = domain.id;
    caption.setAttribute('aria-hidden', 'true'); caption.append(el('span', 'atlas-name', domain.name));
    captions.push(caption);
    button.addEventListener('pointerenter', event => { satelliteHovered = event.pointerType === 'mouse'; highlightDomain(domain.id); syncMotion(); });
    button.addEventListener('pointerleave', () => { satelliteHovered = false; highlightDomain(selected); syncMotion(); });
    button.addEventListener('focus', () => { satelliteFocused = button.matches(':focus-visible'); highlightDomain(domain.id); syncMotion(); });
    button.addEventListener('blur', () => { satelliteFocused = false; highlightDomain(selected); syncMotion(); });
    button.addEventListener('click', () => navigate(domain.id, button));
    const position = el('div', 'satellite-position'); position.append(button); nodes.push(position);
  });
  const center = el('button', 'atlas-center'); center.type = 'button';
  const motionIcon = svgEl('svg', { viewBox: '0 0 24 24', class: 'motion-icon', 'aria-hidden': 'true' });
  motionIcon.append(svgEl('path', { d: 'M9 7v10M15 7v10', class: 'pause-mark' }), svgEl('path', { d: 'm9 6 9 6-9 6Z', class: 'play-mark' }));
  const surface = el('canvas', 'sun-surface'); surface.setAttribute('aria-hidden', 'true');
  paintSphere(surface, 'sun', { sun: true });
  center.append(surface, el('span', 'atlas-center-name', 'nome.'), motionIcon);
  center.addEventListener('click', () => { motionPaused = !motionPaused; syncMotion(); });
  const depth = el('div', 'atlas-depth'); depth.append(svg, foreground, center, ...nodes, ...captions);
  const camera = el('div', 'atlas-camera'); camera.append(depth);
  $('atlas').replaceChildren(camera);
  satelliteNodes = nodes;
  satelliteCaptions = captions;
  satelliteHovered = false; satelliteFocused = false;
  orbitScale = $('atlas').clientWidth / 600;
  placeSatellites();
  syncMotion();
  highlightDomain(selected);
}
function highlightDomain(id) {
  const domain = summary.domains.find(item => item.id === id);
  $('atlas').classList.toggle('is-focused', Boolean(domain));
  $('atlas').querySelectorAll('.atlas-label, .satellite-caption').forEach(node => node.classList.toggle('is-highlighted', node.dataset.domain === id));
  $('atlas').querySelector('.atlas-center-name').textContent = domain ? domain.name : 'nome.';
}
function navigate(id) {
  const target = summary.domains.some(domain => domain.id === id) ? id : 'all';
  if (selected === target) return;
  history[pendingDomain !== null ? 'replaceState' : 'pushState']({ nome: true }, '', target === 'all' ? location.pathname + location.search : `#${target}`);
  return transitionDomain(target, { focus: true });
}
function showDomain(id, focus = false) {
  return transitionDomain(id, { focus, animate: false, force: true });
}
async function transitionDomain(id, { focus = false, animate = true, force = false } = {}) {
  const domain = summary.domains.find(item => item.id === id);
  const target = domain ? id : 'all';
  if (!force && selected === target) return;
  const from = cancelCamera();
  const version = navigationVersion;
  const camera = $('atlas').querySelector('.atlas-camera');
  selected = target;
  pendingDomain = target;
  if (domain) returnFocusDomain = id;
  $('dashboard').classList.toggle('is-exploring', Boolean(domain));
  $('atlas').classList.toggle('is-close', Boolean(domain));
  // The magnified body is decorative; navigation remains in the reading pane.
  $('atlas').inert = Boolean(domain);
  $('atlas').setAttribute('aria-hidden', String(Boolean(domain)));
  satelliteNodes.forEach(node => node.classList.toggle('is-selected', node.querySelector('button').dataset.domain === (domain ? id : returnFocusDomain)));
  $('atlas').querySelectorAll('.atlas-label').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.domain === selected)));
  $('domain-nav').querySelectorAll('button').forEach(button => {
    if (button.dataset.domain === selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (domain) {
    renderDetail(domain);
    $('detail').hidden = false;
    $('detail').scrollTop = 0;
  }
  $('detail').inert = !domain;
  $('detail').setAttribute('aria-hidden', String(!domain));
  highlightDomain(selected);
  syncMotion();
  const to = focusedCamera(selected);
  camera.style.transform = to;
  const canFly = animate && !reducedMotion.matches && !motionPaused && !document.hidden && typeof camera.animate === 'function';
  if (canFly) {
    $('atlas').classList.add('is-travelling');
    camera.style.willChange = 'transform';
    try {
      cameraAnimation = camera.animate([{ transform: from === 'none' ? 'translate3d(0px, 0px, 0) scale(1)' : from }, { transform: to }],
        { duration: domain ? 950 : 750, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      await cameraAnimation.finished;
    } catch { /* Resize, history and Escape can reverse or settle this flight. */ }
  }
  if (version !== navigationVersion) return;
  cameraAnimation = undefined;
  pendingDomain = null;
  camera.style.removeProperty('will-change');
  $('atlas').classList.remove('is-travelling');
  if (!domain) {
    $('detail').hidden = true;
    satelliteHovered = false; satelliteFocused = false;
    if (focus) $('atlas').querySelector(`[data-domain="${returnFocusDomain}"]`)?.focus({ preventScroll: true });
  } else if (focus) $('detail-title').focus({ preventScroll: true });
  $('announcement').textContent = domain ? `正在探索${domain.name}` : '已返回个人星图';
  syncMotion();
}
function renderRecord(record, draft = false, unclassified = false) {
  const article = el('article', `record ${draft ? 'draft-record' : ''}`);
  article.append(el('p', `record-status status-${record.status}`, unclassified ? `待分类 · ${draft ? '草稿' : status(record)}` : draft ? '草稿 · 尚未纳入正式档案' : status(record)), el('p', 'record-content', record.content));
  const details = el('details', 'record-meta');
  details.append(el('summary', '', '来源与时间'));
  const list = el('dl');
  const fields = [['来源', sourceNames[record.source.type] || record.source.type], ['确认时间', date(record.confirmedAt, true)], ['更新于', date(record.updatedAt, true)]];
  if (record.legacyDomain) fields.push(['原分类', legacyNames[record.legacyDomain] || record.legacyDomain]);
  if (record.source.reference) fields.splice(1, 0, ['参考', record.source.reference]);
  fields.forEach(([name, value]) => list.append(el('dt', '', name), el('dd', '', value)));
  details.append(list); article.append(details);
  return article;
}
function renderDetail(domain) {
  $('detail-title').textContent = domain.name;
  $('detail-definition').textContent = domain.description;
  $('detail-description').textContent = domainNote(domain);
  const content = $('detail-records'); content.replaceChildren();
  if (domain.state === 'withheld' || domain.state === 'not_applicable') {
    content.append(el('p', 'detail-empty', domain.state === 'withheld' ? '你选择暂不提供这一方面。' : '这个领域目前不适用于你。'), el('p', 'muted', '不会作为信息缺失，也不会用于生成建议。'));
  } else {
    domain.records.forEach(record => content.append(renderRecord(record)));
    domain.drafts.forEach(record => content.append(renderRecord(record, true)));
    if (!domain.records.length && !domain.drafts.length) content.append(el('p', 'detail-empty', '这一方面还没有记录。'), el('p', 'muted', domain.prompts.join(' · ')), el('p', 'detail-prompt', '在 Agent 对话中，说「进入 NOME 问答模式」。'));
  }
  if (domain.state !== 'withheld' && domain.state !== 'not_applicable') content.append(el('p', 'detail-prompt', `在 Agent 对话中，说「补充我的${domain.name}」。`));
  const pending = profile.unclassified || { records: [], drafts: [] };
  const count = pending.records.length + pending.drafts.length;
  if (count) {
    const section = el('details', 'unclassified-records');
    section.append(el('summary', '', `待分类的旧资料（${count}）`), el('p', 'muted', '原文、来源与时间均保留；这些资料尚不属于任何新分类，不用于日常建议。在 Agent 对话中确认归属后再整理。'));
    pending.records.forEach(record => section.append(renderRecord(record, false, true)));
    pending.drafts.forEach(record => section.append(renderRecord(record, true, true)));
    content.append(section);
  }
}
function render() {
  cancelCamera();
  summary = profileView(profile);
  $('demo-note').hidden = !profile.demo;
  renderAtlas();
  $('domain-nav').replaceChildren(...summary.domains.map(domain => {
    const button = el('button', 'domain-tab', domain.name);
    button.type = 'button'; button.dataset.domain = domain.id;
    button.addEventListener('click', () => navigate(domain.id));
    return button;
  }));
  $('dashboard').hidden = false;
  showDomain(location.hash.slice(1));
}
async function refresh() {
  $('error').hidden = true; $('announcement').textContent = '';
  try {
    const response = await fetch('/api/profile', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '读取失败');
    profile = result; render();
  } catch (error) {
    $('dashboard').hidden = true;
    $('error-message').textContent = error.name === 'TypeError' && /fetch|network|load/i.test(error.message) ? '本机服务暂时没有响应。' : error.message;
    $('error').hidden = false;
  } finally { $('loading').hidden = true; }
}
$('back-to-atlas').addEventListener('click', () => navigate('all'));
$('retry').addEventListener('click', refresh);
window.addEventListener('popstate', () => { if (summary) transitionDomain(location.hash.slice(1), { focus: true }); });
window.addEventListener('hashchange', () => { if (summary) transitionDomain(location.hash.slice(1), { focus: true }); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && (selected !== 'all' || pendingDomain !== null)) navigate('all'); });
$('atlas').addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || !finePointer.matches || reducedMotion.matches || motionPaused || selected !== 'all' || pendingDomain !== null) return;
  cancelAnimationFrame(pointerFrame);
  pointerFrame = requestAnimationFrame(() => {
    const box = $('atlas').getBoundingClientRect();
    const clamp = n => Math.max(-1, Math.min(1, n));
    $('atlas').style.setProperty('--pointer-x', clamp((event.clientX - box.left) / box.width * 2 - 1).toFixed(3));
    $('atlas').style.setProperty('--pointer-y', clamp((event.clientY - box.top) / box.height * 2 - 1).toFixed(3));
    pointerFrame = 0;
  });
});
$('atlas').addEventListener('pointerleave', resetParallax);
function settleMotion() {
  if (summary) showDomain(selected);
  syncMotion();
}
reducedMotion.addEventListener('change', settleMotion);
finePointer.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', settleMotion);
window.addEventListener('resize', settleMotion);
new ResizeObserver(() => {
  orbitScale = $('atlas').clientWidth / 600; placeSatellites();
  if (summary && (selected !== 'all' || pendingDomain !== null)) showDomain(selected);
}).observe($('atlas'));
new IntersectionObserver(([entry]) => { atlasVisible = entry.isIntersecting; syncMotion(); }).observe($('atlas'));
refresh();
