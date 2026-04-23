import React, { useMemo, useState } from 'react';
import { diffArrays } from 'diff';
import { sttCorrectionsAddVariants, sttCorrectionsAddSkipWords } from '../../api';

/**
 * STT 검토 화면의 [교정 diff] 탭 전용 컴포넌트.
 * parsed_text vs cloud_text 단어 단위 diff 렌더 + 사용자 수동 사전 추가 UI.
 *
 * props:
 *   parsedText: string — 파서 결과
 *   cloudText: string — 클라우드 LLM 결과
 *   corrections: object — stt_corrections.json 전체 데이터 (sections, skip_words)
 *   jobId: string — source_stt_job_id 추적용
 *   preprocDirty: boolean — ManagePreprocessTab 편집 중이면 true (Phase 4)
 *   onVariantAdded: () => void — 추가 성공 후 콜백 (corrections 재 fetch)
 *   showAlert: (msg, opts) => void
 *   showConfirm: (msg, opts) => Promise<boolean>
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

  const [ignored, setIgnored] = useState(() => new Set());
  const [expanded, setExpanded] = useState({});        // pairKey → bool
  const [sectionBy, setSectionBy] = useState({});      // pairKey → section_id
  const [targetBy, setTargetBy] = useState({});        // pairKey → target string
  const [addingSet, setAddingSet] = useState(() => new Set());  // pairKey → 진행 중

  const visible = useMemo(
    () => classified.filter(p => !ignored.has(`${p.before}||${p.after}`)),
    [classified, ignored]
  );

  const stats = useMemo(() => ({
    total: classified.length,
    candidate: classified.filter(p => p.status === 'candidate').length,
    existing: classified.filter(p => p.status === 'existing').length,
    protected: classified.filter(p => p.status === 'protected').length,
    conflict: classified.filter(p => p.status === 'conflict').length,
    reorganize: classified.filter(p => p.status === 'reorganize').length,
  }), [classified]);

  const sections = corrections?.sections || [];

  // ─── 핸들러 ───

  const setAdding = (key, flag) => {
    setAddingSet(s => {
      const n = new Set(s);
      if (flag) n.add(key); else n.delete(key);
      return n;
    });
  };

  const handleAddVariant = async (pair, pairKey, sectionId, target) => {
    const trimmedTarget = (target || '').trim();
    if (!sectionId || !trimmedTarget) {
      showAlert('섹션과 타겟을 확인하세요.', { variant: 'info' });
      return;
    }
    setAdding(pairKey, true);
    try {
      const result = await sttCorrectionsAddVariants(sectionId, trimmedTarget, [{
        text: pair.before,
        note: '',
        source_stt_job_id: jobId || '',
      }]);
      if (result.added > 0) {
        showAlert(`✓ 사전 추가됨: ${pair.before} → ${trimmedTarget}`, { variant: 'success' });
        setExpanded(e => ({ ...e, [pairKey]: false }));
        onVariantAdded && onVariantAdded();
      } else {
        showAlert('이미 등록된 규칙입니다.', { variant: 'info' });
      }
    } catch (e) {
      showAlert(`추가 실패: ${e.message}`, { variant: 'error' });
    } finally {
      setAdding(pairKey, false);
    }
  };

  const handleAddSkipWord = async (pair, pairKey) => {
    const ok = await showConfirm(
      `"${pair.before}" 를 수정 제외 단어로 추가하시겠습니까?\n\n향후 STT 교정 시 이 단어는 보호됩니다.`,
      { confirmLabel: '영구 거부', confirmVariant: 'danger' }
    );
    if (!ok) return;
    setAdding(pairKey, true);
    try {
      const result = await sttCorrectionsAddSkipWords([{
        word: pair.before,
        reason: jobId ? `STT diff 영구 거부 (job ${String(jobId).slice(-6)})` : 'STT diff 영구 거부',
      }]);
      if (result.added > 0) {
        showAlert('✓ 수정 제외 단어에 추가됨', { variant: 'success' });
        onVariantAdded && onVariantAdded();
      } else {
        showAlert('이미 보호된 단어입니다.', { variant: 'info' });
      }
    } catch (e) {
      showAlert(`추가 실패: ${e.message}`, { variant: 'error' });
    } finally {
      setAdding(pairKey, false);
    }
  };

  const handleIgnore = (pair) => {
    const key = `${pair.before}||${pair.after}`;
    setIgnored(s => new Set(s).add(key));
  };

  // ─── 렌더 ───

  return (
    <div style={{ padding: 16 }}>
      {preprocDirty && (
        <div style={{
          padding: 12, marginBottom: 12, borderRadius: 6,
          background: 'var(--tint-orange)',
          border: '1px solid var(--accent-orange)',
          color: 'var(--c-text)', fontSize: '0.786rem', lineHeight: 1.5,
        }}>
          ⚠️ [관리] &gt; [전처리] 에 저장 안 한 변경이 있습니다. 사전 추가 전에 먼저 저장하세요.
        </div>
      )}
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

      {!variantIndex && (
        <div style={{
          color: 'var(--c-muted)', padding: 24, textAlign: 'center',
          fontSize: '0.786rem', background: 'var(--bg-subtle)', borderRadius: 8,
        }}>
          사전 로딩 중…
        </div>
      )}

      {variantIndex && visible.length === 0 && (
        <div style={{
          color: 'var(--c-muted)', padding: 24, textAlign: 'center',
          fontSize: '0.786rem', background: 'var(--bg-subtle)', borderRadius: 8,
        }}>
          표시할 변경 사항이 없습니다.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {variantIndex && visible.map((pair, i) => {
          const pairKey = `${pair.before}||${pair.after}||${i}`;
          const isExpanded = !!expanded[pairKey];
          const isAdding = addingSet.has(pairKey);
          const curSection = sectionBy[pairKey] ?? suggestSection(pair.after, variantIndex, sections);
          const curTarget = targetBy[pairKey] ?? pair.after;

          const canAdd = pair.status === 'candidate' || pair.status === 'conflict';

          return (
            <div key={pairKey} style={{
              border: '1px solid var(--bd)', borderRadius: 8,
              padding: 12, background: 'var(--bg-card)',
            }}>
              {/* 헤더 행: before → after + StatusBadge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {(hasScripturePattern(pair.before) || hasScripturePattern(pair.after)) && (
                  <span title="성구 패턴 포함" style={{ fontSize: '0.929rem' }}>🕮</span>
                )}
                <code style={{
                  background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4,
                  color: 'var(--c-danger)', textDecoration: 'line-through',
                  fontSize: '0.857rem',
                }}>
                  {pair.before || '(없음)'}
                </code>
                <span style={{ color: 'var(--c-dim)' }}>→</span>
                <code style={{
                  background: 'var(--bg-subtle)', padding: '2px 6px', borderRadius: 4,
                  color: 'var(--accent)', fontWeight: 600,
                  fontSize: '0.857rem',
                }}>
                  {pair.after || '(없음)'}
                </code>
                <StatusBadge pair={pair} />
              </div>

              {/* 버튼 행 */}
              {(canAdd || pair.status !== 'reorganize') && (
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                  {canAdd && (
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [pairKey]: !isExpanded }))}
                      disabled={isAdding || preprocDirty}
                      title={preprocDirty ? '[관리] > [전처리] 에 저장 안 한 변경이 있습니다.' : undefined}
                      style={btnStyle('accent', isAdding || preprocDirty)}>
                      {isExpanded ? '접기' : '+ 사전 추가'}
                    </button>
                  )}
                  {canAdd && (
                    <button
                      onClick={() => handleAddSkipWord(pair, pairKey)}
                      disabled={isAdding || preprocDirty}
                      title={preprocDirty ? '[관리] > [전처리] 에 저장 안 한 변경이 있습니다.' : undefined}
                      style={btnStyle('danger', isAdding || preprocDirty)}>
                      영구 거부
                    </button>
                  )}
                  {pair.status !== 'reorganize' && (
                    <button
                      onClick={() => handleIgnore(pair)}
                      disabled={isAdding}
                      title={pair.status === 'candidate' ? 'Cloud 가 원문을 정확히 복원한 경우일 수 있으니 원문과 대조 권장' : undefined}
                      style={btnStyle('muted', isAdding)}>
                      무시
                    </button>
                  )}
                </div>
              )}

              {/* 확장 패널 */}
              {canAdd && isExpanded && (
                <div style={{
                  marginTop: 8, padding: 10, background: 'var(--bg-subtle)',
                  borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.714rem', color: 'var(--c-muted)', minWidth: 50 }}>섹션</label>
                    <select
                      value={curSection}
                      onChange={e => setSectionBy(s => ({ ...s, [pairKey]: e.target.value }))}
                      style={{
                        flex: 1, minWidth: 120, padding: '4px 8px',
                        border: '1px solid var(--bd)', borderRadius: 4,
                        fontSize: '0.786rem', background: 'var(--bg-card)',
                        color: 'var(--c-text-dark)', outline: 'none',
                      }}>
                      {sections.map(s => (
                        <option key={s.id} value={s.id}>{s.name || s.id}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <label style={{ fontSize: '0.714rem', color: 'var(--c-muted)', minWidth: 50 }}>타겟</label>
                    <input
                      type="text"
                      value={curTarget}
                      onChange={e => setTargetBy(s => ({ ...s, [pairKey]: e.target.value }))}
                      style={{
                        flex: 1, minWidth: 120, padding: '4px 8px',
                        border: '1px solid var(--bd)', borderRadius: 4,
                        fontSize: '0.786rem', background: 'var(--bg-card)',
                        color: 'var(--c-text-dark)', outline: 'none',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [pairKey]: false }))}
                      disabled={isAdding}
                      style={btnStyle('muted', isAdding)}>
                      취소
                    </button>
                    <button
                      onClick={() => handleAddVariant(pair, pairKey, curSection, curTarget)}
                      disabled={isAdding || preprocDirty}
                      title={preprocDirty ? '[관리] > [전처리] 에 저장 안 한 변경이 있습니다.' : undefined}
                      style={btnStyle('accent', isAdding || preprocDirty)}>
                      {isAdding ? '추가 중…' : '확인'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── StatusBadge ───

function StatusBadge({ pair }) {
  const { status, existingTarget, existingTargets, protectedConflict } = pair;

  const baseStyle = {
    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
    fontSize: '0.643rem', fontWeight: 600, lineHeight: 1.4, whiteSpace: 'nowrap',
  };

  if (status === 'candidate') {
    return <span style={{ ...baseStyle, background: 'var(--tint-green)', color: 'var(--accent)' }}>신규</span>;
  }
  if (status === 'existing') {
    return (
      <span style={{ ...baseStyle, background: 'var(--tint-blue)', color: 'var(--accent-blue)' }}
        title={`등록된 target: ${existingTarget}`}>
        ✓ 등록됨
      </span>
    );
  }
  if (status === 'conflict') {
    const list = (existingTargets || []).join(', ');
    return (
      <span style={{ ...baseStyle, background: 'var(--tint-orange)', color: 'var(--accent-orange)' }}
        title={`다른 target 으로 기록됨: ${list}`}>
        ⚠️ 다른 target
      </span>
    );
  }
  if (status === 'protected') {
    if (protectedConflict) {
      return (
        <span style={{ ...baseStyle, background: 'var(--tint-red, rgba(204,68,68,0.12))', color: 'var(--c-danger)' }}
          title="skip_words 에 있으면서 사전에도 variant 등록됨 — 보호 우선 적용">
          ⚠️ 충돌 (보호+사전)
        </span>
      );
    }
    return (
      <span style={{ ...baseStyle, background: 'var(--bg-muted)', color: 'var(--c-dim)' }}
        title="skip_words 에 등록된 보호 단어">
        🛡 보호됨
      </span>
    );
  }
  if (status === 'reorganize') {
    return <span style={{ ...baseStyle, background: 'var(--bg-subtle)', color: 'var(--c-faint)' }}>재구성</span>;
  }
  return null;
}

// ─── 버튼 스타일 ───

function btnStyle(variant, disabled) {
  const base = {
    height: 24, padding: '0 10px', borderRadius: 6,
    fontSize: '0.714rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
  };
  if (variant === 'accent') {
    return { ...base, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff' };
  }
  if (variant === 'danger') {
    return { ...base, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)' };
  }
  return { ...base, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)' };
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
/**
 * 섹션 자동 제안: after 값 기반으로 적합한 section_id 를 추정한다.
 *
 * 우선순위:
 *   1. after 가 기존 target 과 완전 일치 → 해당 섹션
 *   2. priorityOrder 섹션 순회하며 prefix/substring match
 *   3. fallback: 'general'
 */
export function suggestSection(after, variantIndex, sections) {
  if (!variantIndex || !after) return 'general';

  const direct = variantIndex.targetToSection.get(after);
  if (direct) return direct;

  const priorityOrder = ['bible_books', 'bible_names', 'jw_terms', 'jehovah', 'general'];
  for (const sid of priorityOrder) {
    const section = (sections || []).find(s => s.id === sid);
    if (!section) continue;
    for (const g of section.groups || []) {
      if (!g.target) continue;
      if (after.includes(g.target) || g.target.includes(after)) return sid;
    }
  }

  return 'general';
}

/** 성구 번호 패턴 (예: "사 53:1", "요3:16", "이사야 53:1"). */
const SCRIPTURE_PATTERN = /[가-힣]{1,4}\s?\d+\s*[:：]\s*\d+/;

/** before/after 텍스트에 성구 번호 패턴 포함 여부. */
function hasScripturePattern(text) {
  return SCRIPTURE_PATTERN.test(text || '');
}

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
