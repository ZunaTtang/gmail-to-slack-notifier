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

/** 본문 텍스트 추출 — 텍스트 파트가 없거나 HTML이 섞여 있으면 HTML을 텍스트로 변환 */
function getBodyText_(message) {
  const plain = message.getPlainBody() || '';
  if (plain.trim() && !looksLikeHtml_(plain)) return plain;
  return htmlToText_(plain.trim() ? plain : message.getBody());
}

function looksLikeHtml_(s) {
  return /<(html|head|body|meta|div|p|br|table|span|a|img|style)\b[^>]*>/i.test(s);
}

function htmlToText_(html) {
  return decodeHtmlEntities_(
    String(html || '')
      .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      // 표는 "한 줄 = 한 행, 탭 = 칸"으로 (셀 사이의 소스 줄바꿈은 먼저 제거)
      .replace(/\s+(?=<(t[dh]|\/t[dhr])\b)/gi, '')
      .replace(/(<t[dh]\b[^>]*>)\s+/gi, '$1')
      .replace(/<\/t[dh]>/gi, '\t')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|tr|h[1-6]|table|blockquote)>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, '')
  );
}

function decodeHtmlEntities_(s) {
  const named = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (_, k) => named[k]);
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
