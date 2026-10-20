import { profileView } from './profile-view.js';
import { renderMarkdown, resolveDocumentLink } from './markdown.js';
import { orbits, orbitPath, satellitePosition } from './orbit.js';
import { paintSphere } from './planet-material.js';
import { cameraPose, cameraTransform } from './camera.js';

const $ = id => document.getElementById(id);
const svgNS = 'http://www.w3.org/2000/svg';
const domainLabels = { identity: 'Identity', motivation: 'Values', traits: 'Traits',
  capabilities: 'Skills', relationships: 'Bonds', growth: 'Growth' };
let profile;
let summary;
let selected = 'all';
let selectedRoute = 'all';
let selectedPath = null;
let selectedAnchor = '';
function routeParts(route) {
  const [file, anchor = ''] = route.split('~');
  const domain = file.split('/')[0];
  return { domain, path: file.includes('/') ? file : null, anchor: decodeAnchor(anchor) };
}
function decodeAnchor(value) { try { return decodeURIComponent(value); } catch { return ''; } }
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
let motionPaused = false;
let atlasVisible = true;
let pointerFrame = 0;
let cameraAnimation;
let pendingDomain = null;
let navigationVersion = 0;
let satelliteNodes = [];
let satelliteHovered = false;
let satelliteFocused = false;
let orbitFrame = 0;
let orbitElapsed = 0;
let orbitLastTime = 0;
let orbitScale = 1;
let returnFocusDomain = null;
let sphereMaterials = [];

function addSphere(surface, texture, options) {
  paintSphere(surface, texture, options).then(material => {
    if (!material) return;
    if (!surface.isConnected) { material.dispose(); return; }
    sphereMaterials.push(material);
    material.render(orbitElapsed);
  });
}

