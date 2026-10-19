// Presentation data only. Neither this module nor the page writes to the profile.
export function domainView(profile, domain) {
  const active = domain.state === 'active';
  const records = active ? profile.records.filter(record => record.domain === domain.id) : [];
  const drafts = active ? profile.drafts.filter(record => record.domain === domain.id) : [];
  const confirmed = records.filter(record => record.status === 'confirmed');
  const pending = records.filter(record => record.status !== 'confirmed');
  const state = !active ? domain.state : confirmed.length ? 'confirmed' : pending.length ? 'pending' : drafts.length ? 'draft' : 'empty';
  const label = { confirmed: '已有确认', pending: '待核实', draft: '仅有草稿', empty: '待了解', withheld: '暂不提供', not_applicable: '不适用' }[state];
  return { ...domain, records, drafts, confirmed, pending, state, label, preview: confirmed[0] || pending[0] || drafts[0] || null };
}
export function profileView(profile) {
  const domains = profile.domains.map(domain => domainView(profile, domain));
  const active = domains.filter(domain => !['withheld', 'not_applicable'].includes(domain.state));
  return {
    domains,
    known: active.filter(domain => domain.confirmed.length > 0).length,
    remaining: active.filter(domain => domain.confirmed.length === 0).length,
    skipped: domains.length - active.length,
    records: active.reduce((sum, domain) => sum + domain.records.length, 0),
    drafts: active.reduce((sum, domain) => sum + domain.drafts.length, 0)
  };
}
