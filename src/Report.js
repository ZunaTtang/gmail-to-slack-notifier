/**
 * 리포트 모드 — 형식이 고정된 리포트 메일(KuCoin "30-Day Daily Trading Performance Report")에서
 * Ranked Top 80% 값과 표의 최신 날짜 행을 뽑아 Slack 카드로 만듦. 설정은 CONFIG.REPORT
 */
const REPORT_DATE_RE_ = /^\d{4}-\d{2}-\d{2}$/;

function reportEnabled_() {
  return Boolean(CONFIG.REPORT && CONFIG.REPORT.ENABLED);
}

function isReportMail_(mail) {
  const R = CONFIG.REPORT;
  return reportEnabled_() && Boolean(R.MATCH_SUBJECT) && mail.subject.includes(R.MATCH_SUBJECT);
}

/**
 * 본문 텍스트 → { ok, errors, ranked, token, periodFrom, periodTo, headers, rows, latest, columns }
 * 표는 htmlToText_가 만든 "한 줄 = 한 행, 탭 = 칸" 텍스트 기준 (2칸 이상 공백도 칸 구분으로 인정)
 */
function parseReport_(text) {
  const src = String(text || '');
  const pick = re => src.match(re);
  const errors = [];

  const rankedMatch = pick(/Ranked Top 80%\s*:\s*(YES|NO)\b/i);
  const tokenMatch = pick(/Token\s*:\s*([A-Za-z0-9._-]+)/);
  const periodMatch = pick(/Overall Performance\s*\(\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})\s*\)/i);

  const lines = src.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headerLine = lines.find(line => /^Date(\t| {2,})/i.test(line));
  const headers = headerLine ? splitReportRow_(headerLine) : [];
  const rows = lines
    .map(splitReportRow_)
    .filter(cells => cells.length >= 2 && REPORT_DATE_RE_.test(cells[0]))
    .sort((a, b) => b[0].localeCompare(a[0])); // 최신 날짜가 먼저

  if (!rankedMatch) errors.push('"Ranked Top 80%" 값을 찾지 못했습니다.');
  if (!headers.length) errors.push('표 머리글(Date ...) 행을 찾지 못했습니다.');
  if (!rows.length) errors.push('표 데이터 행을 찾지 못했습니다.');

  const report = {
    ok: false,
    errors,
    ranked: rankedMatch ? rankedMatch[1].toUpperCase() : '',
    token: tokenMatch ? tokenMatch[1] : '',
    periodFrom: periodMatch ? periodMatch[1] : '',
    periodTo: periodMatch ? periodMatch[2] : '',
    headers,
    rows,
    latest: null,
    columns: [],
  };

  if (headers.length && rows.length) {
    const cells = rows[0];
    const pairIdx = headers.findIndex(h => /trading pair/i.test(h));
    report.latest = { date: cells[0], pair: cells[pairIdx >= 0 ? pairIdx : 1] || '', cells };
    report.columns = extractReportColumns_(headers, cells);
    if (!report.columns.length) errors.push('설정한 COLUMNS와 일치하는 표 열이 없습니다.');
  }

  report.ok = errors.length === 0;
  return report;
}

/** 탭 또는 2칸 이상 공백으로 칸을 나눔 (중간의 빈 칸은 유지) */
function splitReportRow_(line) {
  return line.split(/\t| {2,}/).map(cell => cell.trim());
}

/** CONFIG.REPORT.COLUMNS의 match(머리글에 포함된 문구)로 열을 찾아 { label, value } 목록을 만듦 */
function extractReportColumns_(headers, cells) {
  const lower = headers.map(h => h.toLowerCase());
  return CONFIG.REPORT.COLUMNS
    .filter(col => col.show !== false)
    .map(col => {
      const idx = lower.findIndex(h => h.includes(String(col.match).toLowerCase()));
      if (idx < 0) {
        console.warn(`리포트 열을 찾지 못했습니다: ${col.match}`);
        return null;
      }
      const raw = cells[idx];
      const value = raw == null || raw === '' ? '-' : formatReportNumber_(raw) + (col.unit || '');
      return { label: col.label || headers[idx], value };
    })
    .filter(Boolean);
}

