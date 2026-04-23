import { useState, useEffect } from 'react';
import { sttCorrectionsGet, sttCorrectionsSave, sttCorrectionsValidate, sttCorrectionsReload } from '../api';
import { useConfirm } from '../providers/ConfirmProvider';

export default function ManagePreprocessTab() {
  const showConfirm = useConfirm();
  // ── 전처리 state (원본 ManagePage.jsx L621-643) ──
  const [preprocData, setPreprocData] = useState(null);
  const [preprocValidation, setPreprocValidation] = useState(null);
  const [preprocBackups, setPreprocBackups] = useState([]);
  const [preprocLoading, setPreprocLoading] = useState(false);
  const [preprocSaving, setPreprocSaving] = useState(false);
  const [preprocDirty, setPreprocDirty] = useState(false);
  const [preprocStatus, setPreprocStatus] = useState('');
  const [preprocOpenSections, setPreprocOpenSections] = useState({});
  const [preprocShowWarnings, setPreprocShowWarnings] = useState(false);
  const [preprocShowBackups, setPreprocShowBackups] = useState(false);

  // ── Build-2.5C 편집 state ──
  const [preprocOriginal, setPreprocOriginal] = useState(null);
  const [preprocSearch, setPreprocSearch] = useState({});
  const [preprocInitialFilter, setPreprocInitialFilter] = useState({});
  const [preprocSelected, setPreprocSelected] = useState({});
  const [preprocEditingTarget, setPreprocEditingTarget] = useState(null);
  const [preprocEditingError, setPreprocEditingError] = useState(null);
  const [preprocAddingErrorTo, setPreprocAddingErrorTo] = useState(null);
  const [preprocAddingGroupTo, setPreprocAddingGroupTo] = useState(null);
  const [preprocSkipEditingIdx, setPreprocSkipEditingIdx] = useState(null);
  const [preprocSkipEditing, setPreprocSkipEditing] = useState({ word: '', reason: '' });
  const [preprocSkipAdding, setPreprocSkipAdding] = useState(null);

  // ── 전처리 함수 (원본 ManagePage.jsx L645-1068) ──
  const loadPreproc = async () => {
    setPreprocLoading(true);
    setPreprocStatus('');
    try {
      const r = await sttCorrectionsGet();
      setPreprocData(r.data || null);
      setPreprocOriginal(r.data ? JSON.parse(JSON.stringify(r.data)) : null);
      setPreprocValidation(r.validation || null);
      setPreprocBackups(r.backups || []);
      setPreprocDirty(false);
      setPreprocSelected({});
    } catch (e) {
      setPreprocStatus('로드 실패: ' + e.message);
    } finally {
      setPreprocLoading(false);
    }
  };

  const savePreproc = async () => {
    if (!preprocData) return;
    setPreprocSaving(true);
    setPreprocStatus('저장 중...');
    try {
      const r = await sttCorrectionsSave(preprocData);
      setPreprocValidation(r.validation || null);
      setPreprocDirty(false);
      setPreprocOriginal(JSON.parse(JSON.stringify(preprocData)));
      setPreprocSelected({});
      setPreprocStatus(`✓ 저장 완료 (백업 ${r.backup_count || 0}개)`);
      const detail = await sttCorrectionsGet();
      setPreprocBackups(detail.backups || []);
      setTimeout(() => setPreprocStatus(''), 3000);
    } catch (e) {
      setPreprocStatus('저장 실패: ' + e.message);
    } finally {
      setPreprocSaving(false);
    }
  };

  const validatePreproc = async () => {
    try {
      const r = await sttCorrectionsValidate();
      setPreprocValidation(r);
      setPreprocStatus(r.valid ? '✓ 검증 통과' : `⚠️ 경고 ${r.warnings?.length || 0}건`);
      setTimeout(() => setPreprocStatus(''), 3000);
    } catch (e) {
      setPreprocStatus('검증 실패: ' + e.message);
    }
  };

  const reloadPreproc = async () => {
    try {
      await sttCorrectionsReload();
      await loadPreproc();
      setPreprocStatus('✓ 리로드 완료');
      setTimeout(() => setPreprocStatus(''), 3000);
    } catch (e) {
      setPreprocStatus('리로드 실패: ' + e.message);
    }
  };

  const togglePreprocSection = (sectionId) => {
    if (!preprocData) return;
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s =>
        s.id === sectionId ? { ...s, enabled: !(s.enabled !== false) } : s
      ),
    });
    setPreprocDirty(true);
  };

  const togglePreprocSpecialRule = (ruleKey) => {
    if (!preprocData) return;
    const cur = preprocData.special_rules?.[ruleKey];
    setPreprocData({
      ...preprocData,
      special_rules: {
        ...preprocData.special_rules,
        [ruleKey]: { ...cur, enabled: !(cur?.enabled !== false) },
      },
    });
    setPreprocDirty(true);
  };

  const togglePreprocOpen = (id) => {
    setPreprocOpenSections(p => ({ ...p, [id]: !p[id] }));
  };

  // ── 변경 카운트 ──
  const computeChanges = () => {
    if (!preprocOriginal || !preprocData) return { added: 0, modified: 0, removed: 0 };
    let added = 0, modified = 0, removed = 0;

    preprocData.sections.forEach(section => {
      const orig = preprocOriginal.sections.find(s => s.id === section.id);
      if (!orig) return;
      if ((orig.enabled !== false) !== (section.enabled !== false)) modified++;

      section.groups?.forEach(g => {
        const og = orig.groups?.find(x => x.target === g.target);
        if (!og) {
          added += 1 + (g.errors?.length || 0);
        } else {
          g.errors?.forEach(e => {
            const oe = og.errors?.find(x => x.text === e.text);
            if (!oe) added++;
            else if ((oe.note || '') !== (e.note || '')) modified++;
          });
          og.errors?.forEach(oe => {
            if (!g.errors?.find(e => e.text === oe.text)) removed++;
          });
        }
      });
      orig.groups?.forEach(og => {
        if (!section.groups?.find(g => g.target === og.target)) {
          removed += 1 + (og.errors?.length || 0);
        }
      });
    });

    const origSkips = preprocOriginal.skip_words || [];
    const curSkips = preprocData.skip_words || [];
    curSkips.forEach(s => {
      const os = origSkips.find(x => x.word === s.word);
      if (!os) added++;
      else if ((os.reason || '') !== (s.reason || '')) modified++;
    });
    origSkips.forEach(os => {
      if (!curSkips.find(s => s.word === os.word)) removed++;
    });

    const origSR = preprocOriginal.special_rules || {};
    const curSR = preprocData.special_rules || {};
    Object.keys(curSR).forEach(k => {
      if ((origSR[k]?.enabled !== false) !== (curSR[k]?.enabled !== false)) modified++;
    });

    return { added, modified, removed };
  };

  // ── 되돌리기 ──
  const revertPreproc = async () => {
    if (!preprocOriginal) return;
    if (!await showConfirm('변경 사항을 모두 취소하고 마지막 저장 상태로 되돌리시겠습니까?', { confirmVariant: 'danger' })) return;
    setPreprocData(JSON.parse(JSON.stringify(preprocOriginal)));
    setPreprocDirty(false);
    setPreprocSelected({});
    setPreprocEditingTarget(null);
    setPreprocEditingError(null);
    setPreprocAddingErrorTo(null);
    setPreprocAddingGroupTo(null);
    setPreprocSkipEditingIdx(null);
    setPreprocSkipAdding(null);
    setPreprocStatus('✓ 되돌림 완료');
    setTimeout(() => setPreprocStatus(''), 2000);
  };

  // ── 그룹 target 편집 ──
  const startEditTarget = (sectionId, target) => {
    setPreprocEditingTarget({ sectionId, oldTarget: target, newTarget: target });
  };
  const commitEditTarget = () => {
    const { sectionId, oldTarget, newTarget } = preprocEditingTarget;
    const trimmed = newTarget.trim();
    if (!trimmed || trimmed === oldTarget) { setPreprocEditingTarget(null); return; }
    const section = preprocData.sections.find(s => s.id === sectionId);
    if (section.groups.find(g => g.target === trimmed)) {
      alert(`이미 존재하는 타겟: ${trimmed}`);
      return;
    }
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: s.groups.map(g => g.target === oldTarget ? { ...g, target: trimmed } : g),
      })),
    });
    setPreprocDirty(true);
    setPreprocEditingTarget(null);
  };

  const deleteGroup = async (sectionId, target) => {
    const section = preprocData.sections.find(s => s.id === sectionId);
    const group = section?.groups?.find(g => g.target === target);
    if (!group) return;
    if (!await showConfirm(`"${target}" 그룹을 삭제하시겠습니까? (오류 ${group.errors?.length || 0}개 함께 삭제)`, { confirmVariant: 'danger' })) return;
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: s.groups.filter(g => g.target !== target),
      })),
    });
    setPreprocDirty(true);
  };

  const startAddGroup = (sectionId) => {
    setPreprocAddingGroupTo({ sectionId, target: '', errorText: '' });
  };
  const commitAddGroup = () => {
    const { sectionId, target, errorText } = preprocAddingGroupTo;
    const t = target.trim();
    const e = errorText.trim();
    if (!t || !e) { alert('타겟과 첫 오류 텍스트 모두 입력해주세요'); return; }
    const section = preprocData.sections.find(s => s.id === sectionId);
    if (section.groups?.find(g => g.target === t)) {
      alert(`이미 존재하는 타겟: ${t}`);
      return;
    }
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: [...(s.groups || []), { target: t, errors: [{ text: e, note: '' }] }],
      })),
    });
    setPreprocDirty(true);
    setPreprocAddingGroupTo(null);
  };

  // ── 오류 편집 ──
  const startEditError = (sectionId, target, errorIndex, err) => {
    setPreprocEditingError({ sectionId, target, errorIndex, text: err.text, note: err.note || '' });
  };
  const commitEditError = () => {
    const { sectionId, target, errorIndex, text, note } = preprocEditingError;
    const trimmed = text.trim();
    if (!trimmed) { alert('오류 텍스트는 비어있을 수 없습니다'); return; }
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: s.groups.map(g => g.target !== target ? g : ({
          ...g,
          errors: g.errors.map((e, i) => i === errorIndex ? { text: trimmed, note: (note || '').trim() } : e),
        })),
      })),
    });
    setPreprocDirty(true);
    setPreprocEditingError(null);
  };

  const deleteError = async (sectionId, target, errorIndex) => {
    if (!await showConfirm('이 오류를 삭제하시겠습니까?', { confirmVariant: 'danger' })) return;
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: s.groups.map(g => {
          if (g.target !== target) return g;
          const newErrors = g.errors.filter((_, i) => i !== errorIndex);
          if (newErrors.length === 0) return null;
          return { ...g, errors: newErrors };
        }).filter(g => g !== null),
      })),
    });
    setPreprocDirty(true);
  };

  const startAddError = (sectionId, target) => {
    setPreprocAddingErrorTo({ sectionId, target, text: '', note: '' });
  };
  const commitAddError = () => {
    const { sectionId, target, text, note } = preprocAddingErrorTo;
    const t = text.trim();
    if (!t) { alert('오류 텍스트를 입력해주세요'); return; }
    const section = preprocData.sections.find(s => s.id === sectionId);
    const group = section?.groups?.find(g => g.target === target);
    if (group?.errors?.find(e => e.text === t)) {
      alert(`이미 존재하는 오류: ${t}`);
      return;
    }
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: s.groups.map(g => g.target !== target ? g : ({
          ...g,
          errors: [...(g.errors || []), { text: t, note: (note || '').trim() }],
        })),
      })),
    });
    setPreprocDirty(true);
    setPreprocAddingErrorTo(null);
  };

  // ── 일괄 선택/삭제 ──
  const toggleSelectError = (sectionId, target, errorText) => {
    setPreprocSelected(prev => {
      const next = { ...prev };
      if (!next[sectionId]) next[sectionId] = {};
      const set = new Set(next[sectionId][target] || []);
      if (set.has(errorText)) set.delete(errorText);
      else set.add(errorText);
      next[sectionId] = { ...next[sectionId], [target]: set };
      return next;
    });
  };
  const isErrorSelected = (sectionId, target, errorText) => {
    const s = preprocSelected[sectionId]?.[target];
    return s instanceof Set ? s.has(errorText) : false;
  };
  const getSelectedCountInSection = (sectionId) => {
    const s = preprocSelected[sectionId];
    if (!s) return 0;
    return Object.values(s).reduce((sum, set) => sum + (set instanceof Set ? set.size : 0), 0);
  };
  const deleteSelectedInSection = async (sectionId) => {
    const sel = preprocSelected[sectionId];
    if (!sel) return;
    const total = getSelectedCountInSection(sectionId);
    if (total === 0) return;
    if (!await showConfirm(`선택된 ${total}개 오류를 삭제하시겠습니까?`, { confirmVariant: 'danger' })) return;
    setPreprocData({
      ...preprocData,
      sections: preprocData.sections.map(s => s.id !== sectionId ? s : ({
        ...s,
        groups: s.groups.map(g => {
          const set = sel[g.target];
          if (!(set instanceof Set) || set.size === 0) return g;
          const newErrors = g.errors.filter(e => !set.has(e.text));
          if (newErrors.length === 0) return null;
          return { ...g, errors: newErrors };
        }).filter(g => g !== null),
      })),
    });
    setPreprocDirty(true);
    setPreprocSelected(prev => { const n = { ...prev }; delete n[sectionId]; return n; });
  };
  const clearSelectionInSection = (sectionId) => {
    setPreprocSelected(prev => { const n = { ...prev }; delete n[sectionId]; return n; });
  };

  // ── 검색 + 초성 필터 ──
  const setSectionSearch = (sectionId, val) => {
    setPreprocSearch(prev => ({ ...prev, [sectionId]: val }));
  };

  const getInitial = (text) => {
    if (!text) return '기타';
    const code = text.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
      const idx = Math.floor((code - 0xAC00) / 588);
      return initials[idx];
    }
    if (/[a-zA-Z]/.test(text[0])) return 'A-Z';
    if (/[0-9]/.test(text[0])) return '0-9';
    return '기타';
  };

  const normalizeInitial = (init) => {
    const map = { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' };
    return map[init] || init;
  };

  const getInitialCounts = (groups) => {
    const counts = { '전체': groups.length };
    groups.forEach(g => {
      const init = normalizeInitial(getInitial(g.target));
      counts[init] = (counts[init] || 0) + 1;
    });
    return counts;
  };

  const filterGroups = (section) => {
    const q = (preprocSearch[section.id] || '').trim().toLowerCase();
    const initial = preprocInitialFilter[section.id] || '전체';
    return (section.groups || []).filter(g => {
      if (initial !== '전체') {
        if (normalizeInitial(getInitial(g.target)) !== initial) return false;
      }
      if (!q) return true;
      if (g.target.toLowerCase().includes(q)) return true;
      return g.errors?.some(e =>
        e.text.toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q)
      );
    });
  };

  // ── 수정 제외 단어 ──
  const startAddSkip = () => setPreprocSkipAdding({ word: '', reason: '' });
  const commitAddSkip = () => {
    const w = preprocSkipAdding.word.trim();
    const r = preprocSkipAdding.reason.trim();
    if (!w) { alert('단어를 입력해주세요'); return; }
    if ((preprocData.skip_words || []).find(s => s.word === w)) {
      alert(`이미 존재하는 단어: ${w}`);
      return;
    }
    setPreprocData({
      ...preprocData,
      skip_words: [...(preprocData.skip_words || []), { word: w, reason: r }],
    });
    setPreprocDirty(true);
    setPreprocSkipAdding(null);
  };
  const startEditSkip = (idx, skip) => {
    setPreprocSkipEditingIdx(idx);
    setPreprocSkipEditing({ word: skip.word, reason: skip.reason || '' });
  };
  const commitEditSkip = () => {
    const w = preprocSkipEditing.word.trim();
    const r = preprocSkipEditing.reason.trim();
    if (!w) { alert('단어는 비어있을 수 없습니다'); return; }
    setPreprocData({
      ...preprocData,
      skip_words: preprocData.skip_words.map((s, i) =>
        i === preprocSkipEditingIdx ? { word: w, reason: r } : s
      ),
    });
    setPreprocDirty(true);
    setPreprocSkipEditingIdx(null);
  };
  const deleteSkip = async (idx) => {
    if (!await showConfirm('이 단어를 수정 제외 목록에서 삭제하시겠습니까?', { confirmVariant: 'danger' })) return;
    setPreprocData({
      ...preprocData,
      skip_words: preprocData.skip_words.filter((_, i) => i !== idx),
    });
    setPreprocDirty(true);
  };

  // 마운트 시 데이터 로드
  // 원본 ManagePage.jsx L1654: mode === 'preprocess' 시 로드.
  // 조건부 렌더링({mode === 'preprocess' && <ManagePreprocessTab />})이므로
  // 마운트 = 탭 진입. 빈 deps로 1회 로드.
  useEffect(() => {
    loadPreproc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── JSX (원본 ManagePage.jsx L6606-7139) ──
  return (
        <div>
          {preprocLoading && !preprocData && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--c-dim)' }}>
              불러오는 중...
            </div>
          )}

          {preprocData && (
            <>
              {/* 헤더: 통계 + 액션 버튼 */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 14px', background: 'var(--bg-card)', border: '1px solid var(--bd)',
                borderRadius: 8, marginBottom: 12, flexWrap: 'wrap', gap: 10,
              }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: '0.929rem', fontWeight: 700, color: 'var(--c-text-dark)' }}>
                    STT 교정 규칙
                  </div>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>
                    {preprocValidation?.stats?.total_sections || 0} 섹션 · {preprocValidation?.stats?.total_groups || 0} 그룹 · {preprocValidation?.stats?.total_errors || 0} 오류
                    {preprocValidation?.stats?.enabled_sections !== undefined && (
                      <> · 활성 {preprocValidation.stats.enabled_sections}섹션</>
                    )}
                  </div>
                  {preprocDirty && (() => {
                    const ch = computeChanges();
                    const parts = [];
                    if (ch.added > 0) parts.push(`+${ch.added}추가`);
                    if (ch.modified > 0) parts.push(`~${ch.modified}수정`);
                    if (ch.removed > 0) parts.push(`-${ch.removed}삭제`);
                    if (parts.length === 0) return null;
                    return (
                      <div style={{ fontSize: '0.714rem', color: 'var(--accent-gold)', marginTop: 2 }}>
                        ⚠️ 변경: {parts.join(' · ')}
                      </div>
                    );
                  })()}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button onClick={validatePreproc} disabled={preprocSaving}
                    style={{ padding: '5px 12px', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>
                    검증
                  </button>
                  {preprocDirty && (
                    <button onClick={revertPreproc} disabled={preprocSaving}
                      style={{ padding: '5px 12px', border: '1px solid var(--accent-gold)', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--accent-gold)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>
                      되돌리기
                    </button>
                  )}
                  <button onClick={savePreproc} disabled={!preprocDirty || preprocSaving}
                    style={{
                      padding: '5px 14px', border: '1px solid ' + (preprocDirty ? 'var(--accent-orange)' : 'var(--bd)'),
                      borderRadius: 8,
                      background: preprocDirty ? 'var(--accent-orange)' : 'var(--bg-subtle)',
                      color: preprocDirty ? '#fff' : 'var(--c-dim)',
                      fontSize: '0.786rem', fontWeight: 600,
                      cursor: preprocDirty && !preprocSaving ? 'pointer' : 'not-allowed',
                    }}>
                    {preprocSaving ? '저장 중...' : preprocDirty ? '저장 (변경 있음)' : '저장'}
                  </button>
                  <button onClick={reloadPreproc} disabled={preprocSaving}
                    style={{ padding: '5px 12px', border: '1px solid var(--bd)', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>
                    리로드
                  </button>
                </div>
              </div>

              {/* 상태 메시지 */}
              {preprocStatus && (
                <div style={{
                  padding: '6px 12px', marginBottom: 12, borderRadius: 6,
                  background: preprocStatus.includes('실패') ? '#ffebeb' : preprocStatus.includes('경고') ? '#fff5e6' : '#e6f7ed',
                  color: preprocStatus.includes('실패') ? 'var(--c-danger)' : preprocStatus.includes('경고') ? 'var(--accent-gold)' : 'var(--accent)',
                  fontSize: '0.786rem',
                }}>
                  {preprocStatus}
                </div>
              )}

              {/* 경고 배지 */}
              {preprocValidation?.warnings?.length > 0 && (
                <div style={{
                  padding: '8px 12px', marginBottom: 12, border: '1px solid var(--accent-gold)',
                  borderRadius: 8, background: '#fff5e6',
                }}>
                  <div onClick={() => setPreprocShowWarnings(p => !p)}
                    style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.857rem', fontWeight: 600, color: 'var(--accent-gold)' }}>
                    ⚠️ 경고 {preprocValidation.warnings.length}건
                    <span style={{ marginLeft: 'auto', fontSize: '0.714rem' }}>{preprocShowWarnings ? '▲' : '▼'}</span>
                  </div>
                  {preprocShowWarnings && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--accent-gold)' }}>
                      {preprocValidation.warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: '0.786rem', color: 'var(--c-text-dark)', marginBottom: 4 }}>
                          • <b>{w.section_id}</b> {w.target && `→ ${w.target}`}{w.error_text && ` (${w.error_text})`}: {w.issue}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 섹션 목록 */}
              <div style={{ marginBottom: 12 }}>
                {preprocData.sections.map(section => (
                  <div key={section.id} style={{
                    border: '1px solid var(--bd)', borderRadius: 8, marginBottom: 8,
                    background: 'var(--bg-card)', overflow: 'hidden',
                  }}>
                    <div onClick={() => togglePreprocOpen(section.id)}
                      style={{
                        padding: '10px 12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 8,
                        background: preprocOpenSections[section.id] ? 'var(--bg-subtle)' : 'transparent',
                      }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)' }}>
                          {section.name}
                          <span style={{ marginLeft: 8, fontSize: '0.714rem', color: 'var(--c-dim)', fontWeight: 400 }}>
                            {section.groups?.length || 0} 그룹 · {section.groups?.reduce((s, g) => s + (g.errors?.length || 0), 0) || 0} 오류
                          </span>
                        </div>
                        {section.description && (
                          <div style={{ fontSize: '0.714rem', color: 'var(--c-dim)', marginTop: 2 }}>
                            {section.description}
                          </div>
                        )}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}
                        onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={section.enabled !== false}
                          onChange={() => togglePreprocSection(section.id)}
                          style={{ cursor: 'pointer' }} />
                        <span style={{ fontSize: '0.714rem', color: section.enabled !== false ? 'var(--accent)' : 'var(--c-dim)' }}>
                          {section.enabled !== false ? '활성' : '비활성'}
                        </span>
                      </label>
                      <span style={{ fontSize: '0.714rem', color: 'var(--c-dim)' }}>
                        {preprocOpenSections[section.id] ? '▲' : '▼'}
                      </span>
                    </div>

                    {preprocOpenSections[section.id] && (
                      <div style={{ padding: '12px 14px', borderTop: '1px solid var(--bd)' }}>

                        {/* 섹션 도구 모음 */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                          <input type="text"
                            placeholder="검색 (타겟/오류/메모)"
                            value={preprocSearch[section.id] || ''}
                            onChange={e => setSectionSearch(section.id, e.target.value)}
                            style={{ flex: 1, minWidth: 150, padding: '5px 10px', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-card)', fontSize: '0.786rem', color: 'var(--c-text-dark)', outline: 'none' }}
                          />
                          {getSelectedCountInSection(section.id) > 0 && (
                            <>
                              <span style={{ fontSize: '0.714rem', color: 'var(--c-muted)' }}>
                                {getSelectedCountInSection(section.id)}개 선택
                              </span>
                              <button onClick={() => deleteSelectedInSection(section.id)}
                                style={{ padding: '4px 10px', border: '1px solid var(--c-danger)', borderRadius: 6, background: 'var(--c-danger)', color: '#fff', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                                선택 삭제
                              </button>
                              <button onClick={() => clearSelectionInSection(section.id)}
                                style={{ padding: '4px 10px', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer' }}>
                                선택 해제
                              </button>
                            </>
                          )}
                          <button onClick={() => startAddGroup(section.id)}
                            style={{ padding: '4px 10px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--accent)', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                            + 새 그룹
                          </button>
                        </div>

                        {/* 초성 필터 바 */}
                        {(() => {
                          const counts = getInitialCounts(section.groups || []);
                          const order = ['ㄱ','ㄴ','ㄷ','ㄹ','ㅁ','ㅂ','ㅅ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ','A-Z','0-9','기타'];
                          const current = preprocInitialFilter[section.id] || '전체';
                          return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 10 }}>
                              <button onClick={() => setPreprocInitialFilter(p => ({ ...p, [section.id]: '전체' }))}
                                style={{
                                  padding: '3px 8px',
                                  border: '1px solid var(--bd)',
                                  background: current === '전체' ? 'var(--accent)' : 'var(--bg-subtle)',
                                  color: current === '전체' ? '#fff' : 'var(--c-muted)',
                                  borderRadius: 4, fontSize: '0.714rem', cursor: 'pointer',
                                  fontWeight: current === '전체' ? 600 : 500,
                                }}>
                                전체 ({counts['전체']})
                              </button>
                              {order.map(initial => {
                                const count = counts[initial] || 0;
                                if (count === 0) return null;
                                const isActive = current === initial;
                                return (
                                  <button key={initial}
                                    onClick={() => setPreprocInitialFilter(p => ({ ...p, [section.id]: initial }))}
                                    style={{
                                      padding: '3px 8px',
                                      border: '1px solid var(--bd)',
                                      background: isActive ? 'var(--accent)' : 'var(--bg-subtle)',
                                      color: isActive ? '#fff' : 'var(--c-muted)',
                                      borderRadius: 4, fontSize: '0.714rem', cursor: 'pointer',
                                      fontWeight: isActive ? 600 : 500,
                                    }}>
                                    {initial} ({count})
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })()}

                        {/* 새 그룹 추가 폼 */}
                        {preprocAddingGroupTo?.sectionId === section.id && (
                          <div style={{ padding: 10, marginBottom: 10, border: '1px dashed var(--accent)', borderRadius: 6, background: 'var(--bg-subtle)' }}>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                              <input type="text" placeholder="타겟 (예: 여호와)" autoFocus
                                value={preprocAddingGroupTo.target}
                                onChange={e => setPreprocAddingGroupTo(p => ({ ...p, target: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Escape') setPreprocAddingGroupTo(null); }}
                                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                              />
                            </div>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="text" placeholder="첫 오류 텍스트"
                                value={preprocAddingGroupTo.errorText}
                                onChange={e => setPreprocAddingGroupTo(p => ({ ...p, errorText: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') commitAddGroup(); if (e.key === 'Escape') setPreprocAddingGroupTo(null); }}
                                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                              />
                              <button onClick={commitAddGroup}
                                style={{ padding: '4px 12px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', borderRadius: 4, fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                                추가
                              </button>
                              <button onClick={() => setPreprocAddingGroupTo(null)}
                                style={{ padding: '4px 10px', border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', borderRadius: 4, fontSize: '0.714rem', cursor: 'pointer' }}>
                                취소
                              </button>
                            </div>
                          </div>
                        )}

                        {/* 그룹 목록 */}
                        {filterGroups(section).map(group => (
                          <div key={group.target} style={{
                            padding: '8px 10px', marginBottom: 6, border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-card)',
                          }}>
                            {/* 그룹 헤더 */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              {preprocEditingTarget?.sectionId === section.id && preprocEditingTarget?.oldTarget === group.target ? (
                                <>
                                  <input type="text" value={preprocEditingTarget.newTarget} autoFocus
                                    onChange={e => setPreprocEditingTarget(p => ({ ...p, newTarget: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') commitEditTarget(); if (e.key === 'Escape') setPreprocEditingTarget(null); }}
                                    style={{ flex: 1, padding: '3px 8px', border: '1px solid var(--accent-blue)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontWeight: 600, outline: 'none' }}
                                  />
                                  <button onClick={commitEditTarget}
                                    style={{ padding: '2px 8px', border: '1px solid var(--accent-blue)', background: 'var(--accent-blue)', color: '#fff', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>확인</button>
                                  <button onClick={() => setPreprocEditingTarget(null)}
                                    style={{ padding: '2px 8px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                                </>
                              ) : (
                                <>
                                  <span style={{ flex: 1, fontSize: '0.857rem', fontWeight: 600, color: 'var(--accent)' }}>
                                    {group.target}
                                  </span>
                                  <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>
                                    ({group.errors?.length || 0})
                                  </span>
                                  <button onClick={() => startEditTarget(section.id, group.target)}
                                    style={{ padding: '2px 6px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>편집</button>
                                  <button onClick={() => deleteGroup(section.id, group.target)}
                                    style={{ padding: '2px 6px', border: '1px solid var(--c-danger)', background: 'var(--bg-subtle)', color: 'var(--c-danger)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                                </>
                              )}
                            </div>

                            {/* 오류 목록 */}
                            <div style={{ paddingLeft: 8 }}>
                              {group.errors?.map((err, errIdx) => {
                                const isEditing = preprocEditingError?.sectionId === section.id &&
                                                  preprocEditingError?.target === group.target &&
                                                  preprocEditingError?.errorIndex === errIdx;
                                const isSelected = isErrorSelected(section.id, group.target, err.text);
                                return (
                                  <div key={errIdx} style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px',
                                    background: isSelected ? 'rgba(245, 166, 35, 0.15)' : 'transparent', borderRadius: 4,
                                    marginBottom: 2,
                                  }}>
                                    {isEditing ? (
                                      <>
                                        <input type="text" value={preprocEditingError.text} autoFocus
                                          onChange={e => setPreprocEditingError(p => ({ ...p, text: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Enter') commitEditError(); if (e.key === 'Escape') setPreprocEditingError(null); }}
                                          placeholder="오류 텍스트"
                                          style={{ flex: 1, padding: '3px 8px', border: '1px solid var(--accent-blue)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                                        />
                                        <input type="text" value={preprocEditingError.note}
                                          onChange={e => setPreprocEditingError(p => ({ ...p, note: e.target.value }))}
                                          onKeyDown={e => { if (e.key === 'Enter') commitEditError(); if (e.key === 'Escape') setPreprocEditingError(null); }}
                                          placeholder="메모 (선택)"
                                          style={{ width: 120, padding: '3px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.714rem', background: 'var(--bg-card)', color: 'var(--c-dim)', outline: 'none' }}
                                        />
                                        <button onClick={commitEditError}
                                          style={{ padding: '2px 8px', border: '1px solid var(--accent-blue)', background: 'var(--accent-blue)', color: '#fff', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>확인</button>
                                        <button onClick={() => setPreprocEditingError(null)}
                                          style={{ padding: '2px 8px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                                      </>
                                    ) : (
                                      <>
                                        <input type="checkbox" checked={isSelected}
                                          onChange={() => toggleSelectError(section.id, group.target, err.text)}
                                          style={{ cursor: 'pointer' }}
                                        />
                                        <span style={{ flex: 1, fontSize: '0.786rem', color: 'var(--c-text-dark)' }}>
                                          {err.text}
                                        </span>
                                        {err.note && (
                                          <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', fontStyle: 'italic' }}>
                                            ({err.note})
                                          </span>
                                        )}
                                        <button onClick={() => startEditError(section.id, group.target, errIdx, err)}
                                          style={{ padding: '1px 6px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>편집</button>
                                        <button onClick={() => deleteError(section.id, group.target, errIdx)}
                                          style={{ padding: '1px 6px', border: '1px solid var(--c-danger)', background: 'var(--bg-subtle)', color: 'var(--c-danger)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>×</button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}

                              {/* 새 오류 추가 폼 */}
                              {preprocAddingErrorTo?.sectionId === section.id && preprocAddingErrorTo?.target === group.target ? (
                                <div style={{ display: 'flex', gap: 6, padding: '4px 6px', marginTop: 4 }}>
                                  <input type="text" placeholder="오류 텍스트" autoFocus
                                    value={preprocAddingErrorTo.text}
                                    onChange={e => setPreprocAddingErrorTo(p => ({ ...p, text: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') commitAddError(); if (e.key === 'Escape') setPreprocAddingErrorTo(null); }}
                                    style={{ flex: 1, padding: '3px 8px', border: '1px solid var(--accent)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                                  />
                                  <input type="text" placeholder="메모"
                                    value={preprocAddingErrorTo.note}
                                    onChange={e => setPreprocAddingErrorTo(p => ({ ...p, note: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') commitAddError(); if (e.key === 'Escape') setPreprocAddingErrorTo(null); }}
                                    style={{ width: 120, padding: '3px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.714rem', background: 'var(--bg-card)', color: 'var(--c-dim)', outline: 'none' }}
                                  />
                                  <button onClick={commitAddError}
                                    style={{ padding: '2px 10px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>추가</button>
                                  <button onClick={() => setPreprocAddingErrorTo(null)}
                                    style={{ padding: '2px 8px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                                </div>
                              ) : (
                                <button onClick={() => startAddError(section.id, group.target)}
                                  style={{ padding: '2px 8px', marginTop: 4, border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-dim)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>
                                  + 오류 추가
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* 검색 결과 없음 */}
                        {filterGroups(section).length === 0 && preprocSearch[section.id] && (
                          <div style={{ textAlign: 'center', padding: 20, color: 'var(--c-dim)', fontSize: '0.786rem' }}>
                            검색 결과 없음: "{preprocSearch[section.id]}"
                          </div>
                        )}

                        {/* 그룹 없음 */}
                        {(section.groups || []).length === 0 && !preprocSearch[section.id] && (
                          <div style={{ textAlign: 'center', padding: 20, color: 'var(--c-dim)', fontSize: '0.786rem' }}>
                            그룹 없음. [+ 새 그룹] 버튼으로 추가하세요.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 특수 규칙 */}
              {preprocData.special_rules && (
                <div style={{
                  border: '1px solid var(--bd)', borderRadius: 8, marginBottom: 8,
                  background: 'var(--bg-card)', padding: '12px 14px',
                }}>
                  <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)', marginBottom: 8 }}>
                    특수 규칙
                  </div>
                  {Object.entries(preprocData.special_rules).map(([key, rule]) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flex: 1 }}>
                        <input type="checkbox" checked={rule?.enabled !== false}
                          onChange={() => togglePreprocSpecialRule(key)}
                          style={{ cursor: 'pointer' }} />
                        <span style={{ fontSize: '0.786rem', color: 'var(--c-text-dark)' }}>
                          {rule?.description || key}
                        </span>
                      </label>
                    </div>
                  ))}
                </div>
              )}

              {/* 수정 제외 단어 (편집 가능) */}
              <div style={{
                border: '1px solid var(--bd)', borderRadius: 8, marginBottom: 8,
                background: 'var(--bg-card)', padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)', flex: 1 }}>
                    수정 제외 단어 <span style={{ fontSize: '0.714rem', color: 'var(--c-dim)', fontWeight: 400 }}>({(preprocData.skip_words || []).length})</span>
                  </div>
                  <button onClick={startAddSkip}
                    style={{ padding: '3px 10px', border: '1px solid var(--accent)', borderRadius: 6, background: 'var(--bg-subtle)', color: 'var(--accent)', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                    + 단어 추가
                  </button>
                </div>

                {/* 추가 폼 */}
                {preprocSkipAdding && (
                  <div style={{ display: 'flex', gap: 6, padding: 8, marginBottom: 8, border: '1px dashed var(--accent)', borderRadius: 6, background: 'var(--bg-subtle)' }}>
                    <input type="text" placeholder="단어" autoFocus
                      value={preprocSkipAdding.word}
                      onChange={e => setPreprocSkipAdding(p => ({ ...p, word: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') commitAddSkip(); if (e.key === 'Escape') setPreprocSkipAdding(null); }}
                      style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                    />
                    <input type="text" placeholder="이유 (선택)"
                      value={preprocSkipAdding.reason}
                      onChange={e => setPreprocSkipAdding(p => ({ ...p, reason: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') commitAddSkip(); if (e.key === 'Escape') setPreprocSkipAdding(null); }}
                      style={{ flex: 2, padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                    />
                    <button onClick={commitAddSkip}
                      style={{ padding: '3px 12px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', borderRadius: 4, fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>추가</button>
                    <button onClick={() => setPreprocSkipAdding(null)}
                      style={{ padding: '3px 10px', border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', borderRadius: 4, fontSize: '0.714rem', cursor: 'pointer' }}>취소</button>
                  </div>
                )}

                {/* 단어 목록 */}
                {(preprocData.skip_words || []).map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', marginBottom: 2 }}>
                    {preprocSkipEditingIdx === idx ? (
                      <>
                        <input type="text" value={preprocSkipEditing.word} autoFocus
                          onChange={e => setPreprocSkipEditing(p => ({ ...p, word: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') commitEditSkip(); if (e.key === 'Escape') setPreprocSkipEditingIdx(null); }}
                          style={{ flex: 1, padding: '3px 8px', border: '1px solid var(--accent-blue)', borderRadius: 4, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                        />
                        <input type="text" value={preprocSkipEditing.reason} placeholder="이유"
                          onChange={e => setPreprocSkipEditing(p => ({ ...p, reason: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') commitEditSkip(); if (e.key === 'Escape') setPreprocSkipEditingIdx(null); }}
                          style={{ flex: 2, padding: '3px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.714rem', background: 'var(--bg-card)', color: 'var(--c-dim)', outline: 'none' }}
                        />
                        <button onClick={commitEditSkip}
                          style={{ padding: '2px 8px', border: '1px solid var(--accent-blue)', background: 'var(--accent-blue)', color: '#fff', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>확인</button>
                        <button onClick={() => setPreprocSkipEditingIdx(null)}
                          style={{ padding: '2px 8px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: '0.786rem', color: 'var(--c-text-dark)', fontWeight: 600 }}>
                          {s.word}
                        </span>
                        {s.reason && (
                          <span style={{ flex: 2, fontSize: '0.714rem', color: 'var(--c-dim)', fontStyle: 'italic' }}>
                            {s.reason}
                          </span>
                        )}
                        <button onClick={() => startEditSkip(idx, s)}
                          style={{ padding: '1px 6px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>편집</button>
                        <button onClick={() => deleteSkip(idx)}
                          style={{ padding: '1px 6px', border: '1px solid var(--c-danger)', background: 'var(--bg-subtle)', color: 'var(--c-danger)', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer' }}>×</button>
                      </>
                    )}
                  </div>
                ))}

                {(preprocData.skip_words || []).length === 0 && !preprocSkipAdding && (
                  <div style={{ textAlign: 'center', padding: 14, color: 'var(--c-dim)', fontSize: '0.714rem' }}>
                    등록된 제외 단어가 없습니다
                  </div>
                )}
              </div>

              {/* 백업 목록 */}
              {preprocBackups.length > 0 && (
                <div style={{
                  border: '1px solid var(--bd)', borderRadius: 8, marginBottom: 8,
                  background: 'var(--bg-card)',
                }}>
                  <div onClick={() => setPreprocShowBackups(p => !p)}
                    style={{
                      padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                    <div style={{ flex: 1, fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)' }}>
                      자동 백업 <span style={{ fontSize: '0.714rem', color: 'var(--c-dim)', fontWeight: 400 }}>({preprocBackups.length}개 · 최대 10개 FIFO)</span>
                    </div>
                    <span style={{ fontSize: '0.714rem', color: 'var(--c-dim)' }}>
                      {preprocShowBackups ? '▲' : '▼'}
                    </span>
                  </div>
                  {preprocShowBackups && (
                    <div style={{ padding: '12px 14px', borderTop: '1px solid var(--bd)' }}>
                      {preprocBackups.map((b, i) => (
                        <div key={i} style={{
                          padding: '4px 0', fontSize: '0.714rem', color: 'var(--c-text-dark)',
                          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
                        }}>
                          <span style={{ fontFamily: 'monospace' }}>{b.filename}</span>
                          <span style={{ color: 'var(--c-dim)' }}>
                            {(b.size_bytes / 1024).toFixed(1)}KB · {new Date(b.created_at).toLocaleString('ko-KR')}
                          </span>
                        </div>
                      ))}
                      <div style={{ marginTop: 10, fontSize: '0.714rem', color: 'var(--c-dim)', fontStyle: 'italic' }}>
                        경로: ~/jw-system/stt_corrections_backups/
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
  );
}
