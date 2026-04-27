import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import KoreanTextarea from '../../components/KoreanTextarea';
import { parseDocument, sourceLabel, cleanMd, parseKeywords } from '../../components/utils';
import { getBody } from '../../utils/textHelpers';
import { S } from '../../styles';
import { discFormDefault, svcFormDefault, visitFormDefault, pubFormDefault, gatherFormDefault } from '../../utils/formDefaults';
import { RESET_CONFIRM_MSG } from '../../utils/formReset';
import { useConfirm } from '../../providers/ConfirmProvider';
import { useAlert } from '../../providers/AlertProvider';
import ManageSpeechInput from './SpeechInput';
import ManageStructureOther from './StructureOther';
import { MSG, getStatusColor } from '../../utils/messages';
import ManageDrafts from './Drafts';
import SttCorrectionDiff, { computeDiffPairs } from './SttCorrectionDiff';
import { Modal } from '../../components/Modal';
import { collectScripturesFromOutline } from '../../utils/scriptureHelpers';
import { getOutlinePrefix } from '../../utils/outlineFormat';
import { getOutlineLabel } from '../../utils/outlineCategory';
import { dbAdd, dbDelete, dbUpdate, deleteServiceType, freeSearch, getServiceTypes, outlineList, outlineDetail, listBySource, batchAdd, batchList, batchDelete, parseMdFiles, docxToText, saveOutline, saveSpeech, savePublication, saveOriginal, bulkSave, checkDuplicates, bibleLookup, draftSave, draftCheck, draftLoad, draftComplete, draftDelete, draftList, getCategories, saveCategories, lookupPubTitle, matchPubPoints, sttUpload, sttUploadText, sttTranscribe, sttJobsList, sttJobDetail, sttDelete, sttCorrect, sttSave, sttCorrectionsGet } from '../../api';

