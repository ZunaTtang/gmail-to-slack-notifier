const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_BUDGET_MS = 4.5 * 60 * 1000; // GAS 실행 시간 제한(6분) 전에 안전하게 멈춤
const VALID_INTERVALS = [1, 5, 10, 15, 30];

function normalize_(s) {
  const t = String(s || '').normalize('NFC');
  return CONFIG.CASE_SENSITIVE ? t : t.toLowerCase();
}

/** Slack mrkdwn 특수문자 이스케이프 */
function escapeSlack_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate_(s, max) {
  s = String(s || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function compactWhitespace_(s) {
  return String(s || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

/** '"홍길동" <a@b.com>' → { name: '홍길동', email: 'a@b.com' } */
function parseAddress_(raw) {
  const str = String(raw || '');
  const m = str.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) {
    const email = m[2].trim().toLowerCase();
    return { name: m[1].trim() || email, email };
  }
  const email = str.trim().toLowerCase();
  return { name: email, email };
}

function getMyEmail_() {
  try {
    return (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  } catch (e) {
    return '';
  }
}
