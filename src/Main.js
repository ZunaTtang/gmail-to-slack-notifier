/** 트리거가 호출하는 진입점 */
function checkEmails() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) {
    console.warn('이전 실행이 아직 진행 중이라 이번 실행은 건너뜁니다.');
    return;
  }
  try {
    validateConfig_();
    const r = runCheck_({ dryRun: CONFIG.DRY_RUN });
    console.log(`검색어: ${r.query}`);
    console.log(`검사 ${r.scanned}건 / 매칭 ${r.matched}건 / 발송 ${r.sent}건${r.stoppedEarly ? ' (시간 제한으로 중단, 다음 실행에서 이어서 처리)' : ''}`);
  } catch (e) {
    console.error(e);
    notifyError_(e);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function runCheck_({ dryRun }) {
  const startedAt = Date.now();
  const cutoff = new Date(startedAt - CONFIG.LOOKBACK_DAYS * DAY_MS);
  const query = buildQuery_();
  const store = loadProcessedStore_();
  const myEmail = getMyEmail_();
  const label = !dryRun && CONFIG.APPLY_LABEL ? getOrCreateLabel_(CONFIG.APPLY_LABEL) : null;
  const stats = { query, scanned: 0, matched: 0, sent: 0, stoppedEarly: false, matches: [] };

  const messages = collectMessages_(GmailApp.search(query, 0, CONFIG.MAX_THREADS_PER_RUN));

  try {
    for (const message of messages) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        stats.stoppedEarly = true;
        break;
      }
      if (message.getDate() < cutoff || message.isInTrash()) continue;
      if (store.has(message.getId())) continue; //이미 보낸 알림을 다시 보내려면 이 부분 주석처리
      if (CONFIG.ONLY_UNREAD && !message.isUnread()) continue;

      const mail = toMail_(message, myEmail);
      if (CONFIG.EXCLUDE_SELF && myEmail && mail.fromEmail === myEmail) continue;
      stats.scanned++;

      const matched = matchMail_(mail);
      if (!matched) continue;
      mail.matchedKeywords = matched;
      stats.matched++;
      stats.matches.push(mail);
      if (dryRun) continue;

      const payload = buildSlackMessage_(mail);
      if (payload) {
        sendSlack_(payload);
        stats.sent++;
      } else {
        console.log(`알림 끔 설정으로 건너뜀: ${mail.subject}`); // 예: REPORT.NOTIFY_ON_YES = false
      }
      store.add(mail.id);

      if (label) message.getThread().addLabel(label);
      if (CONFIG.MARK_AS_READ) message.markRead();
    }
  } finally {
    // 발송 도중 오류가 나도 그때까지 보낸 기록은 저장해 중복 발송을 막음
    if (!dryRun) store.save();
  }
  return stats;
}

/** 스레드들의 메시지를 한 번에 가져와 오래된 순으로 정렬 */
function collectMessages_(threads) {
  if (!threads.length) return [];
  return GmailApp.getMessagesForThreads(threads)
    .flat()
    .sort((a, b) => a.getDate() - b.getDate());
}

function toMail_(message, myEmail) {
  const from = parseAddress_(message.getFrom());
  const needBody = CONFIG.KEYWORD_FIELDS.includes('body') || reportEnabled_() ||
    (CONFIG.MESSAGE.BODY_PREVIEW_CHARS > 0 && messageUsesBody_());
  const authuser = myEmail ? `?authuser=${encodeURIComponent(myEmail)}` : '';
  return {
    id: message.getId(),
    subject: message.getSubject() || '(제목 없음)',
    fromName: from.name,
    fromEmail: from.email,
    date: message.getDate(),
    body: needBody ? getBodyText_(message) : '',
    link: `https://mail.google.com/mail/${authuser}#all/${message.getId()}`,
    matchedKeywords: [],
  };
}

function getOrCreateLabel_(name) {
  return GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name);
}
