import { documentTitle, inlineTokens, resolveDocumentLink } from './markdown.js';

export function domainView(domain) {
  const index = domain.documents.find(doc => doc.path === `${domain.id}/index.md`);
  const ordered = [];
  if (index) ordered.push(index);
  // The index controls chapter order. Unlinked Markdown files remain accessible.
  for (const token of inlineTokens(index?.markdown || '')) {
    if (token.type !== 'link' || !token.href) continue;
    const target = resolveDocumentLink(token.href, index.path);
    const doc = target && domain.documents.find(d => d.path === target.path);
    if (doc && !ordered.includes(doc)) ordered.push(doc);
  }
  for (const doc of domain.documents) if (!ordered.includes(doc)) ordered.push(doc);
  return { id: domain.id, name: domain.name, documents: ordered.map(doc => ({ ...doc, title: documentTitle(doc) })) };
}
export function profileView(profile) { return { domains: profile.domains.map(domainView) }; }
