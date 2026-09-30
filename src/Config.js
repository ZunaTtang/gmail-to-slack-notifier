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

  // ── Slack 발송 방식 ──
  SLACK_SEND_MODE: 'auto',     // 'auto': 봇 설정이 있으면 봇, 없으면 웹훅 / 'bot' / 'webhook'

  // ── Slack 메시지 형식 ──
  // 템플릿에서 쓸 수 있는 변수는 README의 "메시지 형식 설정" 참고
  MESSAGE: {
    // 'default': 아래 TITLE·SHOW 설정으로 카드 형태 / 'custom': CUSTOM_TEMPLATE을 그대로 사용
    FORMAT: 'default',

    // 제목 줄
    TITLE: {
      SHOW: true,
      TEMPLATE: '{{emoji}} {{subject}}',  // 예: '[{{fromName}}] {{subject}}', ':rotating_light: 긴급 메일'
      STYLE: 'bold',                      // 'bold': 굵게 / 'plain': 일반 / 'header': 큰 헤더(멘션·서식 불가)
    },

    MENTION: '',                // 예: '<!channel>', '<!here>', '<@U0123ABCD>' (여러 명은 공백으로 구분)
    MENTION_POSITION: 'after',  // 'after': 제목 뒤 / 'before': 제목 앞
    EMOJI: ':envelope:',        // {{emoji}} 변수 값
    DATE_FORMAT: 'yyyy-MM-dd HH:mm',
    BODY_PREVIEW_CHARS: 300,    // 본문 미리보기 글자 수 (0이면 본문 미포함)

    // default 형식에서 보여줄 항목 (false면 숨김)
    SHOW: {
      fromName: true,   // 보낸 사람 이름
      fromEmail: true,  // 보낸 사람 주소
      date: true,       // 받은 시각
      body: true,       // 본문 미리보기
      keywords: true,   // 매칭된 키워드
      gmailLink: true,  // Gmail에서 열기 링크
    },

    // default 형식의 항목 이름
    LABELS: {
      from: '보낸 사람',
      date: '받은 시각',
      keywords: '키워드',
      gmailLink: 'Gmail에서 열기',
    },

    // custom 형식 템플릿 (Slack mrkdwn)
    // {{변수}}: 값으로 바뀜 / {{#변수}}...{{/변수}}: 값이 있을 때만 표시 (그 줄이 비면 줄째로 삭제)
    CUSTOM_TEMPLATE: [
      '*{{title}}* {{mention}}',
      '{{from}} · {{date}}',
      '{{#bodyQuoted}}{{bodyQuoted}}{{/bodyQuoted}}',
      '{{#keywords}}키워드: {{keywords}}{{/keywords}}',
      '{{gmailLink}}',
    ].join('\n'),

    // 푸시 알림과 미리보기에 표시되는 한 줄 문구
    NOTIFICATION_TEXT: '[메일] {{fromName}}: {{subject}}',
  },

  // ── 리포트 모드 ──
  // 형식이 고정된 리포트 메일에서 "Ranked Top 80%" 값과 표의 최신 날짜 행을 뽑아 카드로 보냄
  // 아래 MATCH_SUBJECT/MATCH_BODY로 인식한 메일에만 적용되고, 나머지 메일은 위 MESSAGE 형식으로 보냄
  REPORT: {
    ENABLED: false,
    MATCH_SUBJECT: '30-Day Daily Trading Performance Report', // 제목에 이 문구가 있거나
    MATCH_BODY: 'Ranked Top 80%',                              // 본문에 이 문구가 있으면 리포트로 처리 (빈 값이면 제목만 확인)

    // 제목 — 변수: {{token}} {{ranked}} {{date}}(기준일) {{today}}(오늘) {{pair}} {{periodFrom}} {{periodTo}} {{receivedDate}} 등
    TITLE_NO: ':rotating_light: Kucoin 거래소의 {{token}} Ranked Top 80%가 NO입니다.',
    TITLE_YES: ':white_check_mark: Kucoin 거래소의 {{token}} Ranked Top 80%가 YES입니다. ({{today}})',

    // YES 알림
    NOTIFY_ON_YES: true,        // false: YES인 날은 알림을 보내지 않음
    YES_DETAIL: false,          // false: 제목 한 줄만 / true: NO처럼 표 값까지 표시
    DEFAULT_TOKEN: 'LOT',       // 본문에서 Token을 못 찾을 때 {{token}} 값
    TODAY_FORMAT: 'yyyy-MM-dd', // {{today}}(알림 보내는 날) 날짜 형식
    TITLE_STYLE: 'bold',        // 'bold' | 'plain'
    MENTION_ON: 'NO',           // 'NO': NO일 때만 / 'ALWAYS': 항상 / 'NEVER': 안 함 (대상은 MESSAGE.MENTION)

    LAYOUT: 'list',             // 'list': 한 줄에 "항목: 값" / 'fields': 2열 카드
    SHOW_SUMMARY: true,         // Ranked · 기준일 · 페어 · 평가 기간 요약 줄
    SHOW_GMAIL_LINK: true,
    NUMBER_FORMAT: true,        // true: 천 단위 쉼표 (7946.49 → 7,946.49) / false: 메일 원문 그대로
    NOTIFICATION_TEXT: '{{token}} Ranked Top 80%: {{ranked}} ({{date}})',
    LABELS: { ranked: 'Ranked Top 80%', date: '기준일', period: '평가 기간' },

    // 표에서 보여줄 열
    //   match: 머리글에 포함된 문구 / label: 표시 이름 (빈 값이면 메일 머리글 그대로)
    //   unit: 값 뒤에 붙일 단위 / show: false면 숨김
    COLUMNS: [
      { match: 'Daily Single-Sided Organic Volume', label: '', unit: ' USDT', show: true },
      { match: 'Avg. Daily Single-Sided Liquidity', label: '', unit: ' USD', show: true },
      { match: 'Avg. Daily Spread', label: '', unit: '%', show: true },
      { match: 'Daily Taker Volume', label: '', unit: ' USD', show: true },
      { match: 'Daily Trading Frequency', label: '', unit: '%', show: true },
      { match: 'Daily Floor Price', label: '', unit: '', show: true },
    ],
  },

  // ── 편의 기능 ──
  DRY_RUN: false,              // true: Slack으로 보내지 않고 로그만 남김
  EXCLUDE_SELF: true,          // 내가 보낸 메일(스레드 안 답장 등) 제외
  APPLY_LABEL: '',             // 예: 'Slack알림' → 보낸 메일의 스레드에 라벨 붙이기 (빈 값이면 끔)
  MARK_AS_READ: false,         // 보낸 뒤 읽음 처리
  NOTIFY_ERRORS_TO_SLACK: true // 스크립트 오류를 Slack으로 알림 (같은 오류는 1시간에 1번)
};