/** 7946.49 → 7,946.49 (소수 자릿수는 원문 그대로) */
function formatReportNumber_(raw) {
  const s = String(raw).trim();
  if (!CONFIG.REPORT.NUMBER_FORMAT || !/^-?\d+(\.\d+)?$/.test(s)) return s;
  const [int, frac] = s.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return frac === undefined ? grouped : `${grouped}.${frac}`;
}

/** 리포트용 템플릿 변수 — 기존 변수 + token, ranked, date(기준일), pair, periodFrom, periodTo, receivedDate */
function buildReportVars_(mail, report) {
  const vars = buildTemplateVars_(mail);
  vars.receivedDate = vars.date;
  Object.assign(vars, {
    token: escapeSlack_(report.token),
    ranked: report.ranked,
    date: report.latest ? report.latest.date : '',
    pair: escapeSlack_(report.latest ? report.latest.pair : ''),
    periodFrom: report.periodFrom,
    periodTo: report.periodTo,
  });
  return vars;
}

function buildReportMessage_(mail, report) {
  if (!report.ok) return buildReportFailureMessage_(mail, report);

  const R = CONFIG.REPORT;
  const vars = buildReportVars_(mail, report);
  const blocks = [];

  // 제목 (+ 멘션)
  const rawTitle = renderTemplate_(report.ranked === 'NO' ? R.TITLE_NO : R.TITLE_YES, vars);
  const title = R.TITLE_STYLE === 'plain' ? rawTitle : boldLines_(rawTitle);
  const mention = R.MENTION_ON === 'ALWAYS' || (R.MENTION_ON === 'NO' && report.ranked === 'NO') ? vars.mention : '';
  const titleLine = joinMention_(title, mention);
  if (titleLine) blocks.push(mrkdwnSection_(titleLine));

  // 요약 줄: Ranked · 기준일 · 페어 · 평가 기간
  if (R.SHOW_SUMMARY) {
    const L = R.LABELS;
    const parts = [
      `${L.ranked}: *${report.ranked}*`,
      vars.date && `${L.date} ${vars.date}`,
      vars.pair,
      report.periodFrom && `${L.period} ${report.periodFrom} ~ ${report.periodTo}`,
    ].filter(Boolean);
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: parts.join(' · ') }] });
  }

  // 표 값
  if (R.LAYOUT === 'fields') {
    // 2열 카드 (section 하나에 fields 최대 10개)
    const fields = report.columns.map(c => ({
      type: 'mrkdwn',
      text: `*${escapeSlack_(c.label)}*\n${escapeSlack_(c.value)}`,
    }));
    for (let i = 0; i < fields.length; i += 10) {
      blocks.push({ type: 'section', fields: fields.slice(i, i + 10) });
    }
  } else if (report.columns.length) {
    // 목록: 한 줄에 "항목: 값" (이름이 길어도 줄이 밀리지 않음)
    const lines = report.columns.map(c => `• ${escapeSlack_(c.label)}: *${escapeSlack_(c.value)}*`);
    blocks.push({ type: 'divider' });
    blocks.push(mrkdwnSection_(truncate_(lines.join('\n'), 3000)));
  }

  if (R.SHOW_GMAIL_LINK) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: vars.gmailLink }] });

  const text = truncate_(renderTemplate_(R.NOTIFICATION_TEXT, vars), 300) || `리포트: ${report.ranked}`;
  return { text, blocks };
}

/** 형식을 읽지 못해도 알림이 사라지지 않도록 경고와 기본 카드를 보냄 */
function buildReportFailureMessage_(mail, report) {
  console.warn(`리포트 파싱 실패: ${report.errors.join(' / ')}`);
  const vars = buildTemplateVars_(mail);
  const warning = mrkdwnSection_(
    `:warning: *리포트 형식을 읽지 못했습니다.* 메일을 직접 확인해 주세요.\n` +
    report.errors.map(e => `• ${escapeSlack_(e)}`).join('\n')
  );
  const blocks = [warning, ...buildDefaultBlocks_(mail, vars)];
  if (!CONFIG.MESSAGE.SHOW.gmailLink) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: vars.gmailLink }] });
  }
  return { text: `⚠️ 리포트 형식 오류: ${vars.subject}`, blocks };
}
