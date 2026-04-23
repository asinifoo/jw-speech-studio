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
 */
export function parseScriptureList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  if (raw.trim().startsWith('- **')) return [];
  return raw.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * outlineDetail 응답의 subtopics dict → 평면 성구 배열.
 * 중복 제거, 순서 보존.
 *
 * subtopics 스키마: { [subtopicTitle]: [{ id, point_num, content, scriptures, ... }, ...] }
 */
export function collectScripturesFromOutline(subtopics) {
  if (!subtopics || typeof subtopics !== 'object') return [];
  const seen = new Set();
  const out = [];
  for (const points of Object.values(subtopics)) {
    if (!Array.isArray(points)) continue;
    for (const pt of points) {
      for (const v of parseScriptureList(pt?.scriptures)) {
        if (!seen.has(v)) {
          seen.add(v);
          out.push(v);
        }
      }
    }
  }
  return out;
}
