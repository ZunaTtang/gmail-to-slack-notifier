/**
 * 로컬 테스트 — GAS API를 흉내 내어 src/*.js를 불러오고 리포트 파싱과 메시지 구성을 확인
 * 실행: node test/run.js
 * (테스트 데이터의 수치는 모두 가짜 값)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = path.join(__dirname, '..', 'src');

function loadGas() {
  const ctx = {
    console: { log() {}, warn() {}, error: console.error },
    Utilities: { formatDate: d => d.toISOString().slice(0, 16).replace('T', ' ') },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  };
  vm.createContext(ctx);
  const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));
  const code = files.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
  vm.runInContext(`${code}\n;globalThis.__gas = { CONFIG, parseReport_, buildSlackMessage_, htmlToText_, getBodyText_ };`, ctx);
  const gas = ctx.__gas;
  // 테스트는 저장소 기본 Config와 무관하게 같은 조건으로 돌림
  gas.CONFIG.REPORT.ENABLED = true;
  gas.CONFIG.REPORT.MENTION_ON = 'NO';
  gas.CONFIG.MESSAGE.MENTION = '<@U000TEST>';
  gas.CONFIG.MESSAGE.MENTION_POSITION = 'after';
  return gas;
}

const HEADERS = [
  'Date', 'Trading Pair', 'Daily Single-Sided Organic Volume (USDT)', 'Avg. Daily Single-Sided Liquidity (2%, USD)',
  'Avg. Daily Spread (%)', 'Daily Taker Volume (USD)', 'Daily Trading Frequency (%)', 'Daily Floor Price',
];
const ROWS = [
  ['2026-09-29', 'ABC-USDT', '1234.56', '1000.1', '0.12', '2345.67', '11.11', '0.001234'],
  ['2026-09-28', 'ABC-USDT', '9999.99', '2000.2', '0.34', '8888.88', '22.22', '0.005678'],
  ['2026-09-27', 'ABC-USDT', '100.00', '300.3', '0.56', '200.00', '3.33', '0.009999'],
];

function reportText({ ranked = 'NO', rows = ROWS, headers = HEADERS } = {}) {
  return [
    'Dear ABC Team,',
    'Overall Performance ( 2026-08-31 to 2026-09-29 )',
    'Token: ABC',
    `Ranked Top 80%: ${ranked}`,
    '30-Day Daily Trading Performance Breakdown',
    headers.join('\t'),
    ...rows.map(r => r.join('\t')),
    'Sincerely,',
  ].join('\n');
}

function reportHtml({ ranked = 'NO' } = {}) {
  const tr = cells => `  <tr>\n${cells.map(c => `    <td style="padding:4px">\n      ${c}\n    </td>`).join('\n')}\n  </tr>`;
  return `<html><head><style>td{}</style></head><body>
<meta charset="UTF-8">
<p>Dear ABC Team,</p>
<p>Overall Performance ( 2026-08-31 to 2026-09-29 )</p>
<p>Token: ABC</p>
<p>Ranked Top 80%: <b>${ranked}</b></p>
<table>
  <tr>${HEADERS.map(h => `<th>${h}</th>`).join('')}</tr>
${ROWS.map(tr).join('\n')}
</table>
<p>Sincerely,</p></body></html>`;
}

function mailWith(body, subject = '30-Day Daily Trading Performance Report with KuCoin') {
  return {
    id: 'm1', subject, fromName: 'postlisting@kucoin.com', fromEmail: 'postlisting@kucoin.com',
    date: new Date('2026-09-30T01:34:00Z'), body, link: 'https://mail.google.com/#all/m1', matchedKeywords: [],
  };
}

const allText = msg => JSON.stringify(msg.blocks);
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('탭 텍스트: Ranked·토큰·기간·최신 행을 읽는다', () => {
  const { parseReport_ } = loadGas();
  const r = parseReport_(reportText());
  assert.strictEqual(r.ok, true, r.errors.join());
  assert.strictEqual(r.ranked, 'NO');
  assert.strictEqual(r.token, 'ABC');
  assert.strictEqual(r.periodFrom, '2026-08-31');
  assert.strictEqual(r.periodTo, '2026-09-29');
  assert.strictEqual(r.latest.date, '2026-09-29');
  assert.strictEqual(r.latest.pair, 'ABC-USDT');
  assert.strictEqual(r.rows.length, 3);
  // 기본값: 이름은 메일 머리글 그대로, 값은 쉼표 + 단위
  const values = Object.fromEntries(r.columns.map(c => [c.label, c.value]));
  assert.deepStrictEqual(values, {
    'Daily Single-Sided Organic Volume (USDT)': '1,234.56 USDT',
    'Avg. Daily Single-Sided Liquidity (2%, USD)': '1,000.1 USD',
    'Avg. Daily Spread (%)': '0.12%',
    'Daily Taker Volume (USD)': '2,345.67 USD',
    'Daily Trading Frequency (%)': '11.11%',
    'Daily Floor Price': '0.001234',
  });
});

test('label을 지정하거나 NUMBER_FORMAT을 끄면 그대로 적용된다', () => {
  const gas = loadGas();
  gas.CONFIG.REPORT.NUMBER_FORMAT = false;
  Object.assign(gas.CONFIG.REPORT.COLUMNS[0], { label: 'Organic Volume', unit: '' });
  const r = gas.parseReport_(reportText());
  assert.strictEqual(r.columns[0].label, 'Organic Volume');
  assert.strictEqual(r.columns[0].value, '1234.56');
  assert.strictEqual(r.columns[5].value, '0.001234');
});

test('HTML 표: 셀 사이 줄바꿈이 있어도 같은 결과', () => {
  const { parseReport_, getBodyText_ } = loadGas();
  const html = reportHtml();
  const text = getBodyText_({ getPlainBody: () => html, getBody: () => html });
  const r = parseReport_(text);
  assert.strictEqual(r.ok, true, r.errors.join());
  assert.strictEqual(r.latest.date, '2026-09-29');
  assert.strictEqual(r.columns[0].value, '1,234.56 USDT');
  assert.strictEqual(r.columns[5].value, '0.001234');
});

test('행 순서가 섞여도 가장 최근 날짜 행을 고른다', () => {
  const { parseReport_ } = loadGas();
  const r = parseReport_(reportText({ rows: [ROWS[2], ROWS[0], ROWS[1]] }));
  assert.strictEqual(r.latest.date, '2026-09-29');
});

test('NO: 경고 제목 두 줄 + 멘션, 목록형 값', () => {
  const { buildSlackMessage_ } = loadGas();
  const msg = buildSlackMessage_(mailWith(reportText()));
  const title = msg.blocks[0].text.text;
  assert.strictEqual(title, '*:rotating_light: ABC Ranked Top 80%가 NO입니다.*\n*수동 거래를 진행해 주세요!* <@U000TEST>');
  assert.match(msg.blocks[1].elements[0].text, /Ranked Top 80%: \*NO\* · 기준일 2026-09-29 · ABC-USDT/);
  assert.strictEqual(msg.blocks[2].type, 'divider');
  const lines = msg.blocks[3].text.text.split('\n');
  assert.strictEqual(lines.length, 6);
  assert.strictEqual(lines[0], '• Daily Single-Sided Organic Volume (USDT): *1,234.56 USDT*');
  assert.strictEqual(msg.text, 'ABC Ranked Top 80%: NO (2026-09-29)');
});

test('LAYOUT fields: 2열 카드', () => {
  const gas = loadGas();
  gas.CONFIG.REPORT.LAYOUT = 'fields';
  const msg = gas.buildSlackMessage_(mailWith(reportText()));
  assert.strictEqual(msg.blocks[2].fields.length, 6);
});

test('YES: 다른 제목, 멘션 없음', () => {
  const { buildSlackMessage_ } = loadGas();
  const msg = buildSlackMessage_(mailWith(reportText({ ranked: 'YES' })));
  assert.strictEqual(msg.blocks[0].text.text, '*:white_check_mark: ABC Ranked Top 80%: YES*');
  assert.ok(!allText(msg).includes('U000TEST'));
});

test('열 숨기기: show:false인 열은 빠진다', () => {
  const gas = loadGas();
  gas.CONFIG.REPORT.COLUMNS[5].show = false;
  const msg = gas.buildSlackMessage_(mailWith(reportText()));
  assert.strictEqual(msg.blocks[3].text.text.split('\n').length, 5);
  assert.ok(!allText(msg).includes('Daily Floor Price'));
});

test('표가 없으면 파싱 실패 경고를 보낸다', () => {
  const { buildSlackMessage_ } = loadGas();
  const msg = buildSlackMessage_(mailWith('Dear team,\nRanked Top 80%: NO\nNo table here.'));
  assert.match(msg.blocks[0].text.text, /리포트 형식을 읽지 못했습니다/);
  assert.match(msg.text, /리포트 형식 오류/);
  assert.ok(allText(msg).includes('Gmail'));
});

test('제목이 다른 메일은 기존 범용 형식으로 보낸다', () => {
  const { buildSlackMessage_ } = loadGas();
  const msg = buildSlackMessage_(mailWith(reportText(), 'Weekly newsletter'));
  assert.ok(!allText(msg).includes('기준일'));
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`✗ ${name}\n  ${e.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} 통과`);
process.exit(failed ? 1 : 0);
