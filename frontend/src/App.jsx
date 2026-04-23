import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { parseOutline, searchPoints, filterResults, generateSpeechStream, healthCheck, abortGeneration, getMyStyles, saveMyStyles, searchSpeakerMemo, getPrompts, dbAdd } from './api';
import { S } from './styles';
import PresetPills from './components/PresetPills';
import KoreanTextarea from './components/KoreanTextarea';
import EditableBlock from './components/EditableBlock';
import SearchCard from './components/SearchCard';
import WolFiltersPanel from './components/WolFiltersPanel';
import PriorityMaterial from './components/PriorityMaterial';
import AiModelSelector from './components/AiModelSelector';
import GenerateButton from './components/GenerateButton';
import RefinePanel from './components/RefinePanel';
import useAiModel from './hooks/useAiModel';
import { ConfirmProvider } from './providers/ConfirmProvider';
import { AlertProvider } from './providers/AlertProvider';
const BibleSearchPage = lazy(() => import('./pages/BibleSearchPage'));
const TranscriptPage = lazy(() => import('./pages/TranscriptPage'));
const FreeSearchPage = lazy(() => import('./pages/FreeSearchPage'));
const ChatSearchPage = lazy(() => import('./pages/ChatSearchPage'));
const ServiceMeetingPage = lazy(() => import('./pages/ServiceMeetingPage'));
const VisitPage = lazy(() => import('./pages/VisitPage'));
const ManagePage = lazy(() => import('./pages/ManagePage'));

