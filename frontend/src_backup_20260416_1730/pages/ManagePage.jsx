import { useState, useEffect, useRef, Fragment } from 'react';
import KoreanTextarea from '../components/KoreanTextarea';
import { parseDocument, sourceLabel, cleanMd } from '../components/utils';
import { getBody } from '../utils/textHelpers';
import { dbAdd, dbDelete, dbUpdate, deleteServiceType, freeSearch, getServiceTypes, outlineList, outlineDetail, listBySource, listManualEntries, listOriginals, listSpeakerMemos, listCollection, batchAdd, batchList, batchDelete, getApiKeys, saveApiKeys, ollamaModels, ollamaPull, ollamaDelete, getPasswordStatus, changePassword, getFilterModel, setFilterModel, getOllamaCtx, setOllamaCtx, getOllamaThink, setOllamaThink, getChatTurns, setChatTurns, setChatSearchTopK, getPrompts, setPrompt, resetPrompt, savePromptDefault, getAiModels, saveAiModels as saveAiModelsAPI, getApiVersions, saveApiVersions, parseMdFiles, saveOutline, saveSpeech, savePublication, saveOriginal, bulkSave, checkDuplicates, bibleLookup, draftSave, draftCheck, draftLoad, draftComplete, draftDelete, draftList, deleteOutline } from '../api';

const OUTLINE_TYPES = [
  { name: '공개 강연', code: 'S-34', numPh: '001~196', verPh: '10/24' },
  { name: '생활과 봉사', code: 'SB', numPh: '001~ (주차)', verPh: '2604 (년월)', timePh: '10분' },
  { name: '특별 행사', code: 'S-31', numPh: '001', verPh: '2026', sub: [
    { name: '기념식', code: 'S-31' },
    { name: '특별 강연', code: 'S-123' },
    { name: 'RP 모임', code: 'S-211' },
  ]},
  { name: '대회', code: 'CO', numPh: '001~ (순서)', verPh: '2026', sub: [
    { name: '순회 대회', code: 'CO_순회' },
    { name: '지역 대회', code: 'CO_지역' },
  ]},
  { name: '기타', code: 'ETC', numPh: '자유', verPh: '자유' },
];

const getOutlineTypeInfo = (code) => {
  for (const t of OUTLINE_TYPES) {
    if (t.code === code) return t;
    if (t.sub) for (const s of t.sub) if (s.code === code) return { ...t, ...s };
  }
  return OUTLINE_TYPES[0];
};

