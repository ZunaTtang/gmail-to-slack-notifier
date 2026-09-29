/**
 * 사용자 설정 — 이 파일만 수정하면 됩니다.
 * 비밀값(봇 토큰, 웹훅 URL)은 여기에 적지 말고 [프로젝트 설정 → 스크립트 속성]에 저장하세요.
 */
const CONFIG = {
  // ── 검색 범위 ──
  LOOKBACK_DAYS: 1,            // 최근 N일 안에 받은 메일만 검사
  ONLY_UNREAD: false,          // true: 안 읽은 메일만 검사
  MAX_THREADS_PER_RUN: 50,     // 한 번 실행할 때 가져올 최대 스레드 수

  // ── 발신자 필터 ──
  // 비워 두면 모든 발신자. 주소('boss@a.com') 또는 도메인('@a.com', 'a.com')
  SENDERS: [],

  // ── 키워드 필터 ──
  KEYWORDS: ['긴급', '장애'],
  KEYWORD_MATCH: 'any',                 // 'any': 하나라도 포함 / 'all': 모두 포함
  KEYWORD_FIELDS: ['subject', 'body'],  // 'subject', 'body' 중 검사할 곳
  EXCLUDE_KEYWORDS: ['광고', '뉴스레터'], // 하나라도 포함되면 제외
  CASE_SENSITIVE: false,
  // true: Gmail 검색으로 먼저 걸러서 빠름 / false: 기간 안의 메일을 모두 가져와 코드로만 판정
  // (한글 부분 일치가 누락되면 false로)
  KEYWORD_PREFILTER: true,

  // ── 트리거 ──
  TRIGGER_INTERVAL_MINUTES: 5, // 1, 5, 10, 15, 30 중 하나 (변경 후 setupTrigger 다시 실행)

  // ── Slack 메시지 ──
  SLACK_SEND_MODE: 'auto',     // 'auto': 봇 설정이 있으면 봇, 없으면 웹훅 / 'bot' / 'webhook'
  MENTION: '',                 // 예: '<!channel>', '<!here>', '<@U0123ABCD>'
  BODY_PREVIEW_CHARS: 300,     // 본문 미리보기 글자 수 (0이면 본문 미포함)
  SHOW_GMAIL_LINK: true,       // "Gmail에서 열기" 링크 표시

  // ── 편의 기능 ──
  DRY_RUN: false,              // true: Slack으로 보내지 않고 로그만 남김
  EXCLUDE_SELF: true,          // 내가 보낸 메일(스레드 안 답장 등) 제외
  APPLY_LABEL: '',             // 예: 'Slack알림' → 보낸 메일의 스레드에 라벨 붙이기 (빈 값이면 끔)
  MARK_AS_READ: false,         // 보낸 뒤 읽음 처리
  NOTIFY_ERRORS_TO_SLACK: true // 스크립트 오류를 Slack으로 알림 (같은 오류는 1시간에 1번)
};
