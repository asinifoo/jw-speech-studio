import { useState, useEffect, useRef, Fragment } from 'react';
import KoreanTextarea from '../components/KoreanTextarea';
import PresetPills from '../components/PresetPills';
import EditableBlock from '../components/EditableBlock';
import AiModelSelector from '../components/AiModelSelector';
import { S } from '../styles';
import RefinePanel from '../components/RefinePanel';
import GenerateButton from '../components/GenerateButton';
import WolFiltersPanel from '../components/WolFiltersPanel';
import { parseDocument, cleanMd, sourceLabel, parseKeywords } from '../components/utils';
import { getOutlinePrefix } from '../utils/outlineFormat';
import { getBody } from '../utils/textHelpers';
import { bibleSearch, freeSearch, filterResults, generateServiceMeetingStream, getCategories, searchPast, listBySource, abortGeneration, dbUpdate } from '../api';
import { useAlert } from '../providers/AlertProvider';

export default function VisitPage({ fontSize, ai }) {
  const showAlert = useAlert();
  const _vs = (() => { try { return JSON.parse(localStorage.getItem('jw-visit-state')); } catch(e) { return null; } })();
  const [ageGroup, setAgeGroup] = useState(_vs?.ageGroup || '');
  // 카테고리 = [구조화] 편집 (categories.json). 방문은 자동 발견 API 없음 — getCategories 만.
  // localStorage 'jw-cats-visit-sit' 의존 폐기.
  // jw-cats-cache-visit-sit 는 FOUC 방지 캐시 (mount 즉시 표시 + 백그라운드 갱신).
  const [situations, setSituations] = useState(() => {
    try { return JSON.parse(localStorage.getItem('jw-cats-cache-visit-sit')) || []; }
    catch { return []; }
  });
  const [selSits, setSelSits] = useState(() => new Set(_vs?.selSits || []));
  const [scriptures, setScriptures] = useState(_vs?.scriptures || '');
  const [duration, setDuration] = useState(_vs?.duration || '');
  const [notes, setNotes] = useState(_vs?.notes || '');
  const [searchQuery, setSearchQuery] = useState(_vs?.searchQuery || '');
  const [pastVisits, setPastVisits] = useState(_vs?.pastVisits || []);
  const [pastLoading, setPastLoading] = useState(false);
  const [selectedPast, setSelectedPast] = useState(_vs?.selectedPast || {});
  const [expandedPast, setExpandedPast] = useState({});
  const [searchResults, setSearchResults] = useState(_vs?.searchResults || []);
  const [useLLMFilter, setUseLLMFilter] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showAllResults, setShowAllResults] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedSearch, setSelectedSearch] = useState(_vs?.selectedSearch || {});
  const [expandedSearch, setExpandedSearch] = useState({});
  const [pastEditIdx, setPastEditIdx] = useState(null);
  const [pastEditText, setPastEditText] = useState({});
  const [pastDbIdx, setPastDbIdx] = useState(null);
  const [pastDbMeta, setPastDbMeta] = useState({});
  const [pastDbText, setPastDbText] = useState('');
  const [pastDbStatus, setPastDbStatus] = useState('');
  const [srEditIdx, setSrEditIdx] = useState(null);
  const [srEditText, setSrEditText] = useState({});
  const [srDbIdx, setSrDbIdx] = useState(null);
  const [srDbMeta, setSrDbMeta] = useState({});
  const [srDbText, setSrDbText] = useState('');
  const [srDbStatus, setSrDbStatus] = useState('');
  const [autoScriptures, setAutoScriptures] = useState(_vs?.autoScriptures || []);
  const [script, setScript] = useState(() => { try { return localStorage.getItem('jw-visit-script') || ''; } catch(e) { return ''; } });
  useEffect(() => { try { if (script) localStorage.setItem('jw-visit-script', script); else localStorage.removeItem('jw-visit-script'); } catch(e) {} }, [script]);
  // 카테고리 동기화: [구조화] 편집 결과 (categories.json) mount 시 1회 호출 + 캐시 업데이트
  useEffect(() => {
    getCategories().then(r => {
      const next = r.visit_situations || [];
      setSituations(next);
      try { localStorage.setItem('jw-cats-cache-visit-sit', JSON.stringify(next)); } catch {}
    }).catch(() => {});
  }, []);
  // 옛 localStorage 키 1회성 cleanup
  useEffect(() => {
    ['jw-cats-service', 'jw-cats-visit-sit'].forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem('jw-visit-state', JSON.stringify({
        ageGroup, selSits: [...selSits], scriptures, duration, notes, searchQuery, searchResults, selectedSearch, selectedPast, pastVisits, autoScriptures,
      }));
    } catch(e) {}
  }, [ageGroup, selSits, scriptures, duration, notes, searchQuery, searchResults, selectedSearch, selectedPast, pastVisits, autoScriptures]);
  const [generating, setGenerating] = useState(false);
  const abortRef = useRef(null);
  const [streamProgress, setStreamProgress] = useState(0);
  const [streamMsg, setStreamMsg] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [visitPreset, setVisitPreset] = useState('');
  const [extraMat, setExtraMat] = useState('');
  const [phase, setPhase] = useState(() => {
    try {
      if (localStorage.getItem('jw-visit-script')) return 2;
      const vs = JSON.parse(localStorage.getItem('jw-visit-state'));
      if (vs?.searchResults?.length > 0 || vs?.pastVisits?.length > 0) return 1;
      return 0;
    } catch(e) { return 0; }
  });

  const toggleSit = (t) => setSelSits(prev => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; });
  const hasInput = ageGroup || selSits.size > 0 || scriptures.trim() || searchQuery.trim();

  const doSearch = async () => {
    const q = [ageGroup, [...selSits].join(' '), scriptures, searchQuery].filter(Boolean).join(' ').trim();
    if (!q) return;
    setSearchLoading(true); setPastLoading(true); setSelectedPast({});
    setShowAllResults(false); setShowAllPast(false);
    try {
      const [res, pastRes] = await Promise.all([
        freeSearch(q, 40),
        listBySource('visit', 100),
      ]);
      let results = (res.results || []).filter(r => {
        const src = r.metadata?.source || '';
        const col = r.collection || '';
        return col !== 'speech_points' && src !== 'speaker_memo' && src !== 'outline';
      });
      if (useLLMFilter && results.length > 0) {
        const filtered = await filterResults([{ title: q, search_results: results }]);
        results = filtered.points?.[0]?.search_results || results;
      } else {
        results = results.map(r => ({ ...r, filtered: false }));
      }
      const initSel = {};
      results.forEach((r, i) => { initSel[i] = !r.filtered; });
      setSelectedSearch(initSel);
      setSearchResults(results);
      setPastVisits((pastRes.entries || []).sort((a, b) => {
        const ma = a.metadata || {}, mb = b.metadata || {};
        const fa = ma.favorite === 'true' ? 1 : 0, fb = mb.favorite === 'true' ? 1 : 0;
        if (fa !== fb) return fb - fa;
        const ra = parseInt(ma.rating || '0'), rb = parseInt(mb.rating || '0');
        if (ra !== rb) return rb - ra;
        return (mb.date || '').localeCompare(ma.date || '');
      }));
    } catch (e) { showAlert('검색 오류: ' + e.message, { variant: 'error' }); }
    finally { setSearchLoading(false); setPastLoading(false); }
    if (scriptures.trim()) {
      try { const bRes = await bibleSearch(scriptures); setAutoScriptures(bRes.results || []); } catch(e) { setAutoScriptures([]); }
    }
    setPhase(1);
  };

  const doGenerate = async () => {
    if (!password) { setError('비밀번호를 입력하세요'); return; }
    setGenerating(true); setError(''); setScript(''); setStreamProgress(0); setStreamMsg('준비 중...');
    try {
      const selPast = pastVisits.filter((_, i) => selectedPast[i]);
      const selSearch = searchResults.filter((_, i) => selectedSearch[i] !== false);
      let streamedText = '';
      const ac = new AbortController();
      abortRef.current = ac;
      await generateServiceMeetingStream(password, {
        topic: `양치는 방문 (연령대: ${ageGroup || '미지정'}, 상황: ${[...selSits].join(', ') || '일반'})`,
        scriptures, notes: [duration ? `시간: ${/^\d+$/.test(duration.trim()) ? duration.trim() + '분' : duration}` : '', visitPreset, notes].filter(Boolean).join('\n'),
        past_meetings: selPast, search_results: selSearch, auto_scriptures: autoScriptures, visit_mode: true, model: ai.aiModel,
        extra_materials: extraMat,
      }, (ev) => {
        if (ev.stage === 'calling') { setStreamProgress(ev.progress); setStreamMsg('AI 호출 중…'); }
        else if (ev.stage === 'streaming') { streamedText += ev.chunk; setStreamProgress(ev.progress); setStreamMsg('생성 중...'); setScript(streamedText); }
        else if (ev.stage === 'done') { setStreamProgress(100); setStreamMsg('완료'); setScript(ev.script); }
        else if (ev.stage === 'error') { setError('생성 오류: ' + ev.message); }
      }, ac.signal);
      setPhase(2);
    } catch (e) { if (e.name !== 'AbortError') setError('생성 오류: ' + e.message); }
    finally { abortRef.current = null; setGenerating(false); setStreamProgress(0); setStreamMsg(''); }
  };

  const iS = { padding: '6px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 14, overflow: 'hidden' }}>
        {/* 입력 영역 */}
        <div style={{ padding: '12px 14px 8px' }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>연령대</div>
            <div style={S.pillContainer}>
              {['청소년', '청년', '중년', '장년'].map(s => (
                <button key={s} onClick={() => setAgeGroup(ageGroup === s ? '' : s)} style={S.pillScroll(ageGroup === s, 'var(--accent-orange)')}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>고려한 상황</div>
            <div style={{ ...S.pillContainer, flexWrap: 'wrap' }}>
              {situations.map(t => (
                <button key={t} onClick={() => toggleSit(t)} style={S.pillScroll(selSits.has(t), 'var(--accent-blue)')}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={scriptures} onChange={e => setScriptures(e.target.value)} placeholder="핵심 성구: 시 55:22; 요 4:31-34"
              style={{ flex: 1, minWidth: 0, padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: '0.929rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
            <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="시간"
              style={{ width: 70, flexShrink: 0, padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.929rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box', textAlign: 'center' }} />
          </div>
          <textarea value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="추가 검색어 (선택)" rows={3}
            style={{ width: '100%', padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: '0.929rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.7 }} />
        </div>
        {/* 하단 바 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
          borderTop: '1px solid var(--bd-light)',
        }}>
          <button onClick={() => { const next = !useLLMFilter; setUseLLMFilter(next); if (!next) setShowFilters(false); }} style={{
            padding: '4px 10px', borderRadius: 8, border: 'none',
            background: useLLMFilter ? '#7F77DD15' : 'var(--bg-subtle, #EFEFF4)',
            color: useLLMFilter ? 'var(--accent-purple)' : 'var(--c-muted)',
            fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            {useLLMFilter ? '✓' : '○'} LLM 필터
            {useLLMFilter && <span onClick={e => { e.stopPropagation(); setShowFilters(p => !p); }}
              style={{ color: showFilters ? 'var(--accent-brown)' : '#7F77DD80', fontSize: '1.286rem', lineHeight: 0 }}>▾</span>}
          </button>
          <div style={{ flex: 1 }} />
          {(hasInput || searchResults.length > 0) && (
            <button onClick={() => { setPhase(0); setScript(''); setSearchResults([]); setAutoScriptures([]); setPastVisits([]); setSelectedPast({}); setSelectedSearch({}); setAgeGroup(''); setSelSits(new Set()); setScriptures(''); setNotes(''); setSearchQuery(''); setError(''); }}
              style={{
                width: 22, height: 22, borderRadius: 11, border: 'none', padding: 0,
                background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)',
                fontSize: '0.929rem', cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
          )}
          <button onClick={doSearch} disabled={searchLoading || !hasInput} style={{
            width: 80, padding: '5px 0', borderRadius: 8, border: 'none', textAlign: 'center',
            background: searchLoading || !hasInput ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
            fontSize: '0.786rem', fontWeight: 700, cursor: searchLoading || !hasInput ? 'default' : 'pointer',
            transition: 'background 0.15s', position: 'relative', overflow: 'hidden',
          }}>
            {searchLoading && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
            <span style={{ position: 'relative', zIndex: 1 }}>검색</span>
          </button>
        </div>
        {showFilters && <div style={{ padding: '4px 14px 8px' }}><WolFiltersPanel compact={false} /></div>}
        {useLLMFilter && ai.llmSettings && (
          <div style={{ padding: '2px 14px 6px', fontSize: '0.786rem', color: 'var(--c-muted)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span>필터: <b style={{ color: 'var(--accent-purple)' }}>{Object.values(ai.aiModels).flat().find(m => m.value === ai.llmSettings.filter_model)?.label || ai.llmSettings.filter_model}</b></span>
            <span>·</span>
            <span>CTX: <b>{(ai.llmSettings.filter_ctx / 1024).toFixed(0)}K</b></span>
            <span>·</span>
            <span>🧠 <b>{ai.llmSettings.filter_no_think ? 'OFF' : 'ON'}</b></span>
          </div>
        )}
      </div>

      {/* 성구 */}
      {autoScriptures.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-hint)', marginBottom: 6 }}>성구</div>
          {autoScriptures.map((a, i) => (
            <div key={i} style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--tint-blue)', border: '1px solid var(--tint-blue-bd)', marginBottom: 6 }}>
              <span style={{ fontSize: '0.857rem', fontWeight: 700, color: '#2a7ab5' }}>{a.original || a.book}</span>
              <div style={{ marginTop: 4, fontSize: '0.929rem', lineHeight: 1.8 }}>
                {(a.verses || []).map((v, vi) => (
                  <div key={vi} style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                    {(a.verses || []).length > 1 && <span style={{ color: '#2a7ab5', fontWeight: 700, minWidth: 16, textAlign: 'right', flexShrink: 0 }}>{v.verse}</span>}
                    <span>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 과거 방문 */}
      {phase >= 1 && pastLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.857rem', marginBottom: 14 }}>과거 방문 검색 중...</div>}
      {phase >= 1 && !pastLoading && pastVisits.length === 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-hint)', marginBottom: 6 }}>과거 방문 (0건)</div>
          <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', padding: 8 }}>저장된 방문이 없습니다. Manage {'>'} Add에서 추가하세요.</div>
        </div>
      )}
      {phase >= 1 && !pastLoading && pastVisits.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-hint)', marginBottom: 6 }}>과거 방문 ({pastVisits.length}건)</div>
          {(showAllPast ? pastVisits : pastVisits.slice(0, 10)).map((pm, i) => {
            const meta = pm.metadata || {};
            const parsed = parseDocument(pm.text || '');
            const displayBody = pastEditText[i] !== undefined ? pastEditText[i] : getBody(pm.text || '');
            const originalBody = getBody(pm.text || '');
            const isEdited = pastEditText[i] !== undefined && pastEditText[i] !== originalBody;
            const sel = !!selectedPast[i];
            const rt = parseInt(meta.rating || '0');
            return (
              <div key={i} style={{ borderRadius: 8, border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--bd-soft)'), background: sel ? 'var(--tint-green-bg)' : 'var(--bg-card)', marginBottom: 6, overflow: 'hidden' }}>
                <div onClick={() => setSelectedPast(p => ({ ...p, [i]: !p[i] }))} style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: sel ? 'var(--tint-green)' : 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel} readOnly style={{ accentColor: 'var(--accent)' }} />
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-hint)', fontWeight: 600 }}>{meta.date || '?'}</span>
                  {meta.visit_target && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 3, background: '#D85A3015', color: 'var(--accent-orange)', fontWeight: 600 }}>{meta.visit_target}</span>}
                  {meta.situation && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 3, background: 'var(--tint-blue-light)', color: 'var(--accent-blue)', fontWeight: 600 }}>{meta.situation}</span>}
                  {meta.favorite === 'true' && <span style={{ fontSize: '0.714rem', color: 'var(--accent-gold)' }}>★</span>}
                  {rt > 0 && <span style={{ fontSize: '0.571rem', color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(rt)}{'☆'.repeat(5 - rt)}</span>}
                  {isEdited && <span style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: 'var(--tint-blue)', color: 'var(--accent-blue)', fontWeight: 600 }}>편집됨</span>}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { if (pastEditIdx === i) { setPastEditIdx(null); } else { setPastEditIdx(i); setPastDbIdx(null); } }} style={{
                      ...S.btnXs,
                    }}>수정</button>
                    <button onClick={() => { if (pastDbIdx === i) { setPastDbIdx(null); } else { setPastDbIdx(i); setPastEditIdx(null); setPastDbText(pm.text || ''); setPastDbMeta({ ...meta, rating: rt, favorite: meta.favorite === 'true' }); setPastDbStatus(''); } }} style={{
                      ...S.btnXsDanger,
                    }}>DB</button>
                  </div>
                </div>
                <div style={{ padding: '8px 10px', fontSize: '0.786rem', color: 'var(--c-faint)' }}>
                  {(parsed?.scripture || meta.scriptures) && <span style={{ marginRight: 8, color: '#2D8FC7' }}>성구: {cleanMd(parsed?.scripture || meta.scriptures || '')}</span>}
                  {(meta.pub_code || parsed?.pubCode) && <span style={{ marginRight: 8, color: 'var(--accent-purple)' }}>{meta.pub_code || parsed?.pubCode}</span>}
                  {parseKeywords(parsed?.keywords || meta.keywords).map((kw, ki) => (
                    <span key={ki} style={{ display: 'inline-block', fontSize: '0.786rem', padding: '0 5px', borderRadius: 3, background: 'var(--bg-muted)', color: '#777', marginRight: 3, marginBottom: 2 }}>{kw}</span>
                  ))}
                </div>
                {pastEditIdx === i && (
                  <div style={{ padding: '6px 10px', borderTop: '1px solid var(--tint-blue-bd)', background: 'var(--tint-blue-soft)' }}>
                    <textarea value={displayBody} onChange={e => setPastEditText(p => ({ ...p, [i]: e.target.value }))} rows={6}
                      style={{ display: 'block', width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {isEdited && <button onClick={() => setPastEditText(p => { const n = { ...p }; delete n[i]; return n; })} style={{ ...S.btnXs }}>원래대로</button>}
                      <button onClick={() => setPastEditIdx(null)} style={{ ...S.btnXs }}>{isEdited ? '확인' : '취소'}</button>
                    </div>
                  </div>
                )}
                {pastDbIdx === i && (
                  <div style={{ padding: '8px 10px', borderTop: '1px solid var(--tint-red-bd)' }}>
                    <div style={{ fontSize: '0.714rem', fontWeight: 600, color: 'var(--c-danger)', marginBottom: 6 }}>DB 직접 편집</div>
                    <textarea value={pastDbText} onChange={e => setPastDbText(e.target.value)} rows={6}
                      style={{ display: 'block', width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 6 }} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={() => setPastDbMeta(p => ({ ...p, rating: p.rating === n ? 0 : n }))} style={{
                            width: 28, height: 28, borderRadius: 6, border: '1px solid ' + (n <= (pastDbMeta.rating || 0) ? 'var(--accent-gold)' : 'var(--bd)'),
                            background: n <= (pastDbMeta.rating || 0) ? '#F5A62318' : 'var(--bg-card)', color: n <= (pastDbMeta.rating || 0) ? 'var(--accent-gold)' : 'var(--c-dim)',
                            fontSize: '0.714rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}>{n}</button>
                        ))}
                      </div>
                      <button onClick={() => setPastDbMeta(p => ({ ...p, favorite: !p.favorite }))} style={{
                        padding: '3px 10px', borderRadius: 6, border: '1px solid ' + (pastDbMeta.favorite ? 'var(--accent-gold)' : 'var(--bd)'),
                        background: pastDbMeta.favorite ? '#F5A62318' : 'var(--bg-card)', color: pastDbMeta.favorite ? 'var(--accent-gold)' : 'var(--c-dim)',
                        fontSize: '0.786rem', cursor: 'pointer', fontWeight: 700,
                      }}>{pastDbMeta.favorite ? '★' : '☆'}</button>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <input type="text" value={pastDbMeta.rating_note || ''} onChange={e => setPastDbMeta(p => ({ ...p, rating_note: e.target.value }))} placeholder="별점 이유 / 선호 이유"
                        style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-card)', fontSize: '0.786rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={async () => {
                        setPastDbStatus('저장 중...');
                        try {
                          const saveMeta = { ...pastDbMeta, rating: String(pastDbMeta.rating || 0), favorite: pastDbMeta.favorite ? 'true' : 'false', rating_note: pastDbMeta.rating_note || '' };
                          await dbUpdate(pm.collection || 'speech_expressions', pm.id, pastDbText, saveMeta);
                          setPastVisits(p => p.map((x, j) => j === i ? { ...x, text: pastDbText, metadata: saveMeta } : x));
                          setPastDbStatus('저장 완료');
                          setTimeout(() => { setPastDbStatus(''); setPastDbIdx(null); }, 1000);
                        } catch (e) { setPastDbStatus('오류: ' + e.message); }
                      }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-orange)', background: 'var(--accent-orange)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>DB 저장</button>
                      <button onClick={() => { setPastDbIdx(null); setPastDbStatus(''); }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                      {pastDbStatus && <span style={{ fontSize: '0.714rem', color: pastDbStatus.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{pastDbStatus}</span>}
                    </div>
                  </div>
                )}
                {pastEditIdx !== i && pastDbIdx !== i && (
                  <div className={expandedPast[i] ? 'chat-input' : ''} style={{ margin: '0 10px', padding: '8px 0 10px', borderTop: '1px solid var(--bd-light)', fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-sub)', ...(expandedPast[i] ? { maxHeight: 280, overflowY: 'auto' } : {}), whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                    {displayBody.length > 150 && !expandedPast[i] ? displayBody.slice(0, 150) + '...' : displayBody}
                  </div>
                )}
                {pastEditIdx !== i && pastDbIdx !== i && displayBody.length > 150 && (
                  <div style={{ padding: '2px 10px 6px' }}>
                    <button onClick={(e) => { e.stopPropagation(); setExpandedPast(p => ({ ...p, [i]: !p[i] })); }} style={{
                      padding: '2px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
                    }}>{expandedPast[i] ? '접기' : '전체 보기'}</button>
                  </div>
                )}
              </div>
            );
          })}
          {!showAllPast && pastVisits.length > 10 && (
            <button onClick={() => setShowAllPast(true)} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer', marginTop: 6 }}>
              더 보기 (+{pastVisits.length - 10}건)
            </button>
          )}
        </div>
      )}

      {/* DB 검색 결과 */}
      {phase >= 1 && searchResults.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-hint)', marginBottom: 6 }}>DB 검색 결과 ({searchResults.length}건)</div>
          {(showAllResults ? searchResults : searchResults.slice(0, 20)).map((r, i) => {
            const meta = r.metadata || {};
            const col = r.collection || '';
            const parsed = parseDocument(r.text || '');
            const body = getBody(r.text || '');
            const sel = selectedSearch[i] !== false;
            const cColor = { speech_points: 'var(--accent)', speech_expressions: 'var(--accent-orange)', publications: 'var(--accent-purple)' }[col] || 'var(--c-muted)';
            const score = Math.round((r.score || 0) / 0.035 * 100);
            return (
              <div key={i}
                style={{ borderRadius: 8, border: r.filtered ? '1px solid var(--tint-red-bd)' : '1px solid var(--bd-soft)', background: r.filtered ? 'var(--tint-red-soft)' : 'var(--bg-card)', marginBottom: 6, overflow: 'hidden', opacity: sel ? 1 : 0.5 }}>
                <div onClick={() => setSelectedSearch(p => ({ ...p, [i]: p[i] === false ? true : false }))} style={{ padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', background: r.filtered ? 'var(--tint-red)' : 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={sel} readOnly style={{ cursor: 'pointer', accentColor: cColor }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: cColor, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || meta.source || '연설'}</span>
                  {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                  {meta.date && meta.date !== '0000' && <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>{meta.date}</span>}
                  {meta.visit_target && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 3, background: '#D85A3015', color: 'var(--accent-orange)', fontWeight: 600 }}>{meta.visit_target}</span>}
                  {meta.favorite === 'true' && <span style={{ fontSize: '0.714rem', color: 'var(--accent-gold)' }}>★</span>}
                  {parseInt(meta.rating || '0') > 0 && <span style={{ fontSize: '0.571rem', color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(parseInt(meta.rating))}{'☆'.repeat(5 - parseInt(meta.rating))}</span>}
                  {r.filtered && <span style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--c-danger)' }}>LLM 제외</span>}
                  {meta.tags && (() => {
                    const t = meta.tags;
                    const badges = [];
                    if (t.includes('표현')) badges.push({ label: '표현', bg: 'var(--accent-orange)' });
                    if (t.includes('예시(실화)')) badges.push({ label: '예시·실화', bg: 'var(--accent-brown)' });
                    if (t.includes('예시(비유)')) badges.push({ label: '예시·비유', bg: 'var(--accent-brown)' });
                    if (t.includes('예시(성경)')) badges.push({ label: '예시·성경', bg: '#2D8FC7' });
                    if (!badges.length && t.includes('예시')) badges.push({ label: '예시', bg: 'var(--accent-brown)' });
                    return badges.map((b, bi) => <span key={bi} style={{ fontSize: '0.571rem', padding: '1px 5px', borderRadius: 3, background: b.bg, color: '#fff', fontWeight: 700 }}>{b.label}</span>);
                  })()}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { if (srEditIdx === i) { setSrEditIdx(null); } else { setSrEditIdx(i); setSrDbIdx(null); } }} style={{ ...S.btnXs }}>수정</button>
                    <button onClick={() => { if (srDbIdx === i) { setSrDbIdx(null); } else { setSrDbIdx(i); setSrEditIdx(null); setSrDbText(r.text || ''); setSrDbMeta({ ...meta, rating: parseInt(meta.rating || '0'), favorite: meta.favorite === 'true' }); setSrDbStatus(''); } }} style={{ ...S.btnXsDanger }}>DB</button>
                  </div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 44, height: 4, borderRadius: 2, background: 'var(--bg-dim)', overflow: 'hidden' }}>
                      <span style={{ display: 'block', width: Math.min(score, 100) + '%', height: '100%', borderRadius: 2, background: score > 80 ? 'var(--accent)' : score > 50 ? '#BA7517' : 'var(--c-danger)' }} />
                    </span>
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)', minWidth: 26 }}>{Math.min(score, 100)}%</span>
                  </span>
                </div>
                {(() => {
                  const cColor = { speech_points: 'var(--accent)', speech_expressions: 'var(--accent-orange)', publications: 'var(--accent-purple)' }[col] || 'var(--c-muted)';
                  const gt = meta.outline_type || '', gn = meta.outline_num || '';
                  const prefix = getOutlinePrefix(gt, gn);
                  const isPub = col === 'publications';
                  const title = isPub ? (meta.outline_title || '') : (meta.outline_title || '');
                  const metaRows = [
                    isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: 'var(--accent-purple)' },
                    isPub && meta.pub_title && { label: '출판물명', value: meta.pub_title },
                    !isPub && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
                    (parsed?.subtopic || meta.sub_topic || meta.subtopic) && { label: '소주제', value: parsed?.subtopic || meta.sub_topic || meta.subtopic },
                    (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: cColor },
                    cleanMd(parsed?.scripture || meta.scriptures || '') && { label: '성구', value: cleanMd(parsed?.scripture || meta.scriptures || ''), color: '#2D8FC7' },
                    (() => { const kws = parseKeywords(parsed?.keywords || meta.keywords); return kws.length > 0 && { label: '키워드', value: kws.join(', ') }; })(),
                  ].filter(Boolean);
                  return metaRows.length > 0 ? (
                    <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline' }}>
                      {metaRows.map((row, mi) => (
                        <Fragment key={mi}>
                          <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                          <span style={{ fontSize: '0.786rem', color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                        </Fragment>
                      ))}
                    </div>
                  ) : null;
                })()}
                {srEditIdx === i && (
                  <div style={{ padding: '6px 10px', borderTop: '1px solid var(--tint-blue-bd)', background: 'var(--tint-blue-soft)' }}>
                    <textarea value={srEditText[i] !== undefined ? srEditText[i] : body} onChange={e => setSrEditText(p => ({ ...p, [i]: e.target.value }))} rows={6}
                      style={{ display: 'block', width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      {srEditText[i] !== undefined && srEditText[i] !== body && <button onClick={() => setSrEditText(p => { const n = { ...p }; delete n[i]; return n; })} style={{ ...S.btnXs }}>원래대로</button>}
                      <button onClick={() => setSrEditIdx(null)} style={{ ...S.btnXs }}>{srEditText[i] !== undefined && srEditText[i] !== body ? '확인' : '취소'}</button>
                    </div>
                  </div>
                )}
                {srDbIdx === i && (
                  <div style={{ padding: '8px 10px', borderTop: '1px solid var(--tint-red-bd)' }}>
                    <div style={{ fontSize: '0.714rem', fontWeight: 600, color: 'var(--c-danger)', marginBottom: 6 }}>DB 직접 편집</div>
                    <textarea value={srDbText} onChange={e => setSrDbText(e.target.value)} rows={6}
                      style={{ display: 'block', width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 6 }} />
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {[1,2,3,4,5].map(n => (
                          <button key={n} onClick={(e) => { e.stopPropagation(); setSrDbMeta(p => ({ ...p, rating: p.rating === n ? 0 : n })); }} style={{
                            width: 28, height: 28, borderRadius: 6, border: '1px solid ' + (n <= (srDbMeta.rating || 0) ? 'var(--accent-gold)' : 'var(--bd)'),
                            background: n <= (srDbMeta.rating || 0) ? '#F5A62318' : 'var(--bg-card)', color: n <= (srDbMeta.rating || 0) ? 'var(--accent-gold)' : 'var(--c-dim)',
                            fontSize: '0.714rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                          }}>{n}</button>
                        ))}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setSrDbMeta(p => ({ ...p, favorite: !p.favorite })); }} style={{
                        padding: '3px 10px', borderRadius: 6, border: '1px solid ' + (srDbMeta.favorite ? 'var(--accent-gold)' : 'var(--bd)'),
                        background: srDbMeta.favorite ? '#F5A62318' : 'var(--bg-card)', color: srDbMeta.favorite ? 'var(--accent-gold)' : 'var(--c-dim)',
                        fontSize: '0.786rem', cursor: 'pointer', fontWeight: 700,
                      }}>{srDbMeta.favorite ? '★' : '☆'}</button>
                    </div>
                    <div style={{ marginBottom: 6 }}>
                      <input type="text" value={srDbMeta.rating_note || ''} onChange={e => { e.stopPropagation(); setSrDbMeta(p => ({ ...p, rating_note: e.target.value })); }} onClick={e => e.stopPropagation()} placeholder="별점 이유 / 선호 이유"
                        style={{ width: '100%', padding: '6px 8px', boxSizing: 'border-box', border: '1px solid var(--bd)', borderRadius: 6, background: 'var(--bg-card)', fontSize: '0.786rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button onClick={async (e) => {
                        e.stopPropagation(); setSrDbStatus('저장 중...');
                        try {
                          const saveMeta = { ...srDbMeta, rating: String(srDbMeta.rating || 0), favorite: srDbMeta.favorite ? 'true' : 'false', rating_note: srDbMeta.rating_note || '' };
                          await dbUpdate(r.collection || 'speech_expressions', r.id, srDbText, saveMeta);
                          setSearchResults(p => p.map((x, j) => j === i ? { ...x, text: srDbText, metadata: saveMeta } : x));
                          setSrDbStatus('저장 완료');
                          setTimeout(() => { setSrDbStatus(''); setSrDbIdx(null); }, 1000);
                        } catch (e2) { setSrDbStatus('오류: ' + e2.message); }
                      }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-orange)', background: 'var(--accent-orange)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>DB 저장</button>
                      <button onClick={(e) => { e.stopPropagation(); setSrDbIdx(null); setSrDbStatus(''); }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                      {srDbStatus && <span style={{ fontSize: '0.714rem', color: srDbStatus.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{srDbStatus}</span>}
                    </div>
                  </div>
                )}
                {srEditIdx !== i && srDbIdx !== i && (
                  <div className={expandedSearch[i] ? 'chat-input' : ''} style={{ margin: '0 10px', padding: '8px 0 10px', borderTop: '1px solid var(--bd-light)', fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-sub)', ...(expandedSearch[i] ? { maxHeight: 280, overflowY: 'auto' } : {}), whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                    {(() => { const d = srEditText[i] !== undefined ? srEditText[i] : body; return d.length > 150 && !expandedSearch[i] ? d.slice(0, 150) + '...' : d; })()}
                  </div>
                )}
                {srEditIdx !== i && srDbIdx !== i && body.length > 150 && (
                  <div style={{ padding: '2px 10px 6px' }}>
                    <button onClick={(e) => { e.stopPropagation(); setExpandedSearch(p => ({ ...p, [i]: !p[i] })); }} style={{
                      padding: '2px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
                    }}>{expandedSearch[i] ? '접기' : '전체 보기'}</button>
                  </div>
                )}
              </div>
            );
          })}
          {!showAllResults && searchResults.length > 20 && (
            <button onClick={() => setShowAllResults(true)} style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer', marginTop: 6 }}>
              더 보기 (+{searchResults.length - 20}건)
            </button>
          )}
        </div>
      )}

      {/* 생성 옵션 */}
      {phase >= 1 && !script && (
        <div style={{ borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: 14, marginBottom: 14 }}>
          <div style={{ marginBottom: 12 }}>
            <EditableBlock value={extraMat} onChange={setExtraMat} label="추가 자료" icon="+" color="var(--accent)" borderColor="var(--tint-green-bd)" bgColor="var(--tint-green-bg)" headerBg="var(--tint-green-header)"
              placeholder={"일반 추가 자료\n\n예: 배경 정보, 참고 기사 등"} buttonLabel="+ 추가 자료" />
          </div>
          <div style={{ borderRadius: 8, border: '1px solid var(--opt-bd)', background: 'var(--opt-bg)', padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--accent-orange)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.857rem' }}>⚙</span> AI 생성 옵션
            </div>
            <div style={{ marginBottom: 8 }}>
              <AiModelSelector ai={ai} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <PresetPills storageKey="jw-visit-preset" label="AI 프리셋" onChange={setVisitPreset} />
            </div>
            <EditableBlock value={notes} onChange={setNotes} label="AI 지시사항" icon="!" color="var(--accent-orange)" borderColor="var(--tint-orange-bd)" bgColor="var(--tint-orange-light)" headerBg="var(--tint-orange-header)"
              placeholder={"AI에게 전달할 지시사항\n\n예:\n- 따뜻한 격려 위주로\n- 구체적 상황 고려"} buttonLabel="+ AI 지시사항" />
          </div>

          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 12, fontSize: '0.857rem', color: 'var(--c-sub)', lineHeight: 1.8 }}>
            <div>연령대: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{ageGroup || '미지정'}</span> | 상황: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{[...selSits].join(', ') || '미지정'}</span></div>
            <div>성구: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{scriptures || '없음'}</span></div>
            <div>과거 참고: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{Object.values(selectedPast).filter(Boolean).length}건</span> | DB 자료: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{Object.values(selectedSearch).filter(Boolean).length}건</span></div>
            {extraMat && <div>추가 자료: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>있음</span></div>}
            {notes && <div>AI 지시: <span style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>있음</span></div>}
            <div>모델: <span style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>{ai.aiPlatform} / {(ai.aiModels[ai.aiPlatform] || []).find(m => m.value === ai.aiModel)?.label || ai.aiModel}</span></div>
          </div>

          {error && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--tint-red)', border: '1px solid var(--tint-red-bd)', color: 'var(--c-danger)', fontSize: '0.857rem', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ border: 'none', background: 'none', color: 'var(--c-danger)', fontSize: '1.143rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10,
            borderRadius: 10, background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)', overflow: 'hidden',
          }}>
            <span style={{ padding: '0 10px', fontSize: '1.0rem', color: password ? 'var(--accent)' : 'var(--c-dim)', flexShrink: 0 }}>🔒</span>
            <input type={showPw ? 'text' : 'password'} placeholder="비밀번호" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)}
              style={{ flex: 1, padding: '9px 0', border: 'none', fontSize: '0.929rem', outline: 'none', fontFamily: 'inherit', background: 'transparent', color: 'var(--c-text-dark)', minWidth: 0 }} />
            {password && (
              <button onClick={() => setShowPw(!showPw)} style={{
                padding: '6px 12px', border: 'none', background: 'transparent',
                color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600, flexShrink: 0,
              }}>{showPw ? '숨김' : '표시'}</button>
            )}
          </div>
          <GenerateButton onClick={doGenerate} disabled={!password} generating={generating}
            streamProgress={streamProgress} streamMsg={streamMsg} label="방문 스크립트 생성" abortRef={abortRef} />
        </div>
      )}

      {/* 생성된 스크립트 */}
      {script && (
        <RefinePanel
          script={script} onScriptChange={setScript} password={password} aiModel={ai.aiModel}
          presetStorageKey="jw-visit-refine-preset" title="방문 스크립트"
          generating={generating} streamProgress={streamProgress} streamMsg={streamMsg}
          error={error} onError={setError} onClearError={() => setError('')}
          onRegenerate={() => { setScript(''); setPhase(1); }}
        />
      )}
    </div>
  );
}
