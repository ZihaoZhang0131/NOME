// A small, offline Markdown reader. Raw HTML is always text; URLs are explicitly
// allowed and images are rendered as alt text, so a profile cannot load trackers.
export function safeUrl(value) {
  const url = value.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(url) || url.startsWith('//')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return /^(https?:|mailto:)/i.test(url) ? url : null;
  return url;
}
export function resolveDocumentLink(href, currentPath) {
  if (!safeUrl(href) || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href)) return null;
  const [file, anchor = ''] = href.split('#');
  if (!file) return { path: currentPath, anchor };
  const parts = [...currentPath.split('/').slice(0, -1)];
  for (const part of file.split('/')) {
    if (part === '..') { if (!parts.length) return null; parts.pop(); }
    else if (part && part !== '.') parts.push(part);
  }
  const target = parts.join('/');
  return /^[a-z]+\/[a-z0-9][a-z0-9_-]*\.md$/.test(target) ? { path: target, anchor } : null;
}
export const headingSlug = value => value.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').trim().replace(/\s+/g, '-');
export function documentTitle(doc) { return /^#\s+(.+)$/m.exec(doc.markdown)?.[1] || doc.path.split('/').at(-1).replace(/\.md$/, ''); }
export function inlineTokens(text, depth = 0) {
  if (depth > 8) return [{ type: 'text', text }];
  const tokens = [];
  const pattern = /`([^`\n]+)`|\[([^\]\n]+)\]\(([^)\n]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|~~([^~\n]+)~~/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (m.index > last) tokens.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) tokens.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: 'link', text: m[2], href: safeUrl(m[3]) });
    else tokens.push({ type: m[4] ? 'strong' : m[5] ? 'em' : 'del', children: inlineTokens(m[4] || m[5] || m[6], depth + 1) });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', text: text.slice(last) });
  return tokens;
}
const cells = line => line.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(s => s.trim().replace(/\\\|/g, '|'));
const tableDivider = line => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
const listItem = line => /^(\s*)([-+*]|\d+\.)\s+(.+)$/.exec(line);
const blockStart = line => /^(?:#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*_])\1{2,}\s*$)/.test(line) || Boolean(listItem(line));
export function parseMarkdown(value, depth = 0) {
  if (depth > 16) return [{ type: 'paragraph', text: value }];
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  const slugs = new Map();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      const body = []; i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      blocks.push({ type: 'codeblock', text: body.join('\n') }); continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const text = heading[2]; const base = headingSlug(text); const count = slugs.get(base) || 0; slugs.set(base, count + 1);
      blocks.push({ type: 'heading', level: heading[1].length, text, id: `${base}${count ? `-${count}` : ''}` }); i++; continue;
    }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }
    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*> ?/, ''));
      blocks.push({ type: 'quote', blocks: parseMarkdown(body.join('\n'), depth + 1) }); continue;
    }
    if (i + 1 < lines.length && line.includes('|') && tableDivider(lines[i + 1])) {
      const header = cells(line); const rows = []; i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]));
      blocks.push({ type: 'table', header, rows }); continue;
    }
    const first = listItem(line);
    if (first) {
      const ordered = /^\d/.test(first[2]); const indent = first[1].length; const items = [];
      const start = ordered ? Number.parseInt(first[2], 10) : 1;
      while (i < lines.length) {
        const item = listItem(lines[i]);
        if (!item || item[1].length !== indent || /^\d/.test(item[2]) !== ordered) break;
        const body = [item[3]]; i++;
        while (i < lines.length && lines[i].trim() && /^\s+/.test(lines[i]) && (listItem(lines[i])?.[1].length ?? Infinity) > indent) {
          body.push(lines[i++].slice(Math.min(indent + 2, lines[i - 1].match(/^\s*/)[0].length)));
        }
        items.push(parseMarkdown(body.join('\n'), depth + 1));
        if (!lines[i]?.trim() && listItem(lines[i + 1] || '')?.[1].length === indent) i++;
      }
      blocks.push({ type: 'list', ordered, start, items }); continue;
    }
    const body = [line]; i++;
    while (i < lines.length && lines[i].trim() && !blockStart(lines[i]) && !(lines[i].includes('|') && tableDivider(lines[i + 1] || ''))) body.push(lines[i++]);
    blocks.push({ type: 'paragraph', text: body.join('\n') });
  }
  return blocks;
}
export function renderMarkdown(value, { onLink, hrefFor, skipTitle } = {}) {
  const headings = [];
  const blocks = parseMarkdown(value);
  const levels = blocks.filter(b => b.type === 'heading' && !(b.level === 1 && b.text === skipTitle)).map(b => b.level);
  const headingOffset = 3 - (levels.length ? Math.min(...levels) : 1);
  const node = (tag, text) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
  function inline(parent, text) {
    function append(tokens, target) {
      for (const token of tokens) {
        if (token.type === 'text') target.append(document.createTextNode(token.text));
        else if (token.type === 'link') {
          if (!token.href) { target.append(document.createTextNode(token.text)); continue; }
          const a = node('a', token.text); a.href = hrefFor?.(token.href) || token.href;
          if (/^https?:/i.test(token.href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
          a.addEventListener('click', event => onLink?.(token.href, event)); target.append(a);
        } else { const element = node(token.type, token.text); if (token.children) append(token.children, element); target.append(element); }
      }
    }
    // Images do not trigger remote requests; retain their descriptive alt text.
    append(inlineTokens(text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')), parent);
  }
  function render(blocks, parent) {
    for (const block of blocks) {
      let element;
      if (block.type === 'heading') {
        if (block.level === 1 && block.text === skipTitle) continue;
        element = node(`h${Math.min(block.level + headingOffset, 6)}`); element.id = `section-${block.id}`; inline(element, block.text);
        headings.push({ text: block.text, id: element.id, slug: block.id });
      } else if (block.type === 'paragraph') { element = node('p'); inline(element, block.text); }
      else if (block.type === 'codeblock') { element = node('pre'); element.append(node('code', block.text)); }
      else if (block.type === 'hr') element = node('hr');
      else if (block.type === 'quote') { element = node('blockquote'); render(block.blocks, element); }
      else if (block.type === 'list') {
        element = node(block.ordered ? 'ol' : 'ul'); if (block.ordered) element.start = block.start;
        for (const item of block.items) { const li = node('li'); render(item, li); element.append(li); }
      } else if (block.type === 'table') {
        element = node('div'); element.className = 'table-scroll'; element.tabIndex = 0; element.setAttribute('role', 'region'); element.setAttribute('aria-label', '正文表格');
        const table = node('table'); const head = node('thead'); const header = node('tr');
        for (const text of block.header) { const th = node('th'); th.scope = 'col'; inline(th, text); header.append(th); }
        head.append(header); const body = node('tbody');
        for (const row of block.rows) { const tr = node('tr'); for (const text of row) { const td = node('td'); inline(td, text); tr.append(td); } body.append(tr); }
        table.append(head, body); element.append(table);
      }
      if (element) parent.append(element);
    }
  }
  const fragment = document.createDocumentFragment(); render(blocks, fragment);
  return { fragment, headings };
}
