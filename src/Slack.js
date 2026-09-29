/** 메시지 템플릿 — 모양을 바꾸려면 이 함수만 수정 */
function buildSlackMessage_(mail) {
  const when = Utilities.formatDate(mail.date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const mention = CONFIG.MENTION ? CONFIG.MENTION + ' ' : '';
  const subject = escapeSlack_(truncate_(mail.subject, 200));

  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `${mention}:envelope: *${subject}*` } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*보낸 사람*\n${escapeSlack_(mail.fromName)} (${escapeSlack_(mail.fromEmail)})` },
        { type: 'mrkdwn', text: `*받은 시각*\n${when}` },
      ],
    },
  ];

  if (CONFIG.BODY_PREVIEW_CHARS > 0 && mail.body) {
    const preview = escapeSlack_(truncate_(compactWhitespace_(mail.body), CONFIG.BODY_PREVIEW_CHARS));
    const quoted = preview.split('\n').map(line => '>' + line).join('\n');
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: truncate_(quoted, 2900) } });
  }

  const context = [];
  if (mail.matchedKeywords.length) {
    context.push('키워드: ' + mail.matchedKeywords.map(k => '`' + escapeSlack_(k) + '`').join(' '));
  }
  if (CONFIG.SHOW_GMAIL_LINK) context.push(`<${mail.link}|Gmail에서 열기>`);
  if (context.length) {
    blocks.push({ type: 'context', elements: context.map(text => ({ type: 'mrkdwn', text })) });
  }

  // text는 푸시 알림과 blocks를 표시할 수 없는 환경에서 쓰는 대체 문구
  const fallback = `${mention}[메일] ${escapeSlack_(mail.fromName)}: ${escapeSlack_(truncate_(mail.subject, 150))}`;
  return { text: fallback, blocks };
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