function _splitCommaRefs(text) {
  const parts = [];
  let buf = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"' || ch === '\u201c') inQ = true;
    else if (ch === '"' || ch === '\u201d') inQ = false;
    else if (ch === ',' && !inQ) {
      const rest = text.slice(i + 1).trimStart();
      if (rest && /[가-힣「]/.test(rest[0])) { parts.push(buf.trim()); buf = ''; continue; }
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

const OUTLINE_TYPES = [
  { name: '공개강연', code: 'S-34', numPh: '001~196', verPh: '10/24' },
  { name: '생활과봉사', code: 'SB', numPh: '041 (4월 1주차)', verPh: '4/26 (월/년)', timePh: '10분' },
  { name: '특별행사', code: 'S-31', numPh: '001', sub: [
    { name: '기념식', code: 'S-31', numPh: '001', verPh: '8/19 (개정 월/년)' },
    { name: '특별강연', code: 'S-123', numPh: '001', verPh: '5/26 (발표 월/년)' },
    { name: 'RP모임', code: 'S-211', numPh: '001', verPh: '6/26 (개최 월/년)' },
  ]},
  { name: '대회', code: 'CO', numPh: '001', sub: [
    { name: '순회대회', code: 'CO_C', numPh: '001', verPh: '3/26 (개최 월/년)' },
    { name: '지역대회', code: 'CO_R', numPh: '001', verPh: '7/26 (개최 월/년)' },
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

export default function ManageGather({ fontSize, pageType, pendingPub, clearPendingPub, onSaveReturn, embedded = false, forcedMode = null }) {
  const showConfirm = useConfirm();
  const showAlert = useAlert();
  const _isAddPage = pageType === 'add' || pageType === 'input';
  const _siDateDefault = (() => { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); })();
  const [gatherForm, setGatherForm] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-gather-form')) || gatherFormDefault; } catch(e) { return gatherFormDefault; } });
  const [discForm, setDiscForm] = useState(() => { try { const s = localStorage.getItem('jw-disc-form'); return s ? JSON.parse(s) : discFormDefault; } catch { return discFormDefault; } });
  const [svcForm, setSvcForm] = useState(() => { try { const s = localStorage.getItem('jw-svc-form'); return s ? JSON.parse(s) : svcFormDefault; } catch { return svcFormDefault; } });
  const [visitForm, setVisitForm] = useState(() => { try { const s = localStorage.getItem('jw-visit-form'); return s ? JSON.parse(s) : visitFormDefault; } catch { return visitFormDefault; } });
  const [pubForm, setPubForm] = useState(pubFormDefault);
  const [pubRefOpen, setPubRefOpen] = useState(false);
  const [pubLookupHint, setPubLookupHint] = useState('');
  const [pubExactMatch, setPubExactMatch] = useState(null); // 완전 중복 항목
  useEffect(() => {
    const code = pubForm.pub_code?.trim();
    // 코드 3자 미만 → 힌트/참조 모두 clear (이전 값 잔류 방지)
    if (!code || code.length < 3) {
      setPubLookupHint('');
      setPubExactMatch(null);
      setPubForm(p => (p.reference ? { ...p, reference: '' } : p));
      return;
    }
    const t = setTimeout(() => {
      lookupPubTitle(code).then(r => {
        setPubExactMatch(r.exact_match || null);
        if (r.pub_title) {
          setPubLookupHint(r.pub_title);
          setPubForm(p => ({
            ...p,
            pub_title: r.pub_title,
            pub_type: p.pub_type || r.pub_type || '',
            reference: r.reference || '',
          }));
        } else {
          setPubLookupHint('');
          setPubForm(p => ({ ...p, reference: r.reference || '' }));
        }
      }).catch(() => {
        setPubLookupHint('');
        setPubExactMatch(null);
        setPubForm(p => (p.reference ? { ...p, reference: '' } : p));
      });
    }, 500);
    return () => clearTimeout(t);
  }, [pubForm.pub_code]);
  const [cats, setCats] = useState({ service_types: ['호별','상가','재방문','특별활동','비대면','폐쇄'], visit_targets: ['청소년','청년','중년','장년'], visit_situations: ['일반','건강','낙담','바쁨'] });
  const [catEditing, setCatEditing] = useState(null); // 'service_types' | 'visit_targets' | 'visit_situations'
  const [catNewVal, setCatNewVal] = useState('');
  useEffect(() => { getCategories().then(r => setCats(r)).catch(() => {}); }, []);
  useEffect(() => { try { localStorage.setItem('jw-gather-form', JSON.stringify(gatherForm)); } catch(e) {} }, [gatherForm]);
  useEffect(() => { try { localStorage.setItem('jw-disc-form', JSON.stringify(discForm)); } catch {} }, [discForm]);
  useEffect(() => { try { localStorage.setItem('jw-svc-form', JSON.stringify(svcForm)); } catch {} }, [svcForm]);
  useEffect(() => { try { localStorage.setItem('jw-visit-form', JSON.stringify(visitForm)); } catch {} }, [visitForm]);
  const [outlines, setOutlines] = useState([]);
  const [subtopics, setSubtopics] = useState({});
  const [saving, setSaving] = useState(false);
  const [fromPub, setFromPub] = useState(false);
  // text 모드 [+] 출처 마커. true 면 출판물 저장/취소 후 setSubTab('gather') + setGatherMode('text') 로 로컬 복귀
  // (App.jsx onSaveReturn 의 setPage('speech') 우회). localStorage 미저장 — 잔여 회귀 방지.
  const [siFromOutlineText, setSiFromOutlineText] = useState(false);
  // 세션 5f §3.x Commit 2: text 모드 ✓ 매칭. 평탄 매칭 키 Set.
  // 키 형식: "{normPointText}__{normPubCode}" (백엔드 match-points 응답)
  const [txtPubMatched, setTxtPubMatched] = useState(() => new Set());
  // 정규화 — 백엔드 chat.py _norm_text/_norm_pub 와 동일 규칙 (변경 시 함께 수정)
  const _normText = (s) => {
    if (!s) return '';
    return s.replace(/　/g, ' ').trim().replace(/\s+/g, ' ');
  };
  const _normPub = (s) => (s || '').replace(/[「」\s]/g, '').toLowerCase();
  const [batchEntries, setBatchEntries] = useState([]);
  const [batchInfo, setBatchInfo] = useState('');
  const [batchLog, setBatchLog] = useState([]);
  // ── 전처리 state ──
  const [gatherMode, setGatherMode] = useState(() => {
    if (forcedMode) return forcedMode;
    try { return localStorage.getItem('jw-gather-mode') || 'file'; } catch { return 'file'; }
  });
  useEffect(() => { if (embedded) return; try { localStorage.setItem('jw-gather-mode', gatherMode); } catch {} }, [gatherMode, embedded]);
  useEffect(() => { if (forcedMode && gatherMode !== forcedMode) setGatherMode(forcedMode); }, [forcedMode]);
  // 파일 업로드 모드
  const [mdParsed, setMdParsed] = useState(null);
  const [mdParsing, setMdParsing] = useState(false);
  const [mdSaving, setMdSaving] = useState({});
  const [mdResult, setMdResult] = useState('');
  // 골자 입력 모드 (gatherMode='text' 식별자는 A안에서 유지)
  const [txtMeta, setTxtMeta] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-text-meta')) || { outlineType: 'S-34', outlineNum: '', outlineTitle: '', version: '', duration: '', year: '' }; } catch { return { outlineType: 'S-34', outlineNum: '', outlineTitle: '', version: '', duration: '', year: '' }; } });
  const [txtContent, setTxtContent] = useState(() => { try { return localStorage.getItem('jw-text-content') || ''; } catch { return ''; } });
  const [txtParsed, setTxtParsed] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-text-parsed')) || []; } catch { return []; } });
  const [txtSaving, setTxtSaving] = useState(false);
  const [txtResult, setTxtResult] = useState('');
  const [txtDocxLoading, setTxtDocxLoading] = useState(false);
  useEffect(() => { try { localStorage.setItem('jw-text-meta', JSON.stringify(txtMeta)); } catch {} }, [txtMeta]);
  useEffect(() => { try { localStorage.setItem('jw-text-content', txtContent); } catch {} }, [txtContent]);
  useEffect(() => { try { localStorage.setItem('jw-text-parsed', JSON.stringify(txtParsed.map(p => ({ ...p, _editing: undefined })))); } catch {} }, [txtParsed]);
  const [fileStatus, setFileStatus] = useState({}); // { "outline_0": "saving"|"done"|"dup"|"error"|"skipped", "outline_0_msg": "..." }
  const [saveMsg, setSaveMsg] = useState('');
  // 옛 단건 등록 폼 (L2762-3216 영역) 폐기로 부속 state/헬퍼 일괄 삭제 (Commit D).
  // 같은 commit 에서 옛 localStorage 키 4종 1회성 cleanup.
  useEffect(() => {
    ['jw-cats-service', 'jw-cats-discussion', 'jw-cats-speech-sub', 'jw-cats-visit-sit'].forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  }, []);
  // ── 연설 입력 state ──
  const [subTab, setSubTab] = useState(() => {
    // subTab 값 rename — 'input'→'structure', 'preprocess'→'gather'
    if (embedded) return 'gather';
    if (pageType === 'input') return 'structure';
    try {
      const s = localStorage.getItem('jw-prep-subtab');
      // 기존 값 마이그레이션
      if (s === 'input') return 'structure';
      if (s === 'preprocess') return 'gather';
      return ['gather', 'structure', 'drafts'].includes(s) ? s : 'gather';
    } catch { return 'gather'; }
  });
  const [structureMode, setStructureMode] = useState(() => {
    try {
      const s = localStorage.getItem('jw-structure-mode');
      // [구조화] 바에서 quick_input 제거 → pageType='add'는 speech_input 기본
      if (!s || s === 'quick_input') return 'speech_input';
      return s;
    } catch { return 'speech_input'; }
  });
  useEffect(() => { if (embedded || pageType === 'input') return; try { localStorage.setItem('jw-prep-subtab', subTab); } catch {} }, [subTab, pageType, embedded]);
  useEffect(() => { if (pageType === 'input') return; try { localStorage.setItem('jw-structure-mode', structureMode); } catch {} }, [structureMode, pageType]);
  // 빠른메모 → 연설 입력 전달 처리
  // transfer 데이터 처리 — subTab 변경 시 + 외부 트리거(si-transfer 이벤트) 시
  const [siTransferTick, setSiTransferTick] = useState(0);
  useEffect(() => {
    const handler = () => { setSubTab('structure'); setStructureMode('speech_input'); setSiTransferTick(t => t + 1); };
    window.addEventListener('si-transfer', handler);
    return () => window.removeEventListener('si-transfer', handler);
  }, []);
  const [memoEntries, setMemoEntries] = useState([]);
  const [movingMemo, setMovingMemo] = useState(null); // { collection, id, topic, body }
  const [dbDrafts, setDbDrafts] = useState([]);
  const [expandedDbEntry, setExpandedDbEntry] = useState({});

  // ── STT 업로드 탭 ──
  const [sttJobs, setSttJobs] = useState([]);
  const [sttUploadStatus, setSttUploadStatus] = useState('');
  const [sttUploading, setSttUploading] = useState(false);
  const [sttPollingJobs, setSttPollingJobs] = useState(new Set());
  const sttFileInputRef = useRef(null);
  const sttPollRef = useRef(null);
  const sttPollTimeoutRef = useRef(null);
  const sttPollingRef = useRef(new Set());

  const sttLoadJobs = async () => {
    try {
      const r = await sttJobsList();
      const jobs = r.jobs || [];
      setSttJobs(jobs);
      const active = new Set(
        jobs.filter(j => j.status === 'transcribing' || j.status === 'correcting').map(j => j.job_id)
      );
      setSttPollingJobs(active);
    } catch (e) {
      setSttUploadStatus(MSG.fail.fetch + e.message);
    }
  };

  // STT 탭 활성화 시 목록 로드 (새로고침/탭 전환 양쪽 대응)
  useEffect(() => {
    if (subTab === 'gather' && gatherMode === 'stt' && sttJobs.length === 0) {
      sttLoadJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subTab, gatherMode]);

  // 폴링: 진행 중 job만 2초마다 상세 조회 (ref 기반 — 인터벌 재생성 방지)
  useEffect(() => {
    if (sttPollingJobs.size === 0) {
      sttPollingRef.current = new Set();
      return;
    }
    sttPollingRef.current = new Set(sttPollingJobs);
    const interval = setInterval(async () => {
      const ids = Array.from(sttPollingRef.current);
      if (ids.length === 0) { clearInterval(interval); return; }
      try {
        const results = await Promise.all(ids.map(id => sttJobDetail(id).catch(() => null)));
        // stillActive 계산을 setter 바깥에서 동기적으로 수행 (React setter는 비동기)
        const stillActive = new Set();
        results.forEach(res => {
          if (res && (res.status === 'transcribing' || res.status === 'correcting')) {
            stillActive.add(res.job_id);
          }
        });
        setSttJobs(prev => {
          const updated = [...prev];
          results.forEach(res => {
            if (!res) return;
            const idx = updated.findIndex(j => j.job_id === res.job_id);
            if (idx >= 0) updated[idx] = { ...updated[idx], ...res };
          });
          return updated;
        });
        sttPollingRef.current = stillActive;
        if (stillActive.size === 0) clearInterval(interval);
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sttPollingJobs.size]);

  // 언마운트 시 STT 폴링 인터벌/타임아웃 정리
  useEffect(() => {
    return () => {
      if (sttPollRef.current) { clearInterval(sttPollRef.current); sttPollRef.current = null; }
      if (sttPollTimeoutRef.current) { clearTimeout(sttPollTimeoutRef.current); sttPollTimeoutRef.current = null; }
    };
  }, []);

  const handleSttUpload = async (file) => {
    if (!file) return;
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const isText = ext === 'txt';
    const maxSize = isText ? 10 * 1024 * 1024 : 300 * 1024 * 1024;
    const maxLabel = isText ? '10MB' : '300MB';
    const sizeMb = (file.size / 1024 / 1024).toFixed(1);
    if (file.size > maxSize) {
      setSttUploadStatus(MSG.warn.fileTooLarge(sizeMb, maxLabel));
      return;
    }
    setSttUploading(true);
    setSttUploadStatus(MSG.helpers.uploadProgress(file.name, sizeMb));
    try {
      if (isText) {
        await sttUploadText(file);
      } else {
        await sttUpload(file);
      }
      setSttUploadStatus(MSG.helpers.uploadNamed(file.name));
      await sttLoadJobs();
      setTimeout(() => setSttUploadStatus(''), 3000);
    } catch (e) {
      setSttUploadStatus(MSG.fail.upload + e.message);
    } finally {
      setSttUploading(false);
      if (sttFileInputRef.current) sttFileInputRef.current.value = '';
    }
  };

  const handleSttFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) handleSttUpload(file);
  };

  const handleSttDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleSttUpload(file);
  };
  const handleSttDragOver = (e) => e.preventDefault();

  const handleSttTranscribe = async (jobId) => {
    try {
      await sttTranscribe(jobId);
      await sttLoadJobs();
    } catch (e) {
      setSttUploadStatus(MSG.fail.convert + e.message);
    }
  };

  const handleSttDelete = async (jobId, filename) => {
    if (!await showConfirm(`"${filename}" 삭제하시겠습니까? 관련 파일 모두 제거됩니다.`, { confirmVariant: 'danger' })) return;
    try {
      await sttDelete(jobId);
      await sttLoadJobs();
    } catch (e) {
      setSttUploadStatus(MSG.fail.delete + e.message);
    }
  };

  const formatSttDuration = (seconds) => {
    if (!seconds || seconds < 1) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return m > 0 ? `${m}분 ${s}초` : `${s}초`;
  };

  const sttStatusLabel = (job) => {
    const status = (job && job.status) || job;  // 호환: string 직접 전달도 허용
    const sourceType = job && typeof job === 'object' ? job.source_type : '';
    // txt 업로드: Whisper 미경유 → "변환 완료" 대신 "준비됨"
    if (sourceType === 'text' && status === 'transcribed') return '준비됨';
    return ({
      uploaded: '업로드 완료',
      transcribing: '변환 중',
      transcribed: '변환 완료',
      correcting: '교정 중',
      reviewing: '검토 대기',
      draft_sent: '임시저장 중',
      saved: '저장 완료',
      failed: '실패',
    }[status] || status);
  };

  const sttStatusColor = (status) => ({
    uploaded: 'var(--accent-blue)',
    transcribing: 'var(--accent-gold)',
    transcribed: 'var(--accent)',
    correcting: 'var(--accent-gold)',
    reviewing: 'var(--accent)',
    draft_sent: 'var(--accent-blue)',
    saved: 'var(--accent)',
    failed: 'var(--c-danger)',
  }[status] || '#888');

  // ── Build-5B: STT 검토 화면 state ──
  const [sttReviewJob, setSttReviewJob] = useState(null);
  const [sttReviewTab, setSttReviewTab] = useState('cloud');
  const [sttReviewFinalText, setSttReviewFinalText] = useState('');
  const [sttReviewUseLocal, setSttReviewUseLocal] = useState(false);
  const [sttReviewLocalModel, setSttReviewLocalModel] = useState('gemma4:e4b');
  const [sttReviewUseCloud, setSttReviewUseCloud] = useState(true);
  const [sttReviewCloudPlatform, setSttReviewCloudPlatform] = useState('');
  const [sttReviewCloudModel, setSttReviewCloudModel] = useState('');
  // STT용 모델 목록 (aiModels state 대신 localStorage에서 직접 읽기)
  const [sttAiModels, setSttAiModels] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-ai-models') || 'null') || {}; } catch { return {}; } });
  const [sttReviewCorrecting, setSttReviewCorrecting] = useState(false);
  const [sttReviewMeta, setSttReviewMeta] = useState({
    speaker: '',
    speech_date: _siDateDefault,
    source: 'speech',
    outline_id: '',
    outline_num: '',
    outline_version: '',
    topic: '',
  });
  const [sttReviewOutlineQuery, setSttReviewOutlineQuery] = useState('');
  const [sttReviewOutlineFocus, setSttReviewOutlineFocus] = useState(false);
  const [sttReviewOutlines, setSttReviewOutlines] = useState([]);
  const [sttReviewOutlineOpen, setSttReviewOutlineOpen] = useState(false);
  const [sttReturnAfterSave, setSttReturnAfterSave] = useState(false);
  const [sttReviewVerses, setSttReviewVerses] = useState([]);
  const [sttVerseMode, setSttVerseMode] = useState('reading_text');
  const [sttVersesModalOpen, setSttVersesModalOpen] = useState(false);
  const [sttLastCorrectedOutlineId, setSttLastCorrectedOutlineId] = useState('');
  const [sttLastCorrectedVerseMode, setSttLastCorrectedVerseMode] = useState('');
  const [sttWarningDismissed, setSttWarningDismissed] = useState('');
  const [sttSavedModal, setSttSavedModal] = useState(null);
  const [sttReviewStatus, setSttReviewStatus] = useState('');
  const [sttCorrectionsData, setSttCorrectionsData] = useState(null);

  // Phase 5b-2: STT 검토 화면 persist + mount 시 자동 복원
  const sttReviewRestoredRef = useRef(false);
  const sttReviewPersistMountedRef = useRef(false);
  useEffect(() => {
    if (sttReviewRestoredRef.current) return;
    if (subTab !== 'gather' || gatherMode !== 'stt') return;
    sttReviewRestoredRef.current = true;
    const raw = (() => { try { return JSON.parse(localStorage.getItem('jw-stt-review') || 'null'); } catch { return null; } })();
    if (!raw?.jobId) return;
    sttJobDetail(raw.jobId).then(fresh => {
      if (!fresh) { try { localStorage.removeItem('jw-stt-review'); } catch {} return; }
      setSttReviewJob(fresh);
      setSttReviewFinalText(raw.finalText ?? fresh.final_text ?? '');
      setSttReviewMeta({
        speaker: '', speech_date: _siDateDefault, source: 'speech',
        outline_id: '', outline_num: '', outline_version: '', topic: '',
        ...(raw.meta || {}),
      });
      if (raw.tab) setSttReviewTab(raw.tab);
    }).catch(() => { try { localStorage.removeItem('jw-stt-review'); } catch {} });
  }, [subTab, gatherMode]);
  useEffect(() => {
    if (sttReviewJob && !sttCorrectionsData) {
      sttCorrectionsGet().then(r => setSttCorrectionsData(r.data || null)).catch(() => {});
    }
  }, [sttReviewJob, sttCorrectionsData]);
  const sttDiffPairCount = useMemo(() => {
    if (!sttReviewJob?.parsed_text || !sttReviewJob?.cloud_text) return 0;
    return computeDiffPairs(sttReviewJob.parsed_text, sttReviewJob.cloud_text).length;
  }, [sttReviewJob?.parsed_text, sttReviewJob?.cloud_text]);
  // ── 골자 성구 자동 로드 (Level 1.5 Phase 3-B) ──
  // outline_id 변경 감지 → outlineDetail → collectScripturesFromOutline → state
  // outline_id 는 version `/` 포함될 수 있어 path 로 직접 못 씀 (FastAPI 404).
  // SpeechInput 패턴 준거: path 는 type+num 만, version 은 쿼리로.
  useEffect(() => {
    const oid = sttReviewMeta?.outline_id || '';
    if (!oid) { setSttReviewVerses([]); return; }
    // outline_id 에서 _v 토큰 앞까지만 path-safe prefix 추출
    const vIdx = oid.indexOf('_v');
    const pathOid = vIdx > 0 ? oid.slice(0, vIdx) : oid;
    let cancelled = false;
    outlineDetail(pathOid, '', sttReviewMeta.outline_version || '')
      .then(detail => {
        if (cancelled) return;
        setSttReviewVerses(collectScripturesFromOutline(detail?.subtopics || {}));
      })
      .catch(() => { if (!cancelled) setSttReviewVerses([]); });
    return () => { cancelled = true; };
  }, [sttReviewMeta?.outline_id, sttReviewMeta?.outline_version]);
  // ── preprocDirty 폴링 (Level 1.5 Phase 4) ──
  const [preprocDirtyFlag, setPreprocDirtyFlag] = useState(() => {
    try { return localStorage.getItem('jw-preproc-dirty') === '1'; } catch { return false; }
  });
  useEffect(() => {
    if (!sttReviewJob) return;
    const check = () => {
      try { setPreprocDirtyFlag(localStorage.getItem('jw-preproc-dirty') === '1'); } catch {}
    };
    check();
    const id = setInterval(check, 2000);
    window.addEventListener('storage', check);
    return () => { clearInterval(id); window.removeEventListener('storage', check); };
  }, [sttReviewJob]);
  useEffect(() => {
    if (!sttReviewPersistMountedRef.current) { sttReviewPersistMountedRef.current = true; return; }
    if (sttReviewJob?.job_id) {
      try {
        localStorage.setItem('jw-stt-review', JSON.stringify({
          jobId: sttReviewJob.job_id,
          finalText: sttReviewFinalText,
          meta: sttReviewMeta,
          tab: sttReviewTab,
        }));
      } catch {}
    } else {
      try { localStorage.removeItem('jw-stt-review'); } catch {}
    }
  }, [sttReviewJob, sttReviewFinalText, sttReviewMeta, sttReviewTab]);

  // STT draft → 연설 입력 탭 공통 이관 핸들러
  const handleStartSttDraftEdit = async (_draftId, speaker, date, jobId) => {
    try {
      const dr = await draftLoad({ outline_num: '', speaker: speaker || '', date: date || '', outline_type: 'ETC' });
      if (!dr.exists) { showAlert('임시저장을 찾을 수 없습니다.', { variant: 'info' }); return; }
      localStorage.setItem('jw-speech-transfer', JSON.stringify({
        isSttDraft: true,
        outline_type: 'ETC',
        outline_num: '',
        speaker: speaker || dr.speaker || '',
        date: date || dr.date || '',
        free_text: dr.free_text || '',
        free_topic: dr.free_topic || '',
        free_subtopics: dr.free_subtopics || [],
        free_mode: dr.free_mode || 'bulk',
        source_stt_job_id: dr.source_stt_job_id || jobId || '',
        stt_original_text: dr.stt_original_text || dr.free_text || '',
      }));
      localStorage.setItem('jw-prep-subtab', 'structure');
      localStorage.setItem('jw-structure-mode', 'speech_input');
      setSubTab('structure');
      setStructureMode('speech_input');
      window.dispatchEvent(new Event('si-transfer'));
    } catch (e) {
      showAlert(MSG.fail.fetch + e.message, { variant: 'error' });
    }
  };

  const handleDraftMove = async (dr) => {
    const isStt = !!dr.source_stt_job_id;
    const isQuickInput = (dr.outline_type === 'QUICK') || /^(SP|DC|SV|VS|PB|ET)_/.test(dr.outline_num || '');

    // 1) STT → localStorage transfer (Phase 4b-2: si* state를 SpeechInput이 관리)
    if (isStt) {
      let full = dr;
      try {
        const r = await draftLoad({ outline_num: '', speaker: dr.speaker || '', date: dr.date || '', outline_type: 'ETC', source_stt_job_id: dr.source_stt_job_id || '' });
        if (r && r.exists) full = r;
      } catch {}
      try {
        localStorage.setItem('jw-speech-transfer', JSON.stringify({
          isSttDraft: true, isDraft: true,
          speaker: full.speaker || dr.speaker || '',
          date: full.date || dr.date || '',
          free_topic: full.free_topic || full.outline_title || '',
          free_subtopics: full.free_subtopics || [],
          free_mode: full.free_mode || 'subtopic',
          free_type: full.free_type || '생활과봉사',
          source_stt_job_id: full.source_stt_job_id || dr.source_stt_job_id || '',
          stt_original_text: full.stt_original_text || full.free_text || dr.stt_original_text || dr.free_text || '',
        }));
      } catch {}
      setSubTab('structure'); setStructureMode('speech_input');
      setSiTransferTick(t => t + 1);
      return;
    }

    // 2) QUICK → 타입별 분기
    if (isQuickInput) {
      let full = dr;
      try {
        const r = await draftLoad({ outline_num: dr.outline_num || '', speaker: dr.speaker || '', date: dr.date || '', outline_type: 'QUICK' });
        if (r && r.exists) full = r;
      } catch {}
      const codeMap = { SP: 'speech', DC: 'discussion', SV: 'service', VS: 'visit', PB: 'publication', ET: 'other' };
      const m = (dr.outline_num || '').match(/^([A-Z]{2})_/);
      const qtype = full.quick_type || (m ? (codeMap[m[1]] || 'speech') : 'speech');
      const content = full.free_text || '';

      if (qtype === 'discussion') {
        setDiscForm(p => ({
          ...p,
          topic: full.outline_title || '',
          pub_code: full.pub_code || '',
          date: full.date || '',
          content,
        }));

        setSubTab('structure'); setStructureMode('discussion');
        return;
      }
      if (qtype === 'service') {
        setSvcForm(p => ({
          ...p,
          date: full.date || '',
          content,
        }));
        setSubTab('structure'); setStructureMode('service');
        return;
      }
      if (qtype === 'visit') {
        setVisitForm(p => ({
          ...p,
          visit_target: full.target || '',
          date: full.date || '',
          keywords: full.outline_title || '',
          content,
        }));
        setSubTab('structure'); setStructureMode('visit_input');
        return;
      }
      if (qtype === 'publication') {
        // 출판물은 원본/구조화 분리 개념 아님 — pubForm.content 직접 사용
        setPubForm(p => ({
          ...p,
          content: content,
          pub_code: full.pub_code || '',
          pub_title: full.pub_title || '',
          outline_title: full.outline_title || '',
        }));
        setSubTab('gather'); setGatherMode('pub_input');
        return;
      }
      // 'speech' 또는 'other' → localStorage transfer
      try {
        localStorage.setItem('jw-speech-transfer', JSON.stringify({
          isFreeDraft: true, isDraft: true, no_outline: true,
          speaker: full.speaker || '',
          date: full.date || '',
          free_topic: full.outline_title || '',
          free_subtopics: [],
          free_mode: 'subtopic',
          free_type: full.speech_type || '생활과봉사',
          free_text: content,
          stt_original_text: content,
          source_stt_job_id: '',
        }));
      } catch {}
      setSubTab('structure'); setStructureMode('speech_input');
      setSiTransferTick(t => t + 1);
      return;
    }

    // 3) 자유 입력 draft → 기존 isFreeDraft transfer
    if (dr.no_outline) {
      let full = dr;
      try {
        const r = await draftLoad({ outline_num: '', speaker: dr.speaker, date: dr.date, outline_type: dr.outline_type || 'ETC', source_stt_job_id: dr.source_stt_job_id || '' });
        if (r.exists) full = r;
      } catch {}
      try {
        localStorage.setItem('jw-speech-transfer', JSON.stringify({
          speaker: dr.speaker, date: dr.date,
          outline_num: '', outline_title: '', outline_type: 'ETC',
          isFreeDraft: true, no_outline: true,
          free_topic: full.free_topic || '',
          free_text: full.free_text || '',
          free_subtopics: full.free_subtopics || [],
          free_mode: full.free_mode || 'subtopic',
          free_type: full.free_type || '생활과봉사',
          stt_original_text: full.stt_original_text || '',
          source_stt_job_id: full.source_stt_job_id || '',
        }));
        localStorage.setItem('jw-prep-subtab', 'structure');
        localStorage.setItem('jw-structure-mode', 'speech_input');
        window.dispatchEvent(new Event('si-transfer'));
      } catch {}
      setSubTab('structure'); setStructureMode('speech_input');
      return;
    }

    // 4) 골자 draft → [구조화]>[연설] 상세 모드 기본
    try {
      localStorage.setItem('jw-speech-transfer', JSON.stringify({
        speaker: dr.speaker, date: dr.date,
        outline_num: dr.outline_num, outline_title: dr.outline_title,
        outline_type: dr.outline_type, content: '', isDraft: true, forceMode: 'detail',
      }));
      localStorage.setItem('jw-prep-subtab', 'structure');
      localStorage.setItem('jw-structure-mode', 'speech_input');
      window.dispatchEvent(new Event('si-transfer'));
    } catch {}
    setSubTab('structure'); setStructureMode('speech_input');
  };

  // Phase 4b-4: 메모 이동 모달 콜백 (Drafts에서 호출)
  const onMemoMove = (type, m) => {
    setMovingMemo({ id: m.id, collection: m.collection });
    if (type === 'speech_input') {
      try {
        localStorage.setItem('jw-speech-transfer', JSON.stringify({
          isFreeDraft: true, no_outline: true,
          speaker: '', date: '',
          free_topic: m.topic || '',
          free_text: '',
          free_subtopics: [],
          free_mode: 'subtopic',
          stt_original_text: m.body || '',
          source_stt_job_id: '',
          memoId: m.id, memoCol: m.collection,
        }));
      } catch {}
      setSiTransferTick(t => t + 1);
    } else if (type === 'discussion') {
      setDiscForm(p => ({ ...p, topic: m.topic, content: m.body }));
    } else if (type === 'service') {
      setSvcForm(p => ({ ...p, keywords: m.topic, content: m.body }));
    } else if (type === 'visit_input') {
      setVisitForm(p => ({ ...p, keywords: m.topic, content: m.body }));
    } else if (type === 'pub_input') {
      setPubForm(p => ({ ...p, content: m.body, point_summary: m.topic }));
    }
    if (type === 'pub_input') {
      setSubTab('gather'); setGatherMode('pub_input');
    } else {
      setSubTab('structure'); setStructureMode(type);
    }
  };

  // AI 기본 클라우드 모델 (AI 관리에서 저장된 기본 플랫폼·모델)
  const getDefaultCloudModel = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('jw-ai-default') || 'null');
      if (saved?.platform && saved?.model) return { platform: saved.platform, model: saved.model };
    } catch {}
    try {
      const models = JSON.parse(localStorage.getItem('jw-ai-models') || 'null');
      if (models) {
        const nonLocal = Object.keys(models).find(p => p !== 'Local');
        const fallback = nonLocal || Object.keys(models)[0] || 'Gemini';
        const first = models[fallback]?.[0];
        return { platform: fallback, model: first?.value || 'gemini-2.5-flash' };
      }
    } catch {}
    return { platform: 'Gemini', model: 'gemini-2.5-flash' };
  };

  const enterSttReview = async (job) => {
    // STT 리뷰 진입 시 최신 모델 목록 갱신
    try { setSttAiModels(JSON.parse(localStorage.getItem('jw-ai-models') || 'null') || {}); } catch { setSttAiModels({}); }
    let fresh = job;
    try {
      fresh = await sttJobDetail(job.job_id);
    } catch {}
    setSttReviewJob(fresh);
    if (fresh.cloud_text) setSttReviewTab('cloud');
    else if (fresh.local_text) setSttReviewTab('local');
    else if (fresh.parsed_text) setSttReviewTab('parsed');
    else setSttReviewTab('raw');
    setSttReviewFinalText(fresh.final_text || '');
    const dc = getDefaultCloudModel();
    setSttReviewUseLocal(false);
    setSttReviewLocalModel('gemma4:e4b');
    setSttReviewUseCloud(true);
    setSttReviewCloudPlatform(dc.platform);
    setSttReviewCloudModel(dc.model);
    setSttReviewMeta({
      speaker: '',
      speech_date: _siDateDefault,
      source: 'speech',
      outline_id: '',
      outline_num: '',
      outline_version: '',
      topic: '',
    });
    setSttReviewOutlineQuery('');
    setSttReviewStatus('');
  };

  const exitSttReview = async () => {
    if (sttReviewCorrecting) {
      if (!await showConfirm('교정이 진행 중입니다. 정말 나가시겠습니까?', { confirmVariant: 'danger' })) return;
    }
    setSttReviewJob(null);
    setSttReviewStatus('');
    sttLoadJobs();
  };

  const applySttCorrection = async () => {
    if (!sttReviewJob) return;
    setSttReviewCorrecting(true);
    setSttReviewStatus(MSG.progress.correct);
    try {
      const readings = sttReviewVerses.filter(v => v.includes('(낭독)'));
      const options = {
        use_local: sttReviewUseLocal,
        local_model: sttReviewLocalModel,
        use_cloud: sttReviewUseCloud,
        cloud_model: sttReviewCloudModel,
        verses: {
          mode: sttVerseMode,
          all: sttReviewVerses,
          readings,
        },
      };
      const result = await sttCorrect(sttReviewJob.job_id, options);

      if (result.status === 'reviewing') {
        const fresh = await sttJobDetail(sttReviewJob.job_id);
        setSttReviewJob(fresh);
        setSttReviewFinalText(fresh.final_text || '');
        if (fresh.cloud_text) setSttReviewTab('cloud');
        else if (fresh.local_text) setSttReviewTab('local');
        else setSttReviewTab('parsed');
        setSttReviewStatus(MSG.success.correct);
        setSttReviewCorrecting(false);
        setTimeout(() => setSttReviewStatus(''), 3000);
        return;
      }

      // LLM 포함 → 폴링 (ref 기반 — 언마운트 시 정리)
      if (sttPollRef.current) clearInterval(sttPollRef.current);
      if (sttPollTimeoutRef.current) clearTimeout(sttPollTimeoutRef.current);
      sttPollRef.current = setInterval(async () => {
        try {
          const fresh = await sttJobDetail(sttReviewJob.job_id);
          setSttReviewJob(fresh);
          if (fresh.final_text) setSttReviewFinalText(fresh.final_text);

          if (fresh.status === 'reviewing') {
            if (fresh.cloud_text) setSttReviewTab('cloud');
            else if (fresh.local_text) setSttReviewTab('local');
            else setSttReviewTab('parsed');
            setSttReviewStatus(MSG.success.correct);
            setSttReviewCorrecting(false);
            // Phase 4: cloud 교정 완료 시점의 outline_id/verse_mode 스냅샷 저장
            if (fresh.cloud_text) {
              setSttLastCorrectedOutlineId(sttReviewMeta?.outline_id || '');
              setSttLastCorrectedVerseMode(sttVerseMode);
              setSttWarningDismissed('');
            }
            clearInterval(sttPollRef.current);
            sttPollRef.current = null;
            setTimeout(() => setSttReviewStatus(''), 3000);
          } else if (fresh.status === 'failed') {
            setSttReviewStatus(MSG.fail.correct + (fresh.error_message || ''));
            setSttReviewCorrecting(false);
            clearInterval(sttPollRef.current);
            sttPollRef.current = null;
          }
        } catch {}
      }, 2000);
      sttPollTimeoutRef.current = setTimeout(() => {
        if (sttPollRef.current) { clearInterval(sttPollRef.current); sttPollRef.current = null; }
      }, 5 * 60 * 1000);
    } catch (e) {
      setSttReviewStatus(MSG.fail.correct + e.message);
      setSttReviewCorrecting(false);
    }
  };

  const saveSttSpeech = async () => {
    if (!sttReviewJob) return;
    if (!sttReviewMeta.speaker.trim()) { showAlert('연사를 입력해주세요', { variant: 'info' }); return; }
    if (!sttReviewMeta.speech_date) { showAlert('날짜를 입력해주세요', { variant: 'info' }); return; }
    if (!/^\d{4}$/.test(sttReviewMeta.speech_date)) { showAlert('날짜는 YYMM 4자리 숫자로 입력해주세요 (예: 2604)', { variant: 'info' }); return; }
    if (!sttReviewMeta.source) { showAlert('유형을 선택해주세요', { variant: 'info' }); return; }
    if (!sttReviewFinalText.trim()) { showAlert('저장할 텍스트가 없습니다. 교정을 먼저 실행해주세요.', { variant: 'info' }); return; }

    setSttReviewStatus(MSG.progress.transfer);
    try {
      const data = {
        speaker: sttReviewMeta.speaker,
        date: sttReviewMeta.speech_date,
        source: sttReviewMeta.source,
        topic: sttReviewMeta.topic || '',
        final_text: sttReviewFinalText,
      };
      const result = await sttSave(sttReviewJob.job_id, data);
      setSttReviewStatus('');
      setSttSavedModal(result);
    } catch (e) {
      setSttReviewStatus(MSG.fail.transfer + e.message);
    }
  };

  // 골자 검색: outlineList 한 번 받고 클라이언트 필터 (200ms 디바운스)
  useEffect(() => {
    if (!sttReviewJob) return;
    const q = sttReviewOutlineQuery.trim().toLowerCase();
    if (!q) { setSttReviewOutlines([]); return; }
    const t = setTimeout(() => {
      outlineList().then(r => {
        const all = r.outlines || [];
        const filtered = all.filter(g => {
          const title = (g.title || '').toLowerCase();
          const tcode = (g.outline_type || '').toLowerCase();
          const typeName = (g.outline_type_name || '').toLowerCase();
          const num = (g.outline_num || g.num || '').toString().toLowerCase();
          const fullPrefix = `${tcode}_${num}`.toLowerCase();
          return title.includes(q) || tcode.includes(q) || num.includes(q) || fullPrefix.includes(q) || typeName.includes(q);
        }).slice(0, 20);
        setSttReviewOutlines(filtered);
      }).catch(() => setSttReviewOutlines([]));
    }, 200);
    return () => clearTimeout(t);
  }, [sttReviewOutlineQuery, sttReviewJob]);

  const selectSttReviewOutline = (g) => {
    if (!g) {
      setSttReviewMeta(m => ({ ...m, outline_id: '', outline_num: '', outline_version: '' }));
      setSttReviewOutlineQuery('');
      return;
    }
    const version = g.outline_version || '';
    const num = g.num || g.outline_num || '';
    const otype = g.outline_type || '';
    let outlineId = g.outline_id || '';
    if (!outlineId && otype && num) {
      outlineId = `${otype}_${num}`;
      if (version) outlineId += `_v${version}`;
    }
    setSttReviewMeta(m => ({
      ...m,
      outline_id: outlineId,
      outline_num: num,
      outline_version: version,
    }));
    setSttReviewOutlineQuery(`${g.prefix || otype + '_' + num} - ${g.title || ''}`);
    setSttReviewOutlineFocus(false);
  };

  // 백엔드 datetime.utcnow()는 timezone 없는 ISO → 'Z' 보정으로 UTC 해석 강제
  const parseUtcIso = (iso) => {
    if (!iso) return 0;
    const hasTimezone = /Z$|[+\-]\d{2}:?\d{2}$/.test(iso);
    return new Date(hasTimezone ? iso : iso + 'Z').getTime();
  };

  // 시간 기반 진행률 (백엔드 progress 부족 시 보완)
  const computeTimeProgress = (job) => {
    const backendProgress = job.progress || 0;
    if (backendProgress >= 0.5) return backendProgress;
    if (!job.transcribe_started_at || !job.estimated_transcribe_seconds) return backendProgress;
    const started = parseUtcIso(job.transcribe_started_at);
    const elapsed = Math.max(0, (Date.now() - started) / 1000);
    const ratio = elapsed / job.estimated_transcribe_seconds;
    return Math.min(0.95, Math.max(backendProgress, ratio));
  };

  const computeElapsed = (job) => {
    if (!job.transcribe_started_at) return 0;
    const started = parseUtcIso(job.transcribe_started_at);
    return Math.max(0, (Date.now() - started) / 1000);
  };

  // 1초 ticker (transcribing/correcting 있을 때만 리렌더 트리거)
  // eslint-disable-next-line no-unused-vars
  const [sttTickerToken, setSttTickerToken] = useState(0);
  useEffect(() => {
    const hasActive = sttJobs.some(j => j.status === 'transcribing' || j.status === 'correcting');
    if (!hasActive) return;
    const tick = setInterval(() => setSttTickerToken(t => t + 1), 1000);
    return () => clearInterval(tick);
  }, [sttJobs]);


  useEffect(() => {
    outlineList().then(r => setOutlines(r.outlines || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!pendingPub) return;
    // Phase 5-3B-2: pub_input → [가져오기]>[출판물]
    setSubTab('gather');
    setGatherMode('pub_input');
    setFromPub(true);
    // pub_code 전체를 그대로 전달 (면/항 분리는 백엔드 lookup이 처리)
    // Commit B: outline_type/outline_num/version/point_id 4-tuple 자동 주입 (parseOutlineId 결과)
    setPubForm(p => ({
      ...p, pub_code: pendingPub.pub_code || '',
      point_summary: pendingPub.point || '',
      content: pendingPub.content || '',
      outline_title: pendingPub.topic || '',
      scriptures: pendingPub.scriptures || '',
      linked_outlines: pendingPub.linked_outlines || '',
      reference: '', pub_title: '', pub_type: '',
      outline_type: pendingPub.outline_type || '',
      outline_num: pendingPub.outline_num || '',
      version: pendingPub.version || '',
      point_id: pendingPub.pointNum || '',
    }));
    setSaveMsg('');
    // 같은 pub_code 재진입도 reference 자동 채움 (디바운스 useEffect 가 dep 변화 없으면 안 트리거)
    // 사용자 이미 입력한 값(p.pub_title, p.reference) 보존
    if (pendingPub.pub_code) {
      lookupPubTitle(pendingPub.pub_code).then(r => {
        if (r) setPubForm(p => ({
          ...p,
          pub_title: p.pub_title || r.pub_title || '',
          reference: p.reference || r.reference || '',
        }));
      }).catch(() => {});
    }
    if (clearPendingPub) clearPendingPub();
  }, [pendingPub]);

  const handleSave = async () => {
    if (!gatherForm.content.trim()) { setSaveMsg('내용을 입력하세요'); return; }
    if (gatherForm.entry_type === 'publication' && !gatherForm.pub_code.trim() && gatherForm.sub_source !== '원문') { setSaveMsg('출판물 코드를 입력하세요'); return; }
    setSaving(true); setSaveMsg('');
    try {
      const formData = subTab === 'memo'
        ? { ...gatherForm, source: '메모' }
        : gatherForm.sub_source === '원문' ? { ...gatherForm, source: '원문' } : gatherForm;
      const res = await dbAdd(formData);
      if (movingMemo) {
        try { await dbDelete(movingMemo.collection, movingMemo.id); } catch(e) {}
        setMemoEntries(prev => prev.filter(e => e.id !== movingMemo.id));
        setMovingMemo(null);
        setSaveMsg(MSG.helpers.moveTo(res.collection));
      } else {
        setSaveMsg(MSG.helpers.saveTo(res.collection));
      }
      setGatherForm(p => ({ ...p, subtopic: '', point_id: '', point_summary: '', content: '', keywords: '', scriptures: '' }));
      if (fromPub && onSaveReturn) {
        setFromPub(false);
        setTimeout(() => onSaveReturn(), 800);
      }
    } catch (e) { setSaveMsg(MSG.fail.save + e.message); }
    finally { setSaving(false); }
  };

  const saveStructureForm = async (form, source, resetFn, dflt) => {
    if (!form.content?.trim()) { setSaveMsg('내용을 입력하세요'); return; }
    if (source === '출판물' && !form.pub_code?.trim()) { setSaveMsg('출판물 코드를 입력하세요'); return; }
    const effectiveForm = (source === '봉사 모임' || source === '방문' || source === '토의')
      ? { ...form, speaker: (form.speaker || '').trim() || '미상' }
      : form;
    setSaving(true); setSaveMsg('');
    try {
      const payload = { ...gatherFormDefault, ...effectiveForm, source, entry_type: source === '출판물' ? 'publication' : 'expression' };
      const res = await dbAdd(payload);
      const actionLabel = source === '출판물' && res.action ? (
        res.action === 'created' ? ' — 새 출판물'
        : res.action === 'updated' ? ' — 기존 참조 갱신'
        : res.action === 'appended' ? ' — 참조 추가'
        : ''
      ) : '';
      if (movingMemo) {
        try { await dbDelete(movingMemo.collection, movingMemo.id); } catch {}
        setMemoEntries(prev => prev.filter(e => e.id !== movingMemo.id));
        setMovingMemo(null);
        setSaveMsg(MSG.helpers.moveTo(res.collection, actionLabel));
      } else {
        setSaveMsg(MSG.helpers.saveTo(res.collection, actionLabel));
      }
      resetFn(dflt);
      // 출판물 저장 후 자동 복귀
      if (source === '출판물' && fromPub) {
        if (siFromOutlineText) {
          // text 모드 출처 — 로컬 복귀 (App.jsx onSaveReturn 우회)
          setFromPub(false);
          setSiFromOutlineText(false);
          // 점 단위 갱신: 방금 저장한 (point_text, pub_code) 매칭 키만 추가.
          // [준비]>[연설] App.jsx:610-619 패턴 동일 의미 (matchPubPoints 재호출 X).
          if (form.point_summary && form.pub_code) {
            const txtKey = `${_normText(form.point_summary)}__${_normPub(form.pub_code)}`;
            setTxtPubMatched(s => new Set([...s, txtKey]));
          }
          setTimeout(() => {
            setSubTab('gather');
            setGatherMode('text');
          }, 800);
        } else if (onSaveReturn) {
          // [준비]>[연설] 출처 — 기존 흐름
          const savedData = { pub_code: form.pub_code, pub_title: form.pub_title, reference: form.reference, content: form.content, point: form.point_summary };
          setFromPub(false);
          setTimeout(() => onSaveReturn(savedData), 800);
        }
      }
    } catch (e) { setSaveMsg(MSG.fail.save + e.message); }
    finally { setSaving(false); }
  };

  const tagColor = { speech_points: 'var(--accent)', speech_expressions: 'var(--accent-orange)', publications: 'var(--accent-purple)' };
  const tagLabel = { speech_points: '연설 요점', speech_expressions: '표현/예시', publications: '출판물' };




  // ── JSX ──
  return (<>
        {/* 추가 탭 상단 세그먼트 — [입력] 탑레벨에선 숨김. embedded 모드에서도 숨김. */}
        {!embedded && pageType !== 'input' && (
        <div style={{ ...S.pillContainer, marginBottom: 16 }}>
          {[['gather', '가져오기'], ['structure', '구조화'], ['drafts', '임시저장']].map(([k, l]) => (
            <button key={k} onClick={() => { setSubTab(k); if (k === 'gather') setGatherForm(p => ({ ...p, source: '전처리' })); if (k === 'drafts') { draftList().then(r => setDbDrafts(r.drafts || [])).catch(() => {}); if (memoEntries.length === 0) listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}); } }} style={S.pillL2(subTab === k)}>{l}</button>
          ))}
        </div>
        )}

        {/* ═══ 구조화 탭 ═══ */}
        {subTab === 'structure' && (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 12 }}>
          {/* 입력 하위 — 카드 헤더 언더라인 */}
          {pageType !== 'input' && (
          <div style={S.underlineContainer}>
            {(pageType === 'input'
              ? [['quick_input', '빠른 입력', 'var(--accent-orange)']]
              : [['speech_input', '연설', 'var(--accent)'], ['discussion', '토의', 'var(--accent-blue)'], ['service', '봉사 모임', 'var(--accent)'], ['visit_input', '방문', 'var(--accent-orange)']]
            ).map(([k, l, c]) => {
              const active = structureMode === k;
              return (
                <button key={k} onClick={() => { setStructureMode(k); setSaveMsg(''); }} style={S.underlineTab(active, c)}>
                  <span style={S.underlineLabel(active, c)}>{l}</span>
                  <span style={{ fontSize: '0.571rem', visibility: 'hidden' }}>0</span>
                </button>
              );
            })}
          </div>
          )}
          <div style={{ padding: 14 }}>

          {/* ─── 빠른 입력 ─── */}

          {['discussion', 'service', 'visit_input'].includes(structureMode) && (
            <ManageStructureOther
              structureMode={structureMode}
              discForm={discForm} setDiscForm={setDiscForm}
              svcForm={svcForm} setSvcForm={setSvcForm}
              visitForm={visitForm} setVisitForm={setVisitForm}
              saving={saving} saveMsg={saveMsg} saveTab={saveStructureForm}
              cats={cats} setCats={setCats}
              catEditing={catEditing} setCatEditing={setCatEditing}
              catNewVal={catNewVal} setCatNewVal={setCatNewVal}
            />
          )}

          </div>
        </div>
        )}

        {/* ═══ 가져오기 탭 ═══ */}
        {subTab === 'gather' && (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden' }}>
          {/* 전처리 상위 탭 — 카드 헤더 언더라인. embedded 모드에선 숨김 (forcedMode 잠금). */}
            {!embedded && (
            <div style={S.underlineContainer}>
              {[['file', '파일 업로드', 'var(--accent)'], ['text', '골자 입력', 'var(--accent)'], ['stt', 'STT 업로드', 'var(--accent)'], ['pub_input', '출판물', 'var(--accent-purple)']].map(([k, l, c]) => {
                const active = gatherMode === k;
                return (
                  <button key={k} onClick={() => setGatherMode(k)} style={S.underlineTab(active, c)}>
                    <span style={S.underlineLabel(active, c)}>{l}</span>
                    <span style={{ fontSize: '0.571rem', visibility: 'hidden' }}>0</span>
                  </button>
                );
              })}
            </div>
            )}
          <div style={{ padding: 14 }}>
          {/* 기존 메모 출처 선택 — 제거됨 (입력 탭으로 이동) */}
          {false && (<>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
          }}>
            {['연설', '토의', '봉사 모임', '방문', 'JW 방송'].map(s => (
              <button key={s} onClick={() => setGatherForm(p => ({ ...p, source: s, sub_source: s === '연설' ? '공개 강연' : s === '토의' ? '파수대' : '', entry_type: s === '토의' ? 'expression' : s === '봉사 모임' ? 'speech_point' : p.entry_type, service_type: '', outline_num: '', outline_type: '', outline_title: '', subtopic: '', point_id: '', point_summary: '', pub_code: '', topic: '' }))} style={{
                flex: 1, padding: '5px 0', borderRadius: 8, fontSize: '0.786rem', fontWeight: gatherForm.source === s ? 700 : 500,
                border: 'none',
                background: gatherForm.source === s ? 'var(--bg-card, #fff)' : 'transparent',
                color: gatherForm.source === s ? 'var(--c-text-dark)' : 'var(--c-muted)',
                cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                transition: 'all 0.2s ease',
                boxShadow: gatherForm.source === s ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{s}</button>
            ))}
          </div>
          <div style={{ height: 1, background: 'var(--bd-medium)', margin: '10px 0' }} />
          </>)}

          {subTab === 'gather' && (
            <div style={{ marginBottom: 8 }}>

              {/* ═══ 1. 파일 업로드 모드 ═══ */}
              {gatherMode === 'file' && (
                <div>
                  <input type="file" accept=".md,.txt" id="mdUpload" multiple style={{ display: 'none' }} onChange={async e => {
                    const files = Array.from(e.target.files || []);
                    if (!files.length) return;
                    e.target.value = '';
                    setMdParsing(true); setMdParsed(null); setMdResult('');
                    try {
                      const res = await parseMdFiles(files);
                      setMdParsed(res);
                    } catch (err) { setMdResult(MSG.fail.parse + err.message); }
                    finally { setMdParsing(false); }
                  }} />
                  <button onClick={() => document.getElementById('mdUpload').click()} disabled={mdParsing} style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, border: '2px dashed var(--accent)',
                    background: 'var(--tint-green)', color: 'var(--accent)', fontSize: '0.929rem', fontWeight: 600, cursor: 'pointer',
                  }}>{mdParsing ? '파싱 중...' : '전처리 md 파일 선택'}</button>

                  {mdParsed && mdParsed.files && (() => {
                    const outlines = mdParsed.files.filter(f => f.file_format === 'outline');
                    const speeches = mdParsed.files.filter(f => f.file_format === 'speech');
                    const pubs = mdParsed.files.filter(f => f.file_format === 'publication');
                    const originals = mdParsed.files.filter(f => f.file_format === 'original');
                    const groups = [
                      { label: '📋 골자', items: outlines, color: 'var(--accent)', saveKey: 'outline' },
                      { label: '🎤 연설', items: speeches, color: 'var(--accent-orange)', saveKey: 'speech' },
                      { label: '📚 출판물', items: pubs, color: 'var(--accent-purple)', saveKey: 'publication' },
                      { label: '📄 원문', items: originals, color: 'var(--accent-blue)', saveKey: 'original' },
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
                            {allDone ? <span style={{ fontSize: '0.786rem', color: 'var(--accent)' }}>완료</span> : (
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
                                if (parts.length) setMdResult(MSG.helpers.parseStats(parts));
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
                                <span style={{ color: fSt === 'done' ? 'var(--accent)' : fSt === 'updated' ? 'var(--accent-brown)' : fSt === 'error' ? 'var(--c-danger)' : fSt === 'skipped' ? 'var(--c-dim)' : hasWarn ? 'var(--c-danger)' : 'var(--accent)', fontSize: '0.786rem' }}>
                                  {fSt === 'done' ? '✅' : fSt === 'updated' ? '🔄' : fSt === 'saving' ? '⏳' : fSt === 'error' ? '❌' : fSt === 'skipped' ? '⏭️' : fSt === 'dup' ? '⚠️' : hasWarn ? '⚠️' : '📄'}
                                </span>
                                {isPub ? <>
                                  {ot && <span style={{ color: 'var(--accent-purple)', fontWeight: 600 }}>{ot}{on && on !== ot ? ` ${on}${/^\d+$/.test(on) ? '번' : ''}` : ''}</span>}
                                  <span style={{ fontWeight: 600 }}>{m.title || '출판물'}</span>
                                  <span style={{ color: 'var(--accent-purple)', fontSize: '0.786rem' }}>출판물</span>
                                </> : isOrig ? <>
                                  <span style={{ fontWeight: 600 }}>{ot}{on && on !== ot ? ` ${on}${/^\d+$/.test(on) ? '번' : ''}` : ''}</span>
                                  <span style={{ color: 'var(--accent-blue)', fontSize: '0.786rem' }}>원문</span>
                                  {m.title && <span style={{ color: 'var(--c-dim)' }}>— {m.title}</span>}
                                  {m.speaker && <span style={{ color: 'var(--accent-orange)' }}>· {m.speaker}</span>}
                                  {m.date && <span style={{ color: 'var(--c-dim)' }}>· {m.date}</span>}
                                </> : <>
                                  <span style={{ fontWeight: 600 }}>{ot}{on && on !== ot ? ` ${on}${/^\d+$/.test(on) ? '번' : ''}` : ''}</span>
                                  {m.outline_title && <span style={{ color: 'var(--c-dim)' }}>— {m.outline_title}</span>}
                                  {m.speaker && <span style={{ color: 'var(--accent-orange)' }}>· {m.speaker}</span>}
                                  {m.date && <span style={{ color: 'var(--c-dim)' }}>· {m.date}</span>}
                                  {m.outline_version && <span style={{ color: 'var(--c-dim)' }}>· v{m.outline_version}</span>}
                                </>}
                                {fSt === 'done' && <span style={{ color: 'var(--accent)', fontSize: '0.786rem', marginLeft: 'auto' }}>저장됨</span>}
                                {fSt === 'updated' && <span style={{ color: 'var(--accent-brown)', fontSize: '0.786rem', marginLeft: 'auto' }}>{fMsg || '참조 추가'}</span>}
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
                                      padding: '1px 6px', borderRadius: 4, border: '1px solid var(--c-danger)', background: 'transparent',
                                      color: 'var(--c-danger)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600,
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
                                    <div style={{ marginTop: 3, padding: '4px 8px', borderRadius: 6, background: '#c4410a08', fontSize: '0.786rem', color: 'var(--c-danger)', lineHeight: 1.6 }}>
                                      {f.warnings.map((w, wi) => <div key={wi}>· {w}</div>)}
                                    </div>
                                  )}
                                </div>
                              )}
                              {fSt === 'error' && <div style={{ color: 'var(--c-danger)', fontSize: '0.786rem', marginTop: 2 }}>{fMsg}</div>}
                              {fSt === 'dup' && (
                                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                                  <span style={{ fontSize: '0.786rem', color: 'var(--accent-brown)', flex: 1 }}>{fMsg}</span>
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
                  {mdResult && <div style={{ marginTop: 6, fontSize: '0.786rem', color: getStatusColor(mdResult) }}>{mdResult}</div>}
                </div>
              )}

              {/* ═══ 2. txt 원본 모드 (플레이스홀더) ═══ */}
              {/* ═══ STT 업로드 모드 — 목록 뷰 ═══ */}
              {gatherMode === 'stt' && !sttReviewJob && (
                <div>
                  {/* 업로드 영역 */}
                  <div
                    onDrop={handleSttDrop}
                    onDragOver={handleSttDragOver}
                    style={{
                      border: '2px dashed var(--bd)',
                      borderRadius: 8,
                      padding: '24px 16px',
                      textAlign: 'center',
                      background: 'var(--bg-subtle)',
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ fontSize: '0.929rem', marginBottom: 8, color: 'var(--c-text-dark)' }}>
                      음성/영상/텍스트 파일을 드래그하거나 선택하세요
                    </div>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', marginBottom: 12 }}>
                      mp4, mp3, wav, txt 등 · 음성/영상 300MB · 텍스트 10MB
                    </div>
                    <input
                      ref={sttFileInputRef}
                      type="file"
                      accept=".mp4,.mkv,.avi,.mov,.webm,.flv,.wmv,.mp3,.wav,.m4a,.flac,.ogg,.aac,.txt"
                      onChange={handleSttFileSelect}
                      disabled={sttUploading}
                      style={{ display: 'none' }}
                    />
                    <button
                      onClick={() => sttFileInputRef.current?.click()}
                      disabled={sttUploading}
                      style={{
                        padding: '8px 20px',
                        borderRadius: 8,
                        border: '1px solid var(--accent-orange)',
                        background: sttUploading ? 'var(--bg-subtle)' : 'var(--accent-orange)',
                        color: sttUploading ? 'var(--c-dim)' : '#fff',
                        fontSize: '0.857rem',
                        fontWeight: 600,
                        cursor: sttUploading ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {sttUploading ? '업로드 중...' : '파일 선택'}
                    </button>
                    {sttUploadStatus && (
                      <div style={{
                        marginTop: 10,
                        fontSize: '0.786rem',
                        color: getStatusColor(sttUploadStatus),
                      }}>{sttUploadStatus}</div>
                    )}
                  </div>

                  {/* 작업 목록 */}
                  <div>
                    <div style={{ fontSize: '0.857rem', color: 'var(--c-text-dark)', marginBottom: 10, fontWeight: 600 }}>
                      작업 목록 ({sttJobs.length})
                    </div>

                    {sttJobs.length === 0 && (
                      <div style={{
                        textAlign: 'center', padding: '20px', color: 'var(--c-dim)',
                        fontSize: '0.857rem', background: 'var(--bg-subtle)', borderRadius: 8,
                      }}>
                        업로드된 파일이 없습니다
                      </div>
                    )}

                    {sttJobs.map(job => (
                      <div key={job.job_id} style={{
                        border: '1px solid var(--bd)',
                        borderRadius: 8,
                        padding: '10px 12px',
                        marginBottom: 8,
                        background: 'var(--bg-card)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                          <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                            {job.original_filename}
                          </div>
                          <div style={{
                            fontSize: '0.714rem',
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: sttStatusColor(job.status) + '22',
                            color: sttStatusColor(job.status),
                            fontWeight: 600,
                          }}>
                            {sttStatusLabel(job)}
                          </div>
                        </div>

                        <div style={{ fontSize: '0.714rem', color: 'var(--c-dim)', marginBottom: 6 }}>
                          {(job.file_size_bytes / 1024 / 1024).toFixed(1)}MB
                          {job.source_type === 'text'
                            ? ' · —'
                            : job.duration_seconds > 0 && ` · ${formatSttDuration(job.duration_seconds)}`}
                          {job.estimated_transcribe_seconds > 0 && job.status === 'uploaded' && ` · 예상 변환 ${formatSttDuration(job.estimated_transcribe_seconds)}`}
                        </div>

                        {job.status === 'transcribing' && (() => {
                          const progress = computeTimeProgress(job);
                          const elapsed = computeElapsed(job);
                          const isOverdue = job.estimated_transcribe_seconds > 0 && elapsed > job.estimated_transcribe_seconds;
                          return (
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ height: 4, background: 'var(--bg-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{
                                  width: `${Math.round(progress * 100)}%`,
                                  height: '100%',
                                  background: isOverdue ? 'var(--c-danger)' : 'var(--accent-gold)',
                                  transition: 'width 1s linear',
                                }} />
                              </div>
                              <div style={{ fontSize: '0.714rem', color: 'var(--c-dim)', marginTop: 2 }}>
                                {formatSttDuration(elapsed)} / 약 {formatSttDuration(job.estimated_transcribe_seconds)}
                                {isOverdue && <span style={{ color: 'var(--c-danger)', marginLeft: 4 }}>(예상 초과)</span>}
                              </div>
                            </div>
                          );
                        })()}

                        {job.status === 'failed' && job.error_message && (
                          <div style={{ fontSize: '0.714rem', color: 'var(--c-danger)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            ⚠️ {job.error_message.slice(0, 120)}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 6 }}>
                          {job.status === 'uploaded' && (
                            <button onClick={() => handleSttTranscribe(job.job_id)}
                              style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-orange)', background: 'var(--accent-orange)', color: '#fff', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                              변환 시작
                            </button>
                          )}
                          {(job.status === 'transcribed' || job.status === 'reviewing') && (
                            <button onClick={() => enterSttReview(job)}
                              style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-blue)', background: 'var(--accent-blue)', color: '#fff', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                              검토하기
                            </button>
                          )}
                          {job.status === 'draft_sent' && (
                            <button onClick={() => handleStartSttDraftEdit(
                              job.linked_draft_id || '',
                              job.final_meta?.speaker || '',
                              job.final_meta?.date || '',
                              job.job_id,
                            )}
                              style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                              이어서 편집
                            </button>
                          )}
                          {job.status === 'failed' && (
                            <button onClick={() => handleSttTranscribe(job.job_id)}
                              style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--accent-gold)', background: 'var(--accent-gold)', color: '#fff', fontSize: '0.714rem', cursor: 'pointer', fontWeight: 600 }}>
                              재시도
                            </button>
                          )}
                          <button onClick={() => handleSttDelete(job.job_id, job.original_filename)}
                            disabled={job.status === 'transcribing' || job.status === 'correcting'}
                            style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.714rem', cursor: (job.status === 'transcribing' || job.status === 'correcting') ? 'not-allowed' : 'pointer' }}>
                            삭제
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ═══ STT 검토 화면 ═══ */}
              {gatherMode === 'stt' && sttReviewJob && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                  {/* 헤더 */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    background: 'var(--bg-card)', border: '1px solid var(--bd)', borderRadius: 8,
                  }}>
                    <button onClick={exitSttReview}
                      style={{ padding: '4px 10px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 6, fontSize: '0.786rem', cursor: 'pointer' }}>
                      ← 돌아가기
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sttReviewJob.original_filename}
                      </div>
                      <div style={{ fontSize: '0.714rem', color: 'var(--c-dim)' }}>
                        {sttReviewJob.source_type === 'text' ? '—' : formatSttDuration(sttReviewJob.duration_seconds || 0)} · {((sttReviewJob.file_size_bytes || 0) / 1024 / 1024).toFixed(1)}MB
                      </div>
                    </div>
                  </div>

                  {/* 재교정 권장 배너 (골자 또는 verse mode 변경 + cloud_text 존재 시) */}
                  {(() => {
                    const curOid = sttReviewMeta?.outline_id || '';
                    const hasCloud = !!sttReviewJob?.cloud_text;
                    const changed = curOid !== sttLastCorrectedOutlineId || sttVerseMode !== sttLastCorrectedVerseMode;
                    const dismissKey = `${curOid}:${sttVerseMode}`;
                    if (!hasCloud || !changed || sttWarningDismissed === dismissKey) return null;
                    return (
                      <div style={{
                        padding: '10px 14px', borderRadius: 8,
                        background: 'var(--tint-orange)',
                        border: '1px solid var(--accent-orange)',
                        color: 'var(--c-text)', fontSize: '0.786rem', lineHeight: 1.5,
                        display: 'flex', alignItems: 'center', gap: 8,
                      }}>
                        <span style={{ flex: 1 }}>⚠️ 골자 또는 성구 주입 모드가 변경됨 — 재교정 권장</span>
                        <button type="button"
                          onClick={() => setSttWarningDismissed(dismissKey)}
                          title="현재 조합에 한해 숨김"
                          style={{ padding: '2px 8px', border: 'none', background: 'transparent', color: 'var(--c-muted)', cursor: 'pointer', fontSize: '0.857rem', lineHeight: 1 }}>
                          ✕
                        </button>
                      </div>
                    );
                  })()}

                  {/* 교정 옵션 카드 */}
                  <div style={{
                    padding: '12px 14px', background: 'var(--bg-card)',
                    border: '1px solid var(--bd)', borderRadius: 8,
                  }}>
                    <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)', marginBottom: 10 }}>
                      교정 옵션
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* 파서 (고정) */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.786rem', color: 'var(--c-dim)' }}>
                        <input type="checkbox" checked readOnly disabled style={{ cursor: 'not-allowed' }} />
                        <span>파서 규칙 (항상 자동 적용)</span>
                      </div>
                      {/* 로컬 LLM */}
                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.786rem', color: 'var(--c-text-dark)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={sttReviewUseLocal}
                            onChange={e => setSttReviewUseLocal(e.target.checked)}
                            disabled={sttReviewCorrecting}
                            style={{ cursor: 'pointer' }} />
                          <span>로컬 LLM (반복/공백 정리)</span>
                        </label>
                        {sttReviewUseLocal && (
                          <div style={{ marginLeft: 22, marginTop: 4 }}>
                            <input type="text" value={sttReviewLocalModel}
                              onChange={e => setSttReviewLocalModel(e.target.value)}
                              disabled={sttReviewCorrecting}
                              placeholder="gemma4:e4b"
                              style={{ width: 200, padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.714rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}
                            />
                          </div>
                        )}
                      </div>
                      {/* 클라우드 LLM */}
                      <div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.786rem', color: 'var(--c-text-dark)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={sttReviewUseCloud}
                            onChange={e => setSttReviewUseCloud(e.target.checked)}
                            disabled={sttReviewCorrecting}
                            style={{ cursor: 'pointer' }} />
                          <span>클라우드 LLM (정교한 문장 교정)</span>
                        </label>
                        {sttReviewUseCloud && (
                          <div style={{ marginLeft: 22, marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <select value={sttReviewCloudPlatform}
                              onChange={e => {
                                const p = e.target.value;
                                setSttReviewCloudPlatform(p);
                                const first = sttAiModels[p]?.[0];
                                if (first) setSttReviewCloudModel(first.value || '');
                              }}
                              disabled={sttReviewCorrecting}
                              style={{ padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.714rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}>
                              {Object.keys(sttAiModels).map(p => (
                                <option key={p} value={p}>{p}</option>
                              ))}
                            </select>
                            <select value={sttReviewCloudModel}
                              onChange={e => setSttReviewCloudModel(e.target.value)}
                              disabled={sttReviewCorrecting}
                              style={{ padding: '4px 8px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: '0.714rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none' }}>
                              {(sttAiModels[sttReviewCloudPlatform] || []).map(m => (
                                <option key={m.value} value={m.value}>{m.label || m.value}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 교정 버튼 */}
                    <div style={{ display: 'flex', gap: 6, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button onClick={applySttCorrection}
                        disabled={sttReviewCorrecting}
                        style={{
                          padding: '7px 16px',
                          border: '1px solid var(--accent-orange)',
                          background: sttReviewCorrecting ? 'var(--bg-subtle)' : 'var(--accent-orange)',
                          color: sttReviewCorrecting ? 'var(--c-dim)' : '#fff',
                          borderRadius: 8, fontSize: '0.786rem', fontWeight: 600,
                          cursor: sttReviewCorrecting ? 'not-allowed' : 'pointer',
                        }}>
                        {sttReviewCorrecting ? '교정 중...' : (sttReviewJob.final_text ? '다시 교정' : '교정 적용')}
                      </button>
                      {sttReviewStatus && (
                        <div style={{ fontSize: '0.714rem', color: getStatusColor(sttReviewStatus) }}>
                          {sttReviewStatus}
                        </div>
                      )}
                      {sttReviewJob.correction_elapsed && Object.keys(sttReviewJob.correction_elapsed).length > 0 && (
                        <div style={{ marginLeft: 'auto', fontSize: '0.643rem', color: 'var(--c-dim)' }}>
                          {Object.entries(sttReviewJob.correction_elapsed).map(([k, v]) => `${k}: ${v}초`).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4탭 비교 뷰 */}
                  <div style={{
                    background: 'var(--bg-card)', border: '1px solid var(--bd)',
                    borderRadius: 8, overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', gap: 2, background: 'var(--bg-subtle)', padding: 2, overflowX: 'auto' }}>
                      {[
                        { key: 'raw', label: '원본', show: !!sttReviewJob.raw_text },
                        { key: 'parsed', label: '파서', show: !!sttReviewJob.parsed_text },
                        { key: 'local', label: '로컬', show: !!sttReviewJob.local_text },
                        { key: 'cloud', label: '클라우드', show: !!sttReviewJob.cloud_text },
                        { key: 'diff', label: '교정 diff', show: !!(sttReviewJob.parsed_text && sttReviewJob.cloud_text), badge: sttDiffPairCount },
                      ].filter(t => t.show).map(t => (
                        <button key={t.key} onClick={() => setSttReviewTab(t.key)}
                          style={{
                            flex: '1 1 0%', minWidth: 0, padding: '6px 10px', border: 'none',
                            background: sttReviewTab === t.key ? 'var(--bg-card)' : 'transparent',
                            color: sttReviewTab === t.key ? 'var(--accent)' : 'var(--c-muted)',
                            fontSize: '0.786rem', fontWeight: sttReviewTab === t.key ? 700 : 500,
                            cursor: 'pointer', borderRadius: 6, whiteSpace: 'nowrap',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          }}>
                          <span>{t.label}</span>
                          {t.badge > 0 && (
                            <span style={{
                              marginLeft: 2, padding: '1px 7px', borderRadius: 10,
                              background: 'var(--bg-muted)', color: 'var(--c-muted)',
                              fontSize: '0.714rem', fontWeight: 600, lineHeight: 1.4,
                            }}
                              title="신규 후보 N건">
                              {t.badge}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      if (sttReviewTab === 'diff') {
                        return (
                          <SttCorrectionDiff
                            parsedText={sttReviewJob.parsed_text || ''}
                            cloudText={sttReviewJob.cloud_text || ''}
                            corrections={sttCorrectionsData}
                            jobId={sttReviewJob.job_id || ''}
                            preprocDirty={preprocDirtyFlag}
                            onVariantAdded={() => sttCorrectionsGet().then(r => setSttCorrectionsData(r.data || null)).catch(() => {})}
                            showAlert={showAlert}
                            showConfirm={showConfirm}
                          />
                        );
                      }
                      const isLast = (sttReviewJob.cloud_text && sttReviewTab === 'cloud')
                        || (!sttReviewJob.cloud_text && sttReviewJob.local_text && sttReviewTab === 'local')
                        || (!sttReviewJob.cloud_text && !sttReviewJob.local_text && sttReviewJob.parsed_text && sttReviewTab === 'parsed');
                      const text = sttReviewTab === 'raw' ? sttReviewJob.raw_text
                        : sttReviewTab === 'parsed' ? sttReviewJob.parsed_text
                        : sttReviewTab === 'local' ? sttReviewJob.local_text
                        : sttReviewTab === 'cloud' ? sttReviewJob.cloud_text
                        : '';
                      if (isLast) {
                        return (
                          <textarea value={sttReviewFinalText}
                            onChange={e => setSttReviewFinalText(e.target.value)}
                            style={{
                              width: '100%', minHeight: 300, padding: 12,
                              border: 'none', outline: 'none', resize: 'vertical',
                              fontSize: '0.857rem', lineHeight: 1.6,
                              background: 'var(--bg-card)', color: 'var(--c-text-dark)',
                              fontFamily: 'inherit', boxSizing: 'border-box',
                            }}
                          />
                        );
                      }
                      return (
                        <div style={{
                          padding: 12, fontSize: '0.857rem', lineHeight: 1.6,
                          color: 'var(--c-text-dark)', whiteSpace: 'pre-wrap',
                          minHeight: 300, maxHeight: 500, overflowY: 'auto',
                        }}>
                          {text || '(빈 결과)'}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 기본 정보 (연사/날짜만 — 상세 정보는 임시저장 탭에서) */}
                  <div style={{
                    padding: '12px 14px', background: 'var(--bg-card)',
                    border: '1px solid var(--bd)', borderRadius: 8,
                  }}>
                    <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--c-text-dark)', marginBottom: 6 }}>
                      기본 정보
                    </div>
                    <div style={{ fontSize: '0.714rem', color: 'var(--c-dim)', marginBottom: 10 }}>
                      골자·수정은 임시저장 탭에서 입력합니다.
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.714rem', color: 'var(--c-muted)', marginBottom: 2 }}>연사 *</label>
                        <input type="text" value={sttReviewMeta.speaker}
                          onChange={e => setSttReviewMeta(m => ({ ...m, speaker: e.target.value }))}
                          placeholder="연사 이름"
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 6, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.714rem', color: 'var(--c-muted)', marginBottom: 2 }}>날짜 * <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>(YYMM)</span></label>
                        <input type="text" value={sttReviewMeta.speech_date}
                          onChange={e => setSttReviewMeta(m => ({ ...m, speech_date: e.target.value }))}
                          placeholder="YYMM (예: 2604)"
                          maxLength={4}
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 6, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box', textAlign: 'center' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.714rem', color: 'var(--c-muted)', marginBottom: 2 }}>유형 *</label>
                        <select value={sttReviewMeta.source || 'speech'}
                          onChange={e => setSttReviewMeta(m => ({ ...m, source: e.target.value }))}
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 6, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box' }}>
                          <option value="speech">연설</option>
                          <option value="service">봉사 모임</option>
                          <option value="visit">방문</option>
                          <option value="memo">메모</option>
                        </select>
                      </div>
                      {sttReviewMeta.source === 'speech' && (
                        <div>
                          <label style={{ display: 'block', fontSize: '0.714rem', color: 'var(--c-muted)', marginBottom: 2 }}>
                            골자 (선택)
                          </label>
                          {sttReviewOutlineOpen ? (
                            <div style={{ position: 'relative' }}>
                              <input type="text"
                                value={sttReviewOutlineQuery}
                                onChange={e => setSttReviewOutlineQuery(e.target.value)}
                                onFocus={() => setSttReviewOutlineFocus(true)}
                                onBlur={() => setTimeout(() => setSttReviewOutlineFocus(false), 200)}
                                placeholder="골자 번호 또는 제목 검색..."
                                autoFocus
                                style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 6, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box' }}
                              />
                              {sttReviewOutlineFocus && sttReviewOutlineQuery.trim() && sttReviewOutlines.length > 0 && (
                                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 180, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 2 }}>
                                  {sttReviewOutlines.map((g, gi) => {
                                    const pfx = getOutlinePrefix(g.outline_type, g.outline_num || g.num);
                                    const ver = g.outline_version || '';
                                    return (
                                      <div key={`${pfx}_${ver}_${gi}`}
                                        onMouseDown={() => { selectSttReviewOutline(g); setSttReviewOutlineOpen(false); }}
                                        style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.714rem', flexShrink: 0 }}>{pfx}</span>
                                        {ver && <span style={{ padding: '1px 5px', borderRadius: 3, fontSize: '0.643rem', fontWeight: 600, background: 'var(--tint-blue, #eef4fb)', color: 'var(--accent-blue)', flexShrink: 0 }}>v{ver}</span>}
                                        <span style={{ flex: 1, fontSize: '0.714rem', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title || ''}</span>
                                        <span style={{ fontSize: '0.571rem', color: 'var(--c-dim)', flexShrink: 0 }}>{getOutlineLabel(g.outline_type, { withCategory: true })}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div style={{ marginTop: 4, display: 'flex', gap: 4 }}>
                                <button type="button"
                                  onClick={() => setSttReviewOutlineOpen(false)}
                                  style={{ padding: '3px 10px', fontSize: '0.714rem', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 4, cursor: 'pointer' }}>
                                  접기 ▲
                                </button>
                                <button type="button"
                                  onClick={() => {
                                    setSttReturnAfterSave(true);
                                    setSttReviewOutlineOpen(false);
                                    setGatherMode('text');
                                  }}
                                  title="검색 결과에 없는 골자를 새로 등록 후 자동 복귀"
                                  style={{ padding: '3px 10px', fontSize: '0.714rem', border: '1px solid var(--accent)', background: 'var(--bg-card)', color: 'var(--accent)', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                                  + 새 골자 등록
                                </button>
                              </div>
                            </div>
                          ) : sttReviewMeta.outline_id ? (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button type="button"
                                  onClick={() => setSttReviewOutlineOpen(true)}
                                  title="다시 검색하려면 클릭"
                                  style={{ flex: 1, minWidth: 0, padding: '6px 10px', fontSize: '0.786rem', border: '1px solid var(--accent)', background: 'var(--tint-green)', color: 'var(--accent)', borderRadius: 6, cursor: 'pointer', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'inherit' }}>
                                  {sttReviewOutlineQuery || sttReviewMeta.outline_id}
                                </button>
                                <button type="button"
                                  onClick={() => selectSttReviewOutline(null)}
                                  title="선택 해제"
                                  style={{ padding: '6px 10px', fontSize: '0.786rem', border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                                  ✕
                                </button>
                              </div>
                              {sttReviewVerses.length > 0 && (
                                <div style={{
                                  marginTop: 8, padding: 2, background: 'var(--bg-subtle)',
                                  borderRadius: 6, display: 'flex', gap: 2,
                                }}>
                                  {[
                                    { key: 'none', label: '없음' },
                                    { key: 'ref_only', label: 'reference 만' },
                                    { key: 'reading_text', label: '낭독 본문' },
                                    { key: 'all_text', label: '전체 본문' },
                                  ].map(m => (
                                    <button key={m.key} type="button"
                                      onClick={() => setSttVerseMode(m.key)}
                                      title={m.key === 'reading_text' ? '낭독 성구 본문만 프롬프트에 포함 (기본)'
                                        : m.key === 'all_text' ? '모든 성구 본문 포함 (토큰 많음)'
                                        : m.key === 'ref_only' ? 'reference 목록만 (본문 없음)'
                                        : '성구 주입 안 함'}
                                      style={{
                                        flex: '1 1 0%', minWidth: 0, padding: '5px 6px', border: 'none',
                                        background: sttVerseMode === m.key ? 'var(--bg-card)' : 'transparent',
                                        color: sttVerseMode === m.key ? 'var(--accent)' : 'var(--c-muted)',
                                        fontSize: '0.714rem', fontWeight: sttVerseMode === m.key ? 700 : 500,
                                        cursor: 'pointer', borderRadius: 4, whiteSpace: 'nowrap',
                                        fontFamily: 'inherit',
                                      }}>
                                      {m.label}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {sttReviewVerses.length > 0 && (
                                <div style={{
                                  marginTop: 6, fontSize: '0.714rem', color: 'var(--c-muted)',
                                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, lineHeight: 1.7,
                                }}>
                                  <span style={{ flexShrink: 0 }}>📖</span>
                                  {sttReviewVerses.slice(0, 5).map((v, i) => {
                                    const isReading = v.includes('(낭독)');
                                    const highlight = isReading && sttVerseMode === 'reading_text';
                                    return (
                                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {i > 0 && <span style={{ color: 'var(--c-dim)' }}>·</span>}
                                        <span style={highlight ? { color: 'var(--accent)', fontWeight: 700 } : undefined}>{v}</span>
                                      </span>
                                    );
                                  })}
                                  {sttReviewVerses.length > 5 && (
                                    <button type="button"
                                      onClick={() => setSttVersesModalOpen(true)}
                                      style={{ padding: 0, border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '0.714rem', textDecoration: 'underline', fontFamily: 'inherit' }}>
                                      +{sttReviewVerses.length - 5} more
                                    </button>
                                  )}
                                </div>
                              )}
                              {sttVerseMode === 'reading_text' && sttReviewVerses.length > 0
                                && sttReviewVerses.filter(v => v.includes('(낭독)')).length === 0 && (
                                <div style={{
                                  marginTop: 4, fontSize: '0.643rem', color: 'var(--c-dim)', lineHeight: 1.5,
                                }}>
                                  ℹ️ 이 골자엔 낭독 성구 정보가 없어 reference 만 주입됩니다 (전체 본문 모드 선택 시 모든 성구 본문 포함 가능)
                                </div>
                              )}
                            </>
                          ) : (
                            <button type="button"
                              onClick={() => setSttReviewOutlineOpen(true)}
                              style={{ width: '100%', padding: '6px 10px', fontSize: '0.786rem', border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-muted)', borderRadius: 6, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                              골자 선택 ▼
                            </button>
                          )}
                        </div>
                      )}
                      <div>
                        <label style={{ display: 'block', fontSize: '0.714rem', color: 'var(--c-muted)', marginBottom: 2 }}>주제 (선택)</label>
                        <input type="text" value={sttReviewMeta.topic || ''}
                          onChange={e => setSttReviewMeta(m => ({ ...m, topic: e.target.value }))}
                          placeholder="이 연설의 주제 (임시저장에서 식별용)"
                          style={{ width: '100%', padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 6, fontSize: '0.786rem', background: 'var(--bg-card)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 하단 액션 */}
                  <div style={{
                    display: 'flex', gap: 8, justifyContent: 'flex-end',
                    padding: '10px 0',
                  }}>
                    <button onClick={exitSttReview}
                      style={{ padding: '8px 18px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 8, fontSize: '0.857rem', cursor: 'pointer' }}>
                      취소
                    </button>
                    {(() => {
                      const disabled = !sttReviewMeta.speaker.trim() || !sttReviewMeta.speech_date || !sttReviewFinalText.trim() || sttReviewCorrecting;
                      return (
                        <button onClick={saveSttSpeech}
                          disabled={disabled}
                          style={{
                            padding: '8px 22px',
                            border: '1px solid var(--accent)',
                            background: disabled ? 'var(--bg-subtle)' : 'var(--accent)',
                            color: disabled ? 'var(--c-dim)' : '#fff',
                            borderRadius: 8, fontSize: '0.857rem', fontWeight: 600,
                            cursor: disabled ? 'not-allowed' : 'pointer',
                          }}>
                          임시저장으로 보내기
                        </button>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* 골자 성구 전체 보기 모달 */}
              {sttVersesModalOpen && (
                <Modal
                  title={`골자 성구 전체 (${sttReviewVerses.length}개)`}
                  onClose={() => setSttVersesModalOpen(false)}
                  actions={
                    <button onClick={() => setSttVersesModalOpen(false)}
                      style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>
                      닫기
                    </button>
                  }>
                  <div style={{ fontFamily: 'monospace', fontSize: '0.857rem', lineHeight: 1.7 }}>
                    {sttReviewVerses.map((v, i) => {
                      const isReading = v.includes('(낭독)');
                      const highlight = isReading && sttVerseMode === 'reading_text';
                      return (
                        <div key={i}>
                          - {highlight
                            ? <b style={{ color: 'var(--accent)' }}>{v}</b>
                            : <span>{v}</span>}
                        </div>
                      );
                    })}
                  </div>
                </Modal>
              )}

              {/* 임시저장 전달 완료 모달 */}
              {sttSavedModal && (
                <div style={{
                  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
                  background: 'rgba(0,0,0,0.5)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: 20,
                }}
                onClick={(e) => { if (e.target === e.currentTarget) setSttSavedModal(null); }}>
                  <div style={{
                    background: 'var(--bg-card)', borderRadius: 12, padding: 24,
                    maxWidth: 400, width: '100%',
                  }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
                      ✓ 임시저장 완료
                    </div>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 16 }}>
                      임시저장 탭에서 유형/골자/수정을 입력하고 최종 저장하세요.
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => {
                        setSttSavedModal(null);
                        setSttReviewJob(null);
                        sttLoadJobs();
                      }} style={{ padding: '7px 14px', border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-muted)', borderRadius: 6, fontSize: '0.786rem', cursor: 'pointer' }}>
                        목록으로
                      </button>
                      <button onClick={async () => {
                        const draftId = sttSavedModal?.draft_id || '';
                        const speaker = sttReviewMeta.speaker;
                        const date = sttReviewMeta.speech_date;
                        const jobId = sttReviewJob?.job_id || '';
                        setSttSavedModal(null);
                        setSttReviewJob(null);
                        sttLoadJobs();
                        await handleStartSttDraftEdit(draftId, speaker, date, jobId);
                      }} style={{ padding: '7px 14px', border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', borderRadius: 6, fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>
                        이어서 편집
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ 3. 골자 입력 모드 (gatherMode='text') ═══ */}
              {gatherMode === 'text' && (
                <div>
                  {/* DOCX에서 불러오기 */}
                  <div style={{ marginBottom: 8 }}>
                    <input type="file" accept=".docx" id="docxLoad" style={{ display: 'none' }} onChange={async e => {
                      const f = e.target.files && e.target.files[0];
                      e.target.value = '';
                      if (!f) return;
                      if (txtContent && txtContent.trim() && !await showConfirm('기존 입력 내용을 DOCX 내용으로 덮어씁니다. 계속하시겠습니까?')) return;
                      setTxtDocxLoading(true); setTxtResult('');
                      try {
                        const { text, meta } = await docxToText(f);
                        setTxtContent(text || '');
                        setTxtParsed([]);
                        setTxtMeta(p => ({
                          ...p,
                          outlineType: meta.outline_type || p.outlineType,
                          outlineNum: meta.outline_num || p.outlineNum,
                          version: meta.outline_version || p.version,
                          outlineTitle: meta.outline_title || p.outlineTitle,
                          note: meta.note || '',
                          duration: meta.total_time != null ? `${meta.total_time}분` : p.duration,
                          year: '',
                        }));
                        setTxtResult(MSG.helpers.convertDocx());
                      } catch (err) {
                        setTxtResult(MSG.fail.convert + err.message);
                      } finally {
                        setTxtDocxLoading(false);
                      }
                    }} />
                    <button onClick={() => document.getElementById('docxLoad').click()} disabled={txtDocxLoading} style={{
                      width: '100%', padding: '10px 0', borderRadius: 8, border: '2px dashed var(--accent-blue)',
                      background: 'var(--tint-blue, #eef4fb)', color: 'var(--accent-blue)',
                      fontSize: '0.857rem', fontWeight: 600,
                      cursor: txtDocxLoading ? 'wait' : 'pointer', fontFamily: 'inherit',
                    }}>{txtDocxLoading ? 'DOCX 변환 중...' : '📄 DOCX에서 불러오기'}</button>
                  </div>
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
                            setTxtMeta(p => ({ ...p, outlineType: code, year: '' }));
                          }} style={{
                            flex: 1, padding: '5px 0', border: 'none', borderRadius: 8, fontSize: '0.786rem', fontWeight: active ? 700 : 500,
                            background: active ? 'var(--bg-card, #fff)' : 'transparent', color: active ? 'var(--accent)' : 'var(--c-muted)',
                            cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.15s',
                          }}>{t.name}</button>;
                        })}
                      </div>
                      {hasSub && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 8, background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2 }}>
                          {mainType.sub.map(s => {
                            const active = txtMeta.outlineType === s.code;
                            return <button key={s.code} onClick={() => {
                              setTxtMeta(p => ({ ...p, outlineType: s.code, year: '' }));
                            }} style={{
                              flex: 1, padding: '5px 0', border: 'none', borderRadius: 8, fontSize: '0.786rem', fontWeight: active ? 700 : 500,
                              background: active ? 'var(--bg-card, #fff)' : 'transparent', color: active ? 'var(--accent-orange)' : 'var(--c-muted)',
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
                    <button onClick={async () => {
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
                        // 1) 대괄호 낭독 성구 추출 + [낭독]으로 치환: '[이사야 46:9, 10 낭독]' → '[낭독]'
                        //    scriptures에는 '이사야 46:9, 10 (낭독)' 형태로 저장해 괄호 성구와 일관
                        //    치환 후 [낭독]은 trailing 마커로 취급되어 2)에서 분리됨
                        const bracketScriptures = [];
                        text = text.replace(
                          /\[\s*([가-힣]+(?:\s+(?:[가-힣]+|\d+서))*\s+\d+:[\d,\s\-]+(?:\s*(?:및\s*)?각주)?)\s*낭독\s*\]/g,
                          (_, verse) => { bracketScriptures.push(verse.trim() + ' (낭독)'); return '[낭독]'; }
                        );
                        // 2) 줄 끝 마커 분리: [시각 자료 N], [지시문], [연사 지시], [영상 N], [낭독]
                        //    기존 성구/출판물 괄호 추출이 줄 끝 기준이라 마커가 붙어있으면 매치 실패 → 미리 떼어냄
                        let trailingMarkers = '';
                        const markerMatch = text.match(/(\s*(?:\[\s*시각\s*자료\s*\d+\s*\]|\[\s*지시문\s*\]|\[\s*연사\s*지시\s*\]|\[\s*영상\s*\d+\s*\]|\[\s*낭독\s*\])\s*)+$/);
                        if (markerMatch) {
                          trailingMarkers = ' ' + text.slice(markerMatch.index).trim();
                          text = text.slice(0, markerMatch.index).replace(/\s+$/, '');
                        }
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
                              const subs = _splitCommaRefs(part);
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
                        // 대괄호 낭독 성구를 scriptures 앞에 병합 (괄호 성구보다 앞 순서)
                        if (bracketScriptures.length) {
                          scriptures = scriptures ? bracketScriptures.join('; ') + '; ' + scriptures : bracketScriptures.join('; ');
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
                        parsed.push({ num, level: isSubtopic ? 'L1' : `L${level + 1}`, text: text + trailingMarkers, scriptures, scripture_usage: '', publications: pubs, isSubtopic, time: isSubtopic ? (timeMatch[1] + '분') : '' });
                      }
                      setTxtParsed(parsed);
                      // 세션 5f §3.x Commit 2: ✓ 매칭. 각 row 의 (text, publications 토큰) 일괄 호출.
                      const items = parsed
                        .filter(row => row.publications)
                        .map(row => ({
                          point_text: row.text || '',
                          pub_codes: row.publications.split(';').map(s => s.trim()).filter(Boolean),
                        }))
                        .filter(it => it.point_text && it.pub_codes.length);
                      if (items.length === 0) {
                        setTxtPubMatched(new Set());
                      } else {
                        try {
                          const r = await matchPubPoints(items);
                          setTxtPubMatched(new Set(r.matched || []));
                        } catch { setTxtPubMatched(new Set()); }
                      }
                    }} style={{
                      flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                      background: 'var(--accent)', color: '#fff', fontSize: '0.857rem', fontWeight: 600, cursor: 'pointer',
                    }}>파싱</button>
                    <button onClick={async () => {
                      if (!await showConfirm(RESET_CONFIRM_MSG)) return;
                      setTxtContent('');
                      setTxtParsed([]);
                      setTxtResult('');
                      setTxtMeta({ outlineType: 'S-34', outlineNum: '', outlineTitle: '', version: '', duration: '', year: '', note: '' });
                      try {
                        localStorage.removeItem('jw-text-meta');
                        localStorage.removeItem('jw-text-content');
                        localStorage.removeItem('jw-text-parsed');
                      } catch {}
                    }} style={{
                      padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd)',
                      background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer',
                    }}>초기화</button>
                  </div>

                  {/* 파싱 결과 카드 */}
                  {txtParsed.length > 0 && (
                    <div onClick={() => { const open = Object.keys(expandedDbEntry).filter(k => k.startsWith('txtdd_') && expandedDbEntry[k]); if (open.length) setExpandedDbEntry(p => { const n = { ...p }; open.forEach(k => { n[k] = false; }); return n; }); }} style={{ marginTop: 8 }}>
                      <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <span>{txtParsed.length}개 요점</span>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (!txtParsed.length) return;
                          const counters = [0, 0, 0, 0, 0];
                          let subCount = 0;
                          const next = txtParsed.map(pt => {
                            if (pt.isSubtopic) {
                              subCount += 1;
                              for (let i = 0; i < 5; i++) counters[i] = 0;
                              return { ...pt, num: String(subCount) };
                            }
                            const lvlNum = parseInt(pt.level?.[1]) || 1;
                            const idx = Math.max(0, Math.min(4, lvlNum - 1));
                            for (let i = 0; i < idx; i++) if (counters[i] === 0) counters[i] = 1;
                            counters[idx] += 1;
                            for (let i = idx + 1; i < 5; i++) counters[i] = 0;
                            const parts = counters.slice(0, idx + 1).map(n => String(n));
                            const num = subCount > 0 ? subCount + '.' + parts.join('.') : parts.join('.');
                            return { ...pt, num };
                          });
                          setTxtParsed(next);
                          setTxtResult(MSG.success.numReorder);
                        }} disabled={!txtParsed.length} style={{
                          height: 20, padding: '0 8px', borderRadius: 6,
                          border: '1px solid var(--bd)', background: 'var(--bg-card)',
                          color: 'var(--c-faint)', fontSize: '0.714rem', fontFamily: 'inherit',
                          cursor: txtParsed.length ? 'pointer' : 'not-allowed',
                          display: 'inline-flex', alignItems: 'center', lineHeight: 1,
                        }}>🔢 번호 재정렬</button>
                      </div>
                      {txtParsed.map((pt, i) => {
                        const levelColors = { ST: '#8B6914', L1: 'var(--accent-orange)', L2: 'var(--accent-brown)', L3: 'var(--accent)', L4: '#2D8FC7', L5: 'var(--accent-purple)' };
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
                            <button onClick={() => setExpandedDbEntry(p => ({ ...p, ['txt_' + i]: !p['txt_' + i] }))} style={{ border: 'none', background: 'transparent', color: isEditing ? 'var(--accent)' : 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', padding: '2px 6px', flexShrink: 0, fontWeight: 600 }}>{isEditing ? '완료' : '편집'}</button>
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
                                <span style={{ color: 'var(--accent-purple)', fontSize: '0.857rem', flexShrink: 0 }}>📚</span>
                                <input value={pt.publications} onChange={e => setTxtParsed(p => p.map((x, j) => j === i ? { ...x, publications: e.target.value } : x))}
                                  placeholder="출판물 (「파08」 3면)" style={{ flex: 1, padding: '4px 8px', border: 'none', borderRadius: 6, fontSize: '0.857rem', outline: 'none', background: 'var(--bg-card)', color: 'var(--c-text-dark)', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <button onClick={() => setTxtParsed(p => p.filter((_, j) => j !== i))} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.786rem', cursor: 'pointer' }}>삭제</button>
                              </div>
                            </div>
                          )}
                          {/* 읽기 모드: 성구/출판물 */}
                          {!isEditing && (pt.scriptures || pt.publications) && (
                            <div style={{ padding: '3px 10px 6px', borderTop: '1px solid var(--bd-light)' }}>
                              {pt.scriptures && <div style={{ fontSize: '0.857rem', color: '#2D8FC7' }}>📖 {pt.scriptures}</div>}
                              {pt.publications && (() => {
                                const tokens = pt.publications.split(';').map(s => s.trim()).filter(Boolean);
                                if (!tokens.length) return null;
                                return (
                                  <div style={{ fontSize: '0.857rem', color: 'var(--accent-purple)', marginTop: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
                                    <span style={{ flexShrink: 0 }}>📚</span>
                                    {tokens.map((token, ti) => {
                                      const matchKey = `${_normText(pt.text)}__${_normPub(token)}`;
                                      const isMatched = txtPubMatched.has(matchKey);
                                      return (
                                      <span key={ti} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                                        <span>{token}</span>
                                        {isMatched ? (
                                          <span style={{
                                            padding: '0px 3px', fontSize: '0.571rem',
                                            color: 'var(--accent)', fontWeight: 800, lineHeight: '14px',
                                            flexShrink: 0,
                                          }}>✓</span>
                                        ) : (
                                        <button
                                          onClick={async () => {
                                            // Commit B: text 모드 [+] → pub_input 모드 직접 전환 + 4-tuple 자동 주입.
                                            // App.jsx pendingPub 흐름 우회 (App.jsx 변경 0). useEffect[pendingPub]
                                            // 매핑 로직을 직접 인라인으로 수행.
                                            // Commit B-fix: 부모 소주제 자동 채움.
                                            // (A) 케이스: 클릭한 row 자체가 isSubtopic=true 면 자기 자신 텍스트 사용.
                                            let parentSubtopic = '';
                                            if (pt.isSubtopic) {
                                              parentSubtopic = pt.text || '';
                                            } else {
                                              for (let j = i - 1; j >= 0; j--) {
                                                if (txtParsed[j].isSubtopic) {
                                                  parentSubtopic = txtParsed[j].text || '';
                                                  break;
                                                }
                                              }
                                            }
                                            setSubTab('gather');
                                            setGatherMode('pub_input');
                                            setFromPub(true);
                                            setSiFromOutlineText(true);
                                            setSaveMsg('');
                                            setPubForm(prev => ({
                                              ...prev,
                                              pub_code: token,
                                              point_summary: pt.text || '',
                                              content: '',
                                              outline_title: txtMeta.outlineTitle || '',
                                              scriptures: pt.scriptures || '',
                                              linked_outlines: '',
                                              reference: '', pub_title: '', pub_type: '',
                                              outline_type: txtMeta.outlineType || '',
                                              outline_num: txtMeta.outlineNum || '',
                                              version: txtMeta.version || '',
                                              point_id: pt.num || '',
                                              subtopic: parentSubtopic,
                                            }));
                                            // lookupPubTitle await 으로 race 차단 (세션 5f race hotfix).
                                            // 비동기 결과 도착 전 사용자가 [저장] 누를 가능성 차단.
                                            if (token) {
                                              try {
                                                const r = await lookupPubTitle(token);
                                                if (r) setPubForm(p => ({
                                                  ...p,
                                                  pub_title: p.pub_title || r.pub_title || '',
                                                  reference: p.reference || r.reference || '',
                                                }));
                                              } catch {}
                                            }
                                          }}
                                          style={{
                                            padding: '0px 3px', borderRadius: 3,
                                            border: '1px solid var(--accent-purple)',
                                            background: 'var(--bg-card)', color: 'var(--accent-purple)',
                                            fontSize: '0.571rem', cursor: 'pointer', fontWeight: 800, lineHeight: '14px',
                                            flexShrink: 0,
                                          }}
                                          aria-label={`${token} 출판물 추가`}
                                        >+</button>
                                        )}
                                        {ti < tokens.length - 1 && <span style={{ color: 'var(--c-dim)' }}>;</span>}
                                      </span>
                                      );
                                    })}
                                  </div>
                                );
                              })()}
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
                            files: [{ meta: { outline_type: txtMeta.outlineType, outline_type_name: getOutlineTypeInfo(txtMeta.outlineType).name, outline_num: txtMeta.outlineNum, outline_title: txtMeta.outlineTitle, outline_version: txtMeta.version, time: txtMeta.duration, note: txtMeta.note || '' }, subtopics }],
                            overwrite: false,
                          };
                          const dupCheck = await checkDuplicates({ files: [{ ...payload.files[0], file_format: 'outline' }] });
                          if (dupCheck.has_duplicates) {
                            if (!await showConfirm(dupCheck.duplicates.map(d => d.message).join('\n'), { confirmVariant: 'danger' })) { setTxtSaving(false); return; }
                            payload.overwrite = true;
                          }
                          const res = await saveOutline(payload);
                          setTxtResult(MSG.helpers.successFromBackend(res.message));
                          outlineList().then(r => setOutlines(r.outlines || [])).catch(() => {});
                          if (sttReturnAfterSave) {
                            const num = txtMeta.outlineNum || '';
                            const version = txtMeta.version || '';
                            const otype = txtMeta.outlineType || '';
                            let outlineId = `${otype}_${num}`;
                            if (version) outlineId += `_v${version}`;
                            setSttReviewMeta(m => ({
                              ...m,
                              outline_id: outlineId,
                              outline_num: num,
                              outline_version: version,
                            }));
                            setSttReviewOutlineQuery(`${otype}_${num} - ${txtMeta.outlineTitle || ''}`);
                            setSttReviewOutlineOpen(false);
                            setSttReturnAfterSave(false);
                            setGatherMode('stt');
                          }
                        } catch (err) { setTxtResult(MSG.fail.save + err.message); }
                        finally { setTxtSaving(false); }
                      }} disabled={txtSaving} style={{
                        width: '100%', padding: '10px 0', borderRadius: 8, border: 'none', marginTop: 6,
                        background: txtSaving ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
                        fontSize: '0.929rem', fontWeight: 700, cursor: 'pointer', position: 'relative', overflow: 'hidden',
                      }}>
                        {txtSaving && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                        <span style={{ position: 'relative', zIndex: 1 }}>{txtSaving ? '저장 중...' : sttReturnAfterSave ? '저장 후 STT 검토로 돌아가기' : '골자 저장'}</span>
                      </button>
                      {sttReturnAfterSave && !txtSaving && (
                        <button onClick={() => {
                          setSttReturnAfterSave(false);
                          setGatherMode('stt');
                        }} style={{
                          width: '100%', padding: '8px 0', marginTop: 6, borderRadius: 8,
                          border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)',
                          fontSize: '0.857rem', fontWeight: 600, cursor: 'pointer',
                        }}>← 저장하지 않고 STT 검토로 돌아가기</button>
                      )}
                      {txtResult && <div style={{ marginTop: 6, fontSize: '0.786rem', color: getStatusColor(txtResult) }}>{txtResult}</div>}
                    </div>
                  )}
                </div>
              )}

              {/* 출판물 입력 */}
              {gatherMode === 'pub_input' && (<>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>출판물 코드 <span style={{ color: 'var(--c-danger)' }}>*</span> <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>면/항 포함 가능</span></div>
                  <input value={pubForm.pub_code} onChange={e => setPubForm(p => ({ ...p, pub_code: e.target.value }))} placeholder="「파10」 11/15 7면 2항" style={{ ...S.inputField, width: '100%' }} />
                  {(pubLookupHint || pubForm.reference) && (
                    <div style={{ marginTop: 3, fontSize: '0.643rem', color: 'var(--c-dim)' }}>
                      {pubLookupHint && <span style={{ color: 'var(--accent)' }}>{pubLookupHint}</span>}
                      {pubLookupHint && pubForm.reference && <span> </span>}
                      {pubForm.reference && <span style={{ color: 'var(--accent-purple)' }}>{pubForm.reference}</span>}
                    </div>
                  )}
                  {pubExactMatch && (
                    <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', fontSize: '0.714rem', color: 'var(--accent-orange)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: '0.857rem' }}>⚠️</span>
                      <span style={{ fontWeight: 600 }}>이미 저장됨:</span>
                      <span>{pubExactMatch.pub_title || pubExactMatch.pub_code}</span>
                      {pubExactMatch.reference && <span style={{ color: 'var(--accent-purple)' }}>{pubExactMatch.reference}</span>}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>출판물명 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>자동 생성됨, 수정 가능</span></div>
                  <input value={pubForm.pub_title} onChange={e => setPubForm(p => ({ ...p, pub_title: e.target.value }))} placeholder={pubLookupHint || "출판물명 자동 생성"} style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>유형</div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['정기 간행물', '서책', '팜플렛', '소책자', '성경', '웹 연재 기사', '색인'].map(t => (
                      <button key={t} onClick={() => setPubForm(p => ({ ...p, pub_type: t }))} style={{
                        padding: '4px 12px', borderRadius: 8, border: '1px solid ' + (pubForm.pub_type === t ? 'var(--accent-purple)' : 'var(--bd)'),
                        background: pubForm.pub_type === t ? '#7F77DD10' : 'var(--bg-card)', color: pubForm.pub_type === t ? 'var(--accent-purple)' : 'var(--c-faint)',
                        fontSize: '0.786rem', cursor: 'pointer', fontFamily: 'inherit',
                      }}>{t}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>주제 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                  <input value={pubForm.outline_title} onChange={e => setPubForm(p => ({ ...p, outline_title: e.target.value }))} placeholder="골자 제목 또는 주제" style={{ ...S.inputField, width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>요점 (한줄) <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                    <input value={pubForm.point_summary} onChange={e => setPubForm(p => ({ ...p, point_summary: e.target.value }))} placeholder="1.1.2 - 요점" style={{ ...S.inputField, width: '100%' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>성구 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                    <input value={pubForm.scriptures} onChange={e => setPubForm(p => ({ ...p, scriptures: e.target.value }))} placeholder="마 5:3; 시 37:11" style={{ ...S.inputField, width: '100%' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>키워드 <span style={{ color: 'var(--c-dim)', fontSize: '0.643rem' }}>선택</span></div>
                  <input value={pubForm.keywords} onChange={e => setPubForm(p => ({ ...p, keywords: e.target.value }))} placeholder="키워드" style={{ ...S.inputField, width: '100%' }} />
                </div>
                {/* 참조 골자 정보 (접기 블록) */}
                <div style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                  <div onClick={() => setPubRefOpen(v => !v)} style={{
                    padding: '6px 10px', cursor: 'pointer', userSelect: 'none',
                    display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.786rem', color: 'var(--c-sub)',
                  }}>
                    <span>📚 참조 골자 정보</span>
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>(선택)</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.643rem', color: 'var(--c-dim)' }}>{pubRefOpen ? '▲' : '▼'}</span>
                  </div>
                  {pubRefOpen && (() => {
                    const typeOpts = [
                      { code: '', name: '(선택 안 함)' },
                      { code: 'S-34', name: '공개강연 (S-34)' },
                      { code: 'SB', name: '생활과봉사 (SB)' },
                      { code: 'S-31', name: '기념식 (S-31)' },
                      { code: 'S-123', name: '특별강연 (S-123)' },
                      { code: 'S-211', name: 'RP모임 (S-211)' },
                      { code: 'CO_C', name: '순회대회 (CO_C)' },
                      { code: 'CO_R', name: '지역대회 (CO_R)' },
                      { code: 'ETC', name: '기타 (ETC)' },
                    ];
                    return (
                      <div style={{ padding: '8px 10px', borderTop: '1px solid var(--bd-light)', background: 'var(--bg-card)' }}>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2 }}>유형</div>
                            <select value={pubForm.outline_type} onChange={e => setPubForm(p => ({ ...p, outline_type: e.target.value }))} style={{ ...S.inputField, width: '100%' }}>
                              {typeOpts.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2 }}>번호</div>
                            <input value={pubForm.outline_num} onChange={e => setPubForm(p => ({ ...p, outline_num: e.target.value }))} placeholder="001" style={{ ...S.inputField, width: '100%' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2 }}>버전</div>
                            <input value={pubForm.version} onChange={e => setPubForm(p => ({ ...p, version: e.target.value }))} placeholder="10/24" style={{ ...S.inputField, width: '100%' }} />
                          </div>
                        </div>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2 }}>소주제</div>
                          <input value={pubForm.subtopic} onChange={e => setPubForm(p => ({ ...p, subtopic: e.target.value }))} placeholder="소주제 제목" style={{ ...S.inputField, width: '100%' }} />
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 2 }}>
                          <div style={{ width: 80, flexShrink: 0 }}>
                            <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 2 }}>요점 번호</div>
                            <input value={pubForm.point_id} onChange={e => setPubForm(p => ({ ...p, point_id: e.target.value }))} placeholder="1.1.2" style={{ ...S.inputField, width: '100%', textAlign: 'center' }} />
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>내용 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
                  <KoreanTextarea value={pubForm.content} onChange={v => setPubForm(p => ({ ...p, content: v }))}
                    placeholder="출판물 내용을 입력하세요" rows={8}
                    style={{ ...S.inputField, display: 'block', width: '100%', resize: 'vertical', lineHeight: 1.9 }} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={async () => {
                    if (!await showConfirm(RESET_CONFIRM_MSG)) return;
                    setPubForm(pubFormDefault);
                  }} style={{
                    padding: '10px 14px', borderRadius: 8, border: '1px solid var(--bd)',
                    background: 'var(--bg-card)', color: 'var(--c-faint)',
                    fontSize: '0.786rem', cursor: 'pointer', flexShrink: 0,
                  }}>초기화</button>
                  <button onClick={() => saveStructureForm(pubForm, '출판물', setPubForm, pubFormDefault)} disabled={saving || !pubForm.content.trim() || !pubForm.pub_code.trim() || !pubForm.reference.trim()} style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--bd-medium)' : 'var(--accent-purple)', color: '#fff',
                    fontSize: '1.0rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                  }}>{saving ? '저장 중...' : fromPub ? '저장 후 연설 준비로 돌아가기' : '저장'}</button>
                </div>
                {fromPub && !saving && (
                  <button onClick={() => {
                    // [돌아가기] 시 잔여 state cleanup (silent error 200 회귀 방지)
                    const wasFromOutlineText = siFromOutlineText;
                    setFromPub(false);
                    setSiFromOutlineText(false);
                    setPubForm(pubFormDefault);
                    setSaveMsg('');
                    try { localStorage.removeItem('jw-gather-form'); } catch {}
                    if (wasFromOutlineText) {
                      // text 모드 출처 — 로컬 복귀 (App.jsx onSaveReturn 우회)
                      setSubTab('gather');
                      setGatherMode('text');
                    } else if (onSaveReturn) {
                      onSaveReturn();
                    }
                  }} style={{
                    width: '100%', padding: '8px 0', marginTop: 6, borderRadius: 8,
                    border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)',
                    fontSize: '0.857rem', fontWeight: 600, cursor: 'pointer',
                  }}>← 저장하지 않고 돌아가기</button>
                )}
                {saveMsg && <div style={{ marginTop: 8, fontSize: '0.857rem', textAlign: 'center', color: getStatusColor(saveMsg), fontWeight: 600 }}>{saveMsg}</div>}
              </>)}
            </div>
          )}


          {subTab === 'memo' && (<>
          {/* 내용 */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '0.786rem', color: 'var(--c-muted)', marginBottom: 2 }}>내용 <span style={{ color: 'var(--c-danger)' }}>*</span></div>
            <KoreanTextarea value={gatherForm.content} onChange={v => setGatherForm(p => ({ ...p, content: v }))}
              placeholder="내용을 입력하세요" rows={8}
              style={{ ...S.inputField, display: 'block', width: '100%', resize: 'vertical', lineHeight: 1.9 }} />
          </div>

          {/* 이동 중 표시 */}
          {movingMemo && (
            <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, fontSize: '0.786rem', color: 'var(--accent-orange)', fontWeight: 600 }}>
              📋 메모에서 이동 중 — 출처와 세부 항목을 선택한 후 저장하세요
            </div>
          )}

          {/* 저장/리셋 */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleSave} disabled={saving || !gatherForm.content.trim() || (gatherForm.entry_type === 'publication' && !gatherForm.pub_code.trim() && gatherForm.sub_source !== '원문')} style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: saving ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
              fontSize: '1.0rem', fontWeight: 700, cursor: saving ? 'default' : 'pointer',
            }}>{saving ? '저장 중...' : movingMemo ? '이동 저장' : 'DB에 저장'}</button>
            <button onClick={() => { setGatherForm(p => ({...gatherFormDefault, source: p.source, sub_source: p.sub_source})); setSubtopics({}); setSaveMsg(''); setMovingMemo(null); }} style={{
              padding: '10px 16px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.929rem', cursor: 'pointer',
            }}>초기화</button>
          </div>

          {saveMsg && <div style={{ marginTop: 8, fontSize: '0.857rem', textAlign: 'center', color: getStatusColor(saveMsg), fontWeight: 600 }}>{saveMsg}</div>}
          </>)}
          </div>
        </div>
      )}

      {/* ═══ 연설 입력 ═══ */}
      {subTab === 'structure' && structureMode === 'speech_input' && (
        <ManageSpeechInput
          siTransferTick={siTransferTick}
          outlines={outlines}
        />
      )}

      {subTab === 'drafts' && (
        <ManageDrafts
          dbDrafts={dbDrafts} setDbDrafts={setDbDrafts}
          memoEntries={memoEntries} setMemoEntries={setMemoEntries}
          onDraftMove={handleDraftMove} onMemoMove={onMemoMove}
        />
      )}



  </>);
}
