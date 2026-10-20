import test from 'node:test';
import assert from 'node:assert/strict';
import { profileView } from '../skills/nome/assets/profile-view.js';
import { profileView as dataView } from '../skills/nome/scripts/lib/model.mjs';
import { parseMarkdown, inlineTokens, safeUrl, resolveDocumentLink } from '../skills/nome/assets/markdown.js';

test('six empty modules have no scores, status tiers or invented text', () => {
  const input = dataView([]); const before = structuredClone(input); const view = profileView(input);
  assert.equal(view.domains.length, 6); assert.ok(view.domains.every(d => d.documents.length === 0));
  assert.deepEqual(Object.keys(view), ['domains']); assert.deepEqual(input, before);
});
test('index chapter links establish reading order without hiding unlinked chapters', () => {
  const docs = [
    { path: 'growth/career.md', markdown: '# Career' },
    { path: 'growth/index.md', markdown: '# Life\n\n[School](school.md)\n\n[Career](career.md)\n\n[Other](../identity/index.md)' },
    { path: 'growth/school.md', markdown: '# School' },
    { path: 'growth/extra.md', markdown: 'Extra' }
  ];
  const view = profileView(dataView(docs));
  assert.deepEqual(view.domains.find(d => d.id === 'growth').documents.map(d => d.title), ['Life', 'School', 'Career', 'extra']);
});
test('Markdown parses narrative, nested lists, tables, quotes and code without executing HTML', () => {
  const blocks = parseMarkdown('# Life\n\n## Early\n\nA **bold** paragraph.\n\n- item\n  - nested\n- next\n\n| A | B |\n| --- | --- |\n| one | two |\n\n> Quote\n\n```js\n<script>unsafe()</script>\n```\n\n<script>still text</script>');
  assert.ok(blocks.some(b => b.type === 'table' && b.rows[0][1] === 'two'));
  assert.ok(blocks.some(b => b.type === 'quote'));
  assert.ok(blocks.some(b => b.type === 'list' && b.items[0].some(i => i.type === 'list')));
  assert.equal(blocks.at(-1).type, 'paragraph');
  assert.equal(blocks.find(b => b.type === 'codeblock').text, '<script>unsafe()</script>');
});
test('duplicate section titles get distinct anchors and code can contain heading syntax', () => {
  const blocks = parseMarkdown('## 转折\n\n## 转折\n\n```\n# not a heading\n```');
  assert.deepEqual(blocks.filter(b => b.type === 'heading').map(b => b.id), ['转折', '转折-1']);
});
test('unsafe schemes and tracking media cannot become active profile links', () => {
  for (const value of ['javascript:alert(1)', 'data:text/html,x', '//tracker.example', 'file:///private', 'java\nscript:test', '\\server\\share']) assert.equal(safeUrl(value), null);
  assert.equal(safeUrl('https://example.com'), 'https://example.com');
  assert.equal(inlineTokens('[bad](javascript:evil)')[0].href, null);
  assert.deepEqual(resolveDocumentLink('../identity/index.md#now', 'growth/index.md'), { path: 'identity/index.md', anchor: 'now' });
  assert.equal(resolveDocumentLink('../../etc/private.md', 'growth/index.md'), null);
  assert.equal(resolveDocumentLink('https://example.com', 'growth/index.md'), null);
});