export default function App() {
  // 마운트 완료 시 페이드인 + 스크롤 복원
  useEffect(() => {
    requestAnimationFrame(() => document.getElementById('root')?.classList.add('ready'));
    const saved = sessionStorage.getItem('jw-scroll');
    if (saved) { setTimeout(() => window.scrollTo(0, parseInt(saved) || 0), 100); sessionStorage.removeItem('jw-scroll'); }
    const onVisChange = () => { if (document.hidden) sessionStorage.setItem('jw-scroll', String(window.scrollY)); };
    document.addEventListener('visibilitychange', onVisChange);
    return () => document.removeEventListener('visibilitychange', onVisChange);
  }, []);

  // iOS 입력 확대 방지
  useEffect(() => {
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta) meta.setAttribute('content', meta.getAttribute('content').replace(/,?\s*maximum-scale=[^,]*/g, '') + ', maximum-scale=1');
  }, []);

  const [page, setPage] = useState(() => { try { return localStorage.getItem('jw-page') || 'speech'; } catch(e) { return 'speech'; } });
  // STT 변환 폴링이 ManagePage 언마운트 시 중단되는 문제 해결.
  // 최초 진입 후 display 토글로 마운트 유지. Phase 1/2의 preprocVisited/aiVisited와 동일 패턴.
  const [addVisited, setAddVisited] = useState(() => page === 'add');
  useEffect(() => { if (page === 'add' && !addVisited) setAddVisited(true); }, [page, addVisited]);
  const [pendingPub, setPendingPub] = useState(null);
  const pendingPubRef = useRef(null);
  const [resetKey, setResetKey] = useState(0);
  const [prepareMode, setPrepareMode] = useState(() => { try { return localStorage.getItem('jw-prep') || 'speech'; } catch(e) { return 'speech'; } });
  const [searchMode, setSearchMode] = useState(() => { try { return localStorage.getItem('jw-search-mode') || 'free'; } catch(e) { return 'free'; } });
  const [showPrepareFilters, setShowPrepareFilters] = useState(false);
  useEffect(() => { try { localStorage.setItem('jw-page', page); } catch(e) {} if (page === 'speech' || page === 'search') ai.refreshSettings(); }, [page]);
  useEffect(() => { try { localStorage.setItem('jw-prep', prepareMode); } catch(e) {} }, [prepareMode]);
  useEffect(() => { try { localStorage.setItem('jw-search-mode', searchMode); } catch(e) {} }, [searchMode]);
  const _loadSS = () => { try { return JSON.parse(localStorage.getItem('jw-search-state')); } catch(e) { return null; } };
  const _ss = _loadSS();
  const [speechTitle, setSpeechTitle] = useState(_ss?.speechTitle || '');
  const [speechDuration, setSpeechDuration] = useState(_ss?.speechDuration || '');
  const [input, setInput] = useState(_ss?.input || '');
  const [phase, setPhase] = useState(() => { if (_ss?.phase >= 3) return _ss.phase; try { return localStorage.getItem('jw-speech-result') ? 4 : 0; } catch(e) { return 0; } });
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [parsedTitle, setParsedTitle] = useState(_ss?.parsedTitle || '');
  const [duration, setDuration] = useState(_ss?.duration || '');
  const [points, setPoints] = useState(_ss?.points || []);
  const [sel, setSel] = useState(_ss?.sel || {});
  const [resultFilter, setResultFilter] = useState('전체');
  const [priorityMats, setPriorityMats] = useState(_ss?.priorityMats || {});
  const [cardPubs, setCardPubs] = useState(_ss?.cardPubs || {});
  const [autoPubEdits, setAutoPubEdits] = useState(_ss?.autoPubEdits || {});
  const [pointExtras, setPointExtras] = useState(_ss?.pointExtras || {});
  const [editedTexts, setEditedTexts] = useState(_ss?.editedTexts || {});
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  // 연사 스타일 참고
  const [styleOpen, setStyleOpen] = useState(false);
  const [myStyles, setMyStyles] = useState([]);
  const [addingStyle, setAddingStyle] = useState(false);
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleContent, setNewStyleContent] = useState('');
  const [editingStyleIdx, setEditingStyleIdx] = useState(-1);
  const [styleQuery, setStyleQuery] = useState('');
  const [styleResults, setStyleResults] = useState([]);
  const [styleLoading, setStyleLoading] = useState(false);
  const [selStyles, setSelStyles] = useState({});
  const [stylePrompts, setStylePrompts] = useState({});

  // AI 모델 선택 (공유 훅)
  const ai = useAiModel();

  const [extraMat, setExtraMat] = useState(_ss?.extraMat || '');
  const [instructions, setInstructions] = useState(_ss?.instructions || '');
  const [speechPreset, setSpeechPreset] = useState('');
  const [useLLMFilter, setUseLLMFilter] = useState(true);
  const [searchTitle, setSearchTitle] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [speech, setSpeech] = useState(() => { try { return localStorage.getItem('jw-speech-result') || ''; } catch(e) { return ''; } });
  useEffect(() => { try { if (speech) localStorage.setItem('jw-speech-result', speech); else localStorage.removeItem('jw-speech-result'); } catch(e) {} }, [speech]);
  // Persist search state
  useEffect(() => {
    if (phase < 3 && points.length === 0) { try { localStorage.removeItem('jw-search-state'); } catch(e) {} return; }
    try {
      localStorage.setItem('jw-search-state', JSON.stringify({
        speechTitle, speechDuration, input, phase, parsedTitle, duration,
        points, sel, priorityMats, cardPubs, autoPubEdits, pointExtras, editedTexts, extraMat, instructions,
      }));
    } catch(e) {}
  }, [phase, points, sel, priorityMats, cardPubs, autoPubEdits, pointExtras, editedTexts, extraMat, instructions, speechTitle, speechDuration, input, parsedTitle, duration]);
  const [generating, setGenerating] = useState(false);
  const [streamProgress, setStreamProgress] = useState(0);
  const abortRef = useRef(null);
  const [streamMsg, setStreamMsg] = useState('');
  const [serverOk, setServerOk] = useState(null);
  const _defaultFontSize = typeof window !== 'undefined' && window.innerWidth >= 1024 ? 16 : 14;
  const [fontSize, _setFontSize] = useState(() => { try { const s = localStorage.getItem('jw-fontsize'); return s ? Number(s) : _defaultFontSize; } catch(e) { return _defaultFontSize; } });
  const setFontSize = (v) => { const val = typeof v === 'function' ? v(fontSize) : v; _setFontSize(val); try { localStorage.setItem('jw-fontsize', String(val)); } catch(e) {} };
  useEffect(() => { document.documentElement.style.fontSize = fontSize + 'px'; }, [fontSize]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  // 플로팅 메모
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTopic, setMemoTopic] = useState('');
  const [memoContent, setMemoContent] = useState('');
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoMsg, setMemoMsg] = useState('');
  const saveMemo = async () => {
    if (!memoContent.trim()) return;
    setMemoSaving(true); setMemoMsg('');
    try {
      await dbAdd({ source: '메모', entry_type: 'expression', topic: memoTopic.trim(), content: memoContent.trim(), outline_num: '', outline_type: '', outline_title: memoTopic.trim(), subtopic: '', point_id: '', point_summary: '', speaker: '', date: '', keywords: '', scriptures: '', pub_code: '', sub_source: '', service_type: '' });
      setMemoMsg('저장 완료');
      setTimeout(() => { setMemoTopic(''); setMemoContent(''); setMemoMsg(''); }, 1200);
    } catch (e) { setMemoMsg('오류: ' + e.message); }
    finally { setMemoSaving(false); }
  };
  useEffect(() => {
    const onScroll = () => setShowScrollDown(window.scrollY > 200 && document.documentElement.scrollHeight - window.scrollY - window.innerHeight > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [darkMode, setDarkMode] = useState(() => { try { return localStorage.getItem('jw-dark') === '1'; } catch(e) { return false; } });
  const [showFontSlider, setShowFontSlider] = useState(false);
  useEffect(() => { try { localStorage.setItem('jw-dark', darkMode ? '1' : '0'); } catch(e) {} document.documentElement.classList.toggle('dk', darkMode); const bg = darkMode ? '#1a1a1a' : '#F2F2F7'; document.body.style.background = bg; document.documentElement.style.background = bg; }, [darkMode]);
  const dk = darkMode;

  useEffect(() => {
    healthCheck().then(data => { setServerOk(true); }).catch(() => setServerOk(false));
  }, []);

  useEffect(() => {
    if (points.length === 0) return;
    const newSel = {};
    points.forEach((pt, pi) => {
      pt.search_results.forEach((r, ri) => {
        const isRRF = r.score < 0.1;
        const pct = isRRF ? Math.round(r.score / 0.035 * 100) : Math.round(r.score * 100);
        newSel[pi + '-' + ri] = pct >= minScore && !r.filtered;
      });
    });
    setSel(newSel);
  }, [minScore]);

  const run = async () => {
    if (!input.trim()) return;
    setError(''); setSpeech(''); setPhase(1); setPoints([]); setSel({}); setPriorityMats({}); setPointExtras({}); setEditedTexts({}); setMinScore(0); setCardPubs({}); setAutoPubEdits({});
    try {
      setStatus('파싱 중…');
      const hasSepTitle = true;
      const parsed = await parseOutline(input, hasSepTitle);
      setParsedTitle(parsed.title || '');
      setDuration(parsed.duration || '');
      if (!parsed.points || parsed.points.length === 0) {
        setError('요점을 추출할 수 없습니다.'); setPhase(0); return;
      }

      let searchablePoints = [...parsed.points];
      const titleToSearch = speechTitle.trim() || parsed.title || '';
      if (searchTitle && titleToSearch) {
        searchablePoints.unshift({
          title: titleToSearch,
          scriptures: [],
          publications: [],
          _isTitlePoint: true,
        });
      }

      setStatus('DB 검색 중…');
      setPhase(2);
      const searched = await searchPoints(searchablePoints);
      let finalPoints;
      if (useLLMFilter) {
        setStatus('필터 중…');
        const filtered = await filterResults(searched.points);
        finalPoints = filtered.points;
      } else {
        finalPoints = searched.points.map(pt => ({
          ...pt, search_results: pt.search_results.map(r => ({ ...r, filtered: false })),
        }));
      }
      finalPoints = finalPoints.map((pt, i) => ({
        ...pt,
        _isTitlePoint: searchablePoints[i]?._isTitlePoint || false,
      }));
      const initSel = {};
      finalPoints.forEach((pt, pi) => {
        pt.search_results.forEach((r, ri) => { initSel[pi + '-' + ri] = !r.filtered; });
      });
      setSel(initSel);
      setPoints(finalPoints);
      setStatus(''); setPhase(3);
    } catch (e) {
      setError('오류: ' + e.message); setStatus(''); setPhase(0);
    }
  };

  const toggleSel = (key) => setSel(prev => ({ ...prev, [key]: prev[key] === false ? true : false }));
  const setPriorityMat = (pi, val) => setPriorityMats(prev => ({ ...prev, [pi]: val }));
  const setPointExtra = (pi, val) => setPointExtras(prev => ({ ...prev, [pi]: val }));
  const setEditedText = (key, val) => setEditedTexts(prev => {
    const next = { ...prev };
    if (val === null) { delete next[key]; } else { next[key] = val; }
    return next;
  });

  const handleGenerate = async () => {
    if (!password) { setError('비밀번호를 입력하세요'); return; }
    setError(''); setGenerating(true); setSpeech(''); setStreamProgress(0); setStreamMsg('준비 중...');
    try {
      const finalTitle = speechTitle.trim() || parsedTitle || '';
      const finalDuration = speechDuration.trim() || duration || '';
      const selectedPoints = points.map((pt, pi) => {
        const pubTexts = [];
        Object.entries(cardPubs).forEach(([key, val]) => {
          if (key.startsWith(pi + '-') && val) {
            const parts = key.split('-');
            if (parts.length >= 3) {
              const ri = parseInt(parts[1]);
              if (sel[pi + '-' + ri] !== false) { pubTexts.push(val); }
            }
          }
        });
        const cardPubText = pubTexts.join('\n\n');
        const manualPri = priorityMats[pi] || '';
        const combinedPriority = [manualPri, cardPubText].filter(Boolean).join('\n\n');

        const editedAutoPubs = (pt.auto_publications || []).map((ap, api) => {
          const apKey = pi + '-' + api;
          const apEdit = autoPubEdits[apKey];
          if (apEdit?.text) {
            const lines = ap.text.split('\n');
            const metaLines = lines.filter(l => l.startsWith('['));
            return { ...ap, text: metaLines.join('\n') + '\n\n' + apEdit.text };
          }
          return ap;
        });

        return {
          ...pt,
          auto_publications: editedAutoPubs,
          search_results: pt.search_results
            .map((r, ri) => {
              const edited = editedTexts[pi + '-' + ri];
              return edited !== undefined && edited !== null ? { ...r, text: edited } : r;
            })
            .filter((_, ri) => sel[pi + '-' + ri] !== false),
          priority_material: combinedPriority,
          extra_material: pointExtras[pi] || '',
          _isTitlePoint: pt._isTitlePoint || false,
        };
      });
      // 스타일 참고 수집
      const selectedMyStyles = myStyles.filter(s => s.selected && s.content);
      const checkedSearchStyles = styleResults.filter((_, i) => selStyles[i]);
      const styleCount = selectedMyStyles.length + checkedSearchStyles.length;
      let styleExtra = '';
      if (styleCount > 0) {
        const parts = ['\n\n[스타일 지시]'];
        selectedMyStyles.forEach(s => {
          parts.push(`- ${s.name}: ${s.content}`);
        });
        checkedSearchStyles.forEach(r => {
          const m = r.metadata || {};
          const body = (r.text || '').split('\n').filter(l => !l.startsWith('[') && l.trim()).join('\n').trim();
          const label = m.memo_category || '참고';
          const speaker = m.speaker || '미상';
          const num = m.outline_num ? ' · ' + m.outline_num + (/^\d+$/.test(m.outline_num) ? '번' : '') : '';
          parts.push(`- ${label} (${speaker}${num}): ${body}`);
        });
        parts.push('');
        parts.push(stylePrompts.both || '위 스타일을 참고하여 연설문을 생성해 주세요.');
        styleExtra = parts.join('\n');
      }

      const allExtra = [
        extraMat,
        styleExtra,
        (speechPreset || instructions) ? '\n\n## AI 지시사항:\n' + [speechPreset, instructions].filter(Boolean).join('\n') : '',
      ].filter(Boolean).join('');

      let streamedText = '';
      const ac = new AbortController();
      abortRef.current = ac;
      await generateSpeechStream(password, finalTitle, finalDuration, selectedPoints, allExtra, ai.aiModel, (ev) => {
        if (ev.stage === 'preparing') {
          setStreamProgress(ev.progress);
          setStreamMsg(ev.message);
        } else if (ev.stage === 'calling') {
          setStreamProgress(ev.progress);
          setStreamMsg('AI 호출 중…');
        } else if (ev.stage === 'streaming') {
          streamedText += ev.chunk;
          setStreamProgress(ev.progress);
          setStreamMsg('생성 중...');
          setSpeech(streamedText);
        } else if (ev.stage === 'done') {
          setStreamProgress(100);
          setStreamMsg('완료');
          setSpeech(ev.speech);
        } else if (ev.stage === 'error') {
          setError('생성 오류: ' + ev.message);
        }
      }, undefined, ac.signal);
      setPhase(4);
    } catch (e) {
      if (e.name === 'AbortError') { setStreamMsg('중단됨'); }
      else { setError('생성 오류: ' + e.message); }
    } finally {
      abortRef.current = null;
      setGenerating(false); setStreamProgress(0); setStreamMsg('');
    }
  };

  const selCount = Object.values(sel).filter(Boolean).length;
  const priorityCount = Object.values(priorityMats).filter(v => v && v.trim()).length;
  const cardPubCount = Object.values(cardPubs).filter(Boolean).length;
  const autoPubCount = points.reduce((sum, pt) => sum + (pt.auto_publications || []).length, 0);
  const totalPubCount = cardPubCount + autoPubCount;
  const pointExtraCount = Object.values(pointExtras).filter(v => v && v.trim()).length;
  const finalDurationDisplay = speechDuration.trim() || duration || '';

  const taStyle = {
    display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box',
    border: '2px solid var(--bd)', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)',
    fontSize: '0.929rem', lineHeight: 1.8, fontFamily: 'inherit', outline: 'none', resize: 'vertical',
  };

  return (<ConfirmProvider><AlertProvider>
      <style>{`:root {
  --bg: #F2F2F7;
  --bg-card: #FFFFFF;
  --bg-subtle: #EFEFF4;
  --bg-input: #EFEFF4;
  --bg-muted: #E5E5EA;
  --bg-dim: #E5E5EA;
  --bg-header: #FFFFFF;

  --c-text: #3C3C43;
  --c-text-dark: #000000;
  --c-sub: #636366;
  --c-hint: #48484A;
  --c-faint: #8E8E93;
  --c-muted: #AEAEB2;
  --c-dim: #C7C7CC;

  --bd: #C6C6C8;
  --bd-light: #E5E5EA;
  --bd-medium: #AEAEB2;
  --bd-soft: #D1D1D6;

  --tint-blue: #eef6ff;
  --tint-blue-bd: #cce3f8;
  --tint-blue-header: #e0eef8;
  --tint-blue-soft: #f0f8ff;
  --tint-blue-light: #f0f5ff;

  --tint-purple: #f8f5ff;
  --tint-purple-bd: #e0dbf5;
  --tint-purple-badge: #eeebfa;
  --tint-purple-input: #c8b8f0;

  --tint-green: #e6f5ec;
  --tint-green-bd: #b8e0d0;
  --tint-green-soft: #e8f5e9;
  --tint-green-bg: #f0faf5;
  --tint-green-header: #e0f5ec;

  --tint-orange: #ffeedd;
  --tint-orange-soft: #fff3e0;
  --tint-orange-bg: #fef5f0;
  --tint-orange-light: #fdf5f0;
  --tint-orange-bd: #e8c0a8;
  --tint-orange-header: #f5e8e0;

  --tint-red: #fff0f0;
  --tint-red-soft: #fff8f8;
  --tint-red-bd: #fcc;

  --accent: #1D9E75;
  --accent-purple: #7F77DD;
  --accent-orange: #D85A30;
  --accent-blue: #378ADD;
  --accent-gold: #F5A623;
  --accent-brown: #C7842D;
  --c-danger: #cc4444;

  --opt-bg: #fefcf9;
  --opt-bd: #e8e0d0;

  --tab-active-bg: #333;
  --tab-active-c: #fff;
}

.dk {
  --bg: #1a1a1a;
  --bg-card: #2a2a2a;
  --bg-subtle: #222;
  --bg-input: #333;
  --bg-muted: #333;
  --bg-dim: #333;
  --bg-header: #111;

  --c-text: #f0f0f0;
  --c-text-dark: #f0f0f0;
  --c-sub: #ccc;
  --c-hint: #ddd;
  --c-faint: #aaa;
  --c-muted: #999;
  --c-dim: #777;

  --bd: #444;
  --bd-light: #333;
  --bd-medium: #555;
  --bd-soft: #3a3a3a;

  --tint-blue: #1a2a3a;
  --tint-blue-bd: #2a4a6a;
  --tint-blue-header: #1a3040;
  --tint-blue-soft: #1a2030;
  --tint-blue-light: #1a2040;

  --tint-purple: #2a1a3a;
  --tint-purple-bd: #3a2a5a;
  --tint-purple-badge: #2a2040;
  --tint-purple-input: #4a3870;

  --tint-green: #1a3a2a;
  --tint-green-bd: #2a5a3a;
  --tint-green-soft: #1a3a1a;
  --tint-green-bg: #1a3025;
  --tint-green-header: #1a3a28;

  --tint-orange: #3a2a1a;
  --tint-orange-soft: #3a2810;
  --tint-orange-bg: #3a2010;
  --tint-orange-light: #3a2515;
  --tint-orange-bd: #5a3a20;
  --tint-orange-header: #3a2a18;

  --tint-red: #3a1a1a;
  --tint-red-soft: #2e1a1a;
  --tint-red-bd: #5a2a2a;

  --accent: #22B888;
  --accent-purple: #9B94E8;
  --accent-orange: #E87A55;
  --accent-blue: #5AA0E8;
  --accent-gold: #F5B84A;
  --accent-brown: #D8A050;
  --c-danger: #E06060;

  --opt-bg: #2a2520;
  --opt-bd: #444;

  --tab-active-bg: #e0e0e0;
  --tab-active-c: #111;
}

body, html { margin: 0; padding: 0; background: var(--bg); color: var(--c-text); -webkit-text-size-adjust: 100%; -moz-text-size-adjust: 100%; text-size-adjust: 100%; }
input, select, textarea {
  background: var(--bg-subtle); color: var(--c-text-dark); border: none;
}
input::placeholder, textarea::placeholder { color: var(--c-dim); }
option { background: var(--bg-input); color: var(--c-text-dark); }
@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }

textarea::-webkit-scrollbar,
.chat-input::-webkit-scrollbar,
[style*="overflow"]::-webkit-scrollbar { width: 4px; height: 4px; }
textarea::-webkit-scrollbar-track,
.chat-input::-webkit-scrollbar-track,
[style*="overflow"]::-webkit-scrollbar-track { background: transparent; }
textarea::-webkit-scrollbar-thumb,
.chat-input::-webkit-scrollbar-thumb,
[style*="overflow"]::-webkit-scrollbar-thumb { background: var(--bd-medium, #555); border-radius: 4px; }
textarea::-webkit-scrollbar-thumb:hover,
.chat-input::-webkit-scrollbar-thumb:hover,
[style*="overflow"]::-webkit-scrollbar-thumb:hover { background: var(--c-muted, #888); }
textarea, .chat-input, [style*="overflow"] { scrollbar-width: thin; scrollbar-color: var(--bd-medium, #555) transparent; }
textarea::-webkit-resizer { display: none; }
textarea { resize: vertical; }

/* 데스크톱 가독성 — 폭 확장 + zoom 부스트 */
@media (min-width: 1024px) {
  .jw-app {
    max-width: 800px !important;
    padding-left: 24px !important;
    padding-right: 24px !important;
  }
}
@media (min-width: 1440px) {
  .jw-app { max-width: 860px !important; }
}
@media (min-width: 1920px) {
  .jw-app { max-width: 920px !important; }
}
`}</style>
    <div className={`jw-app${dk ? ' dk' : ''}`} style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 60px', fontFamily: "'Noto Sans KR', -apple-system, sans-serif", color: 'var(--c-text)', background: 'var(--bg)', minHeight: '100vh' }}>

      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: '1.286rem', fontWeight: 800 }}>JW Speech Studio</div>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: serverOk === true ? 'var(--accent)' : serverOk === false ? 'var(--c-danger)' : 'var(--bd-medium)',
            boxShadow: serverOk === true ? '0 0 6px #1D9E7560' : serverOk === false ? '0 0 6px #c4460' : 'none',
          }} />
          <button onClick={() => {
            setPage('search'); setSearchMode('chat'); setResetKey(k => k + 1);
            setSpeech(''); setPhase(0); setInput(''); setError(''); setStatus(''); setPoints([]); setSel({}); setPriorityMats({}); setPointExtras({}); setEditedTexts({});
            try { localStorage.removeItem('jw-speech-result'); localStorage.removeItem('jw-svc-script'); localStorage.removeItem('jw-visit-script'); localStorage.removeItem('jw-search-state'); localStorage.removeItem('jw-svc-state'); localStorage.removeItem('jw-visit-state'); localStorage.removeItem('jw-free-state'); localStorage.removeItem('jw-bible-state'); } catch(e) {}
          }} style={{
            width: 22, height: 22, borderRadius: 11, border: 'none',
            background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)',
            fontSize: '0.857rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>↺</button>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
        }}>
          <button onClick={() => setDarkMode(d => !d)} style={{
            width: 30, height: 30, borderRadius: 8, border: 'none',
            background: 'transparent', color: 'var(--c-muted)',
            fontSize: '1.0rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}>{dk ? '☀' : '🌙'}</button>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowFontSlider(p => !p)} style={{
              width: 30, height: 30, borderRadius: 8, border: 'none',
              background: showFontSlider ? 'var(--bg-card, #fff)' : 'transparent',
              color: showFontSlider ? 'var(--accent)' : 'var(--c-muted)',
              fontSize: '0.857rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, transition: 'all 0.15s',
              boxShadow: showFontSlider ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>Aa</button>
            {showFontSlider && (
              <div style={{ position: 'absolute', top: 36, right: 0, background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 20, display: 'flex', alignItems: 'center', gap: 8, minWidth: 180 }}>
                <span onClick={() => setFontSize(f => Math.max(12, f - 1))} style={{ fontSize: '0.786rem', color: 'var(--c-muted)', cursor: 'pointer', userSelect: 'none' }}>A</span>
                <input type="range" min={12} max={20} step={1} value={fontSize} onChange={e => setFontSize(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent)' }} />
                <span onClick={() => setFontSize(f => Math.min(20, f + 1))} style={{ fontSize: '1.071rem', color: 'var(--c-muted)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }}>A</span>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)', minWidth: 18, textAlign: 'center' }}>{fontSize}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ borderRadius: 10, border: '1px solid var(--bd-soft)', background: 'var(--bg-subtle)', padding: '10px 12px', marginBottom: 16 }}>
      <div style={S.pillContainer}>
        {[['input', '입력'], null, ['speech', '준비'], ['search', '검색'], ['add', '전처리'], ['manage', '관리']].map((item, idx) => {
          if (item === null) {
            return <div key={`sep-${idx}`} style={{ width: 1, height: 22, background: 'var(--bd-medium)', margin: '0 10px', alignSelf: 'center', flexShrink: 0 }} />;
          }
          const [key, label] = item;
          const isInput = key === 'input';
          const active = page === key;
          return (
            <button key={key} onClick={() => {
              setPage(key);
              if (key === 'add') { try { window.dispatchEvent(new Event('enter-preprocess-tab')); } catch {} }
            }} style={S.pillL1(active, isInput ? 'var(--accent-orange)' : 'var(--c-text-dark)')}>{label}</button>
          );
        })}
      </div>
      </div>

      <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.857rem' }}>로딩 중...</div>}>

      {page === 'search' && (<>
        <div style={{ ...S.pillContainer, marginBottom: 12 }}>
          {[['chat', 'AI 대화'], ['free', 'DB 검색'], ['bible', '성구'], ['original', '원문']].map(([k, l]) => (
            <button key={k} onClick={() => setSearchMode(k)} style={S.pillL2(searchMode === k)}>{l}</button>
          ))}
        </div>
        {searchMode === 'chat' && <ChatSearchPage fontSize={fontSize} ai={ai} />}
        {searchMode === 'bible' && <BibleSearchPage fontSize={fontSize} />}
        {searchMode === 'original' && <TranscriptPage fontSize={fontSize} />}
        {searchMode === 'free' && <FreeSearchPage fontSize={fontSize} />}
      </>)}
      {page === 'input' && <ManagePage pageType="input" key={'input-' + resetKey} fontSize={fontSize} pendingPub={pendingPub} clearPendingPub={() => setPendingPub(null)} onSaveReturn={(savedPubData) => {
        setPage('speech');
        const ref = pendingPubRef.current;
        pendingPubRef.current = null;
        const pi = ref?.pointIndex;
        if (pi !== undefined && savedPubData) {
          setPoints(prev => prev.map((pt, i) => i !== pi ? pt : {
            ...pt,
            auto_publications: [...(pt.auto_publications || []), {
              pub_code: savedPubData.pub_code || ref.pub_code || '',
              point_content: savedPubData.point || pt.title || '',
              text: savedPubData.content || '',
              matched_ref: ref.pub_code || savedPubData.pub_code || '',
            }],
          }));
        }
      }} />}
      {addVisited && (
        <div style={{ display: page === 'add' ? 'contents' : 'none' }}>
          <ManagePage pageType="add" key={'add-' + resetKey} fontSize={fontSize} pendingPub={pendingPub} clearPendingPub={() => setPendingPub(null)} onSaveReturn={(savedPubData) => {
            setPage('speech');
            const ref = pendingPubRef.current;
            pendingPubRef.current = null;
            const pi = ref?.pointIndex;
            if (pi !== undefined && savedPubData) {
              setPoints(prev => prev.map((pt, i) => i !== pi ? pt : {
                ...pt,
                auto_publications: [...(pt.auto_publications || []), {
                  pub_code: savedPubData.pub_code || ref.pub_code || '',
                  point_content: savedPubData.point || pt.title || '',
                  text: savedPubData.content || '',
                  matched_ref: ref.pub_code || savedPubData.pub_code || '',
                }],
              }));
            }
          }} />
        </div>
      )}
      {page === 'manage' && <ManagePage pageType="manage" key={'manage-' + resetKey} fontSize={fontSize} onGoAdd={() => setPage('add')} />}

      {page === 'speech' && (<>

      {/* Prepare sub-tabs */}
      <div style={{ ...S.pillContainer, marginBottom: 16 }}>
        {[['speech', '연설'], ['service', '봉사 모임'], ['visit', '방문']].map(([k, l]) => (
          <button key={k} onClick={() => { setPrepareMode(k); setError(''); }} style={S.pillL2(prepareMode === k)}>{l}</button>
        ))}
      </div>

      {prepareMode === 'service' && <ServiceMeetingPage key={resetKey} fontSize={fontSize} ai={ai} />}

      {prepareMode === 'visit' && <VisitPage key={resetKey} fontSize={fontSize} ai={ai} />}

      {prepareMode === 'speech' && (<>

      {/* Title + Duration + Input */}
      <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 16, overflow: 'hidden' }}>
        {/* 입력 영역 */}
        <div style={{ padding: '12px 14px 8px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="text" value={speechTitle} onChange={e => setSpeechTitle(e.target.value)} placeholder="연설 제목 (선택)"
              style={{ flex: 1, minWidth: 120, padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: '0.929rem', outline: 'none', fontFamily: 'inherit', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
            <input type="text" value={speechDuration} onChange={e => setSpeechDuration(e.target.value)} placeholder="시간"
              style={{ width: 70, flexShrink: 0, padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.929rem', outline: 'none', fontFamily: 'inherit', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', textAlign: 'center', boxSizing: 'border-box' }} />
          </div>
          <KoreanTextarea value={input} onChange={setInput}
            placeholder={"골자 요점을 붙여넣으세요\n\n여러 요점:\n영적 양식을 즐깁니다 (사 65:13)\n고통을 인내하는 데 도움 (사 65:14-17)\n\n단일 검색:\n대속물의 의미"}
            rows={5} style={taStyle} />
        </div>
        {/* 하단 바 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
          borderTop: '1px solid var(--bd-light)',
        }}>
          <button onClick={() => { const next = !useLLMFilter; setUseLLMFilter(next); if (!next) setShowPrepareFilters(false); }} style={{
            padding: '4px 10px', borderRadius: 8, border: 'none',
            background: useLLMFilter ? '#7F77DD15' : 'var(--bg-subtle, #EFEFF4)',
            color: useLLMFilter ? 'var(--accent-purple)' : 'var(--c-muted)',
            fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            {useLLMFilter ? '✓' : '○'} LLM 필터
            {useLLMFilter && <span onClick={e => { e.stopPropagation(); setShowPrepareFilters(p => !p); }}
              style={{ color: showPrepareFilters ? 'var(--accent-brown)' : '#7F77DD80', fontSize: '1.286rem', lineHeight: 0 }}>▾</span>}
          </button>
          <button onClick={() => setSearchTitle(p => !p)} style={{
            padding: '4px 10px', borderRadius: 8, border: 'none',
            background: searchTitle ? '#D85A3015' : 'var(--bg-subtle, #EFEFF4)',
            color: searchTitle ? 'var(--accent-orange)' : 'var(--c-muted)',
            fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600, transition: 'all 0.15s',
          }}>{searchTitle ? '✓' : '○'} 제목 검색</button>
          <div style={{ flex: 1 }} />
          {(input.trim() || speechTitle.trim() || points.length > 0) && (
            <button onClick={() => { setPhase(0); setPoints([]); setSel({}); setPriorityMats({}); setPointExtras({}); setEditedTexts({}); setSpeech(''); setParsedTitle(''); setDuration(''); setExtraMat(''); setInstructions(''); setMinScore(0); setCardPubs({}); setAutoPubEdits({}); setInput(''); setSpeechTitle(''); setSpeechDuration(''); }}
              style={{
                width: 22, height: 22, borderRadius: 11, border: 'none', padding: 0,
                background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)',
                fontSize: '0.929rem', cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
          )}
          <button onClick={run} disabled={!input.trim() || !!status}
            style={{
              width: 80, padding: '5px 0', borderRadius: 8, border: 'none', textAlign: 'center',
              fontSize: '0.786rem', fontWeight: 700, background: input.trim() && !status ? 'var(--accent)' : 'var(--bd-medium)', color: '#fff',
              cursor: input.trim() && !status ? 'pointer' : 'default', transition: 'background 0.15s',
              position: 'relative', overflow: 'hidden',
            }}>
            {status && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
            <span style={{ position: 'relative', zIndex: 1 }}>검색</span>
          </button>
        </div>
        {showPrepareFilters && <div style={{ padding: '4px 14px 8px' }}><WolFiltersPanel compact={false} /></div>}
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

      {parsedTitle && (
        <div style={{ padding: '10px 14px', borderRadius: 8, marginBottom: 14, background: 'var(--bg-subtle)', border: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)', fontWeight: 600 }}>파싱</span>
          <span style={{ fontSize: '0.929rem', color: 'var(--c-hint)', flex: 1 }}>{parsedTitle}</span>
          {duration && <span style={{ fontSize: '0.786rem', padding: '2px 8px', borderRadius: 8, background: 'var(--bg-dim)', color: 'var(--c-faint)' }}>{duration}</span>}
        </div>
      )}

      {/* Filter bar */}
      {phase >= 3 && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 14,
          background: 'var(--bg-card)', border: '1px solid var(--bd-soft)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)', fontWeight: 600 }}>필터</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.786rem', color: 'var(--c-sub)', userSelect: 'none' }}>
            <span style={{ color: 'var(--c-muted)' }}>최소 점수</span>
            <input type="range" min={0} max={100} value={minScore} onChange={e => setMinScore(Number(e.target.value))} style={{ width: 80, cursor: 'pointer', accentColor: 'var(--accent)' }} />
            <span style={{ minWidth: 28, fontWeight: 700, color: 'var(--accent)', fontSize: '0.857rem' }}>{minScore}%</span>
          </label>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 10 }}>
            {Object.values(sel).filter(Boolean).length}/{Object.keys(sel).length}건 선택
          </span>
        </div>
      )}

      {/* Point groups */}
      {points.map((pt, pi) => (
        <div key={pi} style={{ borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: pt._isTitlePoint ? 'var(--accent-orange)' : 'var(--tab-active-bg)', color: 'var(--tab-active-c)', fontSize: '0.857rem', fontWeight: 800 }}>{pt._isTitlePoint ? 'T' : pi + 1 - (points[0]?._isTitlePoint ? 1 : 0)}</span>
            <span style={{ fontSize: '0.929rem', fontWeight: 700 }}>{pt.title}</span>
            {pt._isTitlePoint && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 4, background: 'var(--tint-orange)', color: 'var(--accent-orange)', fontWeight: 600 }}>제목 검색</span>}
          </div>
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>

            {(pt.auto_scriptures || []).map((a, i) => (
              <div key={'as' + i} style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--tint-blue)', border: '1px solid var(--tint-blue-bd)' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.786rem', fontWeight: 800, color: '#fff', background: 'var(--accent-orange)' }}>B</span>
                  <span style={{ fontSize: '0.857rem', fontWeight: 700, color: '#2a7ab5' }}>{a.original || a.ref}</span>
                  <span style={{ fontSize: '0.643rem', padding: '1px 4px', borderRadius: 4, background: 'var(--tint-green)', color: 'var(--accent)', fontWeight: 600 }}>Bible DB</span>
                </div>
                <div style={{ paddingLeft: 28 }}>
                  {a.verses ? a.verses.map((v, vi) => (
                    <div key={vi} style={{ display: 'flex', gap: 8, marginBottom: a.verses.length > 1 ? 3 : 0, fontSize: '0.929rem', lineHeight: 1.7 }}>
                      {a.verses.length > 1 && <span style={{ color: '#2a7ab5', fontWeight: 700, minWidth: 18, textAlign: 'right', flexShrink: 0 }}>{v.verse}</span>}
                      <span>{v.text}</span>
                    </div>
                  )) : (
                    <div style={{ fontSize: '0.929rem', lineHeight: 1.7 }}>{a.text}</div>
                  )}
                </div>
              </div>
            ))}

            {(pt.auto_publications || []).map((ap, api) => {
              const apKey = pi + '-' + api;
              const apEdit = autoPubEdits[apKey];
              const bodyText = (ap.text || '').split('\n').filter(l => !l.startsWith('[') && l.trim()).join('\n').trim();
              const isEditing = apEdit?.editing;
              const currentText = apEdit?.text ?? bodyText;
              return (
                <div key={'ap' + api} style={{ padding: '8px 10px', borderRadius: 7, background: 'var(--tint-purple)', border: '1px solid var(--tint-purple-bd)' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 4, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.786rem', fontWeight: 800, color: '#fff', background: 'var(--accent-purple)' }}>P</span>
                    <span style={{ fontSize: '0.857rem', fontWeight: 700, color: '#6b5fbd' }}>{ap.pub_code}</span>
                    <span style={{ fontSize: '0.643rem', padding: '1px 4px', borderRadius: 4, background: 'var(--tint-purple-badge)', color: '#6b5fbd', fontWeight: 600 }}>출판물 DB</span>
                    <div style={{ flex: 1 }} />
                    {!isEditing && (
                      <button onClick={() => setAutoPubEdits(prev => ({ ...prev, [apKey]: { text: currentText, editing: true } }))} style={{
                        padding: '2px 6px', borderRadius: 4, border: '1px solid var(--tint-purple-input)', background: 'var(--bg-card)', color: 'var(--accent-purple)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600,
                      }}>수정</button>
                    )}
                    {isEditing && (
                      <>
                        <button onClick={() => setAutoPubEdits(prev => ({ ...prev, [apKey]: { text: prev[apKey]?.text || bodyText, editing: false } }))} style={{
                          padding: '2px 6px', borderRadius: 4, border: '1px solid var(--accent)', background: 'var(--tint-green)', color: 'var(--accent)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600,
                        }}>확인</button>
                        <button onClick={() => setAutoPubEdits(prev => { const n = { ...prev }; delete n[apKey]; return n; })} style={{
                          padding: '2px 6px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer',
                        }}>원래대로</button>
                      </>
                    )}
                  </div>
                  {isEditing ? (
                    <div style={{ paddingLeft: 28 }}>
                      <KoreanTextarea value={apEdit.text} onChange={v => setAutoPubEdits(prev => ({ ...prev, [apKey]: { ...prev[apKey], text: v } }))}
                        rows={6} style={{
                          display: 'block', width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                          borderRadius: 8, border: '1px solid var(--tint-purple-input)', background: 'var(--bg-card)',
                          fontSize: '0.929rem', lineHeight: 1.9, color: 'var(--c-text)', fontFamily: 'inherit', outline: 'none', resize: 'vertical',
                          maxHeight: 200, overflowY: 'auto',
                        }} />
                    </div>
                  ) : (
                    <div style={{ paddingLeft: 28, fontSize: '0.929rem', lineHeight: 1.9, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: 132, overflowY: 'auto' }}>
                      {currentText}
                    </div>
                  )}
                </div>
              );
            })}

            {(pt.sub_points || []).map((sub, si) => {
              const lvl = sub.level || 2;
              const levelColors = { 2: 'var(--accent-orange)', 3: '#BA7517', 4: 'var(--accent)', 5: 'var(--accent-blue)' };
              const levelLabels = { 2: 'L2', 3: 'L3', 4: 'L4', 5: 'L5' };
              const levelBg = { 2: 'var(--tint-orange-light)', 3: 'var(--tint-orange-soft)', 4: 'var(--tint-green-bg)', 5: 'var(--tint-blue-light)' };
              const levelBorder = { 2: 'var(--tint-orange-bd)', 3: 'var(--opt-bd)', 4: 'var(--tint-green-bd)', 5: 'var(--tint-blue-bd)' };
              const c = levelColors[lvl] || 'var(--c-faint)';
              return (
                <div key={'sub' + si} style={{ marginLeft: (lvl - 1) * 12, padding: '8px 10px', borderRadius: 7, background: levelBg[lvl] || 'var(--bg-subtle)', border: '1px solid ' + (levelBorder[lvl] || 'var(--bd-soft)') }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.643rem', padding: '1px 4px', borderRadius: 3, background: c, color: '#fff', fontWeight: 800 }}>{levelLabels[lvl]}</span>
                    <span style={{ fontSize: '0.857rem', color: 'var(--c-hint)', fontWeight: 700 }}>{sub.title}</span>
                  </div>
                  {(sub.publications || []).length > 0 && (
                    <div style={{ padding: '4px 8px', marginBottom: 4, borderRadius: 4, background: 'var(--tint-purple)', border: '1px solid var(--tint-purple-bd)', fontSize: '0.786rem', color: '#6b5fbd' }}>
                      {sub.publications.map((p, pi2) => (
                        <span key={pi2} style={{ display: 'inline-block', padding: '1px 5px', marginRight: 4, borderRadius: 3, background: 'var(--tint-purple-badge)', fontWeight: 600 }}>{p}</span>
                      ))}
                    </div>
                  )}
                  {(sub.auto_scriptures || []).map((a, ai2) => (
                    <div key={'sub-as' + ai2} style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--tint-blue)', border: '1px solid var(--tint-blue-bd)', marginTop: 4 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 3, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.571rem', fontWeight: 800, color: '#fff', background: 'var(--accent-orange)' }}>B</span>
                        <span style={{ fontSize: '0.786rem', fontWeight: 700, color: '#2a7ab5' }}>{a.original}</span>
                      </div>
                      <div style={{ paddingLeft: 22 }}>
                        {a.verses.map((v, vi) => (
                          <div key={vi} style={{ display: 'flex', gap: 6, marginBottom: a.verses.length > 1 ? 2 : 0, fontSize: '0.857rem', lineHeight: 1.7 }}>
                            {a.verses.length > 1 && <span style={{ color: '#2a7ab5', fontWeight: 700, minWidth: 16, textAlign: 'right', flexShrink: 0 }}>{v.verse}</span>}
                            <span>{v.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}

            <PriorityMaterial
              value={priorityMats[pi] || ''}
              onChange={(val) => setPriorityMat(pi, val)}
              publications={pt.publications || []}
              autoPubs={pt.auto_publications || []}
              onPubAdd={(pubCode) => {
                const ap = (pt.auto_publications || []).find(a => a.pub_code === pubCode);
                const content = ap ? (ap.text || '').split('\n').filter(l => !l.startsWith('[') && l.trim()).join('\n').trim() : '';
                const scriptures = (pt.scriptures || []).join('; ');
                const pointNum = pt.point_num || '';
                const outlineId = pt.outline_id || '';
                const linked = outlineId && pointNum ? `${outlineId}:${pointNum}` : '';
                const pub = { pub_code: pubCode, point: ap?.point_content || pt.title || '', content, topic: speechTitle || '', scriptures, pointNum, linked_outlines: linked, pointIndex: pi };
                setPendingPub(pub);
                pendingPubRef.current = pub;
                setPage('add');
              }}
            />

            <EditableBlock
              value={pointExtras[pi] || ''}
              onChange={(val) => setPointExtra(pi, val)}
              label="추가 자료" icon="+" color="var(--accent)" borderColor="var(--tint-green-bd)" bgColor="var(--tint-green-bg)" headerBg="var(--tint-green-header)"
              placeholder={"이 요점에 참고할 추가 자료를 붙여넣으세요"} buttonLabel="+ 추가 자료"
            />

            {pt.search_results && pt.search_results.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '6px 0', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--bd-soft)' }} />
                  {['전체', '표현', '예시', '출판물'].map(f => {
                    const cnt = pt.search_results.filter(r => {
                      if (f === '전체') return true;
                      const tags = r.metadata?.tags || '';
                      const col = r.collection || '';
                      if (f === '표현') return tags.includes('표현') && !tags.includes('예시');
                      if (f === '예시') return tags.includes('예시');
                      if (f === '출판물') return col === 'publications';
                      return true;
                    }).length;
                    return (
                      <button key={f} onClick={() => setResultFilter(f)} style={{
                        padding: '2px 8px', borderRadius: 6, border: 'none', fontSize: '0.643rem', fontWeight: resultFilter === f ? 700 : 500,
                        background: resultFilter === f ? '#1D9E7515' : 'transparent',
                        color: resultFilter === f ? 'var(--accent)' : 'var(--c-dim)', cursor: 'pointer',
                      }}>{f} {cnt > 0 ? cnt : ''}</button>
                    );
                  })}
                  <div style={{ flex: 1, height: 1, background: 'var(--bd-soft)' }} />
                </div>
                {pt.search_results.filter(r => {
                  if (resultFilter === '전체') return true;
                  const tags = r.metadata?.tags || '';
                  const col = r.collection || '';
                  if (resultFilter === '표현') return tags.includes('표현') && !tags.includes('예시');
                  if (resultFilter === '예시') return tags.includes('예시');
                  if (resultFilter === '출판물') return col === 'publications';
                  return true;
                }).map((r, ri) => (
                  <SearchCard key={pi + '-' + ri} item={r} checked={sel[pi + '-' + ri] !== false} onToggle={() => toggleSel(pi + '-' + ri)}
                    editedText={editedTexts[pi + '-' + ri]} onEditText={(val) => setEditedText(pi + '-' + ri, val)}
                    cardKey={pi + '-' + ri} cardPubs={cardPubs}
                    setCardPub={(key, val) => setCardPubs(prev => {
                      const next = { ...prev };
                      if (val === null) { delete next[key]; } else { next[key] = val; }
                      return next;
                    })}
                    onDbDelete={() => {
                      setPoints(prev => prev.map((pt2, pi2) => pi2 !== pi ? pt2 : {
                        ...pt2, search_results: pt2.search_results.filter((_, ri2) => ri2 !== ri)
                      }));
                    }}
                    onItemUpdate={(newText, newMeta) => {
                      setPoints(prev => prev.map((pt2, pi2) => pi2 !== pi ? pt2 : {
                        ...pt2, search_results: pt2.search_results.map((r2, ri2) => ri2 !== ri ? r2 : { ...r2, text: newText, metadata: { ...r2.metadata, ...newMeta } })
                      }));
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      ))}

      {/* Generate section */}
      {phase >= 3 && !speech && (
        <div style={{ borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: 14, marginBottom: 14 }}>

          <div style={{ marginBottom: 12 }}>
            <EditableBlock value={extraMat} onChange={setExtraMat} label="추가 자료 (전체)" icon="+" color="var(--accent)" borderColor="var(--tint-green-bd)" bgColor="var(--tint-green-bg)" headerBg="var(--tint-green-header)"
              placeholder={"요점에 해당하지 않는 일반 추가 자료\n\n예: 배경 정보, 참고 기사 등"} buttonLabel="+ 추가 자료 (전체)" />
          </div>

          {/* 스타일 참고 */}
          <div style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', marginBottom: 12, overflow: 'hidden' }}>
            <div onClick={() => { setStyleOpen(!styleOpen); if (!styleOpen) { getMyStyles().then(r => setMyStyles(r.styles || [])).catch(() => {}); getPrompts().then(r => { const p = r.prompts || {}; setStylePrompts({ both: p.style_both || '', mine: p.style_mine || '', others: p.style_others || '' }); }).catch(() => {}); } }}
              style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-subtle)' }}>
              <span style={{ fontSize: '0.857rem' }}>📝</span>
              <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--accent-purple)' }}>연사 스타일 참고</span>
              {(() => { const cnt = myStyles.filter(s => s.selected).length + Object.values(selStyles).filter(Boolean).length; return cnt > 0 ? <span style={{ fontSize: '0.643rem', padding: '1px 6px', borderRadius: 3, background: 'var(--accent-purple)', color: '#fff', fontWeight: 700 }}>{cnt}건</span> : null; })()}
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>{styleOpen ? '▲' : '▼'}</span>
            </div>
            {styleOpen && (
              <div style={{ padding: 12 }}>
                {/* 내 스타일 블록 목록 */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ fontSize: '0.786rem', fontWeight: 600 }}>⭐ 내 스타일</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => { setAddingStyle(true); setNewStyleName(''); setNewStyleContent(''); }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--accent-purple)', background: 'transparent', color: 'var(--accent-purple)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>+ 추가</button>
                  </div>
                  {myStyles.map((st, si) => (
                    <div key={si} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--bd-soft)', marginBottom: 4, background: st.selected ? '#7F77DD08' : 'var(--bg-subtle)', fontSize: '0.786rem' }}>
                      {editingStyleIdx === si ? (
                        <div>
                          <input value={st.name} onChange={e => { const n = [...myStyles]; n[si] = { ...n[si], name: e.target.value }; setMyStyles(n); }} placeholder="이름" style={{ width: '100%', padding: '3px 6px', borderRadius: 8, border: 'none', fontSize: '0.857rem', outline: 'none', marginBottom: 4, boxSizing: 'border-box' }} />
                          <textarea value={st.content} onChange={e => { const n = [...myStyles]; n[si] = { ...n[si], content: e.target.value }; setMyStyles(n); }} rows={3} placeholder="스타일 내용"
                            style={{ width: '100%', padding: 6, borderRadius: 8, border: 'none', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)' }} />
                          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                            <button onClick={() => { saveMyStyles({ styles: myStyles }); setEditingStyleIdx(-1); }} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: '0.643rem', fontWeight: 600, cursor: 'pointer' }}>저장</button>
                            <button onClick={() => setEditingStyleIdx(-1)} style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                          </div>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                          <input type="checkbox" checked={!!st.selected} onChange={e => { const n = [...myStyles]; n[si] = { ...n[si], selected: e.target.checked }; setMyStyles(n); saveMyStyles({ styles: n }); }} style={{ accentColor: 'var(--accent-purple)', marginTop: 2, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--c-text)', marginBottom: 2 }}>{st.name || '(이름 없음)'}</div>
                            <div style={{ color: 'var(--c-sub)', lineHeight: 1.5 }}>{st.content.length > 80 ? st.content.slice(0, 80) + '...' : st.content}</div>
                          </div>
                          <button onClick={() => setEditingStyleIdx(si)} style={{ padding: '1px 6px', borderRadius: 3, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.571rem', cursor: 'pointer', flexShrink: 0 }}>편집</button>
                          <button onClick={() => { if (!confirm(`"${st.name}" 삭제?`)) return; const n = myStyles.filter((_, i) => i !== si); setMyStyles(n); saveMyStyles({ styles: n }); }} style={{ padding: '1px 6px', borderRadius: 3, border: '1px solid var(--c-danger)', background: 'transparent', color: 'var(--c-danger)', fontSize: '0.571rem', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {addingStyle && (
                    <div style={{ padding: '6px 8px', borderRadius: 6, border: '1px dashed var(--accent-purple)', marginBottom: 4, background: 'var(--bg-subtle)' }}>
                      <input value={newStyleName} onChange={e => setNewStyleName(e.target.value)} placeholder="스타일 이름 (예: 도입, 마무리, 예시...)" style={{ width: '100%', padding: '3px 6px', borderRadius: 4, border: '1px solid var(--bd)', fontSize: '0.857rem', outline: 'none', marginBottom: 4, boxSizing: 'border-box' }} />
                      <textarea value={newStyleContent} onChange={e => setNewStyleContent(e.target.value)} rows={3} placeholder="스타일 내용 (예: 비유를 사용해줘, 감동적으로...)"
                        style={{ width: '100%', padding: 6, borderRadius: 8, border: 'none', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)' }} />
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <button onClick={() => { if (!newStyleName.trim() || !newStyleContent.trim()) return; const n = [...myStyles, { name: newStyleName, content: newStyleContent, selected: true }]; setMyStyles(n); saveMyStyles({ styles: n }); setAddingStyle(false); }} style={{ padding: '3px 10px', borderRadius: 4, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: '0.643rem', fontWeight: 600, cursor: 'pointer' }}>추가</button>
                        <button onClick={() => setAddingStyle(false)} style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>취소</button>
                      </div>
                    </div>
                  )}
                  {myStyles.length === 0 && !addingStyle && <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', padding: '4px 0' }}>[+ 추가]를 눌러 스타일을 등록하세요</div>}
                </div>
                {/* 스타일 검색 */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', marginBottom: 4 }}>── 스타일 검색 ──</div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6,
                    background: 'var(--bg-subtle)', borderRadius: 8, padding: 2,
                    overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                  }}>
                    {['전체', '도입', '구조', '성구', '예시', '언어습관', '마무리'].map(cat => (
                      <button key={cat} onClick={() => {
                        const isFull = cat === '전체';
                        setStyleQuery(isFull ? '' : cat);
                        setStyleLoading(true);
                        searchSpeakerMemo({ query: isFull ? '연설' : '', category: isFull ? '' : cat, top_k: 20 })
                          .then(r => setStyleResults(r.results || [])).catch(() => {}).finally(() => setStyleLoading(false));
                      }} style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: '0.786rem', fontWeight: styleQuery === (cat === '전체' ? '' : cat) ? 700 : 500,
                        border: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                        background: styleQuery === (cat === '전체' ? '' : cat) ? 'var(--bg-card)' : 'transparent',
                        color: styleQuery === (cat === '전체' ? '' : cat) ? 'var(--accent-purple)' : 'var(--c-muted)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        boxShadow: styleQuery === (cat === '전체' ? '' : cat) ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                      }}>{cat}</button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                    <input value={styleQuery} onChange={e => setStyleQuery(e.target.value)} placeholder="자유 검색 (비유, 감정 묘사...)"
                      onKeyDown={e => { if (e.key === 'Enter' && styleQuery.trim()) { setStyleLoading(true); searchSpeakerMemo({ query: styleQuery, top_k: 20 }).then(r => setStyleResults(r.results || [])).catch(() => {}).finally(() => setStyleLoading(false)); } }}
                      style={{ flex: 1, padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: '0.786rem', background: 'var(--bg-subtle)', outline: 'none', fontFamily: 'inherit', color: 'var(--c-text-dark)' }} />
                    <button onClick={() => { if (!styleQuery.trim()) return; setStyleLoading(true); searchSpeakerMemo({ query: styleQuery, top_k: 20 }).then(r => setStyleResults(r.results || [])).catch(() => {}).finally(() => setStyleLoading(false)); }}
                      disabled={styleLoading} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: styleLoading ? 'var(--bd-medium)' : 'var(--accent-purple)', color: '#fff', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{styleLoading ? '...' : '🔍'}</button>
                  </div>
                </div>
                {styleResults.length > 0 && (
                  <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                    {styleResults.map((r, i) => {
                      const m = r.metadata || {};
                      const body = (r.text || '').split('\n').filter(l => !l.startsWith('[') && l.trim()).join('\n').trim();
                      const rating = m.rating || 0;
                      return (
                        <div key={i} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--bd-soft)', marginBottom: 4, background: 'var(--bg-card)', fontSize: '0.786rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            {rating > 0 && <span style={{ fontSize: '0.643rem', color: 'var(--accent-brown)', fontWeight: 700 }}>⭐{rating}</span>}
                            <span style={{ fontWeight: 600 }}>{m.speaker || '미상'}</span>
                            {m.outline_num && <span style={{ color: 'var(--c-dim)' }}>· {m.outline_num}{/^\d+$/.test(m.outline_num) ? '번' : ''}</span>}
                            {m.memo_category && <span style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: 'var(--accent-purple)', color: '#fff' }}>{m.memo_category}</span>}
                            <div style={{ flex: 1 }} />
                            <button onClick={() => {
                              const name = (m.memo_category || '참고') + ' (' + (m.speaker || '미상') + ')';
                              const n = [...myStyles, { name, content: body, type: 'reference', source_id: r.id, selected: true }];
                              setMyStyles(n); saveMyStyles({ styles: n });
                            }} style={{ padding: '1px 6px', borderRadius: 3, border: '1px solid var(--accent-purple)', background: 'transparent', color: 'var(--accent-purple)', fontSize: '0.571rem', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>+ 추가</button>
                          </div>
                          <div style={{ color: 'var(--c-sub)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{selStyles[`exp_${i}`] ? body : body.length > 120 ? body.slice(0, 120) + '...' : body}</div>
                          {body.length > 120 && (
                            <button onClick={() => setSelStyles(p => ({ ...p, [`exp_${i}`]: !p[`exp_${i}`] }))} style={{ marginTop: 2, padding: '1px 6px', borderRadius: 3, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.571rem', cursor: 'pointer' }}>{selStyles[`exp_${i}`] ? '접기' : '전체 보기'}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {styleResults.length === 0 && !styleLoading && styleQuery && (
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', textAlign: 'center', padding: 8 }}>검색 결과가 없습니다</div>
                )}
              </div>
            )}
          </div>

          <div style={{ borderRadius: 8, border: '1px solid var(--opt-bd)', background: 'var(--opt-bg)', padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--accent-orange)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: '0.857rem' }}>⚙</span> AI 생성 옵션
            </div>
            <div style={{ marginBottom: 10 }}>
              <AiModelSelector ai={ai} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <PresetPills storageKey="jw-speech-preset" label="AI 프리셋" onChange={setSpeechPreset} />
            </div>
            <EditableBlock value={instructions} onChange={setInstructions} label="AI 지시사항" icon="!" color="var(--accent-orange)" borderColor="var(--tint-orange-bd)" bgColor="var(--tint-orange-light)" headerBg="var(--tint-orange-header)"
              placeholder={"연설문 생성 시 AI에게 전달할 지시사항\n\n예:\n- 청중에게 질문을 많이 사용해 주세요\n- 도입부에 경험담을 넣어 주세요"} buttonLabel="+ AI 지시사항" />
          </div>

          {error && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--tint-red)', border: '1px solid var(--tint-red-bd)', color: 'var(--c-danger)', fontSize: '0.857rem', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{error}</span>
              <button onClick={() => setError('')} style={{ border: 'none', background: 'none', color: 'var(--c-danger)', fontSize: '1.143rem', cursor: 'pointer', padding: '0 4px', lineHeight: 1, flexShrink: 0 }}>×</button>
            </div>
          )}

          <div style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 12, fontSize: '0.857rem', color: 'var(--c-sub)', lineHeight: 1.8 }}>
            <div>제목: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{speechTitle.trim() || parsedTitle || '(없음)'}</span></div>
            {finalDurationDisplay && <div>시간: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{finalDurationDisplay}</span></div>}
            <div>검색 자료: <span style={{ color: 'var(--c-text)', fontWeight: 600 }}>{selCount}건 선택</span>{(() => { const sc = myStyles.filter(s => s.selected).length + Object.values(selStyles).filter(Boolean).length; return sc > 0 ? <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}> + 스타일 {sc}건</span> : null; })()}</div>
            {priorityCount > 0 && <div>우선 자료: <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{priorityCount}건</span></div>}
            {totalPubCount > 0 && <div>출판물 사용: <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{totalPubCount}건</span></div>}
            {pointExtraCount > 0 && <div>요점별 추가: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{pointExtraCount}건</span></div>}
            {extraMat && <div>추가 자료: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>있음</span></div>}
            {instructions && <div>AI 지시: <span style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>있음</span></div>}
            {ai.aiModel && <div>모델: <span style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>{ai.aiPlatform} / {
              (ai.aiModels[ai.aiPlatform] || []).find(m => m.value === ai.aiModel)?.label || ai.aiModel
            }{ai.isDefaultModel ? ' ★' : ''}</span></div>}
          </div>

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
          <GenerateButton onClick={handleGenerate} disabled={selCount === 0 || !password} generating={generating}
            streamProgress={streamProgress} streamMsg={streamMsg}
            label={'선택된 ' + selCount + '건으로 연설문 생성'} abortRef={abortRef} />
        </div>
      )}

      {/* Speech output */}
      {speech && (
        <RefinePanel
          script={speech} onScriptChange={setSpeech} password={password} aiModel={ai.aiModel}
          presetStorageKey="jw-refine-preset" title="생성된 연설문"
          generating={generating} streamProgress={streamProgress} streamMsg={streamMsg}
          error={error} onError={setError} onClearError={() => setError('')}
          onRegenerate={() => { setSpeech(''); setPhase(3); }}
        />
      )}

      </>)}

      </>)}
      {showScrollDown && !(page === 'search' && searchMode === 'chat') && (
        <div style={{ position: 'sticky', bottom: 20, zIndex: 11, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <button onClick={() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' })}
            style={{
              width: 36, height: 36, borderRadius: 18, border: 'none',
              background: 'var(--bg-card)', color: 'var(--c-muted)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.143rem', cursor: 'pointer', transition: 'all 0.2s',
              pointerEvents: 'auto',
            }}>↓</button>
        </div>
      )}
      </Suspense>
      {/* 플로팅 메모 버튼 (AI 대화 화면 제외) */}
      {!(page === 'search' && searchMode === 'chat') && (
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 50 }}>
        <button onClick={() => setMemoOpen(true)} style={{
          width: 48, height: 48, borderRadius: 24, border: 'none',
          background: 'var(--accent-orange)', color: '#fff', fontSize: '1.286rem',
          boxShadow: '0 4px 12px rgba(216,90,48,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'transform 0.15s',
        }}>✎</button>
      </div>
      )}
      {/* 메모 모달 */}
      {memoOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '90%', maxWidth: 400, borderRadius: 16, background: 'var(--bg-card)', padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '1.0rem', fontWeight: 700, flex: 1 }}>간단 메모</span>
              <button onClick={() => setMemoOpen(false)} style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-muted)', fontSize: '0.929rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <input value={memoTopic} onChange={e => setMemoTopic(e.target.value)} placeholder="주제 (선택)"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
            <textarea value={memoContent} onChange={e => setMemoContent(e.target.value)} placeholder="내용을 입력하세요" rows={6}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.7 }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={saveMemo} disabled={memoSaving || !memoContent.trim()} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                background: memoSaving ? 'var(--bd-medium)' : 'var(--accent-orange)', color: '#fff',
                fontSize: '0.929rem', fontWeight: 700, cursor: memoSaving ? 'default' : 'pointer',
              }}>{memoSaving ? '저장 중...' : '저장'}</button>
            </div>
            {memoMsg && <div style={{ marginTop: 8, fontSize: '0.786rem', textAlign: 'center', color: memoMsg.startsWith('오류') ? 'var(--c-danger)' : 'var(--accent)', fontWeight: 600 }}>{memoMsg}</div>}
          </div>
        </div>
      )}
    </div>
  </AlertProvider></ConfirmProvider>);
}
