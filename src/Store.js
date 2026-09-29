const PROCESSED_KEY = 'PROCESSED_MESSAGE_IDS';
const MAX_STORED_IDS = 200; // 스크립트 속성 값 하나의 용량 한도(9KB) 안에 들어가는 개수

/** 발송한 메시지 ID를 기록해 같은 메일을 두 번 보내지 않게 함 */
function loadProcessedStore_() {
  const props = PropertiesService.getScriptProperties();
  let map = {};
  try {
    map = JSON.parse(props.getProperty(PROCESSED_KEY) || '{}');
  } catch (e) {
    console.warn('발송 기록이 손상되어 초기화합니다.');
  }

  return {
    has: id => Object.prototype.hasOwnProperty.call(map, id),
    add: id => { map[id] = Date.now(); },
    save: () => {
      const keepMs = (CONFIG.LOOKBACK_DAYS + 1) * DAY_MS; // 검색 기간이 지난 기록은 필요 없음
      const now = Date.now();
      const kept = Object.entries(map)
        .filter(([, t]) => now - t < keepMs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_STORED_IDS);
      props.setProperty(PROCESSED_KEY, JSON.stringify(Object.fromEntries(kept)));
    },
  };
}
