/** Gmail 검색어로 1차 필터링 (정확한 판정은 matchMail_에서 다시 함) */
function buildQuery_() {
  const parts = [`newer_than:${CONFIG.LOOKBACK_DAYS}d`];

  if (CONFIG.ONLY_UNREAD) parts.push('is:unread');

  if (CONFIG.SENDERS.length) {
    const senders = CONFIG.SENDERS.map(s => quoteQuery_(s.trim().replace(/^@/, '')));
    parts.push(`from:(${senders.join(' OR ')})`);
  }

  if (CONFIG.KEYWORD_PREFILTER && CONFIG.KEYWORDS.length) {
    const terms = CONFIG.KEYWORDS.map(quoteQuery_);
    const joined = CONFIG.KEYWORD_MATCH === 'all' ? terms.join(' ') : terms.join(' OR ');
    const subjectOnly = CONFIG.KEYWORD_FIELDS.length === 1 && CONFIG.KEYWORD_FIELDS[0] === 'subject';
    parts.push(subjectOnly ? `subject:(${joined})` : `(${joined})`);
  }

  return parts.join(' ');
}

function quoteQuery_(s) {
  return `"${String(s).replace(/"/g, '')}"`;
}

/**
 * 조건에 맞으면 매칭된 키워드 배열(키워드 조건이 없으면 빈 배열)을, 아니면 null을 반환
 */
function matchMail_(mail) {
  if (CONFIG.SENDERS.length && !CONFIG.SENDERS.some(rule => senderMatches_(mail.fromEmail, rule))) {
    return null;
  }

  const text = normalize_(
    CONFIG.KEYWORD_FIELDS.map(f => (f === 'subject' ? mail.subject : mail.body)).join('\n')
  );
  const contains = kw => text.includes(normalize_(kw));

  if (CONFIG.EXCLUDE_KEYWORDS.some(contains)) return null;
  if (!CONFIG.KEYWORDS.length) return [];

  const hits = CONFIG.KEYWORDS.filter(contains);
  const ok = CONFIG.KEYWORD_MATCH === 'all' ? hits.length === CONFIG.KEYWORDS.length : hits.length > 0;
  return ok ? hits : null;
}

/** 'a@b.com'은 정확히 일치, '@b.com'이나 'b.com'은 도메인(서브도메인 포함) 일치 */
function senderMatches_(email, rule) {
  const r = rule.trim().toLowerCase();
  if (r.includes('@') && !r.startsWith('@')) return email === r;
  const domain = r.replace(/^@/, '');
  return email.endsWith('@' + domain) || email.endsWith('.' + domain);
}
