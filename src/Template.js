/**
 * 메시지 템플릿 렌더링
 *   {{변수}}                  값으로 치환 (알 수 없는 변수는 그대로 남겨 오타를 알아보기 쉽게 함)
 *   {{#변수}}...{{/변수}}     값이 있을 때만 표시. 이 블록이 사라져 빈 줄이 되면 그 줄을 삭제
 */
const DROP_MARK_ = '\u0000';

function renderTemplate_(template, vars) {
  const withSections = String(template || '').replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_, name, inner) => (hasValue_(vars[name]) ? inner : DROP_MARK_)
  );
  const rendered = withSections.replace(/\{\{(\w+)\}\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name] == null ? '' : vars[name]) : whole
  );
  return rendered
    .split('\n')
    .filter(line => !(line.includes(DROP_MARK_) && line.split(DROP_MARK_).join('').trim() === ''))
    .map(line => line.split(DROP_MARK_).join('').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function hasValue_(v) {
  return v != null && String(v).trim() !== '';
}

/**
 * 템플릿 변수 — README의 "메시지 형식 설정"에 목록이 있음
 * escape=false는 서식이 없는 plain_text(헤더 블록)용
 */
function buildTemplateVars_(mail, escape = true) {
  const M = CONFIG.MESSAGE;
  const e = escape ? escapeSlack_ : s => String(s || '');
  const name = e(mail.fromName);
  const email = e(mail.fromEmail);
  const body = M.BODY_PREVIEW_CHARS > 0 && mail.body
    ? e(truncate_(compactWhitespace_(mail.body), M.BODY_PREVIEW_CHARS))
    : '';

  const vars = {
    mention: escape ? M.MENTION || '' : '',
    emoji: M.EMOJI || '',
    subject: e(truncate_(mail.subject, 200)),
    fromName: name,
    fromEmail: email,
    from: formatSender_(name, email),
    date: Utilities.formatDate(mail.date, Session.getScriptTimeZone(), M.DATE_FORMAT),
    body,
    bodyQuoted: body ? body.split('\n').map(line => '>' + line).join('\n') : '',
    keywords: mail.matchedKeywords.map(e).join(', '),
    link: mail.link,
    gmailLink: `<${mail.link}|${M.LABELS.gmailLink}>`,
  };
  vars.title = renderTemplate_(M.TITLE.TEMPLATE, vars);
  return vars;
}

/** 이름이 없거나 주소와 같으면 주소만 표시 */
function formatSender_(name, email) {
  if (!name || !email) return name || email;
  return name.toLowerCase() === email.toLowerCase() ? email : `${name} (${email})`;
}

/** 제목과 멘션을 MENTION_POSITION 순서로 합침 */
function joinMention_(title, mention) {
  if (!mention) return title;
  if (!title) return mention;
  return CONFIG.MESSAGE.MENTION_POSITION === 'before' ? `${mention} ${title}` : `${title} ${mention}`;
}

/** 템플릿이 본문 변수를 쓰는지 (본문을 불필요하게 읽지 않기 위함) */
function messageUsesBody_() {
  const M = CONFIG.MESSAGE;
  const templates = [M.TITLE.TEMPLATE, M.NOTIFICATION_TEXT, M.FORMAT === 'custom' ? M.CUSTOM_TEMPLATE : ''].join('\n');
  return /\{\{[#/]?body/.test(templates) || (M.FORMAT === 'default' && M.SHOW.body);
}
