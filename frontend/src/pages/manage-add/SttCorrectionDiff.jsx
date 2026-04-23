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
  const variantIndex = useMemo(() => buildVariantIndex(corrections), [corrections]);

  const classified = useMemo(
    () => pairs.map(p => classifyPair(p, variantIndex)),
    [pairs, variantIndex]
  );

  const stats = useMemo(() => ({
    total: classified.length,
    candidate: classified.filter(p => p.status === 'candidate').length,
    existing: classified.filter(p => p.status === 'existing').length,
    protected: classified.filter(p => p.status === 'protected').length,
    conflict: classified.filter(p => p.status === 'conflict').length,
    reorganize: classified.filter(p => p.status === 'reorganize').length,
  }), [classified]);

  return (
    <div style={{ padding: 16 }}>
      <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 12 }}>
        총 <b>{stats.total}</b>건
        {variantIndex && (
          <>
            {' '}(신규 <b style={{ color: 'var(--accent)' }}>{stats.candidate}</b>
            {' · '}등록됨 <b style={{ color: 'var(--accent-blue)' }}>{stats.existing}</b>
            {' · '}보호됨 <b style={{ color: 'var(--c-dim)' }}>{stats.protected}</b>
            {' · '}충돌 <b style={{ color: 'var(--accent-orange)' }}>{stats.conflict}</b>
            {' · '}재구성 <b style={{ color: 'var(--c-faint)' }}>{stats.reorganize}</b>)
          </>
        )}
      </div>
      <div style={{
        color: 'var(--c-muted)', padding: 24, textAlign: 'center',
        fontSize: '0.786rem', background: 'var(--bg-subtle)', borderRadius: 8,
      }}>
        (Phase 3 커밋 8 에서 카드 UI 완성 예정)
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

/**
 * corrections JSON → 4종 인덱스 객체.
 *   pairSet: Set<"before||target"> — 정확 중복 체크
 *   beforeMap: Map<before, Set<target>> — 같은 before 가 여러 target 에 걸림
 *   targetToSection: Map<target, section_id>
 *   skipSet: Set<word> — 보호 단어
 */
function buildVariantIndex(corrections) {
  if (!corrections) return null;
  const pairSet = new Set();
  const beforeMap = new Map();
  const targetToSection = new Map();
  const skipSet = new Set();

  for (const s of corrections.sections || []) {
    for (const g of s.groups || []) {
      if (!g.target) continue;
      targetToSection.set(g.target, s.id);
      for (const e of g.errors || []) {
        const text = (e?.text || '').trim();
        if (!text) continue;
        pairSet.add(`${text}||${g.target}`);
        if (!beforeMap.has(text)) beforeMap.set(text, new Set());
        beforeMap.get(text).add(g.target);
      }
    }
  }
  for (const w of corrections.skip_words || []) {
    const word = (w?.word || '').trim();
    if (word) skipSet.add(word);
  }

  return { pairSet, beforeMap, targetToSection, skipSet };
}

/**
 * pair 분류: 현재 사전/skip_words 상태에 따라 status 부여.
 *
 * status 매트릭스:
 *   candidate  — before/after 둘 다 존재 & 신규 (사전에 없음 & skip 없음)
 *   existing   — (before, after) 쌍 이미 사전에 등록됨
 *   conflict   — before 는 있으나 다른 target 으로 등록됨
 *   protected  — before 가 skip_words 에 있음 (보호 우선)
 *   reorganize — type 이 insert/delete 인 경우 (재구성 성격, 사전 대상 아님)
 *
 * protectedConflict 플래그: skip 有 + 사전 有 동시 성립 (UI 경고용)
 */
function classifyPair(pair, variantIndex) {
  if (!variantIndex) return { ...pair, status: 'loading' };

  const { before, after } = pair;

  // insert/delete 는 재구성 — 사전 추가 대상 아님
  if (pair.type !== 'replace' || !before || !after) {
    return { ...pair, status: 'reorganize' };
  }

  const inSkip = variantIndex.skipSet.has(before);
  const inDict = variantIndex.beforeMap.has(before);
  const pairExact = variantIndex.pairSet.has(`${before}||${after}`);

  // skip 우선 (protected)
  if (inSkip) {
    return {
      ...pair,
      status: 'protected',
      protectedConflict: inDict,  // 사전 有 + skip 有 모순
      existingTargets: inDict ? [...variantIndex.beforeMap.get(before)] : [],
    };
  }

  // 정확 쌍 중복
  if (pairExact) {
    return { ...pair, status: 'existing', existingTarget: after };
  }

  // before 가 다른 target 으로 등록됨 (conflict)
  if (inDict) {
    return {
      ...pair,
      status: 'conflict',
      existingTargets: [...variantIndex.beforeMap.get(before)],
    };
  }

  return { ...pair, status: 'candidate' };
}