function placeSatellites() {
  const points = satelliteNodes.map((_, index) => satellitePosition(index, orbitElapsed));
  satelliteNodes.forEach((node, index) => {
    const point = points[index];
    node.style.transform = `translate3d(${point.x * orbitScale}px, ${point.y * orbitScale}px, 0)`;
    node.style.zIndex = String(500 + Math.round(point.z));
    node.style.setProperty('--body-size', `${orbits[index].diameter * orbitScale}px`);
  });
}
function orbitTick(now) {
  orbitElapsed += orbitLastTime ? Math.min(now - orbitLastTime, 64) : 0;
  orbitLastTime = now;
  placeSatellites();
  sphereMaterials.forEach(material => material.render(orbitElapsed));
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
  const toggle = $('atlas').querySelector('.motion-toggle');
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
function renderAtlas() {
  sphereMaterials.forEach(material => material.dispose());
  sphereMaterials = [];
  // Equal planet sizes; materials express identity, never profile scores.
  const svg = svgEl('svg', { viewBox: '0 80 600 400', 'aria-hidden': 'true', class: 'atlas-art' });
  const foreground = svgEl('svg', { viewBox: '0 80 600 400', 'aria-hidden': 'true', class: 'atlas-art orbit-foreground' });
  svg.append(svgEl('path', { d: orbitPath(0, false), class: 'satellite-orbit orbit-back' }));
  foreground.append(svgEl('path', { d: orbitPath(0, true), class: 'satellite-orbit' }));
  const nodes = [];
  summary.domains.forEach((domain, index) => {
    const button = el('button', `atlas-label atlas-label-${index}`);
    button.type = 'button'; button.dataset.domain = domain.id;
    button.setAttribute('aria-pressed', String(selected === domain.id));
    button.setAttribute('aria-label', `探索${domain.name} · ${domainLabels[domain.id]}`);
    button.setAttribute('aria-controls', 'detail');
    button.title = `${domainLabels[domain.id]} · ${domain.name} · ${orbits[index].name}`;
    const orb = el('span', 'node-orb');
    const surface = el('canvas', 'planet-surface'); surface.setAttribute('aria-hidden', 'true');
    orb.append(surface);
    addSphere(surface, orbits[index].texture, { clouds: index === 2, period: 180000 + index * 12000 });
    // The name belongs to the body and shares its hover, depth and motion.
    const name = el('span', 'planet-name', domainLabels[domain.id]);
    name.lang = 'en'; name.setAttribute('aria-hidden', 'true'); orb.append(name);
    button.append(orb);
    button.addEventListener('pointerenter', event => { satelliteHovered = event.pointerType === 'mouse'; highlightDomain(domain.id); syncMotion(); });
    button.addEventListener('pointerleave', () => { satelliteHovered = false; highlightDomain(selected); syncMotion(); });
    button.addEventListener('focus', () => { satelliteFocused = button.matches(':focus-visible'); highlightDomain(domain.id); syncMotion(); });
    button.addEventListener('blur', () => { satelliteFocused = false; highlightDomain(selected); syncMotion(); });
    button.addEventListener('click', () => navigate(domain.id, button));
    const position = el('div', 'satellite-position'); position.append(button); nodes.push(position);
  });
  const toggle = el('button', 'motion-toggle'); toggle.type = 'button';
  const motionIcon = svgEl('svg', { viewBox: '0 0 24 24', class: 'motion-icon', 'aria-hidden': 'true' });
  motionIcon.append(svgEl('path', { d: 'M9 7v10M15 7v10', class: 'pause-mark' }), svgEl('path', { d: 'm9 6 9 6-9 6Z', class: 'play-mark' }));
  toggle.append(motionIcon);
  toggle.addEventListener('click', () => { motionPaused = !motionPaused; syncMotion(); });
  const depth = el('div', 'atlas-depth'); depth.append(svg, foreground, ...nodes);
  const camera = el('div', 'atlas-camera'); camera.append(depth);
  $('atlas').replaceChildren(camera, toggle);
  satelliteNodes = nodes;
  satelliteHovered = false; satelliteFocused = false;
  orbitScale = $('atlas').clientWidth / 600;
  placeSatellites();
  syncMotion();
  highlightDomain(selected);
}
function highlightDomain(id) {
  const domain = summary.domains.find(item => item.id === id);
  $('atlas').classList.toggle('is-focused', Boolean(domain));
  $('atlas').querySelectorAll('.atlas-label').forEach(node => node.classList.toggle('is-highlighted', node.dataset.domain === id));
}
function navigate(route) {
  const parts = routeParts(route);
  const target = summary.domains.some(domain => domain.id === parts.domain) ? route : 'all';
  if (selectedRoute === target) return;
  history[pendingDomain !== null ? 'replaceState' : 'pushState']({ nome: true }, '', target === 'all' ? location.pathname + location.search : `#${target}`);
  return transitionDomain(target, { focus: true });
}
function showDomain(id, focus = false) {
  return transitionDomain(id, { focus, animate: false, force: true });
}
async function transitionDomain(id, { focus = false, animate = true, force = false } = {}) {
  const parts = routeParts(id);
  const domain = summary.domains.find(item => item.id === parts.domain);
  const target = domain ? domain.id : 'all';
  if (!force && selectedRoute === id) return;
  const previousDomain = selected;
  const from = cancelCamera();
  const version = navigationVersion;
  const camera = $('atlas').querySelector('.atlas-camera');
  selected = target;
  selectedRoute = domain ? id : 'all';
  selectedPath = parts.path;
  selectedAnchor = parts.anchor;
  pendingDomain = target;
  if (domain) returnFocusDomain = domain.id;
  $('dashboard').classList.toggle('is-exploring', Boolean(domain));
  $('atlas').classList.toggle('is-close', Boolean(domain));
  // The magnified body is decorative; navigation remains in the reading pane.
  $('atlas').inert = Boolean(domain);
  $('atlas').setAttribute('aria-hidden', String(Boolean(domain)));
  satelliteNodes.forEach(node => node.classList.toggle('is-selected', node.querySelector('button').dataset.domain === (domain ? domain.id : returnFocusDomain)));
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
  const canFly = animate && previousDomain !== target && !reducedMotion.matches && !motionPaused && !document.hidden && typeof camera.animate === 'function';
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
  } else {
    if (focus) $('detail-title').focus({ preventScroll: true });
    if (selectedAnchor) document.getElementById(`section-${selectedAnchor}`)?.scrollIntoView({ block: 'start' });
  }
  $('announcement').textContent = domain ? `正在探索${domain.name}` : '已返回个人星图';
  syncMotion();
}
function renderDetail(domain) {
  $('detail-title').textContent = domain.name;
  const content = $('detail-documents'); content.replaceChildren();
  const chapters = $('chapter-nav'); chapters.replaceChildren();
  chapters.hidden = domain.documents.length <= 1;
  const doc = domain.documents.find(item => item.path === selectedPath) || domain.documents[0];
  for (const chapter of domain.documents) {
    const button = el('button', 'chapter-tab', chapter.title);
    button.type = 'button';
    if (chapter === doc) button.setAttribute('aria-current', 'page');
    button.addEventListener('click', () => navigate(chapter.path)); chapters.append(button);
  }
  if (!doc || !doc.markdown.trim()) { content.append(el('p', 'detail-empty', '这里还没有内容。')); return; }
  const article = el('article', 'markdown-body');
  const rendered = renderMarkdown(doc.markdown, { skipTitle: domain.name, hrefFor: href => {
    const target = resolveDocumentLink(href, doc.path);
    return target && summary.domains.some(d => d.documents.some(item => item.path === target.path))
      ? `#${target.path}${target.anchor ? `~${encodeURIComponent(target.anchor)}` : ''}` : href;
  }, onLink: (href, event) => {
    const target = resolveDocumentLink(href, doc.path);
    if (target && summary.domains.some(d => d.documents.some(item => item.path === target.path))) {
      event.preventDefault();
      navigate(`${target.path}${target.anchor ? `~${encodeURIComponent(target.anchor)}` : ''}`);
    } else if (!/^(https?:|mailto:)/i.test(href)) event.preventDefault();
  } });
  if (rendered.headings.length >= 4 && doc.markdown.length >= 1200) {
    const toc = el('nav', 'section-nav'); toc.setAttribute('aria-label', '本文目录');
    for (const heading of rendered.headings) {
      const a = el('a', '', heading.text); a.href = `#${doc.path}~${encodeURIComponent(heading.slug)}`;
      a.addEventListener('click', event => { event.preventDefault(); navigate(`${doc.path}~${encodeURIComponent(heading.slug)}`); }); toc.append(a);
    }
    content.append(toc);
  }
  article.append(rendered.fragment); content.append(article);
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
  if (summary) showDomain(selectedRoute);
  syncMotion();
}
reducedMotion.addEventListener('change', settleMotion);
finePointer.addEventListener('change', syncMotion);
document.addEventListener('visibilitychange', settleMotion);
window.addEventListener('resize', settleMotion);
new ResizeObserver(() => {
  orbitScale = $('atlas').clientWidth / 600; placeSatellites();
  if (summary && (selected !== 'all' || pendingDomain !== null)) showDomain(selectedRoute);
}).observe($('atlas'));
new IntersectionObserver(([entry]) => { atlasVisible = entry.isIntersecting; syncMotion(); }).observe($('atlas'));
refresh();
