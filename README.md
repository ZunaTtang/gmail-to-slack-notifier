# Gmail → Slack 키워드 알림 (Google Apps Script)

Gmail에서 **특정 발신자**나 **키워드**가 포함된 메일을 찾아 Slack 채널로 알림을 보내는 Google Apps Script(GAS)입니다.
서버 없이 시간 기반 트리거로 1~30분마다 실행됩니다.

## 목차
1. [주요 기능](#주요-기능)
2. [파일 구성](#파일-구성)
3. [빠른 시작 요약](#빠른-시작-요약)
4. [1단계: Slack 준비 (봇 또는 웹훅)](#1단계-slack-준비-봇-또는-웹훅)
5. [2단계: GAS 프로젝트에 코드 올리기](#2단계-gas-프로젝트에-코드-올리기)
6. [3단계: 환경 변수(스크립트 속성) 설정](#3단계-환경-변수스크립트-속성-설정)
7. [4단계: 필터 설정 (Config.js)](#4단계-필터-설정-configjs)
8. [5단계: 권한 승인, 테스트, 트리거 설치](#5단계-권한-승인-테스트-트리거-설치)
9. [운영과 관리](#운영과-관리)
10. [메시지 형식 설정](#메시지-형식-설정)
11. [동작 방식](#동작-방식)
12. [주의사항](#주의사항)
13. [문제 해결](#문제-해결)

---

## 주요 기능
- **검색 기간 설정**: 최근 N일(`LOOKBACK_DAYS`) 안에 받은 메일만 검사
- **발신자 필터**: 주소(`boss@a.com`) 또는 도메인(`@a.com`) 단위
- **키워드 필터**: 포함(any/all), 제외 키워드, 제목·본문 선택, 대소문자 구분 여부
- **Slack 발송**: 봇 토큰(`chat.postMessage`)과 Incoming Webhook 모두 지원, Block Kit 템플릿 사용
- **편의 기능**: 중복 발송 방지, 발송 없이 미리보기(DRY_RUN), 내가 보낸 메일 제외, 라벨 붙이기, 읽음 처리, 멘션, 오류 알림, 429 재시도, 동시 실행 방지

## 파일 구성

| 파일 | 역할 |
|---|---|
| `src/Config.js` | **사용자 설정** (이 파일만 수정하면 됨) |
| `src/Main.js` | 트리거 진입점 `checkEmails()`와 전체 처리 흐름 |
| `src/Filter.js` | Gmail 검색어 만들기, 발신자·키워드 판정 |
| `src/Template.js` | 템플릿 변수와 렌더링 (`{{변수}}`, 조건부 블록) |
| `src/Slack.js` | 메시지 구성(default/custom), 발송(봇/웹훅), 재시도, 오류 알림 |
| `src/Store.js` | 발송 기록 (중복 발송 방지) |
| `src/Setup.js` | 환경 변수 읽기, 설정 검증, 트리거 설치·해제, 테스트·상태 함수 |
| `src/Utils.js` | 공통 상수와 문자열 유틸 |
| `src/appsscript.json` | 매니페스트 (시간대 Asia/Seoul, V8 런타임) |
| `.clasp.json.example` | clasp 설정 예시 (실제 `.clasp.json`은 git에 올리지 않음) |

## 빠른 시작 요약
1. Slack에서 **봇 토큰과 채널 ID**, 또는 **웹훅 URL**을 준비합니다.
2. clasp나 편집기 붙여넣기로 GAS 프로젝트에 코드를 올립니다.
3. GAS의 **프로젝트 설정 → 스크립트 속성**에 Slack 값을 입력합니다.
4. `src/Config.js`에서 발신자와 키워드를 설정합니다.
5. 편집기에서 `testSlackConnection` → `previewMatches` → `setupTrigger` 순서로 실행합니다.

---

## 1단계: Slack 준비 (봇 또는 웹훅)
둘 중 하나만 준비하면 됩니다.

| | 봇 토큰 방식 (추천) | 웹훅 방식 |
|---|---|---|
| 필요한 값 | `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_ID` | `SLACK_WEBHOOK_URL` |
| 보낼 수 있는 채널 | 채널 ID만 바꾸면 어디든 (봇 초대 필요) | 발급할 때 고른 채널 하나 |
| 오류 메시지 | 자세함 (`not_in_channel` 등) | 단순함 |
| 준비 난이도 | 조금 더 많음 | 가장 간단 |

### A. 봇 토큰 방식
1. [api.slack.com/apps](https://api.slack.com/apps)에서 **Create New App → From scratch**를 누르고, 앱 이름(예: `메일 알림`)과 워크스페이스를 고릅니다.
2. 왼쪽 메뉴 **OAuth & Permissions → Scopes → Bot Token Scopes**에서 **Add an OAuth Scope**를 누르고 `chat:write`를 추가합니다.
3. 같은 페이지 위쪽의 **Install to Workspace**를 눌러 설치하고 허용합니다.
4. 설치가 끝나면 나오는 **Bot User OAuth Token**(`xoxb-`로 시작)을 복사합니다. 이 값이 `SLACK_BOT_TOKEN`입니다.
5. **채널 ID 확인**: Slack에서 알림 받을 채널 이름을 클릭하고, 열린 창의 맨 아래에서 `C`로 시작하는 채널 ID를 복사합니다. 이 값이 `SLACK_CHANNEL_ID`입니다.
   - 채널 이름(`#알림`)이 아니라 **ID**를 넣어야 합니다.
6. **봇을 채널에 초대**: 그 채널에서 `/invite @메일 알림`을 입력합니다. 초대하지 않으면 `not_in_channel` 오류가 납니다.

### B. 웹훅 방식
1. [api.slack.com/apps](https://api.slack.com/apps)에서 **Create New App → From scratch**로 앱을 만듭니다.
2. 왼쪽 메뉴 **Incoming Webhooks**에서 **Activate Incoming Webhooks**를 켭니다.
3. 아래쪽 **Add New Webhook to Workspace**를 누르고 알림 받을 채널을 고른 뒤 허용합니다.
4. 생성된 URL(`https://hooks.slack.com/services/...`)을 복사합니다. 이 값이 `SLACK_WEBHOOK_URL`입니다.

> 토큰과 웹훅 URL은 비밀번호처럼 다루세요. 코드, GitHub, 채팅에 올리지 말고 **스크립트 속성에만** 저장합니다. 유출됐다면 Slack 앱 설정에서 토큰을 재발급(Revoke)하세요.

---

## 2단계: GAS 프로젝트에 코드 올리기

### 방법 A. clasp (추천)
[clasp](https://github.com/google/clasp)는 로컬 파일을 GAS 프로젝트로 올려 주는 Google 공식 CLI입니다. Node.js가 필요합니다.

**① Apps Script API 켜기 (최초 1회)**
[script.google.com/home/usersettings](https://script.google.com/home/usersettings)에서 **Google Apps Script API**를 **사용**으로 바꿉니다. 꺼져 있으면 clasp 명령이 `User has not enabled the Apps Script API` 오류로 실패합니다.

**② clasp 설치와 로그인**
```bash
npm install -g @google/clasp
```
```bash
clasp login
```
브라우저가 열리면 **메일을 감시할 Google 계정**으로 로그인하고 허용합니다. 인증 정보는 `~/.clasprc.json`에 저장됩니다.

**③ 저장소 받기**
```bash
git clone https://github.com/ZunaTtang/gmail-to-slack-notifier.git
```
```bash
cd gmail-to-slack-notifier
```

**④ GAS 프로젝트 만들기** (둘 중 하나)
- 새 프로젝트를 만드는 경우:
  ```bash
  clasp create --type standalone --title "Gmail Slack Notifier" --rootDir src
  ```
  프로젝트 루트에 `.clasp.json`이 생깁니다. clasp가 `src/appsscript.json`을 덮어쓸지 물으면 **덮어쓰지 않습니다**(No).
- 이미 만든 프로젝트를 쓰는 경우: `.clasp.json.example`을 `.clasp.json`으로 복사하고 `scriptId`를 채웁니다. 스크립트 ID는 GAS 편집기의 **⚙ 프로젝트 설정 → ID**에서 확인할 수 있습니다.

**⑤ 코드 올리기**
```bash
clasp push
```
매니페스트를 덮어쓸지 물으면 **Yes**를 선택합니다. 이 저장소의 `src/appsscript.json`이 적용됩니다.

**⑥ 편집기 열기**
```bash
clasp open-script
```
구버전 clasp에서는 `clasp open`을 씁니다. 브라우저에서 GAS 편집기가 열리고 `Config.gs`, `Main.gs` 등이 보이면 성공입니다.

> **주의**: `clasp push`는 GAS에 있는 코드를 **로컬 파일로 덮어씁니다**. 편집기에서 직접 고친 내용이 있다면, 먼저 `clasp pull`로 받아 온 다음 수정하고 push하세요.

### 방법 B. 편집기에 붙여넣기
1. [script.google.com](https://script.google.com)에서 **새 프로젝트**를 만들고, 제목을 `Gmail Slack Notifier`로 바꿉니다.
2. 왼쪽 **파일 +** 버튼으로 **스크립트** 파일을 만듭니다. 이름은 `Config`, `Main`, `Filter`, `Slack`, `Store`, `Setup`, `Utils`로 하고, `src/`에 있는 같은 이름 파일의 내용을 붙여 넣습니다. 기본으로 있던 `코드.gs`는 삭제합니다.
3. **⚙ 프로젝트 설정**에서 **"편집기에서 'appsscript.json' 매니페스트 파일 표시"**를 체크하고, 편집기에 나타난 `appsscript.json`에 `src/appsscript.json` 내용을 붙여 넣습니다.
4. 💾 저장합니다.

---

## 3단계: 환경 변수(스크립트 속성) 설정
GAS에는 `.env` 파일이 없습니다. 대신 **스크립트 속성(Script Properties)**을 환경 변수처럼 씁니다. 스크립트 속성은 코드와 따로 저장되므로 `clasp push`로 코드를 올려도 **지워지지 않고**, GitHub에도 올라가지 않습니다.

### 설정 방법
1. GAS 편집기 왼쪽의 **⚙ 프로젝트 설정**을 누릅니다.
2. 맨 아래 **스크립트 속성** 섹션에서 **스크립트 속성 추가**를 누릅니다.
3. **속성**(키)과 **값**을 입력합니다. 여러 개면 **스크립트 속성 추가**를 반복합니다.
4. **스크립트 속성 저장**을 누릅니다.

### 입력할 값

**봇 토큰 방식**

| 속성 | 값 예시 | 설명 |
|---|---|---|
| `SLACK_BOT_TOKEN` | `xoxb-1234-5678-abcd...` | 1단계 A-4에서 복사한 Bot User OAuth Token |
| `SLACK_CHANNEL_ID` | `C0123ABCD` | 1단계 A-5에서 복사한 채널 ID (채널 이름 아님) |

**웹훅 방식**

| 속성 | 값 예시 | 설명 |
|---|---|---|
| `SLACK_WEBHOOK_URL` | `https://hooks.slack.com/services/T000/B000/XXXX` | 1단계 B-4에서 복사한 URL |

### 입력할 때 확인할 것
- 키 이름은 **대문자 그대로** 정확히 입력합니다. 오타가 있으면 값이 없는 것으로 처리됩니다.
- 값 앞뒤에 **공백이나 따옴표**가 들어가지 않게 합니다.
- 세 값을 모두 넣어도 됩니다. `Config.js`의 `SLACK_SEND_MODE`가 발송 방식을 정합니다.
  - `'auto'`(기본값): 봇 토큰과 채널 ID가 **둘 다** 있으면 봇, 아니면 웹훅
  - `'bot'`: 항상 봇 (값이 없으면 오류)
  - `'webhook'`: 항상 웹훅
- 입력이 끝나면 편집기에서 **`showStatus`**를 실행해 확인합니다. 토큰은 일부만 보이게 가려서 출력되고, `발송 방식: bot` 또는 `발송 방식: webhook`이 표시되면 정상입니다.

### 값을 바꾸거나 지울 때
같은 화면에서 값을 고치거나 휴지통 아이콘으로 삭제한 뒤 **스크립트 속성 저장**을 누릅니다. 다음 실행부터 바로 적용되며, 트리거를 다시 설치할 필요는 없습니다.

> `PROCESSED_MESSAGE_IDS` 속성은 스크립트가 **자동으로 만드는 발송 기록**입니다. 직접 수정하지 마세요. 초기화가 필요하면 `resetProcessed` 함수를 실행합니다.

---

## 4단계: 필터 설정 (Config.js)
GAS 편집기에서 `Config.gs`를 직접 고치거나, 로컬에서 `src/Config.js`를 고친 뒤 `clasp push`합니다.

```js
LOOKBACK_DAYS: 1,
SENDERS: ['@wizpace.com', 'alert@monitoring.io'],
KEYWORDS: ['긴급', '장애', 'incident'],
KEYWORD_MATCH: 'any',
EXCLUDE_KEYWORDS: ['광고', '뉴스레터'],
```

| 항목 | 기본값 | 설명 |
|---|---|---|
| `LOOKBACK_DAYS` | `1` | 최근 N일 안에 받은 메일만 검사 |
| `ONLY_UNREAD` | `false` | 안 읽은 메일만 검사 |
| `MAX_THREADS_PER_RUN` | `50` | 한 번 실행할 때 가져올 최대 스레드 수 |
| `SENDERS` | `[]` | 발신자 필터. 비우면 모든 발신자. `a@b.com`은 정확히 일치, `@b.com`이나 `b.com`은 도메인(서브도메인 포함) 일치 |
| `KEYWORDS` | `['긴급','장애']` | 포함 키워드 |
| `KEYWORD_MATCH` | `'any'` | `any`: 하나라도 포함 / `all`: 모두 포함 |
| `KEYWORD_FIELDS` | `['subject','body']` | 키워드를 검사할 곳 |
| `EXCLUDE_KEYWORDS` | `['광고','뉴스레터']` | 하나라도 포함되면 제외 |
| `CASE_SENSITIVE` | `false` | 대소문자 구분 |
| `KEYWORD_PREFILTER` | `true` | Gmail 검색으로 1차 필터링 ([주의사항](#주의사항) 참고) |
| `TRIGGER_INTERVAL_MINUTES` | `5` | 1, 5, 10, 15, 30 중 하나 |
| `SLACK_SEND_MODE` | `'auto'` | `auto` / `bot` / `webhook` |
| `MESSAGE` | | 제목, 멘션, 표시 항목, 커스텀 템플릿 → [메시지 형식 설정](#메시지-형식-설정) |
| `DRY_RUN` | `false` | Slack으로 보내지 않고 로그만 남김 |
| `EXCLUDE_SELF` | `true` | 내가 보낸 메일 제외 |
| `APPLY_LABEL` | `''` | 보낸 메일의 스레드에 붙일 라벨 이름 (없으면 자동 생성) |
| `MARK_AS_READ` | `false` | 보낸 뒤 읽음 처리 |
| `NOTIFY_ERRORS_TO_SLACK` | `true` | 오류를 Slack으로 알림 (같은 오류는 1시간에 1번) |

`SENDERS`와 `KEYWORDS`를 모두 비우면 모든 메일이 발송되므로, 설정 검증 단계에서 실행을 막습니다.

---

## 5단계: 권한 승인, 테스트, 트리거 설치
GAS 편집기 상단 툴바에서 **실행할 함수를 드롭다운으로 고르고 ▶ 실행**을 누릅니다. 결과는 아래 **실행 로그**에 나옵니다.

### ① `testSlackConnection`: 권한 승인과 Slack 연결 확인
처음 실행하면 권한 승인 창이 뜹니다.
1. **권한 검토**를 누르고, 메일을 감시할 계정을 고릅니다.
2. **"Google에서 확인하지 않은 앱"** 경고가 나오면 **고급 → Gmail Slack Notifier(으)로 이동(안전하지 않음)**을 누릅니다. 내가 만든 개인 스크립트라서 나오는 정상적인 경고입니다.
3. 요청 권한을 확인하고 **허용**합니다.
   - Gmail 메일 읽기·관리: 메일 검색, 라벨, 읽음 처리
   - 외부 서비스 연결: Slack 발송
   - 트리거 관리: 자동 실행 설치
4. 다시 ▶ 실행을 누르면 Slack 채널에 **샘플 메시지**가 옵니다. 메시지 모양도 이때 확인합니다.

### ② `previewMatches`: 발송 없이 매칭 확인
실행 로그에 Gmail 검색어와 조건에 걸리는 메일 목록이 출력됩니다. 원하는 메일이 걸리는지, 원치 않는 메일이 섞이지 않는지 확인하고 `Config`를 조정합니다.

### ③ `setupTrigger`: 자동 실행 시작
`TRIGGER_INTERVAL_MINUTES` 간격으로 `checkEmails`가 실행되도록 트리거를 설치합니다.
왼쪽 **⏰ 트리거** 메뉴에서 `checkEmails` / 시간 기반 트리거가 보이면 성공입니다.

> 트리거는 **설치한 사람의 계정 권한**으로 돌아갑니다. 브라우저를 꺼도, 로그인하지 않아도 실행됩니다.

---

## 운영과 관리

### 관리용 함수

| 함수 | 설명 |
|---|---|
| `showStatus` | 트리거, 발송 방식, 환경 변수(가려서 표시), 현재 검색어 확인 |
| `previewMatches` | 발송 없이 매칭되는 메일 미리보기 |
| `testSlackConnection` | 샘플 메시지 발송 |
| `testSlackWithLatestMail` | 조건에 맞는 최근 실제 메일로 발송 (메시지 모양 확인용) |
| `previewSlackMessage` | 발송 없이 메시지 JSON을 로그로 출력 |
| `setupTrigger` | 트리거 설치 또는 재설치 |
| `removeTrigger` | 트리거 해제 (알림 중지) |
| `resetProcessed` | 발송 기록 초기화. 기간 안의 메일이 다시 발송될 수 있음 |
| `checkEmails` | 한 번 수동으로 실행 |

### 설정을 바꾸면
- `TRIGGER_INTERVAL_MINUTES`를 바꾼 경우에만 `setupTrigger`를 다시 실행합니다.
- 나머지 설정과 스크립트 속성은 다음 실행부터 바로 적용됩니다.

### 실행 기록 보기
왼쪽 **≡ 실행** 메뉴에서 트리거 실행 이력, 로그, 실패 원인을 볼 수 있습니다. 실행이 실패하면 Google이 계정 메일로 실패 알림을 보냅니다. 알림 빈도는 트리거 설정에서 바꿀 수 있습니다.

### 코드 업데이트 (clasp)
```bash
git pull
```
```bash
clasp push
```

---

## 메시지 형식 설정
메시지 모양은 코드를 고치지 않고 `Config.js`의 `MESSAGE`로 바꿉니다. 형식은 두 가지입니다.

| `MESSAGE.FORMAT` | 설명 |
|---|---|
| `'default'` | 제목 → 보낸 사람·받은 시각 → 본문 미리보기 → 키워드·Gmail 링크 순서의 카드. 항목별로 켜고 끌 수 있음 |
| `'custom'` | `CUSTOM_TEMPLATE`에 쓴 문구를 그대로 발송. 순서와 문구를 자유롭게 구성 |

### 제목 (`MESSAGE.TITLE`)

| 항목 | 기본값 | 설명 |
|---|---|---|
| `SHOW` | `true` | 제목 줄 표시 |
| `TEMPLATE` | `'{{emoji}} {{subject}}'` | 제목 문구. 예: `'[{{fromName}}] {{subject}}'`, `':rotating_light: 긴급 메일 도착'` |
| `STYLE` | `'bold'` | `bold`: 굵게 / `plain`: 일반 / `header`: 큰 헤더 글씨 (굵게·링크 같은 서식은 쓸 수 없고, 멘션은 헤더 바로 아래 줄로 분리됨) |

줄을 바꾸려면 문자열 안에 `\n`을 넣습니다. 예: `'{{emoji}} 첫째 줄\n둘째 줄'`. `bold` 스타일이면 줄마다 따로 굵게 표시되고, 멘션은 마지막 줄 뒤에 붙습니다. `header` 스타일은 줄바꿈이 제대로 표시되지 않습니다.

custom 형식에서는 이 제목을 `{{title}}` 변수로 씁니다.

### 멘션

| 항목 | 기본값 | 설명 |
|---|---|---|
| `MENTION` | `''` | `<!channel>`, `<!here>`, `<@U0123ABCD>`(사용자 ID). 여러 명은 공백으로 구분: `'<@U0123> <@U0456>'` |
| `MENTION_POSITION` | `'after'` | `after`: 제목 뒤 / `before`: 제목 앞 (default 형식에만 적용. custom 형식은 템플릿에서 `{{mention}}` 위치로 결정) |

사용자 ID는 Slack에서 사람 프로필을 열고 **⋮ → 멤버 ID 복사**로 확인합니다. 이름(`@홍길동`)을 그대로 쓰면 태그되지 않습니다.

### 항목 숨기기 (`MESSAGE.SHOW`, default 형식)
`false`로 바꾼 항목은 메시지에서 빠집니다.

| 항목 | 설명 |
|---|---|
| `fromName` | 보낸 사람 이름 |
| `fromEmail` | 보낸 사람 주소 |
| `date` | 받은 시각 |
| `body` | 본문 미리보기 |
| `keywords` | 매칭된 키워드 |
| `gmailLink` | Gmail에서 열기 링크 |

항목 이름은 `MESSAGE.LABELS`에서 바꿉니다(`보낸 사람`, `받은 시각`, `키워드`, `Gmail에서 열기`).
보낸 사람 이름이 없는 메일은 주소가 이름을 대신하고, 이름과 주소가 같으면 한 번만 표시합니다.

### 그 밖의 항목

| 항목 | 기본값 | 설명 |
|---|---|---|
| `EMOJI` | `':envelope:'` | `{{emoji}}` 값 |
| `DATE_FORMAT` | `'yyyy-MM-dd HH:mm'` | 날짜 형식 ([SimpleDateFormat](https://docs.oracle.com/javase/8/docs/api/java/text/SimpleDateFormat.html) 문법). 예: `'M월 d일 a h:mm'` |
| `BODY_PREVIEW_CHARS` | `300` | 본문 미리보기 글자 수 (0이면 본문 미포함) |
| `NOTIFICATION_TEXT` | `'[메일] {{fromName}}: {{subject}}'` | 휴대폰 푸시 알림과 채널 목록 미리보기에 뜨는 한 줄 |

### 템플릿 변수
`TITLE.TEMPLATE`, `CUSTOM_TEMPLATE`, `NOTIFICATION_TEXT`에서 쓸 수 있습니다.

| 변수 | 값 |
|---|---|
| `{{title}}` | `TITLE.TEMPLATE`으로 만든 제목 (`TITLE.TEMPLATE` 안에서는 쓸 수 없음) |
| `{{subject}}` | 메일 제목 |
| `{{fromName}}` / `{{fromEmail}}` | 보낸 사람 이름 / 주소 |
| `{{from}}` | `이름 (주소)`. 이름이 없으면 주소만 |
| `{{date}}` | 받은 시각 (`DATE_FORMAT` 적용) |
| `{{body}}` | 본문 미리보기 |
| `{{bodyQuoted}}` | 본문 미리보기를 인용(`>`) 형태로 |
| `{{keywords}}` | 매칭된 키워드 (쉼표로 구분) |
| `{{mention}}` | `MENTION` 값 |
| `{{emoji}}` | `EMOJI` 값 |
| `{{link}}` | Gmail 주소(URL) |
| `{{gmailLink}}` | `Gmail에서 열기` 링크 |

- **조건부 표시**: `{{#변수}}...{{/변수}}`로 감싸면 값이 있을 때만 표시합니다. 감싼 부분이 사라져 빈 줄이 되면 그 줄도 지웁니다.
- **서식**: 템플릿에서는 Slack 서식(`*굵게*`, `_기울임_`, `~취소선~`, `` `코드` ``, `<URL|링크 글자>`)을 쓸 수 있습니다. 메일에서 온 값(제목·본문 등)은 서식이 적용되지 않게 처리됩니다.
- **오타 확인**: 없는 변수 이름을 쓰면 `{{이름}}`이 그대로 보이므로 바로 알아챌 수 있습니다.

### 예시

**1. 발신 주소와 본문을 숨기고, 제목을 큰 헤더로**
```js
MESSAGE: {
  FORMAT: 'default',
  TITLE: { SHOW: true, TEMPLATE: '{{emoji}} {{subject}}', STYLE: 'header' },
  MENTION: '<!here>',
  SHOW: { fromName: true, fromEmail: false, date: true, body: false, keywords: false, gmailLink: true },
  // ...나머지는 기본값 유지
}
```

**2. custom 형식으로 짧은 한두 줄 알림**
```js
FORMAT: 'custom',
TITLE: { SHOW: true, TEMPLATE: '[{{fromName}}] {{subject}}', STYLE: 'bold' },
MENTION: '<@U0123ABCD>',
CUSTOM_TEMPLATE: [
  ':rotating_light: *{{title}}* {{mention}}',
  '{{date}} · <{{link}}|메일 보기>',
  '{{#keywords}}_키워드: {{keywords}}_{{/keywords}}',
].join('\n'),
```
결과:
```
🚨 [KuCoin] 30-Day Daily Trading Performance Report @홍길동
2026-09-30 10:34 · 메일 보기
키워드: Ranked Top 80%: NO
```

### 모양 확인하기

| 함수 | 설명 |
|---|---|
| `testSlackConnection` | 샘플 메일로 실제 발송 |
| `testSlackWithLatestMail` | 조건에 맞는 **가장 최근 실제 메일**로 발송 (발송 기록에 남기지 않으므로 나중에 정식 알림이 한 번 더 올 수 있음) |
| `previewSlackMessage` | 발송하지 않고 Slack 메시지 JSON을 로그에 출력. [Block Kit Builder](https://app.slack.com/block-kit-builder)에 `blocks`를 붙여 넣으면 미리볼 수 있음 |

더 복잡한 모양이 필요하면 `src/Slack.js`의 `buildDefaultBlocks_`를 직접 수정하세요.

---

## 동작 방식
1. `newer_than:Nd`, 발신자, 키워드로 Gmail 검색어를 만들어 스레드를 가져옵니다.
2. 스레드 안의 메시지를 오래된 순으로 하나씩 검사합니다. 기간, 휴지통, 발송 기록, 내가 보낸 메일 여부를 먼저 확인합니다.
3. 발신자와 키워드를 코드에서 다시 정확히 판정합니다. 한글은 NFC로 정규화하고, 대소문자 구분은 설정을 따릅니다.
4. 조건에 맞으면 Slack으로 보내고, 메시지 ID를 발송 기록에 남깁니다. 설정에 따라 라벨을 붙이거나 읽음 처리합니다.
5. 실행 시간이 4.5분을 넘으면 멈추고, 남은 메일은 다음 실행에서 처리합니다.

---

## 주의사항
- **권한 범위**: `GmailApp`은 트리거를 설치한 계정의 **메일함 전체**에 대한 권한(`https://mail.google.com/`)을 요청합니다. 스크립트 **편집 권한**을 받은 사람은 코드를 고쳐 그 계정 권한으로 실행할 수 있으니, 편집자는 최소한으로 두세요.
- **한글 검색**: Gmail 검색은 단어 단위라서, 한글 부분 일치(예: "장애"로 "장애가"를 찾기)가 1차 검색에서 누락될 수 있습니다. 놓치는 메일이 있으면 `KEYWORD_PREFILTER: false`로 바꾸세요. 대신 기간 안의 모든 메일(최대 `MAX_THREADS_PER_RUN`개 스레드)을 코드로 검사합니다.
- **중복 방지 한도**: 발송 기록은 최근 200건까지 보관합니다. 기간 안에 알림이 이보다 많으면 `LOOKBACK_DAYS`를 줄이세요.
- **지연 시간**: 트리거 간격(최소 1분)만큼 알림이 늦게 올 수 있습니다.
- **할당량**: Apps Script에는 하루 트리거 실행 시간과 UrlFetch 호출 수 제한이 있습니다. 메일이 많다면 간격을 늘리거나 `MAX_THREADS_PER_RUN`을 줄이세요.
- **Workspace 정책**: 관리자 정책에 따라 Apps Script의 Gmail 접근이나 외부 요청이 차단될 수 있습니다.

---

## 문제 해결

| 증상 | 해결 |
|---|---|
| clasp: `User has not enabled the Apps Script API` | [usersettings](https://script.google.com/home/usersettings)에서 Apps Script API를 켜고 몇 분 뒤 다시 시도 |
| clasp: `No credentials found` | `clasp login` |
| `SLACK_WEBHOOK_URL 스크립트 속성이 없습니다` | 스크립트 속성의 키 이름·오타 확인 → `showStatus` |
| `Slack API 오류: not_in_channel` | 채널에서 `/invite @봇이름` |
| `Slack API 오류: invalid_auth` | `SLACK_BOT_TOKEN` 값 확인 (`xoxb-`로 시작, 앞뒤 공백 없음) |
| `Slack API 오류: channel_not_found` | `SLACK_CHANNEL_ID`에 채널 이름이 아니라 ID(`C...`)를 입력 |
| `Slack API 오류: missing_scope` | 봇에 `chat:write` 권한을 추가하고 앱을 **재설치** |
| 웹훅 `404` / `invalid_token` / `no_service` | 웹훅 URL을 다시 발급 |
| `설정 오류: ...` | 메시지에 나온 `Config` 항목을 수정 |
| 메시지에 `{{...}}`가 그대로 보임 | 변수 이름 오타. [템플릿 변수](#템플릿-변수) 표에서 확인 |
| 멘션이 태그되지 않음 | `@이름`이 아니라 `<@U0123ABCD>`(멤버 ID) 형식으로 입력 |
| 알림이 안 옴 | `showStatus`로 트리거 확인 → `previewMatches`로 매칭 확인 → **≡ 실행** 메뉴에서 로그 확인 |
| 같은 메일이 다시 옴 | `resetProcessed`를 실행했거나, 기간 안의 알림이 200건을 넘은 경우 |
