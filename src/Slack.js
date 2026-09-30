/** 메일 한 통을 Slack 메시지로 변환 (형식은 CONFIG.MESSAGE에서 설정) */
function buildSlackMessage_(mail) {
  const M = CONFIG.MESSAGE;
  const vars = buildTemplateVars_(mail);
  const blocks = M.FORMAT === 'custom' ? buildCustomBlocks_(vars) : buildDefaultBlocks_(mail, vars);

  // text는 푸시 알림과 blocks를 표시할 수 없는 환경에서 쓰는 대체 문구
  const text = truncate_(renderTemplate_(M.NOTIFICATION_TEXT, vars), 300) || '새 메일 알림';
  return blocks.length ? { text, blocks } : { text };
}

/** FORMAT: 'custom' — CUSTOM_TEMPLATE을 한 덩어리로 발송 */
function buildCustomBlocks_(vars) {
  const text = renderTemplate_(CONFIG.MESSAGE.CUSTOM_TEMPLATE, vars);
  return text ? [mrkdwnSection_(truncate_(text, 3000))] : [];
}

/** FORMAT: 'default' — TITLE, SHOW, LABELS 설정으로 카드 구성 */
function buildDefaultBlocks_(mail, vars) {
  const M = CONFIG.MESSAGE;
  const blocks = [];

  // 제목 줄 (+ 멘션)
  if (M.TITLE.SHOW && M.TITLE.STYLE === 'header') {
    // 헤더 블록은 plain_text만 지원하므로 멘션은 별도 줄로 분리
    const raw = renderTemplate_(M.TITLE.TEMPLATE, buildTemplateVars_(mail, false));
    const mentionBlock = vars.mention ? mrkdwnSection_(vars.mention) : null;
    if (mentionBlock && M.MENTION_POSITION === 'before') blocks.push(mentionBlock);
    if (raw) blocks.push({ type: 'header', text: { type: 'plain_text', text: truncate_(raw, 150), emoji: true } });
    if (mentionBlock && M.MENTION_POSITION !== 'before') blocks.push(mentionBlock);
  } else {
    const title = M.TITLE.SHOW && vars.title
      ? (M.TITLE.STYLE === 'bold' ? `*${vars.title}*` : vars.title)
      : '';
    const line = joinMention_(title, vars.mention);
    if (line) blocks.push(mrkdwnSection_(line));
  }

  // 보낸 사람 / 받은 시각
  const fields = [];
  const sender = formatSender_(M.SHOW.fromName ? vars.fromName : '', M.SHOW.fromEmail ? vars.fromEmail : '');
  if (sender) fields.push({ type: 'mrkdwn', text: `*${M.LABELS.from}*\n${sender}` });
  if (M.SHOW.date) fields.push({ type: 'mrkdwn', text: `*${M.LABELS.date}*\n${vars.date}` });
  if (fields.length) blocks.push({ type: 'section', fields });

  // 본문 미리보기
  if (M.SHOW.body && vars.bodyQuoted) blocks.push(mrkdwnSection_(truncate_(vars.bodyQuoted, 2900)));

  // 키워드 / Gmail 링크
  const context = [];
  if (M.SHOW.keywords && mail.matchedKeywords.length) {
    context.push(`${M.LABELS.keywords}: ` + mail.matchedKeywords.map(k => '`' + escapeSlack_(k) + '`').join(' '));
  }
  if (M.SHOW.gmailLink) context.push(vars.gmailLink);
  if (context.length) {
    blocks.push({ type: 'context', elements: context.map(text => ({ type: 'mrkdwn', text })) });
  }

  return blocks;
}

function mrkdwnSection_(text) {
  return { type: 'section', text: { type: 'mrkdwn', text } };
}

/** payload: { text, blocks? } */
function sendSlack_(payload) {
  return resolveSlackMode_() === 'bot' ? postViaBot_(payload) : postViaWebhook_(payload);
}

function resolveSlackMode_() {
  const s = getSecrets_();
  const hasBot = Boolean(s.botToken && s.channelId);
  const mode = CONFIG.SLACK_SEND_MODE;

  if (mode === 'bot' || (mode === 'auto' && hasBot)) {
    if (!hasBot) throw new Error('봇 모드에는 SLACK_BOT_TOKEN과 SLACK_CHANNEL_ID 스크립트 속성이 필요합니다.');
    return 'bot';
  }
  if (!s.webhookUrl) throw new Error('SLACK_WEBHOOK_URL 스크립트 속성이 없습니다. (또는 봇 토큰과 채널 ID를 설정하세요)');
  return 'webhook';
}

function postViaBot_(payload) {
  const s = getSecrets_();
  const res = fetchWithRetry_('https://slack.com/api/chat.postMessage', {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    headers: { Authorization: `Bearer ${s.botToken}` },
    payload: JSON.stringify({ channel: s.channelId, unfurl_links: false, ...payload }),
  });
  const json = JSON.parse(res.getContentText());
  if (!json.ok) {
    const hint = json.error === 'not_in_channel' ? ' (채널에서 /invite @봇이름 으로 봇을 초대하세요)' : '';
    throw new Error(`Slack API 오류: ${json.error}${hint}`);
  }
  return json;
}

function postViaWebhook_(payload) {
  const res = fetchWithRetry_(getSecrets_().webhookUrl, {
    method: 'post',
    contentType: 'application/json; charset=utf-8',
    payload: JSON.stringify(payload),
  });
  if (res.getResponseCode() !== 200) {
    throw new Error(`Slack 웹훅 오류 ${res.getResponseCode()}: ${res.getContentText()}`);
  }
  return res.getContentText();
}

/** 429(요청 제한)이면 Retry-After만큼 기다렸다가 최대 3번 시도 */
function fetchWithRetry_(url, params) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = UrlFetchApp.fetch(url, { ...params, muteHttpExceptions: true });
    if (res.getResponseCode() !== 429) return res;
    const headers = res.getHeaders();
    const waitSec = Number(headers['Retry-After'] || headers['retry-after'] || 1);
    Utilities.sleep(Math.min(waitSec, 10) * 1000);
  }
  throw new Error('Slack 요청 제한(429): 재시도 횟수 초과');
}

/** 같은 오류는 1시간에 1번만 Slack으로 알림 */
function notifyError_(err) {
  if (!CONFIG.NOTIFY_ERRORS_TO_SLACK) return;
  try {
    const msg = String((err && err.message) || err);
    const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, msg);
    const key = 'err_' + Utilities.base64EncodeWebSafe(digest).slice(0, 20);
    const cache = CacheService.getScriptCache();
    if (cache.get(key)) return;
    cache.put(key, '1', 60 * 60);
    sendSlack_({ text: `:warning: 메일 알림 스크립트 오류\n\`\`\`${truncate_(msg, 1500)}\`\`\`` });
  } catch (e) {
    console.error('오류 알림 발송 실패:', e);
  }
}
