import React, { useMemo } from 'react';
import { diffArrays } from 'diff';

/**
 * STT 검토 화면의 [교정 diff] 탭 전용 컴포넌트.
 * parsed_text vs cloud_text 단어 단위 diff 렌더 + 사용자 수동 사전 추가 UI.
 *
 * props:
 *   parsedText: string — 파서 결과
 *   cloudText: string — 클라우드 LLM 결과
 *   corrections: object — stt_corrections.json 전체 데이터 (sections, skip_words)
 *   jobId: string — source_stt_job_id 추적용
 *   preprocDirty: boolean — ManagePreprocessTab 편집 중이면 true
 *   onVariantAdded: () => void — 추가 성공 후 콜백 (corrections 재 fetch)
 *   showAlert: (msg, opts) => void — AlertProvider 훅
 *   showConfirm: (msg, opts) => Promise<boolean> — ConfirmProvider 훅
 */
export default function SttCorrectionDiff({
  parsedText, cloudText, corrections, jobId,
  preprocDirty, onVariantAdded,
  showAlert, showConfirm,
}) {
  const pairs = useMemo(() => computeDiffPairs(parsedText, cloudText), [parsedText, cloudText]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 12 }}>
        총 {pairs.length}건 · 파서 결과와 클라우드 LLM 교정 결과 비교
      </div>
      <div style={{
        color: 'var(--c-muted)', padding: 24, textAlign: 'center',
        fontSize: '0.786rem', background: 'var(--bg-subtle)', borderRadius: 8,
      }}>
        (Phase 3 구현 예정 — 사전 추가/영구 거부 UI)
      </div>
    </div>
  );
}

// ─── 헬퍼 ───

/**
 * 한국어 friendly 단어 단위 tokenizer.
 * 공백 + 주요 구두점 기준 split, separator 도 토큰으로 보존.
 * diffArrays 에 입력하면 '여호와는' 같은 단어가 하나의 토큰으로 처리됨.
 */
function tokenizeKo(text) {
  if (!text) return [];
  return text.split(/(\s+|[.,;:!?()"'「」『』\[\]…·])/).filter(t => t !== '');
}

/**
 * parsed vs cloud 를 토큰 단위로 diff → 변경 pair 배열 반환.
 *
 * Returns: [{before, after, type: 'replace'|'insert'|'delete'}, ...]
 */
export function computeDiffPairs(parsed, cloud) {
  if (!parsed || !cloud) return [];

  const tokensA = tokenizeKo(parsed);
  const tokensB = tokenizeKo(cloud);
  const parts = diffArrays(tokensA, tokensB);

  const pairs = [];

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.removed) {
      const next = parts[i + 1];
      if (next && next.added) {
        const before = p.value.join('').trim();
        const after = next.value.join('').trim();
        if (before || after) {
          pairs.push({ before, after, type: 'replace' });
        }
        i++;
      } else {
        const before = p.value.join('').trim();
        if (before) pairs.push({ before, after: '', type: 'delete' });
      }
    } else if (p.added) {
      const after = p.value.join('').trim();
      if (after) pairs.push({ before: '', after, type: 'insert' });
    }
  }

  return pairs;
}
