/**
 * 환경 변수 — [프로젝트 설정(⚙) → 스크립트 속성]에 추가
 *   봇 방식:   SLACK_BOT_TOKEN (xoxb-...), SLACK_CHANNEL_ID (C0123...)
 *   웹훅 방식: SLACK_WEBHOOK_URL (https://hooks.slack.com/services/...)
 */
function getSecrets_() {
  const p = PropertiesService.getScriptProperties();
  return {
    botToken: p.getProperty('SLACK_BOT_TOKEN'),
    channelId: p.getProperty('SLACK_CHANNEL_ID'),
    webhookUrl: p.getProperty('SLACK_WEBHOOK_URL'),
  };
}

function validateConfig_() {
  const errors = [];
  if (!Number.isInteger(CONFIG.LOOKBACK_DAYS) || CONFIG.LOOKBACK_DAYS < 1) {
    errors.push('LOOKBACK_DAYS는 1 이상의 정수여야 합니다.');
  }
  if (!VALID_INTERVALS.includes(CONFIG.TRIGGER_INTERVAL_MINUTES)) {
    errors.push(`TRIGGER_INTERVAL_MINUTES는 ${VALID_INTERVALS.join(', ')} 중 하나여야 합니다.`);
  }
  if (!['any', 'all'].includes(CONFIG.KEYWORD_MATCH)) errors.push("KEYWORD_MATCH는 'any' 또는 'all'입니다.");
  if (!CONFIG.KEYWORD_FIELDS.length || CONFIG.KEYWORD_FIELDS.some(f => !['subject', 'body'].includes(f))) {
    errors.push("KEYWORD_FIELDS는 'subject', 'body' 중에서 1개 이상 지정해야 합니다.");
  }
  if (!['auto', 'bot', 'webhook'].includes(CONFIG.SLACK_SEND_MODE)) {
    errors.push("SLACK_SEND_MODE는 'auto', 'bot', 'webhook' 중 하나입니다.");
  }
  if (!CONFIG.SENDERS.length && !CONFIG.KEYWORDS.length) {
    errors.push('SENDERS와 KEYWORDS가 모두 비어 있으면 모든 메일이 발송됩니다. 하나 이상 설정하세요.');
  }
  if (errors.length) throw new Error('설정 오류:\n- ' + errors.join('\n- '));
}

/** ▶ 트리거 설치 (간격을 바꿨으면 다시 실행) */
function setupTrigger() {
  validateConfig_();
  removeTrigger();
  ScriptApp.newTrigger('checkEmails')
    .timeBased()
    .everyMinutes(CONFIG.TRIGGER_INTERVAL_MINUTES)
    .create();
  console.log(`트리거 설치 완료: ${CONFIG.TRIGGER_INTERVAL_MINUTES}분마다 checkEmails 실행`);
}

/** ▶ 트리거 해제 */
function removeTrigger() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkEmails');
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  console.log(`기존 트리거 ${triggers.length}개 삭제`);
}

/** ▶ Slack 연결과 템플릿 확인 (샘플 메시지 발송) */
function testSlackConnection() {
  const sample = {
    id: 'test',
    subject: '[테스트] 서버 장애 발생 안내',
    fromName: '홍길동',
    fromEmail: 'test@example.com',
    date: new Date(),
    body: '이것은 테스트 메시지입니다.\n템플릿 모양을 확인하세요.',
    link: 'https://mail.google.com/',
    matchedKeywords: ['장애'],
  };
  sendSlack_(buildSlackMessage_(sample));
  console.log(`테스트 메시지 발송 완료 (${resolveSlackMode_()} 방식)`);
}

/** ▶ 발송 없이 현재 설정으로 걸리는 메일 미리보기 */
function previewMatches() {
  validateConfig_();
  const r = runCheck_({ dryRun: true });
  const tz = Session.getScriptTimeZone();
  console.log(`검색어: ${r.query}`);
  console.log(`검사 ${r.scanned}건 중 ${r.matched}건 매칭 (이미 발송한 메일 제외)`);
  r.matches.forEach((m, i) => {
    const when = Utilities.formatDate(m.date, tz, 'MM-dd HH:mm');
    console.log(`${i + 1}. [${when}] ${m.fromEmail} | ${m.subject} | 키워드: ${m.matchedKeywords.join(', ') || '-'}`);
  });
}

/** ▶ 발송 기록 초기화 (기간 안의 메일이 다시 발송될 수 있음) */
function resetProcessed() {
  PropertiesService.getScriptProperties().deleteProperty(PROCESSED_KEY);
  console.log('발송 기록을 초기화했습니다.');
}

/** ▶ 현재 설정과 상태 확인 */
function showStatus() {
  const s = getSecrets_();
  const mask = v => (v ? `${v.slice(0, 8)}…${v.slice(-4)}` : '(없음)');
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'checkEmails');
  let mode;
  try { mode = resolveSlackMode_(); } catch (e) { mode = `설정 필요: ${e.message}`; }

  console.log([
    `트리거: ${triggers.length ? `${CONFIG.TRIGGER_INTERVAL_MINUTES}분 간격 (${triggers.length}개)` : '없음'}`,
    `발송 방식: ${mode}`,
    `SLACK_BOT_TOKEN: ${mask(s.botToken)} / SLACK_CHANNEL_ID: ${s.channelId || '(없음)'}`,
    `SLACK_WEBHOOK_URL: ${mask(s.webhookUrl)}`,
    `기간: 최근 ${CONFIG.LOOKBACK_DAYS}일 / 발신자: ${CONFIG.SENDERS.join(', ') || '전체'}`,
    `키워드(${CONFIG.KEYWORD_MATCH}): ${CONFIG.KEYWORDS.join(', ') || '없음'} / 제외: ${CONFIG.EXCLUDE_KEYWORDS.join(', ') || '없음'}`,
    `검색어: ${buildQuery_()}`,
    `DRY_RUN: ${CONFIG.DRY_RUN}`,
  ].join('\n'));
}