export default function ManagePage({ fontSize, pendingPub, clearPendingPub, onSaveReturn, pageType, onGoAdd }) {
  const defaultMode = pageType === 'add' ? 'add' : 'memo';
  const [mode, setMode] = useState(() => {
    if (pageType === 'add') return 'add';
    try { const saved = localStorage.getItem('jw-manage-mode'); return (saved && saved !== 'add') ? saved : 'memo'; } catch(e) { return 'memo'; }
  });
  const [aiOpenSections, setAiOpenSections] = useState({ model: true });
  const toggleAiSection = async (k) => {
    const opening = !aiOpenSections[k];
    setAiOpenSections(p => ({ ...p, [k]: !p[k] }));
    if (opening && k === 'llm' && !filterModel) {
      try {
        const [fm, om, ctx, think, turns] = await Promise.all([getFilterModel(), ollamaModels(), getOllamaCtx(), getOllamaThink(), getChatTurns()]);
        setFilterModelState({ current: fm.filter_model, models: om.models || [] });
        setOllamaCtxState(ctx);
        setOllamaThinkState(think);
        setChatTurnsState(turns.chat_max_turns || 10);
        setChatSearchTopKState(turns.chat_search_top_k || 10);
      } catch {}
    }
    if (opening && k === 'prompt' && !promptData) {
      try { const data = await getPrompts(); setPromptData(data); setPromptEdits({ ...data.prompts }); } catch {}
    }
    if (opening && k === 'api' && !apiVersions) {
      try { setApiVersions(await getApiVersions()); } catch {}
    }
  };
  const defaultForm = { speaker: '', topic: '', date: '', outline_num: '', outline_type: '', outline_title: '', subtopic: '', point_id: '', point_summary: '', keywords: '', scriptures: '', content: '', entry_type: 'speech_point', source: '봉사 모임', pub_code: '', service_type: '', sub_source: '' };
  const [addForm, setAddForm] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-addform')) || defaultForm; } catch(e) { return defaultForm; } });
  useEffect(() => { if (pageType !== 'add') { try { localStorage.setItem('jw-manage-mode', mode); } catch(e) {} } }, [mode, pageType]);
  useEffect(() => { try { localStorage.setItem('jw-addform', JSON.stringify(addForm)); } catch(e) {} }, [addForm]);
  const [outlines, setOutlines] = useState([]);
  const [subtopics, setSubtopics] = useState({});
  const [saving, setSaving] = useState(false);
  const [fromPub, setFromPub] = useState(false);
  const [outlineQuery, setOutlineQuery] = useState('');
  const [outlineFocus, setOutlineFocus] = useState(false);
  const [batchEntries, setBatchEntries] = useState([]);
  const [batchInfo, setBatchInfo] = useState('');
  const [batchLog, setBatchLog] = useState([]);
  // ── 전처리 state ──
  const [prepMode, setPrepMode] = useState(() => { try { return localStorage.getItem('jw-prep-mode') || 'file'; } catch { return 'file'; } });
  useEffect(() => { try { localStorage.setItem('jw-prep-mode', prepMode); } catch {} }, [prepMode]);
  // 파일 업로드 모드
  const [mdParsed, setMdParsed] = useState(null);
  const [mdParsing, setMdParsing] = useState(false);
  const [mdSaving, setMdSaving] = useState({});
  const [mdResult, setMdResult] = useState('');
  // 텍스트 입력 모드
  const [txtMeta, setTxtMeta] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-txt-meta')) || { outlineType: 'S-34', outlineNum: '', outlineTitle: '', version: '', duration: '' }; } catch { return { outlineType: 'S-34', outlineNum: '', outlineTitle: '', version: '', duration: '' }; } });
  const [txtContent, setTxtContent] = useState(() => { try { return localStorage.getItem('jw-txt-content') || ''; } catch { return ''; } });
  const [txtParsed, setTxtParsed] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-txt-parsed')) || []; } catch { return []; } });
  const [txtSaving, setTxtSaving] = useState(false);
  const [txtResult, setTxtResult] = useState('');
  useEffect(() => { try { localStorage.setItem('jw-txt-meta', JSON.stringify(txtMeta)); } catch {} }, [txtMeta]);
  useEffect(() => { try { localStorage.setItem('jw-txt-content', txtContent); } catch {} }, [txtContent]);
  useEffect(() => { try { localStorage.setItem('jw-txt-parsed', JSON.stringify(txtParsed.map(p => ({ ...p, _editing: undefined })))); } catch {} }, [txtParsed]);
  const [fileStatus, setFileStatus] = useState({}); // { "outline_0": "saving"|"done"|"dup"|"error"|"skipped", "outline_0_msg": "..." }
  const [saveMsg, setSaveMsg] = useState('');
  const [manageServiceTypes, setManageServiceTypes] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-stypes')) || ['일반', '재방문', '기념식', '지역대회', '특별활동']; } catch(e) { return ['일반', '재방문', '기념식', '지역대회', '특별활동']; } });
  const [discussionTypes, setDiscussionTypes] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-dtypes')) || ['집회 교재']; } catch(e) { return ['집회 교재']; } });
  const _listMounted = useRef(false);
  useEffect(() => { if (!_listMounted.current) { _listMounted.current = true; return; } try { localStorage.setItem('jw-stypes', JSON.stringify(manageServiceTypes)); } catch(e) {} }, [manageServiceTypes]);
  useEffect(() => { if (!_listMounted.current) return; try { localStorage.setItem('jw-dtypes', JSON.stringify(discussionTypes)); } catch(e) {} }, [discussionTypes]);
  const [addingDType, setAddingDType] = useState(false);
  const [newDType, setNewDType] = useState('');
  const [editingDTypes, setEditingDTypes] = useState(false);
  const defaultDTypes = ['집회 교재'];
  const [speechSubTypes, setSpeechSubTypes] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-sstypes')) || ['성경에 담긴 보물', '회중의 필요']; } catch(e) { return ['성경에 담긴 보물', '회중의 필요']; } });
  useEffect(() => { if (!_listMounted.current) return; try { localStorage.setItem('jw-sstypes', JSON.stringify(speechSubTypes)); } catch(e) {} }, [speechSubTypes]);
  const [addingSType, setAddingSType] = useState(false);
  const [newSType, setNewSType] = useState('');
  const [editingSTypes, setEditingSTypes] = useState(false);
  const defaultSTypes = ['성경에 담긴 보물', '회중의 필요'];
  const swapArr = (arr, i, j) => { const n = [...arr]; [n[i], n[j]] = [n[j], n[i]]; return n; };
  const [visitSituations, setVisitSituations] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-vsits')) || ['일반']; } catch(e) { return ['일반']; } });
  useEffect(() => { if (!_listMounted.current) return; try { localStorage.setItem('jw-vsits', JSON.stringify(visitSituations)); } catch(e) {} }, [visitSituations]);
  const [addingVSit, setAddingVSit] = useState(false);
  const [newVSit, setNewVSit] = useState('');
  const [editingVSits, setEditingVSits] = useState(false);
  const defaultVSits = ['일반'];
  const [selSituations, setSelSituations] = useState(() => { try { const f = JSON.parse(localStorage.getItem('jw-addform')); return new Set((f?.service_type || '').split(',').filter(Boolean)); } catch(e) { return new Set(); } });
  useEffect(() => { if (addForm.source === '방문') setAddForm(p => ({ ...p, service_type: [...selSituations].join(',') })); }, [selSituations]);
  const [addingMType, setAddingMType] = useState(false);
  const [newMType, setNewMType] = useState('');
  const [editingMTypes, setEditingMTypes] = useState(false);
  const defaultMTypes = ['일반', '재방문', '기념식', '지역대회', '특별활동'];
  // ── 연설 입력 state ──
  const [addTab, setAddTab] = useState(() => { try { const s = localStorage.getItem('jw-add-tab'); return ['input', 'preprocess', 'drafts'].includes(s) ? s : 'input'; } catch { return 'input'; } });
  const [inputMode, setInputMode] = useState(() => { try { return localStorage.getItem('jw-input-mode') || 'speech_input'; } catch { return 'speech_input'; } });
  useEffect(() => { try { localStorage.setItem('jw-add-tab', addTab); } catch {} }, [addTab]);
  useEffect(() => { try { localStorage.setItem('jw-input-mode', inputMode); } catch {} }, [inputMode]);
  const _siInit = (() => { try { return JSON.parse(localStorage.getItem('jw-si-state')) || {}; } catch { return {}; } })();
  const _siDateDefault = (() => { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); })();
  const [siOutline, setSiOutline] = useState(_siInit.outline || null);
  const [siSubtopics, setSiSubtopics] = useState({});
  const [siSubLoading, setSiSubLoading] = useState(false);
  const [siQuery, setSiQuery] = useState(_siInit.query || '');
  const [siQueryFocus, setSiQueryFocus] = useState(false);
  const [siSpeaker, setSiSpeaker] = useState(_siInit.speaker || '');
  const [siDate, setSiDate] = useState(_siInit.date || _siDateDefault);
  const [siMode, setSiMode] = useState(_siInit.mode || 'quick');
  const [siExpanded, setSiExpanded] = useState({});
  const [siNotes, setSiNotes] = useState(_siInit.notes || {});
  const [siDetails, setSiDetails] = useState(_siInit.details || {});
  const [siNoOutline, setSiNoOutline] = useState(_siInit.noOutline || false);
  const [siOutlineNote, setSiOutlineNote] = useState('');
  const [siNoteOpen, setSiNoteOpen] = useState(false);
  const [siFreeText, setSiFreeText] = useState(_siInit.freeText || '');
  const [siFreeTopic, setSiFreeTopic] = useState(_siInit.freeTopic || '');
  useEffect(() => { try { localStorage.setItem('jw-si-state', JSON.stringify({
    outline: siOutline, query: siQuery, speaker: siSpeaker, date: siDate,
    mode: siMode, notes: siNotes, details: siDetails,
    noOutline: siNoOutline, freeText: siFreeText, freeTopic: siFreeTopic,
  })); } catch {} }, [siOutline, siQuery, siSpeaker, siDate, siMode, siNotes, siDetails, siNoOutline, siFreeText, siFreeTopic]);
  // 마운트 시 골자 복원 → 소주제 재로드
  useEffect(() => {
    if (!siOutline || !siOutline.outline_num) return;
    const oid = `${siOutline.outline_type || 'S-34'}_${siOutline.outline_num}`;
    setSiSubLoading(true);
    outlineDetail(oid, siOutline.outline_type_name || siOutline.outline_type || '').then(r => { setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || ''); }).catch(() => {}).finally(() => setSiSubLoading(false));
  }, []);
  // 빠른메모 → 연설 입력 전달 처리
  const [siTransferMemo, setSiTransferMemo] = useState(null); // { memoId, memoCol }
  // transfer 데이터 처리 — addTab 변경 시 + 외부 트리거(si-transfer 이벤트) 시
  const [siTransferTick, setSiTransferTick] = useState(0);
  useEffect(() => {
    const handler = () => { setAddTab('speech_input'); setSiTransferTick(t => t + 1); };
    window.addEventListener('si-transfer', handler);
    return () => window.removeEventListener('si-transfer', handler);
  }, []);
  useEffect(() => {
    if (addTab !== 'speech_input') return;
    let raw; try { raw = localStorage.getItem('jw-si-transfer'); } catch { return; }
    if (!raw) return;
    try { localStorage.removeItem('jw-si-transfer'); } catch {}
    let t; try { t = JSON.parse(raw); } catch { return; }
    if (!t) return;
    // 기존 state 전부 리셋
    setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({});
    setSiExpanded({}); setSiNoOutline(false); setSiFreeText(''); setSiFreeTopic('');
    setSiVerseOpen({}); setSiVerseData({}); setSiDraftInfo(null); setSiNoteInfo(null);
    setSiSpeaker(t.speaker || '');
    setSiDate(t.date || _siDateDefault);
    setSiSaveMsg('');
    setSiTransferMemo(t.memoId ? { id: t.memoId, col: t.memoCol } : null);
    if (t.isDraft) siDraftLoadedRef.current = true;
    if (t.outline_num) {
      // 골자 번호로 골자 자동 선택
      const matched = outlines.find(g => g.outline_num === t.outline_num);
      if (matched) {
        setSiOutline(matched); setSiNoOutline(false);
        setSiQuery(`${matched.outline_num} - ${matched.title}`);
        const oid = `${matched.outline_type || 'S-34'}_${matched.outline_num}`;
        const oType = matched.outline_type_name || matched.outline_type || '';
        setSiSubLoading(true);
        outlineDetail(oid, oType).then(r => {
          setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || '');
          // draft 이어서 입력: draft 로드
          if (t.isDraft) {
            draftLoad({ outline_num: t.outline_num, speaker: t.speaker, date: t.date, outline_type: t.outline_type || '' }).then(dr => {
              if (dr.exists) {
                if (dr.notes) setSiNotes(dr.notes);
                const finalMode = t.forceMode || dr.mode || 'quick';
                // 간단→상세 직접 이동: notes를 details 첫 요점에 매핑
                const mergedDetails = { ...(dr.details || {}) };
                if (finalMode === 'detail' && dr.notes) {
                  Object.entries(r.subtopics || {}).forEach(([stKey, pts]) => {
                    const note = (dr.notes[stKey] || '').trim();
                    if (note && pts.length) {
                      const ptKey = `${stKey.split('.')[0]}_${pts[0].point_num}`;
                      if (!(mergedDetails[ptKey]?.text || '').trim()) mergedDetails[ptKey] = { ...mergedDetails[ptKey], text: note };
                    }
                  });
                }
                setSiDetails(mergedDetails);
                setSiMode(finalMode);
                // 입력된 소주제만 펼침 (notes + details 양쪽 체크)
                const exp = {};
                Object.entries(r.subtopics || {}).forEach(([stKey, pts]) => {
                  if ((dr.notes?.[stKey] || '').trim()) { exp[stKey] = true; return; }
                  const hasDetail = (pts || []).some(pt => {
                    const ptKey = `${stKey.split('.')[0]}_${pt.point_num}`;
                    const d = dr.details?.[ptKey];
                    return d && ((d.text || '').trim() || (d.tags || '').trim());
                  });
                  if (hasDetail) exp[stKey] = true;
                });
                setSiExpanded(exp);
              }
            }).catch(() => {});
          } else if (t.content) {
            const keys = Object.keys(r.subtopics || {});
            if (keys.length) setSiNotes(p => ({ ...p, [keys[0]]: t.content }));
          }
        }).catch(() => setSiSubtopics({})).finally(() => setSiSubLoading(false));
      } else {
        // 골자 없음 모드
        setSiNoOutline(true); setSiOutline(null); setSiSubtopics({});
        setSiFreeTopic(t.outline_title || ''); setSiFreeText(t.content || '');
      }
    } else {
      // 골자 없음
      setSiNoOutline(true); setSiOutline(null); setSiSubtopics({});
      setSiFreeTopic(t.outline_title || ''); setSiFreeText(t.content || '');
    }
  }, [addTab, siTransferTick]);
  // 골자+연사+날짜 조합 변경 시 draft/note 체크
  useEffect(() => {
    if (!siOutline || !siSpeaker.trim() || !siDate.trim()) { setSiDraftInfo(null); setSiNoteInfo(null); return; }
    // transfer로 draft를 이미 로드한 경우 draftCheck 스킵 (한 번만)
    if (siDraftLoadedRef.current) { siDraftLoadedRef.current = false; setSiDraftInfo(null); }
    else draftCheck({ outline_num: siOutline.outline_num, speaker: siSpeaker.trim(), date: siDate.trim(), outline_type: siOutline.outline_type || 'S-34' }).then(r => setSiDraftInfo(r.exists ? r : null)).catch(() => setSiDraftInfo(null));
    listBySource('note', 10, '').then(r => {
      const match = (r.entries || []).find(e => e.metadata?.outline_num === siOutline.outline_num && e.metadata?.speaker === siSpeaker.trim() && e.metadata?.date === siDate.trim());
      setSiNoteInfo(match || null);
    }).catch(() => setSiNoteInfo(null));
  }, [siOutline?.outline_num, siSpeaker, siDate]);
  const [siVerseOpen, setSiVerseOpen] = useState({}); // { ptKey: true }
  const [siVerseData, setSiVerseData] = useState({}); // { ptKey: [{ ref, text }] }
  const [siVerseLoading, setSiVerseLoading] = useState({}); // { ptKey: true }
  const [siDraftInfo, setSiDraftInfo] = useState(null); // { exists, filled, total, mode, saved_at }
  const siDraftLoadedRef = useRef(false); // transfer로 draft 로드 완료 여부
  const [siNoteInfo, setSiNoteInfo] = useState(null); // existing note entries
  const [siSaving, setSiSaving] = useState(false);
  const [siCompleting, setSiCompleting] = useState(false);
  const [siSaveMsg, setSiSaveMsg] = useState('');
  const [myEntries, setMyEntries] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myDbEditIdx, setMyDbEditIdx] = useState(-1);
  const [myDbEditVal, setMyDbEditVal] = useState('');
  const [myDbEditMeta, setMyDbEditMeta] = useState({});
  const [myDbStat, setMyDbStat] = useState('');
  const [expandedMyDb, setExpandedMyDb] = useState({});
  const [memoEntries, setMemoEntries] = useState([]);
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoEditIdx, setMemoEditIdx] = useState(-1);
  const [memoEditVal, setMemoEditVal] = useState('');
  const [memoStat, setMemoStat] = useState('');
  const [expandedMemo, setExpandedMemo] = useState({});
  const [memoCalMonth, setMemoCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [memoDateFilter, setMemoDateFilter] = useState('all');
  const [memoSortOrder, setMemoSortOrder] = useState('desc');
  const [movingMemo, setMovingMemo] = useState(null); // { collection, id }
  const [myDateFilter, setMyDateFilter] = useState('all');
  const [mySortOrder, setMySortOrder] = useState('desc');
  const _dbTabs = [
    { key: '골자', color: '#1D9E75' },
    { key: '연설', color: '#D85A30' },
    { key: '출판물', color: '#7F77DD' },
    { key: '원문', color: '#2D8FC7' },
    { key: '연사메모', color: '#C7842D' },
  ];
  const _dbTabKeys = _dbTabs.map(t => t.key);
  const _dbTabColor = Object.fromEntries(_dbTabs.map(t => [t.key, t.color]));
  const [viewSource, _setViewSource] = useState(() => { try { const v = localStorage.getItem('jw-db-view'); return _dbTabKeys.includes(v) ? v : '골자'; } catch(e) { return '골자'; } });
  const setViewSource = (v) => { _setViewSource(v); try { localStorage.setItem('jw-db-view', v); } catch(e) {} };
  const [dbCache, setDbCache] = useState({}); // { '골자': [...], '연설': [...], ... }
  const dbEntries = dbCache[viewSource] || [];
  const setDbEntries = (v) => setDbCache(p => ({ ...p, [viewSource]: typeof v === 'function' ? v(p[viewSource] || []) : v }));
  const [dbLoading, setDbLoading] = useState(false);
  const [dbSearch, setDbSearch] = useState('');
  const [speechFilter, setSpeechFilter] = useState('그룹'); // 그룹|목록
  const [dbDrafts, setDbDrafts] = useState([]);
  const [expandedDbEntry, setExpandedDbEntry] = useState({});
  const [dbShowLimit, setDbShowLimit] = useState(50);
  const [dbSelected, setDbSelected] = useState(new Set());
  const [dbDeleting, setDbDeleting] = useState(false);
  const [dbTabCounts, setDbTabCounts] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-db-tab-counts') || '{}'); } catch { return {}; } });
  useEffect(() => { try { localStorage.setItem('jw-db-tab-counts', JSON.stringify(dbTabCounts)); } catch {} }, [dbTabCounts]);
  const [batchGroups, setBatchGroups] = useState([]);
  const [colCounts, setColCounts] = useState({});
  const [batchGroupLoading, setBatchGroupLoading] = useState(false);
  const [selTranscripts, setSelTranscripts] = useState(new Set());
  const [selBatchGroups, setSelBatchGroups] = useState(new Set());
  const [batchFilter, setBatchFilter] = useState('전체');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [transcriptCat, setTranscriptCat] = useState('전체');
  const [origSubTab, setOrigSubTab] = useState('원문');
  const [speakerMemos, setSpeakerMemos] = useState([]);
  const [spMemoLoading, setSpMemoLoading] = useState(false);
  const [memoCatFilter, setMemoCatFilter] = useState('전체');
  const [memoViewMode, setMemoViewMode] = useState('그룹'); // 그룹|목록
  const [memoSearchQ, setMemoSearchQ] = useState('');
  const [expandedSpMemo, setExpandedSpMemo] = useState({});
  const [editingSpMemo, setEditingSpMemo] = useState({});  // { idx: editValue }
  const [manualSearch, setManualSearch] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });

  // ── AI 관리 state ──
  const AI_MODELS_DEFAULT = {
    Local: [{ value: 'gemma4:26b', label: 'Gemma 4 26B' }, { value: 'qwen3.5:27b', label: 'Qwen 3.5 27B' }],
    Gemini: [{ value: 'gemini-2.5-flash', label: '2.5 Flash' }, { value: 'gemini-2.5-pro', label: '2.5 Pro' }],
    Claude: [{ value: 'claude-sonnet-4-20250514', label: 'Sonnet 4' }, { value: 'claude-opus-4-20250514', label: 'Opus 4' }],
    ChatGPT: [{ value: 'gpt-4o', label: 'GPT-4o' }, { value: 'gpt-4o-mini', label: 'GPT-4o Mini' }],
  };
  const [aiModels, setAiModels] = useState(() => { try { const s = JSON.parse(localStorage.getItem('jw-ai-models')); if (s && typeof s === 'object') return s; } catch {} return AI_MODELS_DEFAULT; });
  const serverAiModels = useRef(null); // 서버에 저장된 상태 기억
  const serverAiDefault = useRef(null);
  const serverChatDefault = useRef(null);
  useEffect(() => {
    getAiModels().then(data => {
      if (data.models) {
        setAiModels(data.models);
        localStorage.setItem('jw-ai-models', JSON.stringify(data.models));
        serverAiModels.current = data.models;
      }
      if (data.default?.platform) {
        localStorage.setItem('jw-ai-default', JSON.stringify(data.default));
        serverAiDefault.current = data.default;
        setDefaultTick(t => t + 1);
      } else if (data.default && !data.default.platform) {
        localStorage.removeItem('jw-ai-default');
        serverAiDefault.current = null;
        setDefaultTick(t => t + 1);
      }
      if (data.chat_default?.platform) {
        localStorage.setItem('jw-ai-chat-default', JSON.stringify(data.chat_default));
        serverChatDefault.current = data.chat_default;
        setDefaultTick(t => t + 1);
      } else if (data.chat_default && !data.chat_default.platform) {
        localStorage.removeItem('jw-ai-chat-default');
        serverChatDefault.current = null;
        setDefaultTick(t => t + 1);
      }
    }).catch(() => {});
  }, []);
  const [newModelInputs, setNewModelInputs] = useState({});
  const [newPlatformName, setNewPlatformName] = useState('');
  const [apiKeyStatus, setApiKeyStatus] = useState(null);
  const [apiVersions, setApiVersions] = useState(null);
  const [apiKeyInputs, setApiKeyInputs] = useState({});
  const [apiKeySaving, setApiKeySaving] = useState(false);
  const [aiPassword, setAiPassword] = useState('');
  const [aiError, setAiError] = useState('');
  const [installedModels, setInstalledModels] = useState(null);
  const [pullingModel, setPullingModel] = useState('');
  const [pullProgress, setPullProgress] = useState(0);
  const [defaultTick, setDefaultTick] = useState(0);
  const [pwStatus, setPwStatus] = useState(null);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwChanging, setPwChanging] = useState(false);
  const [pwMsg, setPwMsg] = useState('');
  const [promptData, setPromptData] = useState(null);
  const [promptEdits, setPromptEdits] = useState({});
  const [promptSaving, setPromptSaving] = useState('');
  const [filterModel, setFilterModelState] = useState(null);
  const [filterModelSaving, setFilterModelSaving] = useState(false);
  const [deletingModel, setDeletingModel] = useState('');
  const [ollamaCtx, setOllamaCtxState] = useState(null); // { filter_ctx, gen_ctx }
  const [ollamaThink, setOllamaThinkState] = useState(null); // { filter_no_think, gen_no_think }
  const [chatTurns, setChatTurnsState] = useState(null);
  const [chatSearchTopK, setChatSearchTopKState] = useState(null);
  const getNewInput = (p) => newModelInputs[p] || { value: '', label: '' };
  const setNewInput = (p, field, val) => setNewModelInputs(prev => ({ ...prev, [p]: { ...getNewInput(p), [field]: val } }));
  const [aiModelsDirty, setAiModelsDirty] = useState(false);
  const [aiModelsSaveMsg, setAiModelsSaveMsg] = useState('');
  const [aiEditMode, setAiEditMode] = useState(false);
  const [selectingFor, setSelectingFor] = useState(null); // null | 'default' | 'chat'
  const saveAiModelsLocal = (updated) => { setAiModels(updated); localStorage.setItem('jw-ai-models', JSON.stringify(updated)); setAiModelsDirty(true); setAiModelsSaveMsg(''); };
  const addAiModel = (platform) => { const inp = getNewInput(platform); if (!inp.value.trim()) return; const updated = { ...aiModels }; updated[platform] = [...(updated[platform] || []), { value: inp.value.trim(), label: inp.label.trim() || inp.value.trim() }]; saveAiModelsLocal(updated); setNewModelInputs(prev => ({ ...prev, [platform]: { value: '', label: '' } })); };
  const removeAiModel = (platform, idx) => { const updated = { ...aiModels }; updated[platform] = updated[platform].filter((_, i) => i !== idx); if (updated[platform].length === 0) delete updated[platform]; saveAiModelsLocal(updated); };
  const addAiPlatform = () => { const n = newPlatformName.trim(); if (!n || aiModels[n]) return; saveAiModelsLocal({ ...aiModels, [n]: [] }); setNewPlatformName(''); };
  const removeAiPlatform = (p) => { const updated = { ...aiModels }; delete updated[p]; saveAiModelsLocal(updated); };
  const movePlatform = (platform, dir) => {
    const keys = Object.keys(aiModels);
    const idx = keys.indexOf(platform);
    if ((dir === -1 && idx <= 0) || (dir === 1 && idx >= keys.length - 1)) return;
    const newKeys = [...keys];
    [newKeys[idx], newKeys[idx + dir]] = [newKeys[idx + dir], newKeys[idx]];
    const updated = {};
    newKeys.forEach(k => { updated[k] = aiModels[k]; });
    saveAiModelsLocal(updated);
  };
  const moveModel = (platform, idx, dir) => {
    const models = [...(aiModels[platform] || [])];
    if ((dir === -1 && idx <= 0) || (dir === 1 && idx >= models.length - 1)) return;
    [models[idx], models[idx + dir]] = [models[idx + dir], models[idx]];
    saveAiModelsLocal({ ...aiModels, [platform]: models });
  };
  const resetAiModels = () => {
    const saved = serverAiModels.current || AI_MODELS_DEFAULT;
    setAiModels(saved);
    localStorage.setItem('jw-ai-models', JSON.stringify(saved));
    if (serverAiDefault.current) {
      localStorage.setItem('jw-ai-default', JSON.stringify(serverAiDefault.current));
    } else {
      localStorage.removeItem('jw-ai-default');
    }
    if (serverChatDefault.current) {
      localStorage.setItem('jw-ai-chat-default', JSON.stringify(serverChatDefault.current));
    } else {
      localStorage.removeItem('jw-ai-chat-default');
    }
    setAiModelsDirty(false);
    setAiModelsSaveMsg('');
    setDefaultTick(t => t + 1);
  };
  const savedDefault = (() => { void defaultTick; try { return JSON.parse(localStorage.getItem('jw-ai-default')); } catch { return null; } })();
  const savedChatDefault = (() => { void defaultTick; try { return JSON.parse(localStorage.getItem('jw-ai-chat-default')); } catch { return null; } })();
  const saveAiDefault = (platform, model) => { localStorage.setItem('jw-ai-default', JSON.stringify({ platform, model })); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const clearAiDefault = () => { localStorage.removeItem('jw-ai-default'); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const saveChatAiDefault = (platform, model) => { localStorage.setItem('jw-ai-chat-default', JSON.stringify({ platform, model })); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const clearChatAiDefault = () => { localStorage.removeItem('jw-ai-chat-default'); setAiModelsDirty(true); setAiModelsSaveMsg(''); setDefaultTick(t => t + 1); };
  const saveAiModelsToServer = async () => {
    setAiModelsSaveMsg('저장 중...');
    try {
      const currentDefault = (() => { try { return JSON.parse(localStorage.getItem('jw-ai-default')); } catch { return null; } })();
      const currentChatDefault = (() => { try { return JSON.parse(localStorage.getItem('jw-ai-chat-default')); } catch { return null; } })();
      await saveAiModelsAPI(aiModels, currentDefault || {}, currentChatDefault || {});
      serverAiModels.current = aiModels;
      serverAiDefault.current = currentDefault;
      serverChatDefault.current = currentChatDefault;
      setAiModelsDirty(false);
      setAiModelsSaveMsg('서버 저장 완료');
      setTimeout(() => setAiModelsSaveMsg(''), 2000);
    } catch (e) {
      setAiModelsSaveMsg('저장 실패: ' + e.message);
    }
  };

  useEffect(() => {
    outlineList().then(r => setOutlines(r.outlines || [])).catch(() => {});
    getServiceTypes().then(r => { const remote = r.service_types || []; if (remote.length) { setManageServiceTypes(prev => { const merged = [...prev]; remote.forEach(t => { if (!merged.includes(t)) merged.push(t); }); return merged; }); } }).catch(() => {});
    // localStorage에서 복원된 탭 상태에 따라 데이터 자동 로드
    if (mode === 'mydb') _loadDbTab(viewSource);
    if (mode === 'memo') { setMemoLoading(true); listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}).finally(() => setMemoLoading(false)); }
  }, []);

  useEffect(() => {
    if (!pendingPub) return;
    setMode('add');
    setFromPub(true);
    setAddForm(p => ({
      ...p, source: '연설', sub_source: '기타 연설', entry_type: 'publication',
      pub_code: pendingPub.pub_code || '',
      point_summary: pendingPub.point || '',
      content: pendingPub.content || '',
      topic: pendingPub.topic || p.topic || '',
      outline_title: pendingPub.topic || p.outline_title || '',
    }));
    setSaveMsg('');
    if (clearPendingPub) clearPendingPub();
  }, [pendingPub]);

  const selectOutline = async (g) => {
    if (!g) { setAddForm(p => ({ ...p, outline_num: '', outline_type: '', outline_title: '', subtopic: '', point_id: '', point_summary: '' })); setSubtopics({}); return; }
    setAddForm(p => ({ ...p, outline_num: g.num, outline_type: g.type, outline_title: g.title, topic: g.title, subtopic: '', point_id: '', point_summary: '' }));
    try { const r = await outlineDetail(g.num); setSubtopics(r.subtopics || {}); } catch(e) { setSubtopics({}); }
  };

  const handleSave = async () => {
    if (!addForm.content.trim()) { setSaveMsg('내용을 입력하세요'); return; }
    if (addForm.entry_type === 'publication' && !addForm.pub_code.trim() && addForm.sub_source !== '원문') { setSaveMsg('출판물 코드를 입력하세요'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const formData = addTab === 'memo'
        ? { ...addForm, source: '메모' }
        : addForm.sub_source === '원문' ? { ...addForm, source: '원문' } : addForm;
      const res = await dbAdd(formData);
      if (movingMemo) {
        try { await dbDelete(movingMemo.collection, movingMemo.id); } catch(e) {}
        setMemoEntries(prev => prev.filter(e => e.id !== movingMemo.id));
        setMovingMemo(null);
        setSaveMsg(`이동 완료 (${res.collection})`);
      } else {
        setSaveMsg(`저장 완료 (${res.collection})`);
      }
      setAddForm(p => ({ ...p, subtopic: '', point_id: '', point_summary: '', content: '', keywords: '', scriptures: '' }));
      if (fromPub && onSaveReturn) {
        setFromPub(false);
        setTimeout(() => onSaveReturn(), 800);
      }
    } catch (e) { setSaveMsg('오류: ' + e.message); }
    finally { setSaving(false); }
  };

  const _loadDbTab = (tab) => {
    setDbLoading(true);
    if (tab === '골자') listCollection('speech_points', 'outline').then(r => { setDbCache(p => ({ ...p, '골자': r.entries || [] })); setDbTabCounts(p => ({ ...p, '골자': r.total ?? (r.entries || []).length })); }).catch(() => {}).finally(() => setDbLoading(false));
    else if (tab === '연설') listCollection('speech_expressions', 'speech,note,memo,discussion').then(r => { setDbCache(p => ({ ...p, '연설': r.entries || [] })); setDbTabCounts(p => ({ ...p, '연설': r.total ?? (r.entries || []).length })); }).catch(() => {}).finally(() => setDbLoading(false));
    else if (tab === '출판물') listCollection('publications').then(r => { setDbCache(p => ({ ...p, '출판물': r.entries || [] })); setDbTabCounts(p => ({ ...p, '출판물': r.total ?? (r.entries || []).length })); }).catch(() => {}).finally(() => setDbLoading(false));
    else if (tab === '원문') listOriginals().then(r => { const fe = []; for (const [, g] of Object.entries(r.originals || {})) for (const sp of (g.speakers || [])) fe.push({ id: sp.id, collection: sp.source_type === 'file' ? 'file' : 'speech_expressions', text: sp.text, metadata: { ...sp.metadata, source: '원문' } }); setDbCache(p => ({ ...p, '원문': fe })); setDbTabCounts(p => ({ ...p, '원문': fe.length })); }).catch(() => {}).finally(() => setDbLoading(false));
    else if (tab === '연사메모') { setSpMemoLoading(true); listSpeakerMemos().then(r => { setSpeakerMemos(r.memos || []); setDbTabCounts(p => ({ ...p, '연사메모': (r.memos || []).length })); }).catch(() => {}).finally(() => { setSpMemoLoading(false); setDbLoading(false); }); }
    else setDbLoading(false);
  };
  const tagColor = { speech_points: '#1D9E75', speech_expressions: '#D85A30', publications: '#7F77DD' };
  const tagLabel = { speech_points: '연설 요점', speech_expressions: '표현/예시', publications: '출판물' };
  const iS = { padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' };

  return (
    <div>
      {pageType !== 'add' && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 2, marginBottom: 16,
        background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
      }}>
        {[['memo', '빠른메모'], ['mydb', 'DB'], ['ai', 'AI']].map(([k, l]) => (
          <button key={k} onClick={() => {
            setMode(k);
            if (k === 'mydb' && myEntries.length === 0) {
              setMyLoading(true);
              listManualEntries().then(r => setMyEntries((r.entries || []).filter(e => !['메모', 'memo'].includes(e.metadata?.source || '')))).catch(() => {}).finally(() => setMyLoading(false));
            }
            if (k === 'memo' && memoEntries.length === 0) {
              setMemoLoading(true);
              listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}).finally(() => setMemoLoading(false));
            }
          }} style={{
            flex: 1, padding: '7px 0', border: 'none', fontSize: '0.857rem', fontWeight: mode === k ? 700 : 500, cursor: 'pointer',
            background: mode === k ? 'var(--bg-card, #fff)' : 'transparent',
            color: mode === k ? '#1D9E75' : 'var(--c-muted)',
            borderRadius: 8, fontFamily: 'inherit',
            transition: 'all 0.2s ease',
            boxShadow: mode === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}>{l}</button>
        ))}
      </div>
      )}


      {mode === 'add' && (<>
        {/* 추가 탭 상단 세그먼트 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2, marginBottom: 16,
          background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
        }}>
          {[['input', '입력'], ['preprocess', '전처리'], ['drafts', '임시저장']].map(([k, l]) => (
            <button key={k} onClick={() => { setAddTab(k); if (k === 'preprocess') setAddForm(p => ({ ...p, source: '전처리' })); if (k === 'drafts') { draftList().then(r => setDbDrafts(r.drafts || [])).catch(() => {}); if (memoEntries.length === 0) listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}); } }} style={{
              flex: 1, padding: '7px 0', border: 'none', fontSize: '0.857rem', fontWeight: addTab === k ? 700 : 500, cursor: 'pointer',
              background: addTab === k ? 'var(--bg-card, #fff)' : 'transparent',
              color: addTab === k ? '#1D9E75' : 'var(--c-muted)',
              borderRadius: 8, fontFamily: 'inherit', transition: 'all 0.2s ease',
              boxShadow: addTab === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{l}</button>
          ))}
        </div>

        {(addTab === 'memo' || addTab === 'preprocess') && (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden' }}>
          {/* 전처리 상위 탭 — 카드 헤더 언더라인 */}
          {addTab === 'preprocess' && (
            <div style={{ display: 'flex', borderBottom: '1px solid var(--bd-light)', background: 'var(--bg-subtle)' }}>
              {[['file', '파일 업로드'], ['txt', 'txt 원본'], ['text', '텍스트 입력']].map(([k, l]) => {
                const active = prepMode === k;
                return (
                  <button key={k} onClick={() => setPrepMode(k)} style={{
                    flex: 1, padding: '9px 0 7px', border: 'none', borderBottom: active ? '2px solid #1D9E75' : '2px solid transparent',
                    background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 500, color: active ? '#1D9E75' : 'var(--c-muted)', lineHeight: 1.2 }}>{l}</span>
                    <span style={{ fontSize: '0.571rem', height: '0.571rem' }}>&nbsp;</span>
                  </button>
                );
              })}
            </div>
          )}
          <div style={{ padding: 14 }}>
          {/* 출처 선택 — 메모 탭에서만 */}
          {addTab === 'memo' && (<>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
          }}>
            {['연설', '토의', '봉사 모임', '방문', 'JW 방송'].map(s => (
              <button key={s} onClick={() => setAddForm(p => ({ ...p, source: s, sub_source: s === '연설' ? '공개 강연' : s === '토의' ? '파수대' : '', entry_type: s === '토의' ? 'expression' : s === '봉사 모임' ? 'speech_point' : p.entry_type, service_type: '', outline_num: '', outline_type: '', outline_title: '', subtopic: '', point_id: '', point_summary: '', pub_code: '', topic: '' }))} style={{
                flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: addForm.source === s ? 700 : 500,
                border: 'none',
                background: addForm.source === s ? 'var(--bg-card, #fff)' : 'transparent',
                color: addForm.source === s ? 'var(--c-text-dark)' : 'var(--c-muted)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                transition: 'all 0.2s ease',
                boxShadow: addForm.source === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{s}</button>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--bd-medium)', margin: '10px 0' }} />
          </>)}

          {addTab === 'preprocess' && (
            <div style={{ marginBottom: 8 }}>

              {/* ═══ 1. 파일 업로드 모드 ═══ */}
              {prepMode === 'file' && (
                <div>
                  <input type="file" accept=".md,.txt" id="mdUpload" multiple style={{ display: 'none' }} onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    e.target.value = '';
                    setMdParsing(true); setMdParsed(null); setMdResult('');
                    try {
                      const res = await parseMdFiles(files);
                      setMdParsed(res);
                    } catch (err) { setMdResult('오류: ' + err.message); }
                    finally { setMdParsing(false); }
                  }} />
                  <button onClick={() => document.getElementById('mdUpload').click()} disabled={mdParsing} style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, border: '2px dashed #1D9E75',
                    background: 'var(--tint-green)', color: '#1D9E75', fontSize: '0.929rem', fontWeight: 600, cursor: 'pointer',
                  }}>{mdParsing ? '파싱 중...' : '전처리 md 파일 선택'}</button>

                  {mdParsed && mdParsed.files && (() => {
                    const outlines = mdParsed.files.filter(f => f.file_format === 'outline');
                    const speeches = mdParsed.files.filter(f => f.file_format === 'speech');
                    const pubs = mdParsed.files.filter(f => f.file_format === 'publication');
                    const originals = mdParsed.files.filter(f => f.file_format === 'original');
                    const groups = [
                      { label: '📋 골자', items: outlines, color: '#1D9E75', saveKey: 'outline' },
                      { label: '🎤 연설', items: speeches, color: '#D85A30', saveKey: 'speech' },
                      { label: '📚 출판물', items: pubs, color: '#7F77DD', saveKey: 'publication' },
                      { label: '📄 원문', items: originals, color: '#378ADD', saveKey: 'original' },
                    ].filter(g => g.items.length > 0);
                    return <div style={{ marginTop: 8 }}>
                      <div style={{ textAlign: 'right', marginBottom: 4 }}>
                        <button onClick={() => { setMdParsed(null); setMdResult(''); setMdSaving({}); setFileStatus({}); }} style={{
                          padding: '4px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)',
                          color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
                        }}>초기화</button>
                      </div>
                      {groups.map(g => {
                        const saveFn = g.saveKey === 'outline' ? saveOutline : g.saveKey === 'speech' ? saveSpeech : g.saveKey === 'original' ? saveOriginal : savePublication;
                        const allDone = g.items.every((f, i) => { const s = fileStatus[`${g.saveKey}_${f.filename || i}`]; return s === 'done' || s === 'updated' || s === 'skipped'; });
                        const anyProcessing = g.items.some((f, i) => fileStatus[`${g.saveKey}_${f.filename || i}`] === 'saving');
                        const dupKeys = g.items.map((f, i) => `${g.saveKey}_${f.filename || i}`).filter(k => fileStatus[k] === 'dup');
                        return (
                        <div key={g.saveKey} style={{ marginBottom: 10, borderRadius: 8, border: '1px solid var(--bd-soft)', overflow: 'hidden' }}>
                          <div style={{ background: 'var(--bg-subtle)', padding: '6px 10px', fontSize: '0.857rem', fontWeight: 700, color: g.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                            <span>{g.label} {g.items.length}개</span>
                            {dupKeys.length > 1 && (
                              <div style={{ display: 'flex', gap: 3 }}>
                                <button onClick={async () => {
                                  for (const fKey of dupKeys) {
                                    const fi = g.items.findIndex((f, i) => `${g.saveKey}_${f.filename || i}` === fKey);
                                    if (fi < 0) continue;
                                    setFileStatus(p => ({ ...p, [fKey]: 'saving' }));
                                    try {
                                      await saveFn({ files: [g.items[fi]], overwrite: true, overwrite_outline: true, overwrite_speech: true });
                                      setFileStatus(p => ({ ...p, [fKey]: 'done' }));
                                    } catch (err) { setFileStatus(p => ({ ...p, [fKey]: 'error', [`${fKey}_msg`]: err.message })); }
                                  }
                                }} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: g.color, color: '#fff', fontSize: '0.643rem', fontWeight: 600, cursor: 'pointer' }}>전체 덮어쓰기 ({dupKeys.length})</button>
                                <button onClick={() => { dupKeys.forEach(k => setFileStatus(p => ({ ...p, [k]: 'skipped' }))); }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>전체 건너뛰기</button>
                              </div>
                            )}
                            {allDone ? <span style={{ fontSize: '0.786rem', color: '#1D9E75' }}>완료</span> : (
                              <button onClick={async () => {
                                setMdSaving(p => ({ ...p, [g.saveKey]: true }));
                                setMdResult('');
                                let saved = 0, dups = 0;
                                for (let i = 0; i < g.items.length; i++) {
                                  const fKey = `${g.saveKey}_${g.items[i].filename || i}`;
                                  const st = fileStatus[fKey];
                                  if (st === 'done' || st === 'skipped') continue;
                                  setFileStatus(p => ({ ...p, [fKey]: 'saving' }));
                                  try {
                                    // 원문은 DB 저장 아님 → 중복 체크 스킵
                                    if (g.saveKey !== 'original') {
                                      const dup = await checkDuplicates({ files: [g.items[i]] });
                                      if (dup.has_duplicates) {
                                        setFileStatus(p => ({ ...p, [fKey]: 'dup', [`${fKey}_msg`]: dup.duplicates[0]?.message || '중복' }));
                                        dups++;
                                        continue;
                                      }
                                    }
                                    const saveRes = await saveFn({ files: [g.items[i]], overwrite: false });
                                    const isAllUpdated = (saveRes.total_saved === 0 && saveRes.total_updated > 0);
                                    const isExisting = (saveRes.saved === 0 && saveRes.existing > 0);
                                    if (isExisting) {
                                      setFileStatus(p => ({ ...p, [fKey]: 'dup', [`${fKey}_msg`]: '이미 저장된 원문입니다. 덮어쓰시겠습니까?' }));
                                      dups++;
                                    } else {
                                      setFileStatus(p => ({ ...p, [fKey]: isAllUpdated ? 'updated' : 'done', [`${fKey}_msg`]: isAllUpdated ? `${saveRes.total_updated}개 기존 (참조 추가)` : '' }));
                                      saved++;
                                    }
                                  } catch (err) {
                                    setFileStatus(p => ({ ...p, [fKey]: 'error', [`${fKey}_msg`]: err.message }));
                                  }
                                }
                                const parts = [];
                                if (saved) parts.push(`${saved}개 저장`);
                                if (dups) parts.push(`${dups}개 중복`);
                                if (parts.length) setMdResult(`✓ ${parts.join(' · ')}`);
                                setMdSaving(p => ({ ...p, [g.saveKey]: false }));
                              }} disabled={anyProcessing || mdSaving[g.saveKey]} style={{
                                padding: '3px 10px', borderRadius: 6, border: 'none',
                                background: (anyProcessing || mdSaving[g.saveKey]) ? 'var(--bd-medium)' : g.color, color: '#fff',
                                fontSize: '0.786rem', fontWeight: 700, cursor: 'pointer', position: 'relative', overflow: 'hidden',
                              }}>
                                {(anyProcessing || mdSaving[g.saveKey]) && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%', borderRadius: 6, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                                <span style={{ position: 'relative', zIndex: 1 }}>{(anyProcessing || mdSaving[g.saveKey]) ? '저장 중...' : '일괄 저장'}</span>
                              </button>
                            )}
                          </div>
                          <div style={{ maxHeight: 15 * 38, overflowY: 'auto' }}>
                          {g.items.map((f, fi) => {
                            const m = f.meta || {};
                            const on = m.outline_num || '';
                            const ot = m.outline_type_name || m.outline_type || '';
                            const hasWarn = f.warnings && f.warnings.length > 0;
                            const isPub = g.saveKey === 'publication';
                            const isOrig = g.saveKey === 'original';
                            const fKey = `${g.saveKey}_${f.filename || fi}`;
                            const fSt = fileStatus[fKey] || '';
                            const fMsg = fileStatus[`${fKey}_msg`] || '';
                            return <div key={fi} style={{ padding: '6px 10px', borderTop: fi > 0 ? '1px solid var(--bd-soft)' : 'none', fontSize: '0.786rem', position: 'relative', overflow: 'hidden',
                              background: (fSt === 'done' || fSt === 'updated') ? 'var(--tint-green, #f0faf5)' : fSt === 'skipped' ? 'var(--bg-subtle)' : 'transparent',
                              opacity: fSt === 'skipped' ? 0.5 : 1,
                            }}>
                              {fSt === 'saving' && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', background: 'linear-gradient(90deg, transparent, rgba(29,158,117,0.08), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', position: 'relative' }}>
                                <span style={{ color: fSt === 'done' ? '#1D9E75' : fSt === 'updated' ? '#C7842D' : fSt === 'error' ? '#c44' : fSt === 'skipped' ? 'var(--c-dim)' : hasWarn ? '#c44' : '#1D9E75', fontSize: '0.786rem' }}>
                                  {fSt === 'done' ? '✅' : fSt === 'updated' ? '🔄' : fSt === 'saving' ? '⏳' : fSt === 'error' ? '❌' : fSt === 'skipped' ? '⏭️' : fSt === 'dup' ? '⚠️' : hasWarn ? '⚠️' : '📄'}
                                </span>
                                {isPub ? <>
                                  {ot && <span style={{ color: '#7F77DD', fontWeight: 600 }}>{ot}{on && on !== ot ? ` ${on}${/^\d+$/.test(on) ? '번' : ''}` : ''}</span>}
                                  <span style={{ fontWeight: 600 }}>{m.title || '출판물'}</span>
                                  <span style={{ color: '#7F77DD', fontSize: '0.786rem' }}>출판물</span>
                                </> : isOrig ? <>
                                  <span style={{ fontWeight: 600 }}>{ot}{on && on !== ot ? ` ${on}${/^\d+$/.test(on) ? '번' : ''}` : ''}</span>
                                  <span style={{ color: '#378ADD', fontSize: '0.786rem' }}>원문</span>
                                  {m.title && <span style={{ color: 'var(--c-dim)' }}>— {m.title}</span>}
                                  {m.speaker && <span style={{ color: '#D85A30' }}>· {m.speaker}</span>}
                                  {m.date && <span style={{ color: 'var(--c-dim)' }}>· {m.date}</span>}
                                </> : <>
                                  <span style={{ fontWeight: 600 }}>{ot}{on && on !== ot ? ` ${on}${/^\d+$/.test(on) ? '번' : ''}` : ''}</span>
                                  {m.title && <span style={{ color: 'var(--c-dim)' }}>— {m.title}</span>}
                                  {m.speaker && <span style={{ color: '#D85A30' }}>· {m.speaker}</span>}
                                  {m.date && <span style={{ color: 'var(--c-dim)' }}>· {m.date}</span>}
                                  {m.version && <span style={{ color: 'var(--c-dim)' }}>· v{m.version}</span>}
                                </>}
                                {fSt === 'done' && <span style={{ color: '#1D9E75', fontSize: '0.786rem', marginLeft: 'auto' }}>저장됨</span>}
                                {fSt === 'updated' && <span style={{ color: '#C7842D', fontSize: '0.786rem', marginLeft: 'auto' }}>{fMsg || '참조 추가'}</span>}
                                {fSt === 'skipped' && <span style={{ color: 'var(--c-dim)', fontSize: '0.786rem', marginLeft: 'auto' }}>건너뜀</span>}
                              </div>
                              <div style={{ color: 'var(--c-dim)', fontSize: '0.786rem', marginTop: 2 }}>
                                {f.total_subtopics > 0 && <span>{f.total_subtopics}개 소주제 · </span>}
                                {f.total_points > 0 && <span>{f.total_points}개 요점</span>}
                                {f.total_publications > 0 && <span>{f.total_points > 0 ? ' · ' : ''}{f.total_publications}개 청크</span>}
                              </div>
                              {hasWarn && !fSt && (
                                <div style={{ marginTop: 3 }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                    <button onClick={() => setFileStatus(p => ({ ...p, [`${fKey}_warn`]: !p[`${fKey}_warn`] }))} style={{
                                      padding: '1px 6px', borderRadius: 4, border: '1px solid #c44', background: 'transparent',
                                      color: '#c44', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600,
                                    }}>⚠️ {f.warnings.length}건 {fileStatus[`${fKey}_warn`] ? '닫기' : '확인'}</button>
                                    <button onClick={() => {
                                      setMdParsed(prev => {
                                        if (!prev) return prev;
                                        const newFiles = prev.files.filter((_, idx) => {
                                          const origIdx = prev.files.indexOf(f);
                                          return idx !== origIdx;
                                        });
                                        return { ...prev, files: newFiles, total: newFiles.length };
                                      });
                                      setFileStatus(p => ({ ...p, [fKey]: 'removed' }));
                                    }} style={{
                                      padding: '1px 6px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent',
                                      color: 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer',
                                    }}>제외</button>
                                  </div>
                                  {fileStatus[`${fKey}_warn`] && (
                                    <div style={{ marginTop: 3, padding: '4px 8px', borderRadius: 6, background: '#c4410a08', fontSize: '0.786rem', color: '#c44', lineHeight: 1.6 }}>
                                      {f.warnings.map((w, wi) => <div key={wi}>· {w}</div>)}
                                    </div>
                                  )}
                                </div>
                              )}
                              {fSt === 'error' && <div style={{ color: '#c44', fontSize: '0.786rem', marginTop: 2 }}>{fMsg}</div>}
                              {fSt === 'dup' && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                  <span style={{ fontSize: '0.786rem', color: '#C7842D', flex: 1 }}>{fMsg}</span>
                                  <button onClick={async () => {
                                    setFileStatus(p => ({ ...p, [fKey]: 'saving' }));
                                    try {
                                      await saveFn({ files: [f], overwrite: true, overwrite_outline: true, overwrite_speech: true });
                                      setFileStatus(p => ({ ...p, [fKey]: 'done' }));
                                    } catch (err) { setFileStatus(p => ({ ...p, [fKey]: 'error', [`${fKey}_msg`]: err.message })); }
                                  }} style={{ padding: '2px 8px', borderRadius: 6, border: 'none', background: g.color, color: '#fff', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>덮어쓰기</button>
                                  <button onClick={() => setFileStatus(p => ({ ...p, [fKey]: 'skipped' }))} style={{ padding: '2px 8px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', flexShrink: 0 }}>건너뛰기</button>
                                </div>
                              )}
                            </div>;
                          })}
                          </div>
                        </div>
                      );})}
                    </div>;
                  })()}
                  {mdResult && <div style={{ marginTop: 6, fontSize: '0.786rem', color: mdResult.startsWith('✓') ? '#1D9E75' : '#c44' }}>{mdResult}</div>}
                </div>
              )}

              {/* ═══ 2. txt 원본 모드 (플레이스홀더) ═══ */}
              {prepMode === 'txt' && (
                <div style={{ textAlign: 'center', padding: '30px 10px', color: 'var(--c-dim)' }}>
                  <div style={{ fontSize: '0.929rem', marginBottom: 10 }}>원본 텍스트를 AI가 전처리 md로 변환합니다</div>
                  <button disabled style={{
                    padding: '10px 24px', borderRadius: 8, border: '1px solid var(--bd)',
                    background: 'var(--bg-subtle)', color: 'var(--c-dim)', fontSize: '0.929rem', cursor: 'not-allowed',
                  }}>AI 전처리 (준비 중)</button>
                </div>
              )}

              {/* ═══ 3. 텍스트 입력 모드 ═══ */}
              {prepMode === 'text' && (
                <div>
                  {(() => {
                    const mainType = OUTLINE_TYPES.find(t => t.code === txtMeta.outlineType || t.sub?.some(s => s.code === txtMeta.outlineType)) || OUTLINE_TYPES[0];
                    const hasSub = mainType.sub && mainType.sub.length > 0;
                    const typeInfo = getOutlineTypeInfo(txtMeta.outlineType);
                    const isEtc = mainType.code === 'ETC';
                    const iF = { padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle, #EFEFF4)', boxSizing: 'border-box' };
                    return <>
                      {/* 유형 선택 */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2 }}>
                        {OUTLINE_TYPES.map(t => {
                          const active = mainType.code === t.code;
                          return <button key={t.code} onClick={() => {
                            const code = t.sub ? t.sub[0].code : t.code;
                            setTxtMeta(p => ({ ...p, outlineType: code }));
                          }} style={{
                            flex: 1, padding: '5px 0', border: 'none', borderRadius: 8, fontSize: '0.786rem', fontWeight: active ? 700 : 500,
                            background: active ? 'var(--bg-card, #fff)' : 'transparent', color: active ? '#1D9E75' : 'var(--c-muted)',
                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
                          }}>{t.name}</button>;
                        })}
                      </div>
                      {hasSub && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2 }}>
                          {mainType.sub.map(s => {
                            const active = txtMeta.outlineType === s.code;
                            return <button key={s.code} onClick={() => setTxtMeta(p => ({ ...p, outlineType: s.code }))} style={{
                              flex: 1, padding: '5px 0', border: 'none', borderRadius: 8, fontSize: '0.786rem', fontWeight: active ? 700 : 500,
                              background: active ? 'var(--bg-card, #fff)' : 'transparent', color: active ? '#D85A30' : 'var(--c-muted)',
                              cursor: 'pointer', fontFamily: 'inherit',
                              boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
                            }}>{s.name}</button>;
                          })}
                        </div>
                      )}
                      {/* 메타 입력 */}
                      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                        {isEtc && (
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>유형 코드</div>
                            <input value={txtMeta.outlineType === 'ETC' ? '' : txtMeta.outlineType} onChange={e => setTxtMeta(p => ({ ...p, outlineType: e.target.value || 'ETC' }))} placeholder="코드" style={{ ...iF, width: '100%' }} />
                          </div>
                        )}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>번호</div>
                          <input value={txtMeta.outlineNum} onChange={e => setTxtMeta(p => ({ ...p, outlineNum: e.target.value }))} placeholder={typeInfo.numPh || '001'} style={{ ...iF, width: '100%' }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>버전</div>
                          <input value={txtMeta.version} onChange={e => setTxtMeta(p => ({ ...p, version: e.target.value }))} placeholder={typeInfo.verPh || '10/24'} style={{ ...iF, width: '100%' }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>제목</div>
                          <input value={txtMeta.outlineTitle} onChange={e => setTxtMeta(p => ({ ...p, outlineTitle: e.target.value }))} placeholder="골자 제목" style={{ ...iF, width: '100%' }} />
                        </div>
                        <div style={{ width: 70, flexShrink: 0 }}>
                          <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>시간</div>
                          <input value={txtMeta.duration} onChange={e => setTxtMeta(p => ({ ...p, duration: e.target.value }))} placeholder={typeInfo.timePh || '30분'} style={{ ...iF, width: '100%', textAlign: 'center' }} />
                        </div>
                      </div>

                      {/* 유의사항 */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>유의사항</div>
                        <KoreanTextarea value={txtMeta.note || ''} onChange={v => setTxtMeta(p => ({ ...p, note: v }))} rows={2} placeholder="연사 유의사항 (선택)"
                          style={{ display: 'block', width: '100%', padding: '8px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                      </div>

                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2, paddingLeft: 2 }}>요점 입력</div>
                        <KoreanTextarea value={txtContent} onChange={v => setTxtContent(v)} placeholder={"골자 요점을 붙여넣기하세요\n  스페이스 들여쓰기 = 하위 레벨\n  (성구; 출판물) 자동 분리"} style={{
                          width: '100%', minHeight: 180, borderRadius: 8, border: 'none', padding: '8px 10px',
                          background: 'var(--bg-subtle, #EFEFF4)', fontSize: '0.857rem', fontFamily: 'inherit', resize: 'vertical',
                          outline: 'none', color: 'var(--c-text-dark)', boxSizing: 'border-box', lineHeight: 1.7,
                        }} />
                      </div>
                    </>;
                  })()}
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button onClick={() => {
                      if (!txtContent.trim()) return;
                      const rawLines = txtContent.split('\n');
                      const parsed = [];
                      let subCount = 0;
                      const counters = [0, 0, 0, 0, 0];
                      for (const rawLine of rawLines) {
                        const trimmed = rawLine.trim();
                        if (!trimmed) continue;
                        let text = trimmed;

                        // 제로 너비 공백 제거
                        text = text.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
                        // 시간 패턴 감지 → 소주제: (4분), (18분), (4​분) 등
                        const timeMatch = text.match(/\(\s*(\d+[~\-–]?\d*)\s*분\s*\)/);
                        const isSubtopic = !!timeMatch;
                        if (timeMatch) text = text.replace(timeMatch[0], '').trim();

                        // 레벨: 소주제=0, 스페이스0개=1(L1), 1개=2(L2), 2개=3(L3)...
                        let level;
                        if (isSubtopic) {
                          level = 0; // 소주제
                        } else {
                          const rawExpanded = rawLine.replace(/\t/g, '  ');
                          const indent = rawExpanded.search(/\S/);
                          level = Math.min(indent, 4); // 0→L1, 1→L2, 2→L3, 3→L4, 4+→L5 (level+1=L번호)
                        }

                        // 줄 끝 괄호에서 성구/출판물 분리: (창 3:6; 「파08」 3면)
                        let scriptures = '';
                        let pubs = '';
                        const refsMatch = text.match(/\(([^)]+)\)\s*$/);
                        if (refsMatch) {
                          const refsStr = refsMatch[1];
                          // 시간 패턴만 있는 괄호는 건너뛰기 (4분, 18분 등)
                          if (!/^\s*\d+[~\-–]?\d*\s*분\s*$/.test(refsStr)) {
                            text = text.slice(0, refsMatch.index).trim();
                            const parts = refsStr.split(/;\s*/);
                            const scrList = [];
                            const pubList = [];
                            for (let part of parts) {
                              const subs = part.split(/,\s*(?=[가-힣「])/);
                              for (let s of subs) {
                                s = s.trim();
                                if (s.startsWith('「') || s.startsWith("'")) pubList.push(s);
                                else if (s && !/^\d+[~\-–]?\d*\s*분$/.test(s)) scrList.push(s);
                              }
                            }
                            scriptures = scrList.join('; ');
                            pubs = pubList.join('; ');
                          }
                        }

                        // 번호 생성 (중첩)
                        let num;
                        if (isSubtopic) {
                          subCount++;
                          for (let i = 0; i < 5; i++) counters[i] = 0; // 하위 전부 리셋
                          num = String(subCount);
                        } else {
                          for (let i = level + 1; i < 5; i++) counters[i] = 0;
                          counters[level]++;
                          num = subCount > 0
                            ? subCount + '.' + counters.slice(0, level + 1).filter(n => n > 0).join('.')
                            : counters.slice(0, level + 1).filter(n => n > 0).join('.');
                        }
                        parsed.push({ num, level: isSubtopic ? 'L1' : `L${level + 1}`, text, scriptures, scripture_usage: '', publications: pubs, isSubtopic, time: isSubtopic ? (timeMatch[1] + '분') : '' });
                      }
                      setTxtParsed(parsed);
                    }} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                      background: '#1D9E75', color: '#fff', fontSize: '0.857rem', fontWeight: 600, cursor: 'pointer',
                    }}>파싱</button>
                    <button onClick={() => { setTxtContent(''); setTxtParsed([]); setTxtResult(''); }} style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd)',
                      background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
                    }}>초기화</button>
                  </div>

                  {/* 파싱 결과 카드 */}
                  {txtParsed.length > 0 && (
                    <div onClick={() => { const open = Object.keys(expandedDbEntry).filter(k => k.startsWith('txtdd_') && expandedDbEntry[k]); if (open.length) setExpandedDbEntry(p => { const n = { ...p }; open.forEach(k => { n[k] = false; }); return n; }); }} style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', marginBottom: 4 }}>{txtParsed.length}개 요점</div>
                      {txtParsed.map((pt, i) => {
                        const levelColors = { ST: '#8B6914', L1: '#D85A30', L2: '#C7842D', L3: '#1D9E75', L4: '#2D8FC7', L5: '#7F77DD' };
                        const lbl = pt.isSubtopic ? 'ST' : pt.level;
                        const lc = levelColors[lbl] || '#888';
                        const isEditing = expandedDbEntry['txt_' + i];
                        const lvlNum = parseInt(pt.level?.[1]) || 1;
                        return <div key={i} style={{
                          borderRadius: 8,
                          border: 'none',
                          marginBottom: pt.isSubtopic ? 10 : 2,
                          marginTop: pt.isSubtopic && i > 0 ? 6 : 0,
                          marginLeft: pt.isSubtopic ? 0 : (lvlNum - 1) * 14,
                          background: pt.isSubtopic ? 'var(--bg-dim, #eee)' : 'var(--bg-subtle, #EFEFF4)',
                        }}>
                          {/* 헤더 1줄: 레벨 + 번호 + 편집 */}
                          <div style={{ padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                            {/* 레벨 드롭다운 */}
                            {(() => {
                              const allLevels = ['ST', 'L1', 'L2', 'L3', 'L4', 'L5'];
                              const lblNames = { ST: '소주제', L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4', L5: 'L5' };
                              const showDrop = expandedDbEntry['txtdd_' + i];
                              const setShowDrop = (v) => setExpandedDbEntry(p => ({ ...p, ['txtdd_' + i]: v }));
                              return (
                                <span style={{ position: 'relative', flexShrink: 0, zIndex: showDrop ? 30 : 1 }}>
                                  <span onClick={(e) => { e.stopPropagation();
                                    // 다른 드롭다운 닫기
                                    const others = Object.keys(expandedDbEntry).filter(k => k.startsWith('txtdd_') && k !== 'txtdd_' + i && expandedDbEntry[k]);
                                    if (others.length) setExpandedDbEntry(p => { const n = { ...p }; others.forEach(k => { n[k] = false; }); n['txtdd_' + i] = !showDrop; return n; });
                                    else setShowDrop(!showDrop);
                                  }} style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 2,
                                    minWidth: 40, height: 22, borderRadius: 6, fontSize: '0.714rem', fontWeight: 700, padding: '0 6px',
                                    background: lc + '25', color: lc, border: `1px solid ${lc}50`, cursor: 'pointer',
                                  }}>
                                    {lblNames[lbl]} <span style={{ fontSize: '0.571rem', opacity: 0.5 }}>▼</span>
                                  </span>
                                  {showDrop && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 30, marginTop: 3, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', boxShadow: '0 6px 16px rgba(0,0,0,0.18)', minWidth: 90 }}>
                                      {allLevels.map(l => {
                                        const c = levelColors[l] || '#888';
                                        const active = l === lbl;
                                        return (
                                          <div key={l} onClick={(e) => { e.stopPropagation();
                                            if (l === 'ST') setTxtParsed(p => p.map((x, j) => j === i ? { ...x, isSubtopic: true, level: 'L1' } : x));
                                            else setTxtParsed(p => p.map((x, j) => j === i ? { ...x, isSubtopic: false, level: l } : x));
                                            setShowDrop(false);
                                          }} style={{
                                            padding: '8px 12px', cursor: 'pointer', fontSize: '0.857rem', fontWeight: active ? 700 : 500,
                                            background: active ? c + '15' : 'transparent', color: active ? c : 'var(--c-text)',
                                            display: 'flex', alignItems: 'center', gap: 8,
                                          }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0 }} />
                                            {lblNames[l]}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </span>
                              );
                            })()}
                            <span style={{ fontWeight: 700, color: lc, fontSize: '0.857rem', flexShrink: 0 }}>{pt.num}</span>
                            <div style={{ flex: 1 }} />
                            {pt.isSubtopic && pt.time && <span style={{ fontSize: '0.714rem', padding: '2px 8px', borderRadius: 4, background: lc + '20', color: lc, fontWeight: 600, flexShrink: 0 }}>⏱ {pt.time}</span>}
                            <button onClick={() => setExpandedDbEntry(p => ({ ...p, ['txt_' + i]: !p['txt_' + i] }))} style={{ border: 'none', background: 'transparent', color: isEditing ? '#1D9E75' : 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', padding: '2px 6px', flexShrink: 0, fontWeight: 600 }}>{isEditing ? '완료' : '편집'}</button>
                          </div>
                          {/* 본문 2줄 */}
                          <div style={{ padding: '0 10px 6px', fontSize: '0.929rem', color: 'var(--c-text-dark)', fontWeight: pt.isSubtopic ? 600 : 400, lineHeight: 1.6, wordBreak: 'keep-all' }}>
                            {isEditing
                              ? <input value={pt.text} onChange={e => setTxtParsed(p => p.map((x, j) => j === i ? { ...x, text: e.target.value } : x))} style={{ width: '100%', padding: '4px 6px', border: 'none', borderRadius: 6, fontSize: '0.929rem', outline: 'none', background: 'var(--bg-card)', color: 'var(--c-text-dark)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                              : pt.text}
                          </div>
                          {/* 편집 모드: 성구/출판물 + 삭제 */}
                          {isEditing && (
                            <div style={{ padding: '6px 10px 8px', display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--bd-light)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#2D8FC7', fontSize: '0.857rem', flexShrink: 0 }}>📖</span>
                                <input value={pt.scriptures} onChange={e => setTxtParsed(p => p.map((x, j) => j === i ? { ...x, scriptures: e.target.value } : x))}
                                  placeholder="성구 (창 3:6; 요 17:3)" style={{ flex: 1, padding: '4px 8px', border: 'none', borderRadius: 6, fontSize: '0.857rem', outline: 'none', background: 'var(--bg-card)', color: 'var(--c-text-dark)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ color: '#7F77DD', fontSize: '0.857rem', flexShrink: 0 }}>📚</span>
                                <input value={pt.publications} onChange={e => setTxtParsed(p => p.map((x, j) => j === i ? { ...x, publications: e.target.value } : x))}
                                  placeholder="출판물 (「파08」 3면)" style={{ flex: 1, padding: '4px 8px', border: 'none', borderRadius: 6, fontSize: '0.857rem', outline: 'none', background: 'var(--bg-card)', color: 'var(--c-text-dark)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <button onClick={() => setTxtParsed(p => p.filter((_, j) => j !== i))} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: '0.786rem', cursor: 'pointer' }}>삭제</button>
                              </div>
                            </div>
                          )}
                          {/* 읽기 모드: 성구/출판물 */}
                          {!isEditing && (pt.scriptures || pt.publications) && (
                            <div style={{ padding: '3px 10px 6px', borderTop: '1px solid var(--bd-light)' }}>
                              {pt.scriptures && <div style={{ fontSize: '0.857rem', color: '#2D8FC7' }}>📖 {pt.scriptures}</div>}
                              {pt.publications && <div style={{ fontSize: '0.857rem', color: '#7F77DD', marginTop: 1 }}>📚 {pt.publications}</div>}
                            </div>
                          )}
                        </div>;
                      })}
                      {/* 저장 버튼 */}
                      <button onClick={async () => {
                        if (!txtMeta.outlineNum) { setTxtResult('번호를 입력해주세요'); return; }
                        setTxtSaving(true); setTxtResult('');
                        try {
                          // 소주제별 분리
                          const subtopics = [];
                          let curSub = null;
                          for (const p of txtParsed) {
                            if (p.isSubtopic) {
                              curSub = { num: subtopics.length + 1, title: p.text, time: p.time || '', points: [] };
                              subtopics.push(curSub);
                            } else {
                              if (!curSub) { curSub = { num: 0, title: '', time: '', points: [] }; subtopics.push(curSub); }
                              curSub.points.push({ num: p.num, level: p.level, text: p.text, scriptures: p.scriptures, scripture_usage: p.scripture_usage || '', publications: p.publications });
                            }
                          }
                          if (!subtopics.length) subtopics.push({ num: 0, title: '', time: txtMeta.duration, points: [] });
                          const payload = {
                            files: [{ meta: { outline_type: txtMeta.outlineType, outline_type_name: getOutlineTypeInfo(txtMeta.outlineType).name, outline_num: txtMeta.outlineNum, title: txtMeta.outlineTitle, version: txtMeta.version, time: txtMeta.duration, note: txtMeta.note || '' }, subtopics }],
                            overwrite: false,
                          };
                          const dupCheck = await checkDuplicates({ files: [{ ...payload.files[0], file_format: 'outline' }] });
                          if (dupCheck.has_duplicates) {
                            if (!window.confirm(dupCheck.duplicates.map(d => d.message).join('\n'))) { setTxtSaving(false); return; }
                            payload.overwrite = true;
                          }
                          const res = await saveOutline(payload);
                          setTxtResult(`✓ ${res.message}`);
                          outlineList().then(r => setOutlines(r.outlines || [])).catch(() => {});
                        } catch (err) { setTxtResult('오류: ' + err.message); }
                        finally { setTxtSaving(false); }
                      }} disabled={txtSaving} style={{
                        width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', marginTop: 6,
                        background: txtSaving ? 'var(--bd-medium)' : '#1D9E75', color: '#fff',
                        fontSize: '0.929rem', fontWeight: 700, cursor: 'pointer', position: 'relative', overflow: 'hidden',
                      }}>
                        {txtSaving && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                        <span style={{ position: 'relative', zIndex: 1 }}>{txtSaving ? '저장 중...' : '골자 저장'}</span>
                      </button>
                      {txtResult && <div style={{ marginTop: 6, fontSize: '0.786rem', color: txtResult.startsWith('✓') ? '#1D9E75' : '#c44' }}>{txtResult}</div>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 연설 구분 */}
          {addForm.source === '연설' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
              }}>
                {['공개 강연', '기타 연설', '대회 연설', '원문'].map(s => (
                  <button key={s} onClick={() => setAddForm(p => ({ ...p, sub_source: s, service_type: '', outline_num: '', outline_type: '', outline_title: '', subtopic: '', point_id: '', point_summary: '', pub_code: '', topic: '' }))} style={{
                    flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: addForm.sub_source === s ? 700 : 500,
                    border: 'none', textAlign: 'center',
                    background: addForm.sub_source === s ? (s === '원문' ? '#7F77DD15' : '#D85A3015') : 'transparent',
                    color: addForm.sub_source === s ? (s === '원문' ? '#7F77DD' : '#D85A30') : 'var(--c-muted)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* 기타 연설 종류 */}
          {addForm.source === '연설' && addForm.sub_source === '기타 연설' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>종류</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {speechSubTypes.map((t, ti) => (
                  <button key={t} onClick={() => !editingSTypes && setAddForm(p => ({ ...p, service_type: t }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (addForm.service_type === t ? '#378ADD' : editingSTypes && !defaultSTypes.includes(t) ? '#fcc' : 'var(--bd)'),
                    background: addForm.service_type === t ? 'var(--tint-blue-light)' : 'var(--bg-card)', color: addForm.service_type === t ? '#378ADD' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: editingSTypes ? 'default' : 'pointer', fontWeight: addForm.service_type === t ? 700 : 400, position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {editingSTypes && ti > 0 && <span onClick={(e) => { e.stopPropagation(); const next = swapArr(speechSubTypes, ti, ti-1); setSpeechSubTypes(next); try { localStorage.setItem('jw-sstypes', JSON.stringify(next)); } catch(e) {} }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>◀</span>}
                    {t}
                    {editingSTypes && ti < speechSubTypes.length - 1 && <span onClick={(e) => { e.stopPropagation(); const next = swapArr(speechSubTypes, ti, ti+1); setSpeechSubTypes(next); try { localStorage.setItem('jw-sstypes', JSON.stringify(next)); } catch(e) {} }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>▶</span>}
                    {editingSTypes && !defaultSTypes.includes(t) && (
                      <span onClick={async (e) => { e.stopPropagation(); const cnt = (await freeSearch(t, 5)).results?.filter(r => r.metadata?.service_type === t).length || 0; const msg = cnt > 0 ? `"${t}"에 관련 자료가 있습니다.\n삭제하시겠습니까?` : `"${t}"을(를) 삭제하시겠습니까?`; if (!confirm(msg)) return; const next = speechSubTypes.filter(x => x !== t); setSpeechSubTypes(next); if (addForm.service_type === t) setAddForm(p => ({ ...p, service_type: '' })); try { localStorage.setItem('jw-sstypes', JSON.stringify(next)); } catch(e) {} }}
                        style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: '#c44', color: '#fff', fontSize: '0.643rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}>×</span>
                    )}
                  </button>
                ))}
                {!addingSType && !editingSTypes && <button onClick={() => setAddingSType(true)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+</button>}
                {!addingSType && <button onClick={() => setEditingSTypes(p => !p)} style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid ' + (editingSTypes ? '#c44' : 'var(--bd)'), background: editingSTypes ? 'var(--tint-red)' : 'var(--bg-card)', color: editingSTypes ? '#c44' : 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>{editingSTypes ? '완료' : '편집'}</button>}
                {addingSType && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input value={newSType} onChange={e => setNewSType(e.target.value)} placeholder="새 종류"
                      style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.786rem', width: 70, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && newSType.trim()) { const next = [...speechSubTypes, newSType.trim()]; setSpeechSubTypes(next); setAddForm(p => ({ ...p, service_type: newSType.trim() })); setNewSType(''); setAddingSType(false); try { localStorage.setItem('jw-sstypes', JSON.stringify(next)); } catch(e) {} }}} />
                    <button onClick={() => { if (newSType.trim()) { const next = [...speechSubTypes, newSType.trim()]; setSpeechSubTypes(next); setAddForm(p => ({ ...p, service_type: newSType.trim() })); setNewSType(''); setAddingSType(false); try { localStorage.setItem('jw-sstypes', JSON.stringify(next)); } catch(e) {} }}} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #378ADD', background: 'var(--tint-blue-light)', color: '#378ADD', fontSize: '0.786rem', cursor: 'pointer' }}>추가</button>
                    <button onClick={() => { setAddingSType(false); setNewSType(''); }} style={{ padding: '3px 5px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>×</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 연설 > 원문 입력 */}
          {addForm.source === '연설' && addForm.sub_source === '원문' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>골자유형</div>
                  <input value={addForm.outline_type} onChange={e => setAddForm(p => ({ ...p, outline_type: e.target.value }))} placeholder="공개강연" style={{ ...iS, width: '100%' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>골자번호</div>
                  <input value={addForm.outline_num} onChange={e => setAddForm(p => ({ ...p, outline_num: e.target.value }))} placeholder="001" style={{ ...iS, width: '100%' }} />
                </div>
                <div style={{ width: 55 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>버전</div>
                  <input value={addForm.subtopic} onChange={e => setAddForm(p => ({ ...p, subtopic: e.target.value }))} placeholder="9/15" style={{ ...iS, width: '100%', textAlign: 'center' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>연사</div>
                  <input value={addForm.speaker} onChange={e => setAddForm(p => ({ ...p, speaker: e.target.value }))} placeholder="연사" style={{ ...iS, width: '100%' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>제목</div>
                  <input value={addForm.outline_title} onChange={e => setAddForm(p => ({ ...p, outline_title: e.target.value, topic: e.target.value }))} placeholder="제목" style={{ ...iS, width: '100%' }} />
                </div>
                <div style={{ width: 60 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                  <input value={addForm.date} onChange={e => setAddForm(p => ({ ...p, date: e.target.value }))} placeholder="2604" style={{ ...iS, width: '100%', textAlign: 'center' }} />
                </div>
              </div>
            </div>
          )}

          {/* 토의 구분 */}
          {addForm.source === '토의' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
              }}>
                {['파수대', '성서 연구', '영적 보물', '기타'].map(s => (
                  <button key={s} onClick={() => setAddForm(p => ({
                    ...p, sub_source: s,
                    entry_type: (s === '파수대' || s === '성서 연구' || s === '영적 보물') ? 'expression' : p.entry_type,
                    service_type: '', outline_num: '', outline_type: '', outline_title: '', subtopic: '', point_id: '', point_summary: '', pub_code: '', topic: '',
                  }))} style={{
                    flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: addForm.sub_source === s ? 700 : 500,
                    border: 'none', textAlign: 'center',
                    background: addForm.sub_source === s ? '#8D6E6315' : 'transparent',
                    color: addForm.sub_source === s ? '#8D6E63' : 'var(--c-muted)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* 영적 보물 - 성경 읽기 범위 */}
          {addForm.source === '토의' && addForm.sub_source === '영적 보물' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>성경 읽기 범위 <span style={{ color: '#c44' }}>*</span></div>
              <input value={addForm.subtopic} onChange={e => setAddForm(p => ({ ...p, subtopic: e.target.value }))}
                placeholder="이사야 50-51장" style={{ ...iS, width: '100%' }} />
            </div>
          )}

          {/* 토의 기타 종류 */}
          {addForm.source === '토의' && addForm.sub_source === '기타' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>종류</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {discussionTypes.map((t, ti) => (
                  <button key={t} onClick={() => !editingDTypes && setAddForm(p => ({ ...p, service_type: t }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (addForm.service_type === t ? '#378ADD' : editingDTypes && !defaultDTypes.includes(t) ? '#fcc' : 'var(--bd)'),
                    background: addForm.service_type === t ? 'var(--tint-blue-light)' : 'var(--bg-card)', color: addForm.service_type === t ? '#378ADD' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: editingDTypes ? 'default' : 'pointer', fontWeight: addForm.service_type === t ? 700 : 400, position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {editingDTypes && ti > 0 && <span onClick={(e) => { e.stopPropagation(); const next = swapArr(discussionTypes, ti, ti-1); setDiscussionTypes(next); try { localStorage.setItem('jw-dtypes', JSON.stringify(next)); } catch(e) {} }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>◀</span>}
                    {t}
                    {editingDTypes && ti < discussionTypes.length - 1 && <span onClick={(e) => { e.stopPropagation(); const next = swapArr(discussionTypes, ti, ti+1); setDiscussionTypes(next); try { localStorage.setItem('jw-dtypes', JSON.stringify(next)); } catch(e) {} }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>▶</span>}
                    {editingDTypes && !defaultDTypes.includes(t) && (
                      <span onClick={async (e) => { e.stopPropagation(); const cnt = (await freeSearch(t, 5)).results?.filter(r => r.metadata?.service_type === t).length || 0; const msg = cnt > 0 ? `"${t}"에 관련 자료가 있습니다.\n삭제하시겠습니까?` : `"${t}"을(를) 삭제하시겠습니까?`; if (!confirm(msg)) return; const next = discussionTypes.filter(x => x !== t); setDiscussionTypes(next); if (addForm.service_type === t) setAddForm(p => ({ ...p, service_type: '' })); try { localStorage.setItem('jw-dtypes', JSON.stringify(next)); } catch(e) {} }}
                        style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: '#c44', color: '#fff', fontSize: '0.643rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}>×</span>
                    )}
                  </button>
                ))}
                {!addingDType && !editingDTypes && <button onClick={() => setAddingDType(true)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+</button>}
                {!addingDType && <button onClick={() => setEditingDTypes(p => !p)} style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid ' + (editingDTypes ? '#c44' : 'var(--bd)'), background: editingDTypes ? 'var(--tint-red)' : 'var(--bg-card)', color: editingDTypes ? '#c44' : 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>{editingDTypes ? '완료' : '편집'}</button>}
                {addingDType && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input value={newDType} onChange={e => setNewDType(e.target.value)} placeholder="새 종류"
                      style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.786rem', width: 70, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && newDType.trim()) { const next = [...discussionTypes, newDType.trim()]; setDiscussionTypes(next); setAddForm(p => ({ ...p, service_type: newDType.trim() })); setNewDType(''); setAddingDType(false); try { localStorage.setItem('jw-dtypes', JSON.stringify(next)); } catch(e) {} }}} />
                    <button onClick={() => { if (newDType.trim()) { const next = [...discussionTypes, newDType.trim()]; setDiscussionTypes(next); setAddForm(p => ({ ...p, service_type: newDType.trim() })); setNewDType(''); setAddingDType(false); try { localStorage.setItem('jw-dtypes', JSON.stringify(next)); } catch(e) {} }}} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #378ADD', background: 'var(--tint-blue-light)', color: '#378ADD', fontSize: '0.786rem', cursor: 'pointer' }}>추가</button>
                    <button onClick={() => { setAddingDType(false); setNewDType(''); }} style={{ padding: '3px 5px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>×</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 봉사 모임 구분 */}
          {addForm.source === '봉사 모임' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>구분</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
              }}>
                {[['speech_point', '전체 내용'], ['expression', '표현/예시']].map(([v, l]) => (
                  <button key={v} onClick={() => setAddForm(p => ({ ...p, entry_type: v }))} style={{
                    flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: addForm.entry_type === v ? 700 : 500,
                    border: 'none', textAlign: 'center',
                    background: addForm.entry_type === v ? '#378ADD15' : 'transparent',
                    color: addForm.entry_type === v ? '#378ADD' : 'var(--c-muted)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
                  }}>{l}</button>
                ))}
              </div>
            </div>
          )}

          {/* 봉사 종류 */}
          {addForm.source === '봉사 모임' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>봉사 종류</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {manageServiceTypes.map((t, ti) => (
                  <button key={t} onClick={() => !editingMTypes && setAddForm(p => ({ ...p, service_type: t }))} style={{
                    padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (addForm.service_type === t ? '#1D9E75' : editingMTypes && !defaultMTypes.includes(t) ? '#fcc' : 'var(--bd)'),
                    background: addForm.service_type === t ? 'var(--tint-green)' : 'var(--bg-card)', color: addForm.service_type === t ? '#1D9E75' : 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: editingMTypes ? 'default' : 'pointer', fontWeight: addForm.service_type === t ? 700 : 400, position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {editingMTypes && ti > 0 && <span onClick={(e) => { e.stopPropagation(); const next = swapArr(manageServiceTypes, ti, ti-1); setManageServiceTypes(next); try { localStorage.setItem('jw-stypes', JSON.stringify(next)); } catch(e) {} }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>◀</span>}
                    {t}
                    {editingMTypes && ti < manageServiceTypes.length - 1 && <span onClick={(e) => { e.stopPropagation(); const next = swapArr(manageServiceTypes, ti, ti+1); setManageServiceTypes(next); try { localStorage.setItem('jw-stypes', JSON.stringify(next)); } catch(e) {} }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>▶</span>}
                    {editingMTypes && !defaultMTypes.includes(t) && (
                      <span onClick={async (e) => {
                        e.stopPropagation();
                        const r = await listBySource('봉사 모임', 100, t);
                        const cnt = r.total || 0;
                        const msg = cnt > 0 ? `"${t}"에 ${cnt}건의 자료가 있습니다.\n삭제하면 모두 "일반"으로 변경됩니다.\n삭제하시겠습니까?` : `"${t}" 봉사 종류를 삭제하시겠습니까?`;
                        if (!confirm(msg)) return;
                        if (cnt > 0) await deleteServiceType(t);
                        setManageServiceTypes(p => p.filter(x => x !== t));
                        if (addForm.service_type === t) setAddForm(p => ({ ...p, service_type: '' }));
                      }} style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: '#c44', color: '#fff', fontSize: '0.643rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}>×</span>
                    )}
                  </button>
                ))}
                {!addingMType && !editingMTypes && <button onClick={() => setAddingMType(true)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+</button>}
                {!addingMType && <button onClick={() => setEditingMTypes(p => !p)} style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid ' + (editingMTypes ? '#c44' : 'var(--bd)'), background: editingMTypes ? 'var(--tint-red)' : 'var(--bg-card)', color: editingMTypes ? '#c44' : 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>{editingMTypes ? '완료' : '편집'}</button>}
                {addingMType && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input value={newMType} onChange={e => setNewMType(e.target.value)} placeholder="새 종류" style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.857rem', width: 70, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && newMType.trim()) { setManageServiceTypes(p => [...p, newMType.trim()]); setAddForm(p => ({ ...p, service_type: newMType.trim() })); setNewMType(''); setAddingMType(false); }}} />
                    <button onClick={() => { if (newMType.trim()) { setManageServiceTypes(p => [...p, newMType.trim()]); setAddForm(p => ({ ...p, service_type: newMType.trim() })); setNewMType(''); setAddingMType(false); }}} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #1D9E75', background: 'var(--tint-green)', color: '#1D9E75', fontSize: '0.786rem', cursor: 'pointer' }}>추가</button>
                    <button onClick={() => { setAddingMType(false); setNewMType(''); }} style={{ padding: '3px 5px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>×</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 방문 - 연령대 */}
          {addForm.source === '방문' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>연령대</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 2,
                background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
              }}>
                {['청소년', '청년', '중년', '장년'].map(s => (
                  <button key={s} onClick={() => setAddForm(p => ({ ...p, sub_source: s }))} style={{
                    flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: addForm.sub_source === s ? 700 : 500,
                    border: 'none', textAlign: 'center',
                    background: addForm.sub_source === s ? '#D85A3015' : 'transparent',
                    color: addForm.sub_source === s ? '#D85A30' : 'var(--c-muted)',
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
                  }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* 방문 - 고려한 상황 */}
          {addForm.source === '방문' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>고려한 상황 (복수 선택)</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                {visitSituations.map((t, ti) => {
                  const sel = selSituations.has(t);
                  return (
                    <button key={t} onClick={() => { if (editingVSits) return; setSelSituations(prev => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next; }); }} style={{
                      padding: '4px 10px', borderRadius: 8, border: '1px solid ' + (sel ? '#378ADD' : editingVSits && !defaultVSits.includes(t) ? '#fcc' : 'var(--bd)'),
                      background: sel ? 'var(--tint-blue-light)' : 'var(--bg-card)', color: sel ? '#378ADD' : 'var(--c-faint)',
                      fontSize: '0.786rem', cursor: editingVSits ? 'default' : 'pointer', fontWeight: sel ? 700 : 400, position: 'relative',
                      display: 'flex', alignItems: 'center', gap: 3,
                    }}>
                      {editingVSits && ti > 0 && <span onClick={(e) => { e.stopPropagation(); setVisitSituations(swapArr(visitSituations, ti, ti-1)); }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>◀</span>}
                      {sel ? '✓ ' : ''}{t}
                      {editingVSits && ti < visitSituations.length - 1 && <span onClick={(e) => { e.stopPropagation(); setVisitSituations(swapArr(visitSituations, ti, ti+1)); }} style={{ cursor: 'pointer', fontSize: '0.643rem', color: 'var(--c-muted)' }}>▶</span>}
                      {editingVSits && !defaultVSits.includes(t) && (
                        <span onClick={(e) => { e.stopPropagation(); if (!confirm(`"${t}"을(를) 삭제하시겠습니까?`)) return; setVisitSituations(prev => prev.filter(x => x !== t)); setSelSituations(prev => { const next = new Set(prev); next.delete(t); return next; }); }}
                          style={{ position: 'absolute', top: -6, right: -6, width: 14, height: 14, borderRadius: '50%', background: '#c44', color: '#fff', fontSize: '0.643rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontWeight: 800 }}>×</span>
                      )}
                    </button>
                  );
                })}
                {!addingVSit && !editingVSits && <button onClick={() => setAddingVSit(true)} style={{ padding: '4px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'var(--bg-card)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>+</button>}
                {!addingVSit && <button onClick={() => setEditingVSits(p => !p)} style={{ padding: '4px 6px', borderRadius: 8, border: '1px solid ' + (editingVSits ? '#c44' : 'var(--bd)'), background: editingVSits ? 'var(--tint-red)' : 'var(--bg-card)', color: editingVSits ? '#c44' : 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>{editingVSits ? '완료' : '편집'}</button>}
                {addingVSit && (
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input value={newVSit} onChange={e => setNewVSit(e.target.value)} placeholder="새 상황"
                      style={{ padding: '3px 8px', border: 'none', borderRadius: 8, fontSize: '0.786rem', width: 70, outline: 'none', background: 'var(--bg-subtle)' }}
                      onKeyDown={e => { if (e.key === 'Enter' && newVSit.trim()) { setVisitSituations(prev => [...prev, newVSit.trim()]); setSelSituations(prev => new Set([...prev, newVSit.trim()])); setNewVSit(''); setAddingVSit(false); }}} />
                    <button onClick={() => { if (newVSit.trim()) { setVisitSituations(prev => [...prev, newVSit.trim()]); setSelSituations(prev => new Set([...prev, newVSit.trim()])); setNewVSit(''); setAddingVSit(false); }}} style={{ padding: '3px 6px', borderRadius: 4, border: '1px solid #378ADD', background: 'var(--tint-blue-light)', color: '#378ADD', fontSize: '0.786rem', cursor: 'pointer' }}>추가</button>
                    <button onClick={() => { setAddingVSit(false); setNewVSit(''); }} style={{ padding: '3px 5px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>×</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 연사/인도자, 날짜, 유형 */}
          {addForm.source !== '토의' && addForm.source !== '방문' && addForm.source !== '원문' && addForm.source !== '전처리' && addForm.sub_source !== '원문' && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>{addForm.source === '봉사 모임' ? '인도자' : '연사'}</div>
                <input value={addForm.speaker} onChange={e => setAddForm(p => ({ ...p, speaker: e.target.value }))} placeholder="최진규" style={{ ...iS, width: '100%' }} />
              </div>
              <div style={{ width: 80 }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                <input value={addForm.date} onChange={e => setAddForm(p => ({ ...p, date: e.target.value }))}
                  placeholder={addForm.source === '봉사 모임' ? '260408' : '2604'}
                  style={{ ...iS, width: '100%', textAlign: 'center' }} />
              </div>
              {addForm.source === '연설' && (
                <div style={{ width: 100 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>유형</div>
                  <select value={addForm.entry_type} onChange={e => setAddForm(p => ({ ...p, entry_type: e.target.value }))} style={{ ...iS, width: '100%' }}>
                    <option value="speech_point">연설 요점</option>
                    <option value="expression">표현/예시</option>
                    <option value="publication">출판물</option>
                  </select>
                </div>
              )}
              {!['연설', '토의', '봉사 모임', '메모', '원문'].includes(addForm.source) && (
                <div style={{ width: 100 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>유형</div>
                  <select value={addForm.entry_type} onChange={e => setAddForm(p => ({ ...p, entry_type: e.target.value }))} style={{ ...iS, width: '100%' }}>
                    <option value="speech_point">연설 요점</option>
                    <option value="expression">표현/예시</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* 출판물 코드 */}
          {(addForm.entry_type === 'publication' || (addForm.source === '토의' && (addForm.sub_source === '파수대' || addForm.sub_source === '성서 연구'))) && addForm.sub_source !== '원문' && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>출판물 코드 {addForm.entry_type === 'publication' && <span style={{ color: '#c44' }}>*</span>}</div>
              <input value={addForm.pub_code} onChange={e => setAddForm(p => ({ ...p, pub_code: e.target.value }))}
                placeholder="파26 2월호 2-7면" style={{ ...iS, width: '100%' }} />
            </div>
          )}

          {/* 골자/주제/소주제/요점 */}
          {(() => {
            const src = addForm.source;
            const sub = addForm.sub_source;
            if (src === '봉사 모임' || src === '원문' || src === '전처리' || sub === '원문') return null;

            const showOutline = src === '연설' && sub === '공개 강연';
            const showSubtopic = src === '연설' && (sub === '공개 강연' || sub === '대회 연설');
            const showPoint = showSubtopic;
            const isDiscussion = src === '토의';
            const showFreePoint = src === 'JW 방송' || (src === '연설' && sub === '기타 연설');
            const isPubType = addForm.entry_type === 'publication';

            return (<>
              {showOutline && !isPubType && (
                <div style={{ marginBottom: 8, position: 'relative' }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>골자 (번호 또는 제목 검색)</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input value={outlineQuery} onChange={e => { setOutlineQuery(e.target.value); setOutlineFocus(true); if (addForm.outline_num) { selectOutline(null); } }}
                      onFocus={() => setOutlineFocus(true)} onBlur={() => setTimeout(() => setOutlineFocus(false), 200)}
                      placeholder="007, 기념식, 자비..." style={{ ...iS, flex: 1 }} />
                    {addForm.outline_num && <button onClick={() => { selectOutline(null); setOutlineQuery(''); }} style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer', flexShrink: 0 }}>초기화</button>}
                  </div>
                  {addForm.outline_num && <div style={{ marginTop: 4, fontSize: '0.786rem', color: '#1D9E75', fontWeight: 600 }}>✅ {addForm.outline_type === '공개강연' || addForm.outline_type?.startsWith('S-34') ? 'S-34_' + addForm.outline_num.padStart(3, '0') : addForm.outline_type === '기념식' ? 'S-31_기념식' : addForm.outline_type?.startsWith('JWBC') ? addForm.outline_type + '_' + addForm.outline_num : addForm.outline_num} - {addForm.outline_title}</div>}
                  {outlineFocus && outlineQuery && !addForm.outline_num && (() => {
                    const q = outlineQuery.toLowerCase();
                    const filtered = outlines.filter(g => !g.type.startsWith('JWBC')).filter(g => g.num.toLowerCase().includes(q) || g.title.toLowerCase().includes(q) || g.prefix.toLowerCase().includes(q)).slice(0, 10);
                    if (filtered.length === 0) return <div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: 8, padding: 8, fontSize: '0.786rem', color: 'var(--c-muted)' }}>결과 없음</div>;
                    return (<div style={{ position: 'absolute', left: 0, right: 0, top: '100%', zIndex: 10, background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: 8, maxHeight: 200, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                      {filtered.map((g, gi) => (<div key={gi} onClick={() => { selectOutline(g); setOutlineQuery(g.prefix + ' - ' + g.title); setOutlineFocus(false); }} style={{ padding: '8px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd-light)', fontSize: '0.857rem', color: 'var(--c-text)' }} onMouseEnter={e => e.target.style.background = 'var(--bg-subtle)'} onMouseLeave={e => e.target.style.background = ''}><span style={{ fontWeight: 700, marginRight: 6 }}>{g.prefix}</span>{g.title}</div>))}
                    </div>);
                  })()}
                </div>
              )}

              {!addForm.outline_num && !(src === '토의' && sub === '영적 보물') && !showFreePoint && !(isPubType && (showOutline || showSubtopic)) && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>주제</div>
                    <input value={addForm.topic} onChange={e => setAddForm(p => ({ ...p, topic: e.target.value, outline_title: e.target.value }))} placeholder="주제를 입력하세요" style={{ ...iS, width: '100%' }} />
                  </div>
                  {(src === '토의' || src === '방문') && (
                    <div style={{ width: 80 }}>
                      <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                      <input value={addForm.date} onChange={e => setAddForm(p => ({ ...p, date: e.target.value }))}
                        placeholder="260408"
                        style={{ ...iS, width: '100%', textAlign: 'center' }} />
                    </div>
                  )}
                </div>
              )}

              {showSubtopic && !isPubType && (<>
                {Object.keys(subtopics).length > 0 ? (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>소주제</div>
                    <select value={addForm.subtopic} onChange={e => setAddForm(p => ({ ...p, subtopic: e.target.value, point_id: '', point_summary: '' }))} style={{ ...iS, width: '100%' }}>
                      <option value="">선택</option>
                      {Object.keys(subtopics).map((st, si) => <option key={si} value={st}>{st}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>소주제</div>
                    <input value={addForm.subtopic} onChange={e => setAddForm(p => ({ ...p, subtopic: e.target.value }))} placeholder="예수의 본을 따라..." style={{ ...iS, width: '100%' }} />
                  </div>
                )}
              </>)}

              {(showOutline || showSubtopic) && isPubType && (<>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>주제</div>
                  <input value={addForm.topic} onChange={e => setAddForm(p => ({ ...p, topic: e.target.value, outline_title: e.target.value }))} placeholder="연설 주제" style={{ ...iS, width: '100%' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>소주제</div>
                  <input value={addForm.subtopic} onChange={e => setAddForm(p => ({ ...p, subtopic: e.target.value }))} placeholder="소주제" style={{ ...iS, width: '100%' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>요점</div>
                  <input value={addForm.point_summary} onChange={e => setAddForm(p => ({ ...p, point_summary: e.target.value }))} placeholder="핵심 요점을 입력하세요" style={{ ...iS, width: '100%' }} />
                </div>
              </>)}

              {showPoint && !isPubType && (<>
                {addForm.subtopic && subtopics[addForm.subtopic]?.length > 0 ? (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>요점 선택</div>
                    <select value={addForm.point_id ? addForm.point_id + '|' + addForm.point_summary : ''} onChange={e => {
                      const v = e.target.value;
                      if (v) { const [id, ...rest] = v.split('|'); setAddForm(p => ({ ...p, point_id: id, point_summary: rest.join('|') })); }
                      else { setAddForm(p => ({ ...p, point_id: '', point_summary: '' })); }
                    }} style={{ ...iS, width: '100%' }}>
                      <option value="">직접 입력</option>
                      {subtopics[addForm.subtopic].map((pt, pi) => <option key={pi} value={pt.id + '|' + pt.content}>{pt.id} - {pt.content}</option>)}
                    </select>
                  </div>
                ) : (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>요점</div>
                    <input value={addForm.point_summary} onChange={e => setAddForm(p => ({ ...p, point_summary: e.target.value }))} placeholder="자비를 나타내려면 적극적 행동" style={{ ...iS, width: '100%' }} />
                  </div>
                )}
              </>)}

              {isDiscussion && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>질문 (선택)</div>
                    <input value={addForm.point_summary} onChange={e => setAddForm(p => ({ ...p, point_summary: e.target.value }))} placeholder="성경에서 무엇을 배울 수 있습니까?" style={{ ...iS, width: '100%' }} />
                  </div>
                  {sub === '영적 보물' && (
                    <div style={{ width: 80 }}>
                      <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜</div>
                      <input value={addForm.date} onChange={e => setAddForm(p => ({ ...p, date: e.target.value }))}
                        placeholder="260408" style={{ ...iS, width: '100%', textAlign: 'center' }} />
                    </div>
                  )}
                </div>
              )}

              {showFreePoint && (<>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>주제</div>
                  <input value={addForm.topic} onChange={e => setAddForm(p => ({ ...p, topic: e.target.value, outline_title: e.target.value }))} placeholder="연설 주제" style={{ ...iS, width: '100%' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>요점</div>
                  <input value={addForm.point_summary} onChange={e => setAddForm(p => ({ ...p, point_summary: e.target.value }))} placeholder="핵심 요점을 입력하세요" style={{ ...iS, width: '100%' }} />
                </div>
              </>)}
            </>);
          })()}

          {/* 키워드, 성구 */}
          {addForm.source !== '메모' && addForm.source !== '원문' && addForm.source !== '전처리' && addForm.sub_source !== '원문' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>키워드 (선택)</div>
              <input value={addForm.keywords} onChange={e => setAddForm(p => ({ ...p, keywords: e.target.value }))} placeholder="자비, 용서" style={{ ...iS, width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>성구 (선택)</div>
              <input value={addForm.scriptures} onChange={e => setAddForm(p => ({ ...p, scriptures: e.target.value }))} placeholder="눅 10:29-37" style={{ ...iS, width: '100%' }} />
            </div>
          </div>
          )}

          {addTab === 'memo' && (<>
          {/* 내용 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>내용 <span style={{ color: '#c44' }}>*</span></div>
            <KoreanTextarea value={addForm.content} onChange={v => setAddForm(p => ({ ...p, content: v }))}
              placeholder="내용을 입력하세요" rows={8}
              style={{ ...iS, display: 'block', width: '100%', resize: 'vertical', lineHeight: 1.9 }} />
          </div>

          {/* 이동 중 표시 */}
          {movingMemo && (
            <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, fontSize: '0.786rem', color: '#D85A30', fontWeight: 600 }}>
              📋 메모에서 이동 중 — 출처와 세부 항목을 선택한 후 저장하세요
            </div>
          )}

          {/* 저장/리셋 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !addForm.content.trim() || (addForm.entry_type === 'publication' && !addForm.pub_code.trim() && addForm.sub_source !== '원문')} style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--bd-medium)' : '#1D9E75', color: '#fff',
              fontSize: '1.0rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
            }}>{saving ? '저장 중...' : movingMemo ? '이동 저장' : 'DB에 저장'}</button>
            <button onClick={() => { setAddForm(p => ({...defaultForm, source: p.source, sub_source: p.sub_source})); setOutlineQuery(''); setSubtopics({}); setSaveMsg(''); setMovingMemo(null); }} style={{
              padding: '10px 16px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.929rem', cursor: 'pointer',
            }}>초기화</button>
          </div>

          {saveMsg && <div style={{ marginTop: 8, fontSize: '0.857rem', textAlign: 'center', color: saveMsg.startsWith('오류') ? '#c44' : '#1D9E75', fontWeight: 600 }}>{saveMsg}</div>}
          </>)}
          </div>
        </div>
      )}

      {/* ═══ 연설 입력 ═══ */}
      {addTab === 'speech_input' && (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: 14, overflow: 'hidden' }}>

          {siTransferMemo && (
            <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, fontSize: '0.786rem', color: '#D85A30', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              📋 메모에서 이동 중 — 저장하면 원본 메모가 삭제됩니다
              <div style={{ flex: 1 }} />
              <button onClick={() => setSiTransferMemo(null)} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>✕</button>
            </div>
          )}
          {/* 1. 골자 선택 */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: '0.786rem', fontWeight: 700, color: 'var(--c-text-dark)' }}>골자 선택</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => { setSiNoOutline(p => !p); setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({}); setSiExpanded({}); setSiSaveMsg(''); }} style={{
                padding: '3px 10px', borderRadius: 8, border: 'none', fontSize: '0.786rem', fontWeight: siNoOutline ? 700 : 500,
                background: siNoOutline ? '#D85A3015' : 'var(--bg-subtle, #EFEFF4)', color: siNoOutline ? '#D85A30' : 'var(--c-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}>골자 없음</button>
            </div>

            {!siNoOutline && (
              <div style={{ position: 'relative' }}>
                <input value={siQuery} onChange={e => setSiQuery(e.target.value)} onFocus={() => setSiQueryFocus(true)} onBlur={() => setTimeout(() => setSiQueryFocus(false), 200)}
                  placeholder="골자 번호 또는 제목 검색..." style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
                {siQueryFocus && siQuery.trim() && (() => {
                  const q = siQuery.trim().toLowerCase();
                  const matched = outlines.filter(g => (g.outline_num || '').toLowerCase().includes(q) || (g.title || '').toLowerCase().includes(q) || (g.outline_type_name || '').toLowerCase().includes(q));
                  if (!matched.length) return null;
                  return (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} className="chat-input">
                      {matched.map(g => (
                        <div key={g.filename} onMouseDown={() => {
                          setSiOutline(g);
                          setSiQuery(`${g.outline_type_name || g.outline_type || ''} ${g.outline_num} - ${g.title}`);
                          setSiQueryFocus(false);
                          setSiNotes({}); setSiDetails({}); setSiExpanded({}); setSiSaveMsg(''); setSiDraftInfo(null); setSiNoteInfo(null);
                          // 소주제 로드
                          const oid = `${g.outline_type || 'S-34'}_${g.outline_num}`;
                          setSiSubLoading(true);
                          outlineDetail(oid, g.outline_type_name || g.outline_type || '').then(r => { setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || ''); }).catch(() => setSiSubtopics({})).finally(() => setSiSubLoading(false));
                          // draft/note 체크는 연사/날짜 변경 시 useEffect에서 처리
                          // 기본 날짜
                          if (!siDate) { const d = new Date(); setSiDate(String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')); }
                        }} style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, color: '#1D9E75', fontSize: '0.786rem', flexShrink: 0 }}>{g.outline_num}</span>
                          <span style={{ flex: 1, fontSize: '0.786rem', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                          <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.outline_type_name || g.outline_type}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {siOutline && !siNoOutline && (
              <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--tint-green)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{siOutline.outline_type_name || siOutline.outline_type}</span>
                <span style={{ fontWeight: 700, color: '#1D9E75', fontSize: '0.786rem' }}>{siOutline.outline_num}</span>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-text)' }}>{siOutline.title}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({}); setSiExpanded({}); }} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>✕</button>
              </div>
            )}

            {siNoOutline && (
              <div style={{ marginTop: 6 }}>
                <input value={siFreeTopic} onChange={e => setSiFreeTopic(e.target.value)} placeholder="연설 주제" style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box', marginBottom: 6 }} />
              </div>
            )}
          </div>

          {/* 2. 연사/날짜 */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <input value={siSpeaker} onChange={e => setSiSpeaker(e.target.value)} placeholder="연사" style={{ flex: 1, padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
            <input value={siDate} onChange={e => setSiDate(e.target.value)} placeholder="YYMM" style={{ width: 70, padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box', textAlign: 'center' }} />
          </div>

          {/* 유의사항 */}
          {siOutline && !siNoOutline && siOutlineNote && (
            <div style={{ marginBottom: 10, borderRadius: 8, border: '1px solid var(--bd)', overflow: 'hidden' }}>
              <div onClick={() => setSiNoteOpen(p => !p)} style={{
                padding: '6px 10px', background: 'var(--bg-subtle)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span style={{ fontSize: '0.857rem' }}>⚠️</span>
                <span style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)' }}>유의사항</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: siNoteOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
              </div>
              {siNoteOpen && (
                <div style={{ padding: '8px 12px', fontSize: '0.857rem', lineHeight: 1.7, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all' }}>
                  {siOutlineNote}
                </div>
              )}
            </div>
          )}

          {/* 3. 모드 전환 */}
          {(siOutline || siNoOutline) && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 2, marginBottom: 10,
              background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
            }}>
              {[['quick', '간단 입력'], ['detail', '상세 입력']].map(([k, l]) => (
                <button key={k} onClick={() => {
                  // 간단→상세 전환: 소주제 메모를 해당 소주제 첫 요점에 자동 채움
                  if (k === 'detail' && siMode === 'quick') {
                    const newDetails = { ...siDetails };
                    Object.entries(siSubtopics).forEach(([stKey, points]) => {
                      const note = (siNotes[stKey] || '').trim();
                      if (note && points.length) {
                        const ptKey = `${stKey.split('.')[0]}_${points[0].point_num}`;
                        if (!(newDetails[ptKey]?.text || '').trim()) newDetails[ptKey] = { ...newDetails[ptKey], text: note };
                      }
                    });
                    setSiDetails(newDetails);
                  }
                  setSiMode(k);
                }} style={{
                  flex: 1, padding: '6px 0', border: 'none', fontSize: '0.786rem', fontWeight: siMode === k ? 700 : 500, cursor: 'pointer',
                  background: siMode === k ? 'var(--bg-card, #fff)' : 'transparent',
                  color: siMode === k ? '#1D9E75' : 'var(--c-muted)',
                  borderRadius: 8, fontFamily: 'inherit', transition: 'all 0.2s ease',
                  boxShadow: siMode === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{l}</button>
              ))}
            </div>
          )}

          {/* 6. 골자 없는 연설 — 자유 입력 */}
          {siNoOutline && (
            <div style={{ marginBottom: 10 }}>
              <KoreanTextarea value={siFreeText} onChange={setSiFreeText} rows={6} placeholder="연설 내용을 자유롭게 입력하세요..."
                style={{ display: 'block', width: '100%', padding: '8px 12px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
            </div>
          )}

          {/* 4. 간단 입력 모드 */}
          {siOutline && !siNoOutline && siMode === 'quick' && (
            <div>
              {siSubLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 12 }}>소주제 로딩...</div>}
              {!siSubLoading && Object.keys(siSubtopics).length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 12 }}>소주제가 없습니다.</div>}
              {Object.entries(siSubtopics).map(([stKey, points]) => {
                const stLabel = stKey || '전체 요점';
                const isOpen = stKey ? siExpanded[stKey] : (siExpanded[stLabel] !== false); // 빈키는 기본 펼침
                return (
                <div key={stLabel} style={{ marginBottom: 6, borderRadius: 8, border: '1px solid var(--bd-light)', overflow: 'hidden' }}>
                  <div onClick={() => setSiExpanded(p => ({ ...p, [stLabel]: !isOpen }))} style={{
                    padding: '8px 10px', background: 'var(--bg-subtle, #EFEFF4)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)' }}>{stLabel}</span>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{points.length}개 요점</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '6px 10px', background: 'var(--bg-card)' }}>
                      {points.map((pt, pi) => {
                        const qPtKey = `q_${(stKey || '0').split('.')[0]}_${pt.point_num}`;
                        const qSu = (siDetails[qPtKey] || {}).scripture_usage || '';
                        const scr = cleanMd(pt.scriptures || '');
                        const hasPub = scr.includes('「') || scr.includes('」');
                        const hasScr = scr && !hasPub;
                        return (
                        <div key={pi} style={{ fontSize: '0.786rem', color: 'var(--c-faint)', padding: '3px 0', borderBottom: pi < points.length - 1 ? '1px solid var(--bd-light)' : 'none' }}>
                          <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>{pt.point_num}</span> {cleanMd(pt.content)}
                          {hasScr && (<>
                            <span onClick={(e) => { e.stopPropagation();
                              const open = !siVerseOpen[qPtKey];
                              setSiVerseOpen(p => ({ ...p, [qPtKey]: open }));
                              if (open && !siVerseData[qPtKey]) {
                                setSiVerseLoading(p => ({ ...p, [qPtKey]: true }));
                                bibleLookup(pt.scriptures).then(r => setSiVerseData(p => ({ ...p, [qPtKey]: r.verses || [] }))).catch(() => setSiVerseData(p => ({ ...p, [qPtKey]: [] }))).finally(() => setSiVerseLoading(p => ({ ...p, [qPtKey]: false })));
                              }
                            }} style={{
                              display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                              background: siVerseOpen[qPtKey] ? '#7F77DD' : '#7F77DD0A', color: siVerseOpen[qPtKey] ? '#fff' : '#7F77DD', fontWeight: 600, whiteSpace: 'nowrap',
                              transition: 'all 0.15s',
                            }}>📖 {scr}</span>
                            <span onClick={(e) => { e.stopPropagation(); const nv = qSu === '낭독' ? '' : '낭독'; setSiDetails(p => ({ ...p, [qPtKey]: { ...p[qPtKey], scripture_usage: nv } })); }} style={{
                              display: 'inline-block', marginLeft: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.571rem', cursor: 'pointer',
                              background: qSu === '낭독' ? '#D85A30' : 'var(--bg-subtle, #EFEFF4)', color: qSu === '낭독' ? '#fff' : 'var(--c-dim)', fontWeight: 600,
                              transition: 'all 0.15s',
                            }}>낭독</span>
                          </>)}
                          {hasPub && (
                            <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', background: '#9C27B00A', color: '#9C27B0', fontWeight: 600, whiteSpace: 'nowrap' }}>📚 {scr}</span>
                          )}
                          {siVerseOpen[qPtKey] && hasScr && (
                            <div style={{ margin: '4px 0 2px 16px', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle, #EFEFF4)', border: '1px solid var(--bd-light)', fontSize: '0.786rem', lineHeight: 1.6, color: 'var(--c-text)' }}>
                              {siVerseLoading[qPtKey] && <div style={{ height: 14, borderRadius: 4, background: 'linear-gradient(90deg, var(--bd-light) 25%, var(--bd-medium) 50%, var(--bd-light) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                              {!siVerseLoading[qPtKey] && (siVerseData[qPtKey] || []).length === 0 && <span style={{ color: 'var(--c-dim)' }}>본문을 찾을 수 없습니다.</span>}
                              {!siVerseLoading[qPtKey] && (siVerseData[qPtKey] || []).map((v, vi) => (
                                <div key={vi}><span style={{ fontWeight: 700, color: '#7F77DD', marginRight: 4 }}>{v.ref}</span>{v.text}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{ padding: '6px 10px' }}>
                    <KoreanTextarea value={siNotes[stKey] || ''} onChange={v => setSiNotes(p => ({ ...p, [stKey]: v }))} rows={2} placeholder="이 소주제에 대한 메모..."
                      style={{ display: 'block', width: '100%', padding: '6px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                  </div>
                </div>
                );})}
            </div>
          )}

          {/* 5. 상세 입력 모드 */}
          {siOutline && !siNoOutline && siMode === 'detail' && (
            <div>
              {siSubLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 12 }}>소주제 로딩...</div>}
              {!siSubLoading && Object.keys(siSubtopics).length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 12 }}>소주제가 없습니다.</div>}
              {Object.entries(siSubtopics).map(([stKey, points]) => {
                const stLabel2 = stKey || '전체 요점';
                const isOpen2 = stKey ? siExpanded[stKey] : (siExpanded[stLabel2] !== false);
                return (
                <div key={stLabel2} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--bd-light)', overflow: 'hidden' }}>
                  <div onClick={() => setSiExpanded(p => ({ ...p, [stLabel2]: !isOpen2 }))} style={{
                    padding: '8px 10px', background: 'var(--bg-subtle, #EFEFF4)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen2 ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)' }}>{stLabel2}</span>
                  </div>
                  {isOpen2 && (
                    <div style={{ padding: '6px 10px', background: 'var(--bg-card)' }}>
                      {points.map((pt) => {
                        const ptKey = `${(stKey || '0').split('.')[0]}_${pt.point_num}`;
                        const d = siDetails[ptKey] || {};
                        const upd = (field, val) => setSiDetails(p => ({ ...p, [ptKey]: { ...p[ptKey], [field]: val } }));
                        return (
                          <div key={pt.point_num} style={{ marginBottom: 8, padding: '8px 0', borderBottom: '1px solid var(--bd-light)' }}>
                            <div style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-text-dark)', marginBottom: 4 }}>
                              {pt.point_num}. {cleanMd(pt.content)}
                              {(() => { const scr = cleanMd(pt.scriptures || ''); const hasPub = scr.includes('「') || scr.includes('」'); const hasScr = scr && !hasPub; return (<>
                                {hasScr && (<>
                                  <span onClick={() => {
                                    const open = !siVerseOpen[ptKey];
                                    setSiVerseOpen(p => ({ ...p, [ptKey]: open }));
                                    if (open && !siVerseData[ptKey]) {
                                      setSiVerseLoading(p => ({ ...p, [ptKey]: true }));
                                      bibleLookup(pt.scriptures).then(r => setSiVerseData(p => ({ ...p, [ptKey]: r.verses || [] }))).catch(() => setSiVerseData(p => ({ ...p, [ptKey]: [] }))).finally(() => setSiVerseLoading(p => ({ ...p, [ptKey]: false })));
                                    }
                                  }} style={{
                                    display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                                    background: siVerseOpen[ptKey] ? '#7F77DD' : '#7F77DD0A', color: siVerseOpen[ptKey] ? '#fff' : '#7F77DD', fontWeight: 600, whiteSpace: 'nowrap',
                                    transition: 'all 0.15s',
                                  }}>📖 {scr}</span>
                                  <span onClick={() => { const nv = (d.scripture_usage || '') === '낭독' ? '' : '낭독'; upd('scripture_usage', nv); }} style={{
                                    display: 'inline-block', marginLeft: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.571rem', cursor: 'pointer',
                                    background: d.scripture_usage === '낭독' ? '#D85A30' : 'var(--bg-subtle, #EFEFF4)', color: d.scripture_usage === '낭독' ? '#fff' : 'var(--c-dim)', fontWeight: 600,
                                    transition: 'all 0.15s',
                                  }}>낭독</span>
                                </>)}
                                {hasPub && (
                                  <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', background: '#9C27B00A', color: '#9C27B0', fontWeight: 600, whiteSpace: 'nowrap' }}>📚 {scr}</span>
                                )}
                              </>); })()}
                            </div>
                            {siVerseOpen[ptKey] && cleanMd(pt.scriptures || '') && !cleanMd(pt.scriptures || '').includes('「') && (
                              <div style={{ margin: '0 0 4px', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle, #EFEFF4)', border: '1px solid var(--bd-light)', fontSize: '0.786rem', lineHeight: 1.6, color: 'var(--c-text)' }}>
                                {siVerseLoading[ptKey] && <div style={{ height: 14, borderRadius: 4, background: 'linear-gradient(90deg, var(--bd-light) 25%, var(--bd-medium) 50%, var(--bd-light) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                                {!siVerseLoading[ptKey] && (siVerseData[ptKey] || []).length === 0 && <span style={{ color: 'var(--c-dim)' }}>본문을 찾을 수 없습니다.</span>}
                                {!siVerseLoading[ptKey] && (siVerseData[ptKey] || []).map((v, vi) => (
                                  <div key={vi}><span style={{ fontWeight: 700, color: '#7F77DD', marginRight: 4 }}>{v.ref}</span>{v.text}</div>
                                ))}
                              </div>
                            )}
                            {/* 내용 */}
                            <KoreanTextarea value={d.text || ''} onChange={v => upd('text', v)} rows={2} placeholder="내용 입력..."
                              style={{ display: 'block', width: '100%', padding: '6px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 4 }} />
                            {/* 키워드 */}
                            <input value={d.keywords || ''} onChange={e => upd('keywords', e.target.value)} placeholder="키워드 (쉼표 구분)"
                              style={{ width: '100%', padding: '5px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box', marginBottom: 4 }} />
                            {/* 태그 */}
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 4 }}>
                              {['표현', '예시·실화', '예시·비유', '예시·성경'].map(tag => {
                                const curTags = (d.tags || '').split(',').filter(Boolean);
                                const active = curTags.includes(tag);
                                return (
                                  <button key={tag} onClick={() => {
                                    const next = active ? curTags.filter(t => t !== tag) : [...curTags, tag];
                                    upd('tags', next.join(','));
                                  }} style={{
                                    padding: '3px 8px', borderRadius: 6, fontSize: '0.786rem', fontWeight: active ? 700 : 500, cursor: 'pointer',
                                    border: 'none',
                                    background: active ? (tag === '표현' ? '#D85A3018' : tag === '예시·성경' ? '#2D8FC718' : '#C7842D18') : 'var(--bg-subtle, #EFEFF4)',
                                    color: active ? (tag === '표현' ? '#D85A30' : tag === '예시·성경' ? '#2D8FC7' : '#C7842D') : 'var(--c-muted)',
                                    transition: 'all 0.15s',
                                  }}>{tag}</button>
                                );
                              })}
                            </div>
                            {/* 사용여부 */}
                            <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                              {['사용', '미사용', '합쳐서사용'].map(u => (
                                <button key={u} onClick={() => upd('usage', u)} style={{
                                  padding: '3px 8px', borderRadius: 6, fontSize: '0.786rem', fontWeight: (d.usage || '사용') === u ? 700 : 500, cursor: 'pointer',
                                  border: 'none',
                                  background: (d.usage || '사용') === u ? '#1D9E7515' : 'var(--bg-subtle, #EFEFF4)',
                                  color: (d.usage || '사용') === u ? '#1D9E75' : 'var(--c-muted)',
                                  transition: 'all 0.15s',
                                }}>{u}</button>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* 7. 저장/완료 버튼 (2층 구조) */}
          {(siOutline || siNoOutline) && (
            <div style={{ marginTop: 10 }}>
              {/* draft 불러오기 안내 */}
              {siDraftInfo && (
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--tint-blue-soft)', border: '1px solid var(--tint-blue-bd)', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: '#378ADD', fontWeight: 600, marginBottom: 6 }}>기존 임시저장 데이터 있음 ({siDraftInfo.filled}/{siDraftInfo.total} {siDraftInfo.mode === 'quick' ? '소주제 메모' : '요점'} 입력)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={async () => {
                      const r = await draftLoad({ outline_num: siOutline?.outline_num || '', speaker: siSpeaker.trim(), date: siDate.trim(), outline_type: siOutline?.outline_type || '' });
                      if (r.exists) {
                        if (r.notes) setSiNotes(r.notes);
                        if (r.details) setSiDetails(r.details);
                        if (r.mode) setSiMode(r.mode);
                        const exp = {};
                        Object.entries(siSubtopics).forEach(([stKey, pts]) => {
                          if ((r.notes?.[stKey] || '').trim()) { exp[stKey] = true; return; }
                          if ((pts || []).some(pt => { const d = r.details?.[`${stKey.split('.')[0]}_${pt.point_num}`]; return d && ((d.text || '').trim() || (d.tags || '').trim()); })) exp[stKey] = true;
                        });
                        setSiExpanded(exp);
                        setSiDraftInfo(null);
                        setSiSaveMsg('✓ 임시저장 불러오기 완료');
                      }
                    }} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: '#378ADD', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>불러오기</button>
                    <button onClick={async () => {
                      if (!confirm('기존 데이터가 삭제됩니다. 새로 만드시겠습니까?')) return;
                      await draftDelete(siDraftInfo.draft_id);
                      setSiNotes({}); setSiDetails({}); setSiExpanded({});
                      setSiDraftInfo(null);
                      setSiSaveMsg('✓ 기존 임시저장 삭제, 새로 시작');
                    }} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>새로 만들기</button>
                  </div>
                </div>
              )}
              {/* 간단 메모 불러오기 안내 (상세 입력 모드에서) */}
              {siNoteInfo && siMode === 'detail' && (
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.786rem', color: '#D85A30', fontWeight: 600 }}>간단 입력 데이터 있음</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => {
                    const text = (siNoteInfo.text || '').replace(/\[.*?\].*\n?/g, '').trim();
                    if (text) {
                      const keys = Object.keys(siSubtopics);
                      if (keys.length) setSiNotes(p => ({ ...p, [keys[0]]: text }));
                    }
                    setSiNoteInfo(null);
                    setSiSaveMsg('✓ 간단 메모 불러오기 완료');
                  }} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#D85A30', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>불러오기</button>
                </div>
              )}

              {/* [저장] = draft만 저장 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={async () => {
                  setSiSaving(true); setSiSaveMsg('');
                  try {
                    await draftSave({
                      outline_type: siOutline?.outline_type || 'ETC',
                      outline_num: siOutline?.outline_num || '',
                      outline_title: siOutline?.title || siFreeTopic || '',
                      version: siOutline?.version || '',
                      speaker: siSpeaker.trim(), date: siDate.trim(),
                      mode: siMode, notes: siNotes, details: siDetails,
                      subtopics: siSubtopics,
                    });
                    setSiSaveMsg('✓ 임시저장 완료');
                  } catch (e) { setSiSaveMsg('오류: ' + e.message); }
                  finally { setSiSaving(false); }
                }} disabled={siSaving || siCompleting} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--bd)',
                  background: siSaving ? 'var(--bd-medium)' : 'var(--bg-card)', color: 'var(--c-text-dark)',
                  fontSize: '0.929rem', fontWeight: 600, cursor: siSaving ? 'default' : 'pointer',
                }}>
                  {siSaving ? '임시저장 중...' : '임시저장'}
                </button>

                {/* [완료] = DB 저장 + draft 삭제 (상세 입력만) */}
                {siMode === 'detail' && <button onClick={async () => {
                  setSiCompleting(true); setSiSaveMsg('');
                  try {
                    const res = await draftComplete({
                      outline_type: siOutline?.outline_type || 'ETC',
                      outline_num: siOutline?.outline_num || '',
                      outline_title: siOutline?.title || siFreeTopic || '',
                      version: siOutline?.version || '',
                      speaker: siSpeaker.trim(), date: siDate.trim(),
                      mode: siMode, notes: siNotes, details: siDetails,
                      subtopics: siSubtopics,
                    });
                    if (res.status === 'error') { setSiSaveMsg(res.message); setSiCompleting(false); return; }
                    if (siTransferMemo) { try { await dbDelete(siTransferMemo.col, siTransferMemo.id); } catch {} setSiTransferMemo(null); }
                    setSiSaveMsg(`✓ ${res.total}건 저장 완료 (임시저장 삭제됨)`);
                    setSiNotes({}); setSiDetails({});
                    setDbCache(p => { const n = { ...p }; delete n['연설']; return n; }); // 캐시 무효화
                  } catch (e) { setSiSaveMsg('오류: ' + e.message); }
                  finally { setSiCompleting(false); }
                }} disabled={siSaving || siCompleting} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: siCompleting ? 'var(--bd-medium)' : '#1D9E75', color: '#fff',
                  fontSize: '0.929rem', fontWeight: 700, cursor: siCompleting ? 'default' : 'pointer',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {siCompleting && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                  <span style={{ position: 'relative', zIndex: 1 }}>{siCompleting ? '저장 중...' : '저장'}</span>
                </button>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }} />
                <button onClick={() => {
                  if (!confirm('입력한 내용을 모두 초기화하시겠습니까?')) return;
                  setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiSpeaker(''); setSiDate(_siDateDefault);
                  setSiMode('quick'); setSiExpanded({}); setSiNotes({}); setSiDetails({});
                  setSiNoOutline(false); setSiFreeText(''); setSiFreeTopic(''); siDraftLoadedRef.current = false;
                  setSiVerseOpen({}); setSiVerseData({}); setSiSaveMsg(''); setSiDraftInfo(null); setSiNoteInfo(null);
                  try { localStorage.removeItem('jw-si-state'); } catch {}
                }} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>초기화</button>
              </div>
              {siSaveMsg && <div style={{ marginTop: 6, fontSize: '0.786rem', textAlign: 'center', color: siSaveMsg.startsWith('✓') ? '#1D9E75' : '#c44', fontWeight: 600 }}>{siSaveMsg}</div>}
            </div>
          )}

        </div>
      )}

      {addTab === 'drafts' && (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden' }}>
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{dbDrafts.length}건</span>
              <button onClick={() => { draftList().then(r => setDbDrafts(r.drafts || [])).catch(() => {}); }} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
            </div>
            {dbDrafts.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>임시저장된 데이터가 없습니다.</div>}
            {dbDrafts.map((dr, di) => (
              <div key={dr.draft_id} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#378ADD', flexShrink: 0 }} />
                  {dr.outline_num && <span style={{ fontSize: '0.786rem', color: '#1D9E75', fontWeight: 700 }}>{dr.outline_num}</span>}
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-text)' }}>{dr.outline_title}</span>
                  {dr.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{dr.speaker}</span>}
                  {dr.date && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{dr.date}</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: '0.643rem', color: '#378ADD', fontWeight: 600 }}>{dr.filled}/{dr.total} {dr.mode === 'quick' ? '소주제' : '요점'}</span>
                </div>
                <div style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{dr.mode === 'quick' ? '간단 입력' : '상세 입력'}</span>
                  {dr.saved_at && <span style={{ fontSize: '0.571rem', color: 'var(--c-dim)' }}>{dr.saved_at.split('T')[0]}</span>}
                  <div style={{ flex: 1 }} />
                  {['quick', 'detail'].map(m => (
                    <button key={m} onClick={() => {
                      try { localStorage.setItem('jw-si-transfer', JSON.stringify({
                        speaker: dr.speaker, date: dr.date,
                        outline_num: dr.outline_num, outline_title: dr.outline_title,
                        outline_type: dr.outline_type, content: '', isDraft: true, forceMode: m,
                      })); localStorage.setItem('jw-add-tab', 'speech_input'); window.dispatchEvent(new Event('si-transfer')); } catch {}
                      setAddTab('speech_input');
                    }} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #378ADD', background: 'var(--bg-card)', color: '#378ADD', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>{m === 'quick' ? '간단' : '상세'}</button>
                  ))}
                  <button onClick={async () => {
                    if (!confirm('이 임시저장을 삭제하시겠습니까?')) return;
                    await draftDelete(dr.draft_id);
                    setDbDrafts(p => p.filter((_, i) => i !== di));
                  }} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      </>)}

      {mode === 'mydb' && (<>

        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 12 }}>
        {/* DB 탭 — 카드 헤더 언더라인 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--bd-light)', background: 'var(--bg-subtle)' }}>
            {_dbTabs.map(({ key: t, color: tc }) => {
              const active = viewSource === t;
              const cnt = dbTabCounts[t];
              return (
              <button key={t} onClick={() => {
                if (t === viewSource) return;
                setViewSource(t); setDbSearch(''); setExpandedDbEntry({}); setDbShowLimit(50); setDbSelected(new Set());
                // 캐시 있으면 스킵
                if (t === '연사메모') { if (!speakerMemos.length) { setSpMemoLoading(true); listSpeakerMemos().then(r => { setSpeakerMemos(r.memos || []); setDbTabCounts(p => ({ ...p, '연사메모': (r.memos || []).length })); }).catch(() => {}).finally(() => setSpMemoLoading(false)); } return; }
                if (dbCache[t]?.length) return;
                _loadDbTab(t);
              }} style={{
                flex: 1, padding: '9px 0 7px', border: 'none', borderBottom: active ? `2px solid ${tc}` : '2px solid transparent',
                background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 500, color: active ? tc : 'var(--c-muted)', lineHeight: 1.2 }}>{t}</span>
                <span style={{ fontSize: '0.571rem', fontWeight: 600, color: active ? tc : 'var(--c-dim)', visibility: cnt != null ? 'visible' : 'hidden' }}>{cnt ?? 0}</span>
              </button>
              );
            })}
        </div>

        {/* ── 골자/연설/출판물/원문 공통 ── */}
        {['골자', '연설', '출판물', '원문'].includes(viewSource) && (
        <div style={{ padding: 12 }}>
          {/* 연설 필터 */}
          {viewSource === '연설' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2 }}>
              {['그룹', '목록'].map(f => (
                <button key={f} onClick={() => { setSpeechFilter(f); }} style={{
                  flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: speechFilter === f ? 700 : 500,
                  border: 'none', background: speechFilter === f ? 'var(--bg-card, #fff)' : 'transparent',
                  color: speechFilter === f ? '#D85A30' : 'var(--c-muted)',
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  boxShadow: speechFilter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{f}</button>
              ))}
            </div>
          )}
          {/* 검색 */}
          <div style={{ marginBottom: 8 }}>
            <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="검색..." style={{ width: '100%', padding: '6px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          </div>

          {/* 선택 툴바 + 건수 + 새로고침 */}
          {(
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.786rem', color: 'var(--c-muted)' }}>
                <input type="checkbox" checked={dbSelected.size > 0 && dbSelected.size === (() => {
                  if (viewSource === '골자') { const g = {}; dbEntries.forEach(r => { g[`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}`] = true; }); return Object.keys(g).length; }
                  if (viewSource === '연설') { const g = {}; dbEntries.forEach(r => { const m = r.metadata || {}; g[`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`] = true; }); return Object.keys(g).length; }
                  return dbEntries.length;
                })()} onChange={e => {
                  if (e.target.checked) {
                    if (viewSource === '골자') {
                      const groups = {}; dbEntries.forEach(r => { groups[`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}`] = true; });
                      setDbSelected(new Set(Object.keys(groups)));
                    } else if (viewSource === '연설') {
                      const groups = {}; dbEntries.forEach(r => { const m = r.metadata || {}; groups[`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`] = true; });
                      setDbSelected(new Set(Object.keys(groups)));
                    } else setDbSelected(new Set(dbEntries.map(r => r.id)));
                  } else setDbSelected(new Set());
                }} style={{ accentColor: '#1D9E75' }} />
                전체 선택
              </label>
              <div style={{ flex: 1 }} />
              {dbSelected.size === 0 && (<>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{(() => {
                  if (viewSource === '연설' && speechFilter === '그룹') { const g = {}; dbEntries.forEach(r => { const m = r.metadata || {}; g[`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`] = true; }); return `${Object.keys(g).length}그룹`; }
                  if (viewSource === '골자') { const g = {}; dbEntries.forEach(r => { g[`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}`] = true; }); return `${Object.keys(g).length}그룹`; }
                  return `${dbEntries.length}건`;
                })()}</span>
                <button onClick={() => _loadDbTab(viewSource)} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
              </>)}
              {dbSelected.size > 0 && (
                <>
                  <span style={{ fontSize: '0.786rem', color: '#c44', fontWeight: 600 }}>{dbSelected.size}개 선택</span>
                  <button onClick={() => setDbSelected(new Set())} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.714rem', cursor: 'pointer' }}>선택 해제</button>
                  <button onClick={async () => {
                    const count = viewSource === '골자'
                      ? dbEntries.filter(r => dbSelected.has(`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}`)).length
                      : dbSelected.size;
                    if (!confirm(`선택한 ${dbSelected.size}개 항목 (${count}건)을 삭제하시겠습니까?`)) return;
                    setDbDeleting(true);
                    try {
                      if (viewSource === '골자') {
                        for (const gKey of dbSelected) {
                          const items = dbEntries.filter(r => `${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}` === gKey);
                          if (items.length) {
                            const m = items[0].metadata || {};
                            const code = m.outline_type === '공개강연' ? 'S-34' : m.outline_type === '기념식' ? 'S-31' : m.outline_type === '특별강연' ? 'S-123' : m.outline_type || '';
                            const num = m.outline_num || '';
                            const pfx = code && /^\d+$/.test(num) ? code + '_' + num.replace(/^0+/, '').padStart(3, '0') : code || num;
                            await deleteOutline(pfx);
                          }
                        }
                      } else if (viewSource === '연설') {
                        // 연설 그룹 삭제: gKey로 매칭된 항목 개별 삭제
                        for (const gKey of dbSelected) {
                          const items = dbEntries.filter(r => { const m = r.metadata || {}; return `${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}` === gKey; });
                          for (const item of items) await dbDelete(item.collection, item.id);
                        }
                      } else {
                        for (const id of dbSelected) {
                          const entry = dbEntries.find(r => r.id === id);
                          if (entry) await dbDelete(entry.collection, entry.id);
                        }
                      }
                      setDbCache(p => ({ ...p, [viewSource]: (p[viewSource] || []).filter(r => {
                        if (viewSource === '골자') return !dbSelected.has(`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}`);
                        if (viewSource === '연설') { const m = r.metadata || {}; return !dbSelected.has(`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`); }
                        return !dbSelected.has(r.id);
                      }) }));
                      setDbTabCounts(p => ({ ...p, [viewSource]: Math.max(0, (p[viewSource] || 0) - count) }));
                      setDbSelected(new Set());
                    } catch (e) { alert('오류: ' + e.message); }
                    finally { setDbDeleting(false); }
                  }} disabled={dbDeleting} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #c44', background: dbDeleting ? 'var(--bd)' : 'var(--bg-card)', color: '#c44', fontSize: '0.714rem', cursor: dbDeleting ? 'default' : 'pointer', fontWeight: 600 }}>{dbDeleting ? '삭제 중...' : '선택 삭제'}</button>
                </>
              )}
            </div>
          )}

          {/* 항목 목록 */}
          {dbLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 16 }}>로딩...</div>}

          {/* 골자 그룹 표시 */}
          {viewSource === '골자' && !dbLoading && (() => {
            const groups = {};
            dbEntries.forEach(r => {
              const m = r.metadata || {};
              const ot = m.outline_type || '';
              const on = m.outline_num || '기타';
              const key = `${ot}_${on}`;
              if (!groups[key]) groups[key] = { num: on, title: m.outline_title || '', type: ot, items: [] };
              if (!groups[key].title && m.outline_title) groups[key].title = m.outline_title;
              groups[key].items.push(r);
            });
            const sorted = Object.values(groups).sort((a, b) => {
              const codeA = a.type === '공개강연' ? 'S-34' : a.type === '기념식' ? 'S-31' : a.type === '특별강연' ? 'S-123' : a.type || 'ZZZ';
              const codeB = b.type === '공개강연' ? 'S-34' : b.type === '기념식' ? 'S-31' : b.type === '특별강연' ? 'S-123' : b.type || 'ZZZ';
              const ka = `${codeA}_${(a.num || '').padStart(5, '0')}`;
              const kb = `${codeB}_${(b.num || '').padStart(5, '0')}`;
              return ka.localeCompare(kb);
            });
            const q = dbSearch.trim().toLowerCase();
            const filtered = q ? sorted.filter(g => g.num.toLowerCase().includes(q) || g.title.toLowerCase().includes(q)) : sorted;
            return filtered.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>골자가 없습니다.</div> : filtered.map(g => {
              const gKey = `${g.type}_${g.num}`;
              const isOpen = expandedDbEntry['g_' + gKey];
              const gt = g.type || '';
              const code = gt === '공개강연' ? 'S-34' : gt === '기념식' ? 'S-31' : gt === '특별강연' ? 'S-123' : gt.startsWith('S-') || gt.startsWith('CO') || gt.startsWith('SB') || gt.startsWith('JWBC') || gt.startsWith('ETC') ? gt : '';
              const num = g.num || '';
              const isNumeric = /^\d+$/.test(num);
              const pfx = code ? (isNumeric ? code + '_' + num.replace(/^0+/, '').padStart(3, '0') : code) : num;
              return (
                <div key={gKey} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                  <div onClick={() => setExpandedDbEntry(p => ({ ...p, ['g_' + gKey]: !p['g_' + gKey] }))} style={{
                    padding: '8px 10px', background: 'var(--bg-subtle)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <input type="checkbox" checked={dbSelected.has(gKey)} onChange={e => { e.stopPropagation(); setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(gKey); else n.delete(gKey); return n; }); }} onClick={e => e.stopPropagation()} style={{ accentColor: '#1D9E75', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontWeight: 700, color: '#1D9E75', fontSize: '0.786rem' }}>{pfx || g.num}</span>
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.items.length}개 요점</span>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!confirm(`${pfx || g.num} 골자를 삭제하시겠습니까? (${g.items.length}개 요점 + JSON 파일)`)) return;
                      try {
                        const outlineId = pfx || g.num;
                        await deleteOutline(outlineId);
                        setDbCache(p => ({ ...p, '골자': (p['골자'] || []).filter(r => !g.items.some(gi => gi.id === r.id)) }));
                        setDbTabCounts(p => ({ ...p, '골자': Math.max(0, (p['골자'] || 0) - g.items.length) }));
                      } catch (err) { alert('오류: ' + err.message); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: '0.643rem', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '4px 10px 6px', maxHeight: 250, overflowY: 'auto' }} className="chat-input">
                      {[...g.items].sort((a, b) => {
                        const pa = (a.metadata?.point_num || '').split('.').map(Number);
                        const pb = (b.metadata?.point_num || '').split('.').map(Number);
                        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                          const diff = (pa[i] || 0) - (pb[i] || 0);
                          if (diff !== 0) return diff;
                        }
                        return 0;
                      }).map((r, ri) => {
                        const m = r.metadata || {};
                        return (
                          <div key={r.id} style={{ fontSize: '0.786rem', padding: '3px 0', borderBottom: ri < g.items.length - 1 ? '1px solid var(--bd-light)' : 'none', display: 'flex', gap: 4, alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 600, color: '#1D9E75', flexShrink: 0 }}>{m.point_num || ''}</span>
                            <span style={{ color: 'var(--c-text)', flex: 1 }}>{cleanMd(m.point_content || '')}</span>
                            {m.scriptures && <span style={{ color: '#7F77DD', fontSize: '0.643rem', flexShrink: 0 }}>{cleanMd(m.scriptures)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* 항목 목록 (전체/간단입력) — 골자는 위에서 그룹 표시 */}
          {/* 연설 그룹 표시 */}
          {viewSource === '연설' && speechFilter === '그룹' && !dbLoading && (() => {
            const groups = {};
            dbEntries.forEach(r => {
              const m = r.metadata || {};
              if (dbSearch.trim()) {
                const q = dbSearch.trim().toLowerCase();
                const txt = (r.text || '').toLowerCase();
                if (!(m.outline_title || m.topic || '').toLowerCase().includes(q) && !(m.speaker || '').toLowerCase().includes(q) && !(m.outline_num || '').toLowerCase().includes(q) && !txt.includes(q)) return;
              }
              const key = `${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`;
              if (!groups[key]) groups[key] = { num: m.outline_num || '', title: m.outline_title || m.topic || '', speaker: m.speaker || '', date: m.date || '', type: m.outline_type || '', items: [] };
              groups[key].items.push(r);
            });
            const sorted = Object.entries(groups).sort((a, b) => {
              const ga = a[1], gb = b[1];
              const codeA = ga.type === '공개강연' ? 'S-34' : ga.type === '기념식' ? 'S-31' : ga.type === '특별강연' ? 'S-123' : ga.type || 'ZZZ';
              const codeB = gb.type === '공개강연' ? 'S-34' : gb.type === '기념식' ? 'S-31' : gb.type === '특별강연' ? 'S-123' : gb.type || 'ZZZ';
              const ka = `${codeA}_${(ga.num || '').padStart(5, '0')}_${ga.speaker || ''}_${ga.date || ''}`;
              const kb = `${codeB}_${(gb.num || '').padStart(5, '0')}_${gb.speaker || ''}_${gb.date || ''}`;
              return ka.localeCompare(kb);
            });
            return sorted.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>데이터가 없습니다.</div> : (<>
              {sorted.slice(0, dbShowLimit).map(([gKey, g]) => {
                const isOpen = expandedDbEntry['sg_' + gKey];
                const gt = g.type || '';
                const code = gt === '공개강연' ? 'S-34' : gt === '기념식' ? 'S-31' : gt === '특별강연' ? 'S-123' : gt.startsWith('S-') || gt.startsWith('CO') || gt.startsWith('SB') || gt.startsWith('JWBC') || gt.startsWith('ETC') ? gt : '';
                const num = g.num || '';
                const pfx = code && /^\d+$/.test(num) ? code + '_' + num.replace(/^0+/, '').padStart(3, '0') : code || num;
                return (
                  <div key={gKey} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                    <div onClick={() => setExpandedDbEntry(p => ({ ...p, ['sg_' + gKey]: !p['sg_' + gKey] }))} style={{
                      padding: '8px 10px', background: 'var(--bg-subtle)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <input type="checkbox" checked={dbSelected.has(gKey)} onChange={e => { e.stopPropagation(); setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(gKey); else n.delete(gKey); return n; }); }} onClick={e => e.stopPropagation()} style={{ accentColor: '#D85A30', cursor: 'pointer' }} />
                      <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                      {pfx && <span style={{ fontWeight: 700, color: '#1D9E75', fontSize: '0.786rem' }}>{pfx}</span>}
                      <span style={{ fontSize: '0.786rem', color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                      {g.speaker && <span style={{ fontSize: '0.714rem', color: 'var(--c-faint)', flexShrink: 0 }}>{g.speaker}</span>}
                      {g.date && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.date}</span>}
                      <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.items.length}건</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '4px 10px 6px', maxHeight: 300, overflowY: 'auto' }} className="chat-input">
                        {[...g.items].sort((a, b) => {
                          const pa = (a.metadata?.point_num || '').split('.').map(Number);
                          const pb = (b.metadata?.point_num || '').split('.').map(Number);
                          for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const diff = (pa[i] || 0) - (pb[i] || 0); if (diff !== 0) return diff; }
                          return 0;
                        }).map((r, ri) => {
                          const m = r.metadata || {};
                          const parsed = parseDocument(r.text || '');
                          const body = (r.text || '').replace(/\[.*?\].*\n?/g, '').trim();
                          const lvl = (m.point_num || '').split('.').length;
                          return (
                            <div key={r.id} style={{ fontSize: '0.786rem', padding: '4px 0', borderBottom: ri < g.items.length - 1 ? '1px solid var(--bd-light)' : 'none', marginLeft: Math.max(0, lvl - 1) * 12 }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 600, color: '#D85A30', flexShrink: 0 }}>{m.point_num || m.sub_topic || ''}</span>
                                <span style={{ color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanMd(m.point_content || parsed?.point || '')}</span>
                                {m.source === 'note' && <span style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: '#C7842D20', color: '#C7842D', fontWeight: 600 }}>간단</span>}
                              </div>
                              {(m.scriptures || m.keywords) && (
                                <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginTop: 1 }}>
                                  {m.scriptures && <span style={{ color: '#2D8FC7', marginRight: 6 }}>📖 {cleanMd(m.scriptures)}</span>}
                                  {m.keywords && <span>{m.keywords}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {sorted.length > dbShowLimit && (
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <button onClick={() => setDbShowLimit(p => p + 50)} style={{ padding: '6px 20px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>더 보기 ({sorted.length - dbShowLimit}개 남음)</button>
                </div>
              )}
            </>);
          })()}

          {/* 출판물/원문 개별 표시 */}
          {((!['골자', '연설'].includes(viewSource)) || (viewSource === '연설' && speechFilter === '목록')) && !dbLoading && (() => { const _filtered = dbEntries.filter(r => {
            const m = r.metadata || {};
            if (!dbSearch.trim()) return true;
            const q = dbSearch.trim().toLowerCase();
            const txt = (r.text || '').toLowerCase();
            return (m.outline_title || m.topic || '').toLowerCase().includes(q) || (m.speaker || '').toLowerCase().includes(q) || (m.outline_num || '').toLowerCase().includes(q) || (m.point_content || '').toLowerCase().includes(q) || (m.pub_code || '').toLowerCase().includes(q) || txt.includes(q);
          }); return (<>{_filtered.slice(0, dbShowLimit).map((r, i) => {
            const meta = r.metadata || {};
            const parsed = parseDocument(r.text || '');
            const isExpanded = expandedDbEntry[r.id];
            const body = (r.text || '').replace(/\[.*?\].*\n?/g, '').trim();
            const cColor = r.collection === 'speech_points' ? '#1D9E75' : r.collection === 'publications' ? '#7F77DD' : '#D85A30';
            const isPub = r.collection === 'publications';
            const gt = meta.outline_type || '';
            const gn = meta.outline_num || '';
            let prefix = '';
            if ((gt === '공개강연' || gt.startsWith('S-34')) && gn) prefix = 'S-34_' + gn.replace(/^0+/, '').padStart(3, '0');
            else if (gt === '기념식' || gt.startsWith('S-31')) prefix = 'S-31_기념식';
            else if (gt.startsWith('JWBC-')) prefix = gn ? gt + '_' + gn : gt;
            else if (gn) prefix = gn;
            const title = meta.outline_title || meta.topic || '';
            const subTopic = parsed?.subtopic || meta.sub_topic || '';
            const scripture = cleanMd(parsed?.scripture || meta.scriptures || '');
            const metaRows = [
              isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: '#7F77DD' },
              !isPub && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
              subTopic && { label: '소주제', value: subTopic },
              (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: cColor },
              scripture && { label: '성구', value: scripture, color: '#2D8FC7' },
              (parsed?.keywords || meta.keywords) && { label: '키워드', value: parsed?.keywords || meta.keywords },
            ].filter(Boolean);
            return (
              <div key={r.id} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 6 }}>
                {/* 헤더 */}
                <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={dbSelected.has(r.id)} onChange={e => setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} style={{ accentColor: cColor, cursor: 'pointer' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: cColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || meta.source || viewSource}</span>
                    {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                    {meta.date && meta.date !== '0000' && <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>{meta.date}</span>}
                    {meta.tags && (() => {
                      const t = meta.tags;
                      const badges = [];
                      if (t.includes('표현')) badges.push({ label: '표현', bg: '#D85A30' });
                      if (t.includes('예시(실화)') || t.includes('예시·실화')) badges.push({ label: '예시·실화', bg: '#C7842D' });
                      if (t.includes('예시(비유)') || t.includes('예시·비유')) badges.push({ label: '예시·비유', bg: '#C7842D' });
                      if (t.includes('예시(성경)') || t.includes('예시·성경')) badges.push({ label: '예시·성경', bg: '#2D8FC7' });
                      if (!badges.length && t.includes('예시')) badges.push({ label: '예시', bg: '#C7842D' });
                      return badges.map((b, bi) => <span key={bi} style={{ fontSize: '0.571rem', padding: '1px 5px', borderRadius: 3, background: b.bg, color: '#fff', fontWeight: 700 }}>{b.label}</span>);
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    <div style={{ flex: 1 }} />
                    {viewSource === '연설' && meta.source === 'note' && (
                      <button onClick={() => {
                        try { localStorage.setItem('jw-si-transfer', JSON.stringify({
                          speaker: meta.speaker || '', date: meta.date || '',
                          outline_num: meta.outline_num || '', outline_title: meta.outline_title || meta.topic || '',
                          outline_type: meta.outline_type || '', content: body,
                          memoId: r.id, memoCol: r.collection,
                        })); localStorage.setItem('jw-add-tab', 'speech_input'); window.dispatchEvent(new Event('si-transfer')); } catch {}
                        if (onGoAdd) onGoAdd(); else { setAddTab('speech_input'); setMode('add'); }
                      }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #1D9E75', background: 'var(--bg-card)', color: '#1D9E75', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>→상세</button>
                    )}
                    <button onClick={async () => {
                      if (!confirm('삭제하시겠습니까?')) return;
                      try { await dbDelete(r.collection, r.id); setDbEntries(p => p.filter(e => e.id !== r.id)); } catch (e) { alert('오류: ' + e.message); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                  </div>
                </div>
                {/* 메타 그리드 */}
                {metaRows.length > 0 && (
                <div style={{ padding: '8px 10px', fontSize: '0.857rem', lineHeight: 1.8, color: 'var(--c-sub)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline' }}>
                    {metaRows.map((row, idx) => (
                      <Fragment key={idx}>
                        <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                        <span style={{ fontSize: '0.786rem', color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                      </Fragment>
                    ))}
                  </div>
                </div>
                )}
                {/* 본문 */}
                {body && (
                  <div style={{ padding: '6px 10px 10px', fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: isExpanded ? 300 : 60, overflow: isExpanded ? 'auto' : 'hidden' }} className={isExpanded ? 'chat-input' : undefined}>
                    {body.slice(0, isExpanded ? undefined : 150)}
                  </div>
                )}
                {body && body.length > 150 && (
                  <div style={{ padding: '0 10px 6px', borderTop: '1px solid var(--bd-light)', textAlign: 'right' }}>
                    <button onClick={() => setExpandedDbEntry(p => ({ ...p, [r.id]: !p[r.id] }))} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>{isExpanded ? '접기' : '전체 보기'}</button>
                  </div>
                )}
              </div>
            );
          })}
            {_filtered.length > dbShowLimit && (
              <div style={{ textAlign: 'center', padding: 8 }}>
                <button onClick={() => setDbShowLimit(p => p + 50)} style={{ padding: '6px 20px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>더 보기 ({_filtered.length - dbShowLimit}건 남음)</button>
              </div>
            )}
            {_filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>데이터가 없습니다.</div>}
          </>); })()}
        </div>
        )}

        {/* ── 연사메모 ── */}
        {viewSource === '연사메모' && (<>
        <div style={{ padding: 12 }}>
          {/* [그룹] [목록] 세그먼트 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2 }}>
            {['그룹', '목록'].map(m => (
              <button key={m} onClick={() => { setMemoViewMode(m); setDbSelected(new Set()); }} style={{
                flex: 1, padding: '5px 0', border: 'none', borderRadius: 8, fontSize: '0.786rem', fontWeight: memoViewMode === m ? 700 : 500,
                background: memoViewMode === m ? 'var(--bg-card, #fff)' : 'transparent', color: memoViewMode === m ? '#C7842D' : 'var(--c-muted)',
                cursor: 'pointer', fontFamily: 'inherit', boxShadow: memoViewMode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
              }}>{m}</button>
            ))}
          </div>
          {/* 카테고리 필터 — 목록에서만 */}
          {memoViewMode === '목록' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 6, background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2 }}>
              {['전체', '원본', '도입', '구조', '성구', '예시', '언어습관', '마무리'].map(cat => (
                <button key={cat} onClick={() => setMemoCatFilter(cat)} style={{
                  flex: 1, padding: '4px 0', border: 'none', borderRadius: 8, fontSize: '0.714rem', fontWeight: memoCatFilter === cat ? 700 : 500, whiteSpace: 'nowrap',
                  background: memoCatFilter === cat ? 'var(--bg-card, #fff)' : 'transparent', color: memoCatFilter === cat ? '#7F77DD' : 'var(--c-muted)',
                  cursor: 'pointer', fontFamily: 'inherit', boxShadow: memoCatFilter === cat ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
                }}>{cat}</button>
              ))}
            </div>
          )}
          {/* 검색 */}
          <div style={{ marginBottom: 8 }}>
            <input value={memoSearchQ} onChange={e => setMemoSearchQ(e.target.value)} placeholder="연사/골자번호 검색..." style={{ width: '100%', padding: '6px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          </div>
          {/* 연사메모 선택 툴바 + 건수 + 새로고침 */}
          {(
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.786rem', color: 'var(--c-muted)' }}>
                <input type="checkbox" checked={dbSelected.size > 0 && dbSelected.size === speakerMemos.length} onChange={e => {
                  if (e.target.checked) setDbSelected(new Set(speakerMemos.map(m => m.id)));
                  else setDbSelected(new Set());
                }} style={{ accentColor: '#7F77DD' }} />
                전체 선택
              </label>
              <div style={{ flex: 1 }} />
              {dbSelected.size === 0 && (<>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{memoViewMode === '그룹' ? (() => { const g = {}; speakerMemos.forEach(m => { g[m.metadata?.speaker || ''] = true; }); return `${Object.keys(g).length}그룹`; })() : (() => {
                  const cnt = speakerMemos.filter(m => {
                    if (memoCatFilter === '전체') return true;
                    if (memoCatFilter === '원본') return m.metadata?.reprocessed === 'true' || (!m.metadata?.memo_category && !m.metadata?.reprocessed);
                    return m.metadata?.memo_category === memoCatFilter;
                  }).length;
                  return `${cnt}건`;
                })()}</span>
                <button onClick={() => { setSpMemoLoading(true); listSpeakerMemos().then(r => { setSpeakerMemos(r.memos || []); setDbTabCounts(p => ({ ...p, '연사메모': (r.memos || []).length })); }).catch(() => {}).finally(() => setSpMemoLoading(false)); }} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
              </>)}
              {dbSelected.size > 0 && (
                <>
                  <span style={{ fontSize: '0.786rem', color: '#c44', fontWeight: 600 }}>{dbSelected.size}개 선택</span>
                  <button onClick={() => setDbSelected(new Set())} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.714rem', cursor: 'pointer' }}>선택 해제</button>
                  <button onClick={async () => {
                    if (!confirm(`선택한 ${dbSelected.size}개 연사메모를 삭제하시겠습니까?`)) return;
                    setDbDeleting(true);
                    try {
                      for (const id of dbSelected) { await dbDelete('speech_expressions', id); }
                      setSpeakerMemos(p => p.filter(m => !dbSelected.has(m.id)));
                      setDbTabCounts(p => ({ ...p, '연사메모': Math.max(0, (p['연사메모'] || 0) - dbSelected.size) }));
                      setDbSelected(new Set());
                    } catch (e) { alert('오류: ' + e.message); }
                    finally { setDbDeleting(false); }
                  }} disabled={dbDeleting} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #c44', background: dbDeleting ? 'var(--bd)' : 'var(--bg-card)', color: '#c44', fontSize: '0.714rem', cursor: dbDeleting ? 'default' : 'pointer', fontWeight: 600 }}>{dbDeleting ? '삭제 중...' : '선택 삭제'}</button>
                </>
              )}
            </div>
          )}
          {/* 연사메모 그룹 뷰 — 연사별 */}
          {memoViewMode === '그룹' && !spMemoLoading && (() => {
            const groups = {};
            speakerMemos.filter(m => {
              if (!memoSearchQ.trim()) return true;
              const q = memoSearchQ.trim().toLowerCase();
              return (m.metadata?.speaker || '').toLowerCase().includes(q) || (m.metadata?.outline_num || '').toLowerCase().includes(q) || (m.metadata?.outline_title || '').toLowerCase().includes(q);
            }).forEach(m => {
              const key = m.metadata?.speaker || '(연사 없음)';
              if (!groups[key]) groups[key] = [];
              groups[key].push(m);
            });
            const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
            return sorted.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>연사메모가 없습니다.</div> : sorted.map(([speaker, items]) => {
              const gKey = 'sm_' + speaker;
              const isOpen = expandedDbEntry[gKey];
              const cats = {};
              items.forEach(m => { const c = m.metadata?.memo_category || '원본'; cats[c] = (cats[c] || 0) + 1; });
              return (
                <div key={gKey} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                  <div onClick={() => setExpandedDbEntry(p => ({ ...p, [gKey]: !p[gKey] }))} style={{
                    padding: '8px 10px', background: 'var(--bg-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <input type="checkbox" checked={items.every(m => dbSelected.has(m.id))} onChange={e => { e.stopPropagation(); setDbSelected(p => { const n = new Set(p); items.forEach(m => e.target.checked ? n.add(m.id) : n.delete(m.id)); return n; }); }} onClick={e => e.stopPropagation()} style={{ accentColor: '#C7842D', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontWeight: 700, color: '#C7842D', fontSize: '0.786rem' }}>{speaker}</span>
                    <div style={{ flex: 1, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {Object.entries(cats).map(([c, n]) => (
                        <span key={c} style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: '#7F77DD15', color: '#7F77DD', fontWeight: 600 }}>{c} {n}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{items.length}건</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '4px 10px 6px', maxHeight: 300, overflowY: 'auto' }} className="chat-input">
                      {items.map((m, mi) => {
                        const meta = m.metadata || {};
                        const rawText = (m.text || m.document || '').trim();
                        const body = (meta.memo_category && meta.memo_category !== '원본') ? getBody(rawText) : rawText;
                        return (
                          <div key={m.id} style={{ fontSize: '0.786rem', padding: '4px 0', borderBottom: mi < items.length - 1 ? '1px solid var(--bd-light)' : 'none' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                              <span style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: '#7F77DD15', color: '#7F77DD', fontWeight: 600, flexShrink: 0 }}>{meta.memo_category || '원본'}</span>
                              {meta.outline_num && <span style={{ color: '#1D9E75', fontWeight: 600, flexShrink: 0 }}>{meta.outline_num}</span>}
                              <span style={{ color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{body.split('\n')[0] || '(내용 없음)'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* 연사메모 목록 뷰 */}
          {spMemoLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 16 }}>로딩...</div>}
          {memoViewMode === '목록' && !spMemoLoading && speakerMemos.filter(m => {
            if (memoCatFilter !== '전체') {
              if (memoCatFilter === '원본') { if (m.metadata?.memo_category && m.metadata?.memo_category !== '원본' && m.metadata?.reprocessed !== 'true') return false; if (!m.metadata?.reprocessed && m.metadata?.memo_category) return false; }
              else if (m.metadata?.memo_category !== memoCatFilter) return false;
            }
            if (!memoSearchQ.trim()) return true;
            const q = memoSearchQ.trim().toLowerCase();
            return (m.metadata?.speaker || '').toLowerCase().includes(q) || (m.metadata?.outline_num || '').toLowerCase().includes(q) || (m.metadata?.outline_title || '').toLowerCase().includes(q);
          }).map((m, i) => {
            const meta = m.metadata || {};
            const isExpanded = expandedSpMemo[i];
            const isEditing = editingSpMemo[i] !== undefined;
            const rawText = (m.text || m.document || '').trim();
            const body = (meta.memo_category && meta.memo_category !== '원본') ? getBody(rawText) : rawText;
            return (
              <div key={m.id || i} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ padding: '6px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={dbSelected.has(m.id)} onChange={e => setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} style={{ accentColor: '#7F77DD', cursor: 'pointer' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#7F77DD', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.786rem', fontWeight: 600, color: '#7F77DD' }}>{meta.memo_category || '원본'}</span>
                  {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                  {meta.outline_num && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{meta.outline_num}</span>}
                  <div style={{ flex: 1 }} />
                  {!isEditing && <>
                    <button onClick={() => setEditingSpMemo(p => ({ ...p, [i]: body }))} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #7F77DD', background: 'var(--bg-card)', color: '#7F77DD', fontSize: '0.643rem', cursor: 'pointer' }}>편집</button>
                    <button onClick={async () => {
                      if (!confirm('삭제하시겠습니까?')) return;
                      try { await dbDelete(m.collection || 'speech_expressions', m.id); setSpeakerMemos(p => p.filter((_, j) => j !== i)); } catch (e) { alert('오류: ' + e.message); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                  </>}
                </div>
                {!isEditing && (
                  <div onClick={() => setExpandedSpMemo(p => ({ ...p, [i]: !p[i] }))} style={{ padding: '6px 10px', fontSize: '0.786rem', lineHeight: 1.7, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: isExpanded ? 'none' : 50, overflow: isExpanded ? 'visible' : 'hidden', cursor: 'pointer' }}>
                    {body || '(내용 없음)'}
                  </div>
                )}
                {isEditing && (
                  <div style={{ padding: '6px 10px' }}>
                    <KoreanTextarea value={editingSpMemo[i] || ''} onChange={v => setEditingSpMemo(p => ({ ...p, [i]: v }))} rows={4}
                      style={{ display: 'block', width: '100%', padding: '6px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 4 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={async () => {
                        try { await dbUpdate(m.collection || 'speech_expressions', m.id, editingSpMemo[i]); setSpeakerMemos(p => p.map((x, j) => j === i ? { ...x, document: editingSpMemo[i] } : x)); setEditingSpMemo(p => { const n = { ...p }; delete n[i]; return n; }); } catch (e) { alert('오류: ' + e.message); }
                      }} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#7F77DD', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>저장</button>
                      <button onClick={() => setEditingSpMemo(p => { const n = { ...p }; delete n[i]; return n; })} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {!spMemoLoading && speakerMemos.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>연사메모가 없습니다.</div>}
        </div>
        </>)}

        </div>
      </>)}

      {mode === 'memo' && (<>
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: 12, marginBottom: 12 }}>
          {/* Memo Calendar header */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 4 }}>
            <button onClick={() => setMemoCalMonth(p => new Date(p.getFullYear() - 1, p.getMonth(), 1))} style={{ padding: '2px 6px', border: 'none', borderRadius: 8, background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', cursor: 'pointer', fontSize: '0.786rem', transition: 'all 0.15s' }}>◀◀</button>
            <button onClick={() => setMemoCalMonth(p => new Date(p.getFullYear(), p.getMonth() - 1, 1))} style={{ padding: '2px 8px', border: 'none', borderRadius: 8, background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-faint)', cursor: 'pointer', fontSize: '0.857rem', transition: 'all 0.15s' }}>◀</button>
            <div onClick={() => setMemoCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} style={{ flex: 1, textAlign: 'center', fontSize: '0.929rem', fontWeight: 700, cursor: 'pointer' }}>
              {memoCalMonth.getFullYear()}년 {memoCalMonth.getMonth() + 1}월
            </div>
            <button onClick={() => setMemoCalMonth(p => new Date(p.getFullYear(), p.getMonth() + 1, 1))} style={{ padding: '2px 8px', border: 'none', borderRadius: 8, background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-faint)', cursor: 'pointer', fontSize: '0.857rem', transition: 'all 0.15s' }}>▶</button>
            <button onClick={() => setMemoCalMonth(p => new Date(p.getFullYear() + 1, p.getMonth(), 1))} style={{ padding: '2px 6px', border: 'none', borderRadius: 8, background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', cursor: 'pointer', fontSize: '0.786rem', transition: 'all 0.15s' }}>▶▶</button>
          </div>
          {/* Memo Calendar grid */}
          {(() => {
            const y = memoCalMonth.getFullYear(), m = memoCalMonth.getMonth();
            const firstDay = new Date(y, m, 1).getDay();
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
            const dayCounts = {};
            memoEntries.forEach(r => {
              const ts = parseInt((r.id || '').split('_').pop()) || 0; const tsValid = ts > 1600000000;
              if (!ts) return;
              const d = new Date(ts);
              const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
              dayCounts[key] = (dayCounts[key] || 0) + 1;
            });
            const days = ['일', '월', '화', '수', '목', '금', '토'];
            const cells = [];
            for (let i = 0; i < firstDay; i++) cells.push(null);
            for (let d = 1; d <= daysInMonth; d++) cells.push(d);
            return (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, marginBottom: 4 }}>
                  {days.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.786rem', color: 'var(--c-dim)', padding: 2 }}>{d}</div>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1 }}>
                  {cells.map((d, i) => {
                    if (!d) return <div key={'e'+i} />;
                    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                    const count = dayCounts[dateStr] || 0;
                    const isToday = dateStr === todayStr;
                    const isSelected = memoDateFilter === dateStr;
                    return (
                      <div key={i} onClick={() => setMemoDateFilter(isSelected ? 'all' : dateStr)} style={{
                        textAlign: 'center', padding: '6px 0', borderRadius: 8, cursor: 'pointer',
                        background: isSelected ? '#D85A30' : isToday ? 'var(--tint-blue-soft)' : 'transparent',
                        color: isSelected ? 'var(--tab-active-c)' : isToday ? '#378ADD' : count ? 'var(--c-text)' : 'var(--bd-medium)',
                        fontWeight: count ? 700 : 400, fontSize: '0.857rem', position: 'relative',
                      }}>
                        {d}
                        {count > 0 && <div style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', width: 4, height: 4, borderRadius: '50%', background: isSelected ? 'var(--tab-active-c)' : '#D85A30' }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}
          {/* Memo Footer */}
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, gap: 6 }}>
            <button onClick={() => setMemoDateFilter('all')} style={{
              padding: '4px 10px', borderRadius: 8, border: 'none',
              background: memoDateFilter === 'all' ? '#D85A3015' : 'var(--bg-subtle, #EFEFF4)',
              color: memoDateFilter === 'all' ? '#D85A30' : 'var(--c-muted)',
              fontSize: '0.786rem', cursor: 'pointer', fontWeight: memoDateFilter === 'all' ? 700 : 500, transition: 'all 0.15s',
            }}>전체</button>
            <button onClick={() => setMemoSortOrder(p => p === 'desc' ? 'asc' : 'desc')} style={{
              padding: '4px 10px', borderRadius: 8, border: 'none',
              background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer', transition: 'all 0.15s',
            }}>{memoSortOrder === 'desc' ? '최신순 ▼' : '오래된순 ▲'}</button>
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>
              {memoLoading ? '로딩...' : (() => {
                const filtered = memoEntries.filter(r => {
                  if (memoDateFilter === 'all') return true;
                  const ts = parseInt((r.id || '').split('_').pop()) || 0; const tsValid = ts > 1600000000;
                  if (!ts) return false;
                  const d = new Date(ts);
                  const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                  return key === memoDateFilter;
                });
                return filtered.length !== memoEntries.length ? `${filtered.length}/${memoEntries.length}건` : `${memoEntries.length}건`;
              })()}
            </span>
            <button onClick={() => {
              setMemoLoading(true);
              listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}).finally(() => setMemoLoading(false));
            }} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', transition: 'all 0.15s' }}>새로고침</button>
          </div>
        </div>

        {memoEntries.filter(r => {
          if (memoDateFilter === 'all') return true;
          const ts = parseInt((r.id || '').split('_').pop()) || 0; const tsValid = ts > 1600000000;
          if (!ts) return false;
          const d = new Date(ts);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          return key === memoDateFilter;
        }).length === 0 && !memoLoading && (
          <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.857rem', padding: 20 }}>
            {memoEntries.length === 0 ? '저장된 메모가 없습니다.' : '선택한 날짜에 메모가 없습니다.'}
          </div>
        )}
        {memoEntries.filter(r => {
          if (memoDateFilter === 'all') return true;
          const ts = parseInt((r.id || '').split('_').pop()) || 0; const tsValid = ts > 1600000000;
          if (!ts) return false;
          const d = new Date(ts);
          const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          return key === memoDateFilter;
        }).sort((a, b) => {
          const ta = parseInt((a.id || '').split('_').pop()) || 0;
          const tb = parseInt((b.id || '').split('_').pop()) || 0;
          return memoSortOrder === 'desc' ? tb - ta : ta - tb;
        }).map((r, i) => {
          const meta = r.metadata || {};
          const col = r.collection || 'speech_points';
          const parsed = parseDocument(r.text || '');
          const body = getBody(r.text || '');
          return (
            <div key={i} style={{
              borderRadius: 8, overflow: 'hidden', marginBottom: 8,
              border: '1px solid var(--bd-soft)', background: 'var(--bg-card)',
            }}>
              {/* 헤더 */}
              <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D85A30', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.786rem', fontWeight: 600, color: '#D85A30' }}>메모</span>
                  {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                  {meta.date && meta.date !== '0000' && <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>{meta.date}</span>}
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  {(() => { const ts = parseInt((r.id || '').split('_').pop()) || 0; const tsValid = ts > 1600000000; if (!ts || ts < 1600000000) return null; const d = new Date(ts); return <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{String(d.getMonth()+1).padStart(2,'0')}/{String(d.getDate()).padStart(2,'0')} {String(d.getHours()).padStart(2,'0')}:{String(d.getMinutes()).padStart(2,'0')}</span>; })()}
                  <div style={{ flex: 1 }} />
                  {memoEditIdx !== i && <>
                    <button onClick={() => {
                      const body = getBody(r.text || '');
                      try { localStorage.setItem('jw-si-transfer', JSON.stringify({
                        speaker: meta.speaker || '', date: meta.date || '',
                        outline_num: meta.outline_num || '', outline_title: meta.outline_title || meta.topic || '',
                        outline_type: meta.outline_type || '', content: body,
                        memoId: r.id, memoCol: col,
                      })); localStorage.setItem('jw-add-tab', 'speech_input'); window.dispatchEvent(new Event('si-transfer')); } catch {}
                      if (onGoAdd) onGoAdd();
                      else { setAddTab('speech_input'); setMode('add'); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #1D9E75', background: 'var(--bg-card)', color: '#1D9E75', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>이동</button>
                    <button onClick={() => { setMemoEditIdx(i); setMemoEditVal(r.text || ''); setMemoStat(''); }} style={{
                      padding: '2px 6px', borderRadius: 4, border: '1px solid var(--tint-red-bd)',
                      background: 'var(--bg-card)', color: '#c44', fontSize: '0.643rem', cursor: 'pointer', minWidth: 32, textAlign: 'center',
                    }}>DB</button>
                  </>}
                </div>
              </div>
              {/* 메타 그리드 */}
              {(() => {
                const metaRows = [
                  meta.pub_code && { label: '출판물', value: meta.pub_code, color: '#7F77DD' },
                  meta.pub_title && { label: '출판물명', value: meta.pub_title },
                  meta.outline_title && { label: '주제', value: meta.outline_title },
                  (parsed?.subtopic || meta.sub_topic || meta.subtopic) && { label: '소주제', value: parsed?.subtopic || meta.sub_topic || meta.subtopic },
                  (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: '#D85A30' },
                  cleanMd(parsed?.scripture || meta.scriptures || '') && { label: '성구', value: cleanMd(parsed?.scripture || meta.scriptures || ''), color: '#2D8FC7' },
                  (parsed?.keywords || meta.keywords) && { label: '키워드', value: parsed?.keywords || meta.keywords },
                ].filter(Boolean);
                return metaRows.length > 0 ? (
                  <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline', fontSize: '0.857rem', lineHeight: 1.8, color: 'var(--c-sub)' }}>
                    {metaRows.map((row, mi) => (
                      <Fragment key={mi}>
                        <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                        <span style={{ fontSize: '0.786rem', color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                      </Fragment>
                    ))}
                  </div>
                ) : null;
              })()}
              {body && memoEditIdx !== i && (
                <div style={{ padding: '6px 10px 10px', borderTop: '1px solid var(--bd-light)' }}>
                  <div style={{ fontSize: '0.929rem', lineHeight: 1.9, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: expandedMyDb[i] ? 400 : 80, overflow: expandedMyDb[i] ? 'auto' : 'hidden' }}>
                    {body.length > 150 && !expandedMyDb[i] ? body.slice(0, 150) + '...' : body}
                  </div>
                  {body.length > 150 && <button onClick={() => setExpandedMyDb(p => ({ ...p, [i]: !p[i] }))} style={{ marginTop: 4, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>{expandedMyDb[i] ? '접기' : '전체 보기'}</button>}
                </div>
              )}
              {memoEditIdx === i && (
                <div style={{ padding: '8px 10px', borderTop: '1px solid var(--tint-red-bd)' }}>
                  <div style={{ fontSize: '0.786rem', fontWeight: 600, color: '#c44', marginBottom: 4 }}>DB 직접 편집</div>
                  <KoreanTextarea value={memoEditVal} onChange={setMemoEditVal} rows={8} style={{ display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                  <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                    <button onClick={async () => { setMemoStat('저장 중...'); try { await dbUpdate(col, r.id, memoEditVal); setMemoStat('저장 완료'); setMemoEntries(prev => prev.map(rr => rr.id === r.id ? { ...rr, text: memoEditVal } : rr)); } catch (e) { setMemoStat('오류: ' + e.message); } }} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#1D9E75', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>저장</button>
                    <button onClick={async () => { if (!confirm('정말 삭제하시겠습니까?')) return; setMemoStat('삭제 중...'); try { await dbDelete(col, r.id); setMemoEntries(prev => prev.filter(rr => rr.id !== r.id)); setMemoEditIdx(-1); } catch (e) { setMemoStat('오류: ' + e.message); } }} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: '0.786rem', cursor: 'pointer' }}>삭제</button>
                    <button onClick={() => setMemoEditIdx(-1)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                    {memoStat && <span style={{ fontSize: '0.786rem', color: memoStat.includes('오류') ? '#c44' : '#1D9E75', marginLeft: 4 }}>{memoStat}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </>)}

      {/* ── AI 관리 ── */}
      {mode === 'ai' && (
        <div>
          {/* 모델 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('model')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.model ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>AI 모델 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.model ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.model && <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: '0.929rem', fontWeight: 700 }}>AI 모델 관리</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {aiModelsSaveMsg && <span style={{ fontSize: '0.786rem', color: aiModelsSaveMsg.includes('실패') ? '#c44' : '#1D9E75', fontWeight: 600 }}>{aiModelsSaveMsg}</span>}
                {aiModelsDirty && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D85A30' }} />}
                <button onClick={resetAiModels}
                  style={{ padding: '2px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>초기화</button>
                <button onClick={() => setAiEditMode(p => !p)}
                  style={{ padding: '2px 8px', borderRadius: 8, border: '1px solid ' + (aiEditMode ? '#7F77DD' : 'var(--bd)'), background: aiEditMode ? 'var(--tint-purple)' : 'transparent', color: aiEditMode ? '#7F77DD' : 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: aiEditMode ? 600 : 400 }}>{aiEditMode ? '완료' : '편집'}</button>
                <button onClick={saveAiModelsToServer}
                  style={{ padding: '2px 8px', borderRadius: 8, border: '1px solid ' + (aiModelsDirty ? '#1D9E75' : 'var(--bd)'), background: aiModelsDirty ? '#1D9E75' : 'transparent', color: aiModelsDirty ? '#fff' : 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: aiModelsDirty ? 600 : 400 }}>저장</button>
              </div>
            </div>

            <div style={{ padding: '6px 10px', borderRadius: 8, background: selectingFor ? 'var(--tint-purple)' : 'var(--bg-subtle)', marginBottom: 10, fontSize: '0.786rem', display: 'flex', flexDirection: 'column', gap: 5, border: selectingFor ? '1.5px solid #7F77DD' : '1px solid transparent' }}>
              {selectingFor && (
                <div style={{ fontSize: '0.786rem', fontWeight: 700, color: '#7F77DD', textAlign: 'center' }}>
                  {selectingFor === 'default' ? '기본 모델을 선택하세요' : '대화 모델을 선택하세요'} — 아래 모델을 탭
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--c-muted)', fontSize: '0.786rem', width: 52, flexShrink: 0 }}>기본 모델</span>
                {savedDefault ? (
                  <span style={{ flex: 1, color: savedChatDefault?.platform === savedDefault.platform && savedChatDefault?.model === savedDefault.model ? '#8B6914' : '#D85A30', fontWeight: 700, fontSize: '0.786rem' }}>★ {savedDefault.platform} / {savedDefault.model}</span>
                ) : (
                  <span style={{ flex: 1, color: 'var(--c-dim)', fontSize: '0.786rem' }}>설정 안됨</span>
                )}
                <button onClick={() => setSelectingFor(selectingFor === 'default' ? null : 'default')}
                  style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                    border: '1px solid ' + (selectingFor === 'default' ? '#7F77DD' : '#D85A30'),
                    background: selectingFor === 'default' ? '#7F77DD' : 'transparent',
                    color: selectingFor === 'default' ? '#fff' : '#D85A30', fontWeight: 600 }}>
                  {selectingFor === 'default' ? '취소' : '선택'}
                </button>
                {savedDefault && (
                  <button onClick={() => { clearAiDefault(); setSelectingFor(null); }}
                    style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>해제</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--c-muted)', fontSize: '0.786rem', width: 52, flexShrink: 0 }}>대화 모델</span>
                {savedChatDefault ? (
                  <span style={{ flex: 1, color: savedDefault?.platform === savedChatDefault.platform && savedDefault?.model === savedChatDefault.model ? '#8B6914' : '#7F77DD', fontWeight: 700, fontSize: '0.786rem' }}>★ {savedChatDefault.platform} / {savedChatDefault.model}</span>
                ) : (
                  <span style={{ flex: 1, color: 'var(--c-dim)', fontSize: '0.786rem' }}>설정 안됨</span>
                )}
                <button onClick={() => setSelectingFor(selectingFor === 'chat' ? null : 'chat')}
                  style={{ padding: '2px 8px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                    border: '1px solid ' + (selectingFor === 'chat' ? '#7F77DD' : '#7F77DD'),
                    background: selectingFor === 'chat' ? '#7F77DD' : 'transparent',
                    color: selectingFor === 'chat' ? '#fff' : '#7F77DD', fontWeight: 600 }}>
                  {selectingFor === 'chat' ? '취소' : '선택'}
                </button>
                {savedChatDefault && (
                  <button onClick={() => { clearChatAiDefault(); setSelectingFor(null); }}
                    style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>해제</button>
                )}
              </div>
            </div>

            {Object.entries(aiModels).map(([platform, models], platformIdx) => {
              const platformKeys = Object.keys(aiModels);
              const isLocal = models.some(m => !m.value.startsWith('gemini-') && !m.value.startsWith('claude-') && !m.value.startsWith('gpt-'));
              const adding = getNewInput(platform).value || getNewInput(platform).label;
              return (
              <div key={platform} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  {aiEditMode && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginRight: 2 }}>
                      <button onClick={() => movePlatform(platform, -1)} disabled={platformIdx === 0}
                        style={{ padding: 0, border: 'none', background: 'none', color: platformIdx === 0 ? 'var(--bd)' : 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', lineHeight: 1 }}>▲</button>
                      <button onClick={() => movePlatform(platform, 1)} disabled={platformIdx === platformKeys.length - 1}
                        style={{ padding: 0, border: 'none', background: 'none', color: platformIdx === platformKeys.length - 1 ? 'var(--bd)' : 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', lineHeight: 1 }}>▼</button>
                    </div>
                  )}
                  <span style={{ fontWeight: 700, fontSize: '0.786rem', color: 'var(--c-text-dark)' }}>{platform}</span>
                  {isLocal && (
                    <button onClick={async () => { try { setInstalledModels(await ollamaModels()); } catch {} }}
                      style={{ padding: 0, border: 'none', background: 'none', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>🔄</button>
                  )}
                  {aiEditMode && (
                    <button onClick={() => removeAiPlatform(platform)}
                      style={{ padding: '0 3px', border: 'none', background: 'none', color: '#e55', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 800 }}>×</button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                  {models.map((m, idx) => {
                    const mIsLocal = !m.value.startsWith('gemini-') && !m.value.startsWith('claude-') && !m.value.startsWith('gpt-');
                    const isInstalled = installedModels?.models?.some(im => im.name === m.value);
                    const isPulling = pullingModel === m.value;
                    const isDefault = savedDefault?.platform === platform && savedDefault?.model === m.value;
                    const isChatDef = savedChatDefault?.platform === platform && savedChatDefault?.model === m.value;
                    const isBoth = isDefault && isChatDef;
                    const borderColor = isBoth ? '#8B6914' : isDefault ? '#D85A30' : isChatDef ? '#7F77DD' : selectingFor ? '#7F77DD44' : 'var(--bd)';
                    const textColor = isBoth ? '#8B6914' : isDefault ? '#D85A30' : isChatDef ? '#7F77DD' : 'var(--c-sub)';
                    const handleCardClick = () => {
                      if (aiEditMode) return;
                      if (selectingFor === 'default') { saveAiDefault(platform, m.value); setSelectingFor(null); }
                      else if (selectingFor === 'chat') { saveChatAiDefault(platform, m.value); setSelectingFor(null); }
                    };
                    return (
                    <div key={m.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                      {aiEditMode && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginRight: 1 }}>
                          <button onClick={() => moveModel(platform, idx, -1)} disabled={idx === 0}
                            style={{ padding: 0, border: 'none', background: 'none', color: idx === 0 ? 'var(--bd)' : 'var(--c-dim)', fontSize: '0.5rem', cursor: 'pointer', lineHeight: 1 }}>▲</button>
                          <button onClick={() => moveModel(platform, idx, 1)} disabled={idx === models.length - 1}
                            style={{ padding: 0, border: 'none', background: 'none', color: idx === models.length - 1 ? 'var(--bd)' : 'var(--c-dim)', fontSize: '0.5rem', cursor: 'pointer', lineHeight: 1 }}>▼</button>
                        </div>
                      )}
                      <div onClick={handleCardClick} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 14, fontSize: '0.786rem',
                        border: `1.5px solid ${borderColor}`,
                        background: (isDefault || isChatDef) ? borderColor + '10' : selectingFor ? 'var(--bg-card)' : 'var(--bg-subtle)',
                        color: textColor, cursor: (aiEditMode || !selectingFor) ? 'default' : 'pointer',
                      }}>
                        <span style={{ fontWeight: (isDefault || isChatDef) ? 700 : 400 }}>{m.label || m.value}</span>
                        {mIsLocal && installedModels && (
                          isInstalled ? <span style={{ color: '#1D9E75', fontSize: '0.571rem' }}>●</span>
                          : isPulling ? <span style={{ color: '#D85A30' }}>{pullProgress}%</span>
                          : <button onClick={async (e) => {
                              e.stopPropagation();
                              setPullingModel(m.value); setPullProgress(0);
                              try { await ollamaPull(m.value, (ev) => { if (ev.progress) setPullProgress(ev.progress); if (ev.status === 'done' || ev.status === 'error') { setPullingModel(''); ollamaModels().then(r => setInstalledModels(r)).catch(() => {}); } }); } catch { setPullingModel(''); }
                            }}
                            style={{ padding: 0, border: 'none', background: 'none', color: '#D85A30', fontSize: '0.643rem', cursor: 'pointer', textDecoration: 'underline' }}>pull</button>
                        )}
                        {isDefault && <span style={{ fontSize: '0.643rem', color: '#D85A30' }}>★</span>}
                        {isChatDef && <span style={{ fontSize: '0.571rem', color: '#7F77DD' }}>💬</span>}
                        {aiEditMode && (
                          <button onClick={(e) => { e.stopPropagation(); removeAiModel(platform, idx); }}
                            style={{ padding: 0, border: 'none', background: 'none', color: '#e55', fontSize: '0.786rem', cursor: 'pointer', lineHeight: 1, fontWeight: 800 }}>×</button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                  {aiEditMode && (
                    <button onClick={() => setNewInput(platform, 'value', getNewInput(platform).value || ' ')}
                      style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', borderRadius: 14, fontSize: '0.786rem',
                        border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer' }}>+</button>
                  )}
                </div>
                {aiEditMode && (adding) && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                    <input value={getNewInput(platform).value.trim()} onChange={e => setNewInput(platform, 'value', e.target.value)}
                      placeholder="모델 ID" onKeyDown={e => e.key === 'Enter' && addAiModel(platform)} autoFocus
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                    <input value={getNewInput(platform).label} onChange={e => setNewInput(platform, 'label', e.target.value)}
                      placeholder="표시명" onKeyDown={e => e.key === 'Enter' && addAiModel(platform)}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                    <button onClick={() => addAiModel(platform)}
                      style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid #1D9E75', background: '#1D9E75', color: '#fff', fontSize: '0.786rem', cursor: 'pointer' }}>추가</button>
                    <button onClick={() => setNewModelInputs(prev => ({ ...prev, [platform]: { value: '', label: '' } }))}
                      style={{ padding: '3px 6px', borderRadius: 8, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                  </div>
                )}
              </div>
              );
            })}

            {aiEditMode && (
              <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                <input value={newPlatformName} onChange={e => setNewPlatformName(e.target.value)}
                  placeholder="새 플랫폼" onKeyDown={e => e.key === 'Enter' && addAiPlatform()}
                  style={{ width: 100, padding: '3px 8px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                <button onClick={addAiPlatform}
                  style={{ padding: '3px 8px', borderRadius: 8, border: '1px dashed var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.786rem', cursor: 'pointer' }}>+ 플랫폼</button>
              </div>
            )}
          </div>}</div>

          {/* LLM 필터 모델 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('llm')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.llm ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>🔍 로컬 LLM 설정</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.llm ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.llm && <div style={{ padding: 14 }}>
            {filterModel ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 10, fontSize: '0.786rem', color: 'var(--c-sub)' }}>
                  필터 모델: <b style={{ color: '#7F77DD' }}>{filterModel.current}</b>
                  <span style={{ marginLeft: 8, fontSize: '0.786rem', color: 'var(--c-muted)' }}>연설 검색 시 관련성 판단</span>
                  {ollamaCtx && <span style={{ marginLeft: 8 }}>| 필터: <b style={{ color: '#1D9E75' }}>{(ollamaCtx.filter_ctx / 1024).toFixed(0)}K</b> · 생성: <b style={{ color: '#D85A30' }}>{(ollamaCtx.gen_ctx / 1024).toFixed(0)}K</b> · 대화: <b style={{ color: '#7F77DD' }}>{(ollamaCtx.chat_ctx / 1024).toFixed(0)}K</b></span>}
                </div>

                {/* 필터 모델 선택 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>필터 모델</div>
                {filterModel.models.filter(m => !m.name.includes('embed') && !m.name.includes('bge')).map(m => {
                  const isCurrent = filterModel.current === m.name;
                  const isDeleting = deletingModel === m.name;
                  return (
                  <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <button onClick={async () => {
                      setFilterModelSaving(true);
                      try {
                        const res = await setFilterModel(m.name);
                        setFilterModelState(prev => ({ ...prev, current: res.filter_model }));
                      } catch {} finally { setFilterModelSaving(false); }
                    }} disabled={filterModelSaving}
                      style={{
                        flex: 1, padding: '6px 12px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                        border: `1.5px solid ${isCurrent ? '#7F77DD' : 'var(--bd)'}`,
                        background: isCurrent ? '#7F77DD18' : 'transparent',
                        color: isCurrent ? '#7F77DD' : 'var(--c-sub)',
                        fontWeight: isCurrent ? 700 : 400,
                      }}>
                      {isCurrent ? '✓ ' : ''}{m.name}
                      {m.size > 0 && <span style={{ marginLeft: 6, fontSize: '0.643rem', color: 'var(--c-muted)' }}>{(m.size / 1e9).toFixed(1)}GB</span>}
                    </button>
                    {!isCurrent && (
                      <button onClick={async () => {
                        if (!confirm(`'${m.name}' 모델을 삭제하시겠습니까?`)) return;
                        setDeletingModel(m.name);
                        try {
                          await ollamaDelete(m.name);
                          setFilterModelState(prev => ({ ...prev, models: prev.models.filter(mm => mm.name !== m.name) }));
                        } catch (e) { alert(e.message); }
                        finally { setDeletingModel(''); }
                      }} disabled={isDeleting}
                        style={{ padding: '3px 8px', borderRadius: 8, border: '1px solid #e55', background: 'transparent', color: '#e55', fontSize: '0.786rem', cursor: 'pointer', flexShrink: 0 }}>
                        {isDeleting ? '...' : '삭제'}
                      </button>
                    )}
                  </div>
                  );
                })}
                {filterModel.models.filter(m => !m.name.includes('embed') && !m.name.includes('bge')).length === 0 && (
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)' }}>Ollama에 설치된 모델이 없습니다</span>
                )}

                {/* 컨텍스트 크기 — 필터 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 12, marginBottom: 4 }}>필터 컨텍스트 <span style={{ color: '#1D9E75' }}>(LLM 필터용 · 짧은 프롬프트)</span></div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[2048, 4096, 8192, 16384, 32768, 65536].map(v => (
                    <button key={v} onClick={async () => {
                      try {
                        const res = await setOllamaCtx(v, 'filter');
                        setOllamaCtxState(res);
                      } catch (e) { alert(e.message); }
                    }}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${ollamaCtx?.filter_ctx === v ? '#1D9E75' : 'var(--bd)'}`,
                        background: ollamaCtx?.filter_ctx === v ? '#1D9E7518' : 'transparent',
                        color: ollamaCtx?.filter_ctx === v ? '#1D9E75' : 'var(--c-sub)',
                        fontWeight: ollamaCtx?.filter_ctx === v ? 700 : 400,
                      }}>
                      {ollamaCtx?.filter_ctx === v ? '✓ ' : ''}{(v / 1024)}K
                    </button>
                  ))}
                </div>

                {/* 컨텍스트 크기 — 생성 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 8, marginBottom: 4 }}>생성 컨텍스트 <span style={{ color: '#D85A30' }}>(연설문/스크립트 생성용)</span></div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[4096, 8192, 16384, 32768, 65536, 131072, 262144].map(v => (
                    <button key={v} onClick={async () => {
                      try {
                        const res = await setOllamaCtx(v, 'gen');
                        setOllamaCtxState(res);
                      } catch (e) { alert(e.message); }
                    }}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${ollamaCtx?.gen_ctx === v ? '#D85A30' : 'var(--bd)'}`,
                        background: ollamaCtx?.gen_ctx === v ? '#D85A3018' : 'transparent',
                        color: ollamaCtx?.gen_ctx === v ? '#D85A30' : 'var(--c-sub)',
                        fontWeight: ollamaCtx?.gen_ctx === v ? 700 : 400,
                      }}>
                      {ollamaCtx?.gen_ctx === v ? '✓ ' : ''}{(v / 1024)}K
                    </button>
                  ))}
                </div>

                {/* 컨텍스트 크기 — 대화 */}
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 8, marginBottom: 4 }}>대화 컨텍스트 <span style={{ color: '#7F77DD' }}>(AI 대화 검색용)</span></div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {[4096, 8192, 16384, 32768, 65536, 131072, 262144].map(v => (
                    <button key={v} onClick={async () => {
                      try {
                        const res = await setOllamaCtx(v, 'chat');
                        setOllamaCtxState(res);
                      } catch (e) { alert(e.message); }
                    }}
                      style={{
                        padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                        border: `1.5px solid ${ollamaCtx?.chat_ctx === v ? '#7F77DD' : 'var(--bd)'}`,
                        background: ollamaCtx?.chat_ctx === v ? '#7F77DD18' : 'transparent',
                        color: ollamaCtx?.chat_ctx === v ? '#7F77DD' : 'var(--c-sub)',
                        fontWeight: ollamaCtx?.chat_ctx === v ? 700 : 400,
                      }}>
                      {ollamaCtx?.chat_ctx === v ? '✓ ' : ''}{(v / 1024)}K
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                  작을수록 빠르고 VRAM 절약 · 클수록 긴 프롬프트 처리 가능
                </div>

                {/* Thinking 설정 */}
                {ollamaThink && (
                  <>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginTop: 12, marginBottom: 6 }}>Thinking 모드 <span style={{ fontSize: '0.643rem' }}>(Qwen 3.5 등 thinking 모델용)</span></div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={async () => {
                        try {
                          const res = await setOllamaThink('filter', !ollamaThink.filter_no_think);
                          setOllamaThinkState(res);
                        } catch {}
                      }}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                          border: `1.5px solid ${ollamaThink.filter_no_think ? 'var(--bd)' : '#7F77DD'}`,
                          background: ollamaThink.filter_no_think ? 'transparent' : '#7F77DD18',
                          color: ollamaThink.filter_no_think ? 'var(--c-muted)' : '#7F77DD',
                          fontWeight: ollamaThink.filter_no_think ? 400 : 700 }}>
                        필터: {ollamaThink.filter_no_think ? '🧠 OFF' : '🧠 ON'}
                      </button>
                      <button onClick={async () => {
                        try {
                          const res = await setOllamaThink('gen', !ollamaThink.gen_no_think);
                          setOllamaThinkState(res);
                        } catch {}
                      }}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                          border: `1.5px solid ${ollamaThink.gen_no_think ? 'var(--bd)' : '#7F77DD'}`,
                          background: ollamaThink.gen_no_think ? 'transparent' : '#7F77DD18',
                          color: ollamaThink.gen_no_think ? 'var(--c-muted)' : '#7F77DD',
                          fontWeight: ollamaThink.gen_no_think ? 400 : 700 }}>
                        생성: {ollamaThink.gen_no_think ? '🧠 OFF' : '🧠 ON'}
                      </button>
                      <button onClick={async () => {
                        try {
                          const res = await setOllamaThink('chat', !ollamaThink.chat_no_think);
                          setOllamaThinkState(res);
                        } catch {}
                      }}
                        style={{ flex: 1, padding: '8px 0', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                          border: `1.5px solid ${ollamaThink.chat_no_think ? 'var(--bd)' : '#7F77DD'}`,
                          background: ollamaThink.chat_no_think ? 'transparent' : '#7F77DD18',
                          color: ollamaThink.chat_no_think ? 'var(--c-muted)' : '#7F77DD',
                          fontWeight: ollamaThink.chat_no_think ? 400 : 700 }}>
                        대화: {ollamaThink.chat_no_think ? '🧠 OFF' : '🧠 ON'}
                      </button>
                    </div>
                    <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                      OFF 권장 (3090) · ON은 M5 Ultra 등 대용량 메모리에서 사용
                    </div>
                  </>
                )}

                {/* ── AI 대화 설정 ── */}
                {(chatTurns !== null || chatSearchTopK !== null) && (
                  <>
                    <div style={{ borderTop: '1px solid var(--bd)', marginTop: 14, paddingTop: 10 }}>
                      <div style={{ fontSize: '0.786rem', fontWeight: 700, color: '#7F77DD', marginBottom: 8 }}>💬 AI 대화 설정</div>
                    </div>

                    {/* 대화 이력 턴 수 */}
                    {chatTurns !== null && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>대화 이력 턴 수 <span style={{ color: '#7F77DD' }}>(AI가 기억하는 이전 질문-답변 쌍 수)</span></div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[5, 10, 15, 20, 30, 50].map(v => (
                            <button key={v} onClick={async () => {
                              try {
                                const res = await setChatTurns(v);
                                setChatTurnsState(res.chat_max_turns);
                              } catch (e) { alert(e.message); }
                            }}
                              style={{
                                padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                                border: `1.5px solid ${chatTurns === v ? '#7F77DD' : 'var(--bd)'}`,
                                background: chatTurns === v ? '#7F77DD18' : 'transparent',
                                color: chatTurns === v ? '#7F77DD' : 'var(--c-sub)',
                                fontWeight: chatTurns === v ? 700 : 400,
                              }}>
                              {chatTurns === v ? '✓ ' : ''}{v}턴
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                          클수록 긴 대화 맥락 유지 · CTX가 충분해야 함
                        </div>
                      </div>
                    )}

                    {/* 검색 결과 수 */}
                    {chatSearchTopK !== null && (
                      <div>
                        <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 4 }}>검색 결과 수 <span style={{ color: '#D85A30' }}>(AI 대화 시 DB에서 가져오는 자료 수)</span></div>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {[5, 10, 15, 20, 30].map(v => (
                            <button key={v} onClick={async () => {
                              try {
                                const res = await setChatSearchTopK(v);
                                setChatSearchTopKState(res.chat_search_top_k);
                              } catch (e) { alert(e.message); }
                            }}
                              style={{
                                padding: '5px 10px', borderRadius: 8, fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                                border: `1.5px solid ${chatSearchTopK === v ? '#D85A30' : 'var(--bd)'}`,
                                background: chatSearchTopK === v ? '#D85A3018' : 'transparent',
                                color: chatSearchTopK === v ? '#D85A30' : 'var(--c-sub)',
                                fontWeight: chatSearchTopK === v ? 700 : 400,
                              }}>
                              {chatSearchTopK === v ? '✓ ' : ''}{v}건
                            </button>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginTop: 4 }}>
                          많을수록 넓은 범위 검색 · CTX 토큰 더 소비
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--c-dim)', fontSize: '0.786rem' }}>로딩 중...</div>
            )}
          </div>}</div>

          {/* 프롬프트 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('prompt')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.prompt ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>📝 프롬프트 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.prompt ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.prompt && <div style={{ padding: 14 }}>
            {promptData ? (
              <div style={{ marginTop: 10 }}>
                {[
                  { key: 'speech', label: '연설문 생성', color: '#1D9E75' },
                  { key: 'service_meeting', label: '봉사 모임', color: '#D85A30' },
                  { key: 'visit', label: '방문', color: '#7F77DD' },
                  { key: 'refine', label: '다듬기', color: 'var(--c-sub)' },
                  { key: 'style_both', label: '스타일 지시', color: '#7F77DD' },
                ].map(({ key, label, color }) => {
                  const isModified = promptEdits[key] !== promptData.defaults[key];
                  const hasCustomDefault = promptData.original_defaults && promptData.defaults[key] !== promptData.original_defaults[key];
                  return (
                  <div key={key} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: '0.786rem', fontWeight: 700, color }}>{label}</span>
                        {hasCustomDefault && <span style={{ fontSize: '0.571rem', color: '#D85A30' }}>★</span>}
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isModified && (
                          <button onClick={async () => {
                            try {
                              await resetPrompt(key);
                              setPromptEdits(prev => ({ ...prev, [key]: promptData.defaults[key] }));
                              setPromptData(prev => ({ ...prev, prompts: { ...prev.prompts, [key]: prev.defaults[key] } }));
                            } catch (e) { alert(e.message); }
                          }}
                            style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid var(--bd)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer' }}>초기화</button>
                        )}
                        <button onClick={async () => {
                          try {
                            await savePromptDefault(key, promptEdits[key]);
                            setPromptData(prev => ({ ...prev, defaults: { ...prev.defaults, [key]: promptEdits[key] } }));
                          } catch (e) { alert(e.message); }
                        }} disabled={promptEdits[key] === promptData.defaults[key]}
                          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (promptEdits[key] !== promptData.defaults[key] ? '#D85A30' : 'var(--bd)'), background: promptEdits[key] !== promptData.defaults[key] ? '#D85A30' : 'transparent', color: promptEdits[key] !== promptData.defaults[key] ? '#fff' : 'var(--c-dim)', fontSize: '0.643rem', cursor: 'pointer' }}>기본값 저장</button>
                        <button onClick={async () => {
                          setPromptSaving(key);
                          try {
                            await setPrompt(key, promptEdits[key]);
                            setPromptData(prev => ({ ...prev, prompts: { ...prev.prompts, [key]: promptEdits[key] } }));
                          } catch (e) { alert(e.message); }
                          finally { setPromptSaving(''); }
                        }} disabled={promptSaving === key || promptEdits[key] === promptData.prompts[key]}
                          style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #1D9E75', background: (promptEdits[key] !== promptData.prompts[key]) ? '#1D9E75' : 'transparent', color: (promptEdits[key] !== promptData.prompts[key]) ? '#fff' : 'var(--c-muted)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>
                          {promptSaving === key ? '...' : '저장'}
                        </button>
                      </div>
                    </div>
                    <textarea value={promptEdits[key] || ''} onChange={e => setPromptEdits(prev => ({ ...prev, [key]: e.target.value }))}
                      rows={6} style={{ display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', resize: 'vertical', outline: 'none' }} />
                    {isModified && <div style={{ fontSize: '0.643rem', color, marginTop: 2 }}>수정됨 (기본값과 다름)</div>}
                  </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--c-dim)', fontSize: '0.786rem' }}>로딩 중...</div>
            )}
          </div>}</div>

          {/* API 키 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('api')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.api ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>🔑 API 키 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.api ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.api && <div style={{ padding: 14 }}>
            <div style={{ fontSize: '0.929rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>설정</span>
              {!apiKeyStatus ? (
                <button onClick={async () => { try { setApiKeyStatus(await getApiKeys()); } catch {} }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>열기</button>
              ) : (
                <button onClick={() => { setApiKeyStatus(null); setApiKeyInputs({}); setAiError(''); }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>닫기</button>
              )}
            </div>
            {apiKeyStatus && (
              <div style={{ marginTop: 10 }}>
                {[
                  { key: 'GEMINI_API_KEY', label: 'Gemini', placeholder: 'AIza...' },
                  { key: 'ANTHROPIC_API_KEY', label: 'Claude', placeholder: 'sk-ant-...' },
                  { key: 'OPENAI_API_KEY', label: 'ChatGPT', placeholder: 'sk-...' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ width: 60, fontSize: '0.786rem', color: 'var(--c-sub)', flexShrink: 0 }}>{label}</span>
                    <input type="password" autoComplete="off" value={apiKeyInputs[key] ?? ''} onChange={e => setApiKeyInputs(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={apiKeyStatus[key] || placeholder}
                      style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: `1px solid ${apiKeyStatus[key] ? '#1D9E75' : 'var(--bd)'}`, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                    {apiKeyStatus[key] && <span style={{ fontSize: '0.786rem', color: '#1D9E75' }}>✓</span>}
                    {apiKeyStatus[key] && (
                      <button onClick={async () => {
                        if (!aiPassword) { setAiError('비밀번호를 입력하세요'); return; }
                        if (!confirm(`${label} API 키를 삭제하시겠습니까?`)) return;
                        try { await saveApiKeys(aiPassword, { [key]: '' }); setApiKeyStatus(await getApiKeys()); setApiKeyInputs(prev => ({ ...prev, [key]: '' })); }
                        catch (e) { setAiError(e.message); }
                      }}
                        style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid #e55', background: 'transparent', color: '#e55', fontSize: '0.643rem', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                    )}
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <input type="password" autoComplete="off" value={aiPassword} onChange={e => { setAiPassword(e.target.value); setAiError(''); }} placeholder="비밀번호"
                    style={{ width: 100, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit' }} />
                  <button onClick={async () => {
                    if (!aiPassword) { setAiError('비밀번호를 입력하세요'); return; }
                    const toSave = {}; Object.entries(apiKeyInputs).forEach(([k, v]) => { if (v) toSave[k] = v; });
                    if (!Object.keys(toSave).length) return;
                    setApiKeySaving(true); setAiError('');
                    try { await saveApiKeys(aiPassword, toSave); setApiKeyStatus(await getApiKeys()); setApiKeyInputs({}); setAiError('✓ 저장 완료'); setTimeout(() => setAiError(''), 2000); }
                    catch (e) { setAiError('저장 오류: ' + e.message); }
                    finally { setApiKeySaving(false); }
                  }} disabled={apiKeySaving}
                    style={{ padding: '4px 14px', borderRadius: 8, border: '1px solid #1D9E75', background: '#1D9E75', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>
                    {apiKeySaving ? '저장 중...' : '저장'}
                  </button>
                </div>
                {aiError && <div style={{ marginTop: 6, fontSize: '0.786rem', color: aiError.startsWith('✓') ? '#1D9E75' : '#c44' }}>{aiError}</div>}
              </div>
            )}
            {apiVersions && (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)' }}>
                <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 6, fontWeight: 600 }}>API 버전</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-sub)', width: 60, flexShrink: 0 }}>Claude</span>
                  <input value={apiVersions.anthropic || ''} onChange={e => setApiVersions(p => ({ ...p, anthropic: e.target.value }))}
                    placeholder="2023-06-01"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none' }} />
                  <button onClick={async () => {
                    try { await saveApiVersions({ anthropic: apiVersions.anthropic }); setAiError('✓ 버전 저장 완료'); setTimeout(() => setAiError(''), 2000); }
                    catch (e) { setAiError('버전 저장 오류: ' + e.message); }
                  }} style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: '#7F77DD', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>저장</button>
                </div>
              </div>
            )}
          </div>}</div>

          {/* 비밀번호 관리 */}
          <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 10, overflow: 'hidden' }}>
            <div onClick={() => toggleAiSection('pw')} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              background: 'var(--bg-subtle)', borderBottom: aiOpenSections.pw ? '1px solid var(--bd-light)' : 'none',
            }}>
              <span style={{ fontSize: '0.929rem', fontWeight: 700, flex: 1 }}>🔒 비밀번호 관리</span>
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: aiOpenSections.pw ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
            </div>
          {aiOpenSections.pw && <div style={{ padding: 14 }}>
            <div style={{ fontSize: '0.929rem', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>설정</span>
              {!pwStatus ? (
                <button onClick={async () => { try { setPwStatus(await getPasswordStatus()); } catch {} }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>열기</button>
              ) : (
                <button onClick={() => { setPwStatus(null); setPwCurrent(''); setPwNew(''); setPwConfirm(''); setPwMsg(''); }}
                  style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-sub)', fontSize: '0.786rem', cursor: 'pointer' }}>닫기</button>
              )}
            </div>
            {pwStatus && (
              <div style={{ marginTop: 10 }}>
                <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-subtle)', marginBottom: 10, fontSize: '0.786rem', color: 'var(--c-sub)' }}>
                  상태: <b style={{ color: pwStatus.has_password ? '#1D9E75' : '#c44' }}>{pwStatus.has_password ? '설정됨 ✓' : '미설정'}</b>
                </div>
                {pwStatus.has_password && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>현재 비밀번호</div>
                    <input type="password" autoComplete="off" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="현재 비밀번호"
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>새 비밀번호</div>
                  <input type="password" autoComplete="off" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="새 비밀번호 (4자 이상)"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>새 비밀번호 확인</div>
                  <input type="password" autoComplete="off" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="새 비밀번호 재입력"
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  {pwConfirm && pwNew !== pwConfirm && <div style={{ fontSize: '0.786rem', color: '#c44', marginTop: 2 }}>비밀번호가 일치하지 않습니다</div>}
                </div>
                <button onClick={async () => {
                  if (!pwNew || pwNew.length < 4) { setPwMsg('새 비밀번호는 4자 이상이어야 합니다'); return; }
                  if (pwNew !== pwConfirm) { setPwMsg('비밀번호가 일치하지 않습니다'); return; }
                  setPwChanging(true); setPwMsg('');
                  try {
                    await changePassword(pwCurrent, pwNew);
                    setPwMsg('✓ 비밀번호가 변경되었습니다');
                    setPwCurrent(''); setPwNew(''); setPwConfirm('');
                    setPwStatus(await getPasswordStatus());
                  } catch (e) { setPwMsg(e.message); }
                  finally { setPwChanging(false); }
                }} disabled={pwChanging || !pwNew || pwNew !== pwConfirm}
                  style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: 'none',
                    background: (!pwNew || pwNew !== pwConfirm) ? 'var(--bd)' : '#1D9E75', color: '#fff',
                    fontSize: '0.929rem', fontWeight: 700, cursor: (!pwNew || pwNew !== pwConfirm) ? 'not-allowed' : 'pointer',
                    opacity: (!pwNew || pwNew !== pwConfirm) ? 0.5 : 1 }}>
                  {pwChanging ? '변경 중...' : pwStatus.has_password ? '비밀번호 변경' : '비밀번호 설정'}
                </button>
                {pwMsg && <div style={{ marginTop: 6, fontSize: '0.786rem', color: pwMsg.startsWith('✓') ? '#1D9E75' : '#c44' }}>{pwMsg}</div>}
              </div>
            )}
          </div>}</div>
        </div>
      )}
    </div>
  );
}
