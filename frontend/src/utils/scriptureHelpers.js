// 골자 성구 수집 헬퍼 (세션 5b Phase 2).
// outlineDetail API 응답의 subtopics 구조 → {verses} 주입용 평면 배열.
//
// 실측 기반 설계:
//   - pt.scriptures 는 string (ChromaDB metadata primitive 제약)
//   - 세미콜론 (;) 이 주 구분자, 쉼표 (,) 는 같은 장 인접 절 표기로 유지
//   - 일부 pt 에 출판물 md 찌꺼기 ("- **출판물**:") 오염 — loose 필터
//   - 낭독 표시 "(낭독)" 보존 (LLM 매칭 힌트)

/**
 * 성구 원시 문자열 → 배열.
 * 세미콜론 구분, trim, 출판물 md 찌꺼기 필터.
 *
 * 같은 책 인접 장 인용 시 책명 생략 도메인 관습 대응:
 *   "요 14:31; 15:13"    → ["요 14:31", "요 15:13"]
 *   "창 3:19; 5:5"       → ["창 3:19", "창 5:5"]
 *   "전 11:10; 12:1; 딤후 3:16, 17" → ["전 11:10", "전 12:1", "딤후 3:16, 17"]
 *
 * 책명 추출 전략: 항목에서 첫 "공백+숫자:숫자" 패턴 index 앞까지 slice
 * (책명 약호/전체명/숫자서 혼재 대응 — Phase 2 실측 25종 변형 커버).
 */
export function parseScriptureList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  if (raw.trim().startsWith('- **')) return [];
  const parts = raw.split(';').map(s => s.trim()).filter(s => s.length > 0);

  let lastBook = '';
  const out = [];
  for (const p of parts) {
    const m = /\s+\d+\s*[:：]\s*\d/.exec(p);
    if (m) {
      // 본 항목에 책명 있음 — lastBook 갱신 + 그대로 보존
      lastBook = p.slice(0, m.index).trim();
      out.push(p);
    } else if (/^\d/.test(p) && lastBook) {
      // 숫자 시작 + 직전 책명 있음 → prepend
      out.push(`${lastBook} ${p}`);
    } else {
      // 안전망: 패턴 매치 실패 + 책명 없음 → 그대로
      out.push(p);
    }
  }
  return out;
}

/**
 * outlineDetail 응답의 subtopics dict → 평면 성구 배열.
 * 중복 제거, 순서 보존.
 *
 * subtopics 스키마: { [subtopicTitle]: [{ id, point_num, content, scriptures, scripture_usage, ... }, ...] }
 *
 * 낭독/참조 구분 두 패턴 병존 (Doc-35 배경):
 *   - 패턴 A: scripture_usage="낭독" + scriptures 깨끗 (routers/preprocess.py md 경로, 실측 9.1%)
 *   - 패턴 B: scriptures 내 "(낭독)" 태그 + scripture_usage=""  (DOCX 경로, 실측 0.3%)
 *   - 패턴 C: 둘 다 (실측 0건, 안전망)
 * 정규화 방식: scriptures 에 태그 없고 usage 있으면 "(usage)" 접미사 부여 → 패턴 B 와 일관.
 */
const USAGE_TAG_RE = /\s*\((낭독|참조|미언급|적용)\)/;

export function collectScripturesFromOutline(subtopics) {
  if (!subtopics || typeof subtopics !== 'object') return [];
  const seen = new Set();
  const out = [];
  for (const points of Object.values(subtopics)) {
    if (!Array.isArray(points)) continue;
    for (const pt of points) {
      const usage = (pt?.scripture_usage || '').trim();
      for (const ref of parseScriptureList(pt?.scriptures)) {
        const hasTag = USAGE_TAG_RE.test(ref);
        const finalRef = (!hasTag && usage) ? `${ref} (${usage})` : ref;
        if (!seen.has(finalRef)) {
          seen.add(finalRef);
          out.push(finalRef);
        }
      }
    }
  }
  return out;
}
