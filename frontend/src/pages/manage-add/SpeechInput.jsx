import { useState, useEffect, useRef, useMemo } from 'react';
import KoreanTextarea from '../../components/KoreanTextarea';
import { S } from '../../styles';
import { bibleLookup, draftSave, draftLoad, draftComplete, draftDelete, draftCheck, dbDelete, saveSpeech, outlineDetail, listBySource } from '../../api';
import { cleanMd } from '../../components/utils';
import { RESET_CONFIRM_MSG } from '../../utils/formReset';
import { useConfirm } from '../../providers/ConfirmProvider';
import { useAlert } from '../../providers/AlertProvider';
import { MSG } from '../../utils/messages';
import OriginalBlock from './speech-input/OriginalBlock';
import SaveActions from './speech-input/SaveActions';
import OutlineSelectorBar from './speech-input/OutlineSelectorBar';
import OutlineQuickEditor from './speech-input/OutlineQuickEditor';
import OutlineDetailEditor from './speech-input/OutlineDetailEditor';
import FreeStructureEditor from './speech-input/FreeStructureEditor';

// si* state 초기값 복원 — 매 mount 마다 localStorage 최신 반영 (B4 fix: 모듈 상수 stale 회피)
const _readSiInit = () => {
  try { return JSON.parse(localStorage.getItem('jw-speech-state')) || {}; }
  catch { return {}; }
};
const _siDateDefault = (() => { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); })();

export default function ManageSpeechInput({ siTransferTick, outlines }) {
  const showConfirm = useConfirm();
  const showAlert = useAlert();

  // B4 fix: mount 시 1회 localStorage 신규 읽기 (unmount→remount 시 최신 반영)
  const _siInit = useMemo(_readSiInit, []);

  // ── si* state (33개) ──
  const [siOutline, setSiOutline] = useState(_siInit.outline || null);
  const [siSubtopics, setSiSubtopics] = useState({});
  const [siSubLoading, setSiSubLoading] = useState(false);
  const [siQuery, setSiQuery] = useState(_siInit.query || '');
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
  const [siFreeSubtopics, setSiFreeSubtopics] = useState(_siInit.freeSubtopics || []); // [{ title, memo }]
  const [siFreeMode, setSiFreeMode] = useState(_siInit.freeMode || 'subtopic'); // 항상 'subtopic' (bulk 제거됨)
  const [siFreeType, setSiFreeType] = useState(_siInit.freeType || '생활과봉사'); // 생활과 봉사 | JW방송 | 대회 | 기타
  const [siSourceSttJobId, setSiSourceSttJobId] = useState(_siInit.sourceSttJobId || '');
  const [siSttOriginalText, setSiSttOriginalText] = useState(_siInit.sttOriginalText || '');
  const [siSttOriginalEditing, setSiSttOriginalEditing] = useState(false);
  const [siSttOriginalCollapsed, setSiSttOriginalCollapsed] = useState(false);
  const [siOriginType, setSiOriginType] = useState(_siInit.originType || '');
  const [siVerseOpen, setSiVerseOpen] = useState({}); // { ptKey: true }
  const [siVerseData, setSiVerseData] = useState({}); // { ptKey: [{ ref, text }] }
  const [siVerseLoading, setSiVerseLoading] = useState({}); // { ptKey: true }
  const [siDraftInfo, setSiDraftInfo] = useState(null); // { exists, filled, total, mode, saved_at }
  const siDraftLoadedRef = useRef(false); // transfer로 draft 로드 완료 여부
  const [siNoteInfo, setSiNoteInfo] = useState(null); // existing note entries
  const [siSaving, setSiSaving] = useState(false);
  const [siCompleting, setSiCompleting] = useState(false);
  const [siSaveMsg, setSiSaveMsg] = useState('');
  const [siTransferMemo, setSiTransferMemo] = useState(null); // { memoId, memoCol }

  // ── useEffect 1: jw-speech-state localStorage ──
  useEffect(() => { try { localStorage.setItem('jw-speech-state', JSON.stringify({
    outline: siOutline, query: siQuery, speaker: siSpeaker, date: siDate,
    mode: siMode, notes: siNotes, details: siDetails,
    noOutline: siNoOutline, freeText: siFreeText, freeTopic: siFreeTopic, freeSubtopics: siFreeSubtopics, freeMode: siFreeMode, freeType: siFreeType,
    // STT ID는 자유 입력 모드일 때만 persist (골자 모드 오염 방지)
    sourceSttJobId: siNoOutline ? siSourceSttJobId : '',
    // STT 원본은 존재만으로 persist (골자 선택 후에도 참조 유지)
    sttOriginalText: siSttOriginalText || '',
    originType: siOriginType || '',
  })); } catch {} }, [siOutline, siQuery, siSpeaker, siDate, siMode, siNotes, siDetails, siNoOutline, siFreeText, siFreeTopic, siFreeSubtopics, siFreeMode, siFreeType, siSourceSttJobId, siSttOriginalText, siOriginType]);

  // ── useEffect 2: siOutline subtopics 복원 ──
  useEffect(() => {
    if (!siOutline || !siOutline.outline_num) return;
    const oid = `${siOutline.outline_type || 'S-34'}_${siOutline.outline_num}`;
    setSiSubLoading(true);
    outlineDetail(oid, siOutline.outline_type_name || siOutline.outline_type || '', siOutline.version || '').then(r => { setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || ''); }).catch(() => {}).finally(() => setSiSubLoading(false));
  }, []);

  // ── useEffect 3: transfer 처리 (subTab/structureMode 조건 제거, siTransferTick만 의존) ──
  useEffect(() => {
    let raw; try { raw = localStorage.getItem('jw-speech-transfer'); } catch { return; }
    if (!raw) return;
    try { localStorage.removeItem('jw-speech-transfer'); } catch {}
    let t; try { t = JSON.parse(raw); } catch { return; }
    if (!t) return;
    // 기존 state 전부 리셋
    setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({});
    setSiExpanded({}); setSiNoOutline(false); setSiFreeText(''); setSiFreeTopic(''); setSiFreeSubtopics([]); setSiFreeType('생활과봉사');
    setSiVerseOpen({}); setSiVerseData({}); setSiDraftInfo(null); setSiNoteInfo(null);
    setSiSourceSttJobId('');
    setSiSttOriginalText(''); setSiSttOriginalEditing(false); setSiSttOriginalCollapsed(false); setSiOriginType('');
    setSiSpeaker(t.speaker || '');
    setSiDate(t.date || _siDateDefault);
    setSiSaveMsg('');
    setSiTransferMemo(t.memoId ? { id: t.memoId, col: t.memoCol } : null);
    if (t.isDraft) siDraftLoadedRef.current = true;

    // STT draft 이관: 자유 입력 모드로 바로 진입
    if (t.isSttDraft) {
      setSiNoOutline(true);
      setSiFreeMode('subtopic');  // bulk 제거 — 항상 subtopic
      setSiFreeText('');
      setSiFreeTopic(t.free_topic || '');
      setSiFreeSubtopics(t.free_subtopics || []);
      setSiSourceSttJobId(t.source_stt_job_id || '');
      // STT 원본: 저장되어 있으면 복원, 없으면 free_text 초기값
      setSiSttOriginalText(t.stt_original_text || t.free_text || '');
      setSiOriginType('stt');
      setSiSttOriginalEditing(false);
      setSiSttOriginalCollapsed(false);
      siDraftLoadedRef.current = true;
      return;
    }
    // Build-7 hotfix 1: 자유 입력 draft 이관 (STT 없는 no_outline)
    if (t.isFreeDraft) {
      setSiNoOutline(true);
      setSiFreeMode('subtopic');
      setSiFreeText('');
      setSiFreeTopic(t.free_topic || '');
      setSiFreeType(t.free_type || '생활과봉사');
      // Hotfix 4: 구 draft 구조 마이그레이션 (pt.text → pt.title, _mode 추론)
      const rawSubs = t.free_subtopics || [];
      const migrated = rawSubs.map((st, si) => ({
        ...st,
        _mode: st._mode || (
          rawSubs.length === 1 && si === 0 && !((st.title || '').trim()) ? 'top' : 'subtopic'
        ),
        points: (st.points || []).map(pt => ({
          title: pt.title || pt.text || '',
          content: pt.content || '',
          scriptures: pt.scriptures || '',
          publications: pt.publications || '',
          keywords: pt.keywords || '',
          tags: pt.tags || '',
        })),
      }));
      setSiFreeSubtopics(migrated);
      setSiSourceSttJobId(t.source_stt_job_id || '');
      // 원본 텍스트 복원 + 타입 결정 (stt_original_text 우선, 없으면 legacy free_text)
      const originText = t.stt_original_text || t.free_text || '';
      setSiSttOriginalText(originText);
      setSiOriginType(originText ? (t.source_stt_job_id ? 'stt' : 'quick') : '');
      setSiSttOriginalEditing(false);
      setSiSttOriginalCollapsed(false);
      siDraftLoadedRef.current = true;
      return;
    }
    if (t.outline_num) {
      // 골자 번호 + 유형 조합으로 매칭 (중복 outline_num 대비)
      const matched = outlines.find(g =>
        g.outline_num === t.outline_num &&
        (!t.outline_type || g.outline_type === t.outline_type)
      );
      if (matched) {
        setSiOutline(matched); setSiNoOutline(false);
        setSiQuery(`${matched.outline_num} - ${matched.title}`);
        const oid = `${matched.outline_type || 'S-34'}_${matched.outline_num}`;
        const oType = matched.outline_type_name || matched.outline_type || '';
        setSiSubLoading(true);
        outlineDetail(oid, oType, matched.version || '').then(r => {
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
                      const ptKey = `${(stKey || '0').split('.')[0]}_${pts[0].point_num}`;
                      if (!(mergedDetails[ptKey]?.text || '').trim()) mergedDetails[ptKey] = { ...mergedDetails[ptKey], text: note };
                    }
                  });
                }
                setSiDetails(mergedDetails);
                setSiMode(finalMode);
                // Build-5D-2 hotfix3: STT 원본 복원 (골자 draft라도 보존)
                if (dr.stt_original_text) {
                  setSiSttOriginalText(dr.stt_original_text);
                  setSiSourceSttJobId(dr.source_stt_job_id || '');
                  setSiSttOriginalEditing(false);
                  setSiSttOriginalCollapsed(false);
                }
                // 입력된 소주제만 펼침 (notes + details 양쪽 체크)
                const exp = {};
                Object.entries(r.subtopics || {}).forEach(([stKey, pts]) => {
                  if ((dr.notes?.[stKey] || '').trim()) { exp[stKey] = true; return; }
                  const hasDetail = (pts || []).some(pt => {
                    const ptKey = `${(stKey || '0').split('.')[0]}_${pt.point_num}`;
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
  }, [siTransferTick]);

  // ── useEffect 4: draft/note 체크 ──
  // 세션 5b B2 fix: cancelled 플래그 + cleanup — mount 직후 localStorage 잔재 siOutline 기반
  // draftCheck 가 in-flight 인 상태로 transfer 가 siOutline 을 바꾸면, stale 응답이
  // 새 outline 의 siDraftInfo 를 덮어쓰던 race 차단.
  useEffect(() => {
    if (!siOutline || !siSpeaker.trim() || !siDate.trim()) { setSiDraftInfo(null); setSiNoteInfo(null); return; }
    let cancelled = false;
    // transfer로 draft를 이미 로드한 경우 draftCheck 스킵 (한 번만)
    if (siDraftLoadedRef.current) {
      siDraftLoadedRef.current = false;
      setSiDraftInfo(null);
    } else {
      draftCheck({ outline_num: siOutline.outline_num, speaker: siSpeaker.trim(), date: siDate.trim(), outline_type: siOutline.outline_type || 'S-34' })
        .then(r => { if (!cancelled) setSiDraftInfo(r.exists ? r : null); })
        .catch(() => { if (!cancelled) setSiDraftInfo(null); });
    }
    listBySource('note', 10, '').then(r => {
      if (cancelled) return;
      const match = (r.entries || []).find(e => e.metadata?.outline_num === siOutline.outline_num && e.metadata?.speaker === siSpeaker.trim() && e.metadata?.date === siDate.trim());
      setSiNoteInfo(match || null);
    }).catch(() => { if (!cancelled) setSiNoteInfo(null); });
    return () => { cancelled = true; };
  }, [siOutline?.outline_num, siSpeaker, siDate]);

  // ── 핸들러 (JSX 인라인 추출) ──
  const handleLoadDraft = async () => {
    const r = await draftLoad({ outline_num: siOutline?.outline_num || '', speaker: siSpeaker.trim(), date: siDate.trim(), outline_type: siOutline?.outline_type || '' });
    if (r.exists) {
      if (r.notes) setSiNotes(r.notes);
      if (r.details) setSiDetails(r.details);
      if (r.mode) setSiMode(r.mode);
      const exp = {};
      Object.entries(siSubtopics).forEach(([stKey, pts]) => {
        if ((r.notes?.[stKey] || '').trim()) { exp[stKey] = true; return; }
        if ((pts || []).some(pt => { const d = r.details?.[`${(stKey || '0').split('.')[0]}_${pt.point_num}`]; return d && ((d.text || '').trim() || (d.tags || '').trim()); })) exp[stKey] = true;
      });
      setSiExpanded(exp);
      setSiDraftInfo(null);
      setSiSaveMsg(MSG.success.loadDraft);
    }
  };

  const handleDiscardDraft = async () => {
    if (!await showConfirm('기존 데이터가 삭제됩니다. 새로 만드시겠습니까?', { confirmVariant: 'danger' })) return;
    await draftDelete(siDraftInfo.draft_id);
    setSiNotes({}); setSiDetails({}); setSiExpanded({});
    setSiDraftInfo(null);
    setSiSaveMsg(MSG.success.newDraft);
  };

  const handleLoadNote = () => {
    const text = (siNoteInfo.text || '').replace(/\[.*?\].*\n?/g, '').trim();
    if (text) {
      const keys = Object.keys(siSubtopics);
      if (keys.length) setSiNotes(p => ({ ...p, [keys[0]]: text }));
    }
    setSiNoteInfo(null);
    setSiSaveMsg(MSG.success.loadMemo);
  };

  const handleSaveDraft = async () => {
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
        no_outline: siNoOutline,
        free_text: siFreeText,
        free_topic: siFreeTopic,
        free_subtopics: siFreeSubtopics,
        free_mode: siFreeMode,
        free_type: siFreeType,
        // STT ID는 자유 입력 모드일 때만 전송
        source_stt_job_id: siNoOutline ? siSourceSttJobId : '',
        // STT 원본은 존재만으로 전송 (링크 독립, 골자 전환 후에도 참조 유지)
        stt_original_text: siSttOriginalText || '',
      });
      setSiSaveMsg(MSG.success.saveTransient);
    } catch (e) { setSiSaveMsg(MSG.fail.save + e.message); }
    finally { setSiSaving(false); }
  };

  const handleComplete = async () => {
    // 공통 검증
    if (!siSpeaker.trim()) { showAlert('연사를 입력해주세요', { variant: 'info' }); return; }
    if (!siDate.trim()) { showAlert('날짜를 입력해주세요', { variant: 'info' }); return; }

    setSiCompleting(true); setSiSaveMsg('');
    try {
      if (siNoOutline) {
        // 자유 입력 모드: saveSpeech 직접 호출
        const meaningfulSubs = (siFreeSubtopics || []).filter(s => {
          const hasTitleOrMemo = (s.title || '').trim() || (s.memo || '').trim();
          const hasPoints = (s.points || []).some(pt =>
            (pt.title || pt.content || pt.scriptures || pt.publications || pt.keywords || pt.tags || '').trim()
          );
          return hasTitleOrMemo || hasPoints;
        });
        if (!siFreeText.trim() && meaningfulSubs.length === 0) {
          setSiSaveMsg('본문 또는 소주제를 입력해주세요');
          setSiCompleting(false);
          return;
        }
        const sourceKo = '연설';
        // text = pt.title (point_content), speech_text = pt.content (document 본문)
        let _globalPtNum = 0;
        const subList = meaningfulSubs.length > 0
          ? meaningfulSubs.map((st, si) => {
              const validPoints = (st.points || []).filter(pt =>
                (pt.title || pt.content || pt.scriptures || pt.publications || pt.keywords || pt.tags || '').trim()
              );
              let points;
              if (validPoints.length > 0) {
                points = validPoints.map(pt => {
                  _globalPtNum += 1;
                  return {
                    num: String(_globalPtNum),
                    text: pt.title || '',
                    level: 'L1',
                    speech_text: pt.content || '',
                    scriptures: pt.scriptures || '',
                    scripture_usage: '',
                    publications: pt.publications || '',
                    keywords: pt.keywords || '',
                    tags: pt.tags || '',
                    usage: '사용',
                  };
                });
              } else {
                _globalPtNum += 1;
                const memo = st.memo || '';
                points = [{ num: String(_globalPtNum), text: memo, level: 'L1', speech_text: memo, scriptures: '', scripture_usage: '', publications: '', keywords: '', tags: '', usage: '사용' }];
              }
              return {
                title: st.title || '',
                num: si + 1,
                points,
              };
            })
          : [{
              title: siFreeTopic || '',
              num: 1,
              points: [{ num: '1', text: siFreeText, level: 'L1', speech_text: siFreeText, scriptures: '', scripture_usage: '', publications: '', keywords: '', tags: '', usage: '사용' }],
            }];
        const res = await saveSpeech({
          files: [{
            meta: {
              outline_type: 'ETC',
              outline_type_name: siFreeType || '생활과봉사',
              outline_num: '',
              title: siFreeTopic || '',
              version: '',
              speaker: siSpeaker.trim(),
              date: siDate.trim(),
              source: sourceKo,
            },
            subtopics: subList,
          }],
          overwrite: true,
        });
        // draft 삭제 (draft_id 재계산, STT suffix는 자유 입력 모드 한정)
        try {
          const sttSuffix = (siNoOutline && siSourceSttJobId)
            ? `_stt${(siSourceSttJobId.split('_').pop() || siSourceSttJobId).slice(0, 6)}`
            : '';
          const did = `ETC_${siSpeaker.trim()}_${siDate.trim()}${sttSuffix}`;
          await draftDelete(did);
        } catch {}
        setSiSaveMsg(MSG.helpers.saveBatch(res.total_new || 0));
        // ManageDbTab이 mode='mydb' 활성 시 체크하여 연설 탭 캐시 무효화.
        localStorage.setItem('jw-db-stale-tab', '연설');
      } else {
        // 기존 골자 기반 complete
        const res = await draftComplete({
          outline_type: siOutline?.outline_type || 'ETC',
          outline_num: siOutline?.outline_num || '',
          outline_title: siOutline?.title || siFreeTopic || '',
          version: siOutline?.version || '',
          speaker: siSpeaker.trim(), date: siDate.trim(),
          mode: siMode, notes: siNotes, details: siDetails,
          subtopics: siSubtopics,
        });
        if (siTransferMemo) { try { await dbDelete(siTransferMemo.col, siTransferMemo.id); } catch {} setSiTransferMemo(null); }
        setSiSaveMsg(MSG.helpers.saveBatch(res.total));
        setSiNotes({}); setSiDetails({});
        // ManageDbTab이 mode='mydb' 활성 시 체크하여 연설 탭 캐시 무효화.
        localStorage.setItem('jw-db-stale-tab', '연설');
      }
    } catch (e) { setSiSaveMsg(MSG.fail.save + e.message); }
    finally { setSiCompleting(false); }
  };

  const handleReset = async () => {
    if (!await showConfirm(RESET_CONFIRM_MSG)) return;
    setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiSpeaker(''); setSiDate(_siDateDefault);
    setSiMode('quick'); setSiExpanded({}); setSiNotes({}); setSiDetails({});
    setSiNoOutline(false); setSiFreeText(''); setSiFreeTopic(''); setSiFreeSubtopics([]); setSiFreeType('생활과봉사'); siDraftLoadedRef.current = false;
    setSiSourceSttJobId(''); setSiSttOriginalText(''); setSiSttOriginalEditing(false); setSiSttOriginalCollapsed(false);
    setSiVerseOpen({}); setSiVerseData({}); setSiSaveMsg(''); setSiDraftInfo(null); setSiNoteInfo(null);
    try { localStorage.removeItem('jw-speech-state'); } catch {}
  };

  const handleToggleMode = async (isFree) => {
    if (isFree === siNoOutline) return;
    const hasOrigin = !!siSttOriginalText;
    // 데이터 손실 경고 — 빈 상태면 confirm 생략
    if (isFree) {
      // 골자 → 자유: 골자 입력 내용 (골자 선택, 간단 메모, 상세 내용/태그) 삭제됨
      const hasOutlineData = siOutline || Object.keys(siNotes || {}).length > 0 || Object.values(siDetails || {}).some(d => (d?.text || d?.tags || '').trim());
      if (hasOutlineData) {
        const msg = '자유 입력으로 전환하면 선택한 골자와 입력 내용(간단/상세)이 삭제됩니다.'
          + (hasOrigin ? '\n원본 텍스트는 유지됩니다.' : '')
          + '\n계속하시겠습니까?';
        if (!await showConfirm(msg, { confirmVariant: 'danger' })) return;
      }
    } else {
      // 자유 → 골자: 자유 구조 (주제/자유구조/소주제/요점) 삭제됨
      const hasFreeData = (siFreeText || '').trim() || (siFreeTopic || '').trim() || (siFreeSubtopics || []).some(s =>
        (s.title || '').trim() || (s.memo || '').trim() ||
        (s.points || []).some(pt => (pt.title || pt.content || pt.text || pt.scriptures || pt.publications || pt.keywords || pt.tags || '').trim())
      );
      if (hasFreeData) {
        const msg = '골자 선택으로 전환하면 입력한 자유 구조(주제, 소주제, 요점)가 삭제됩니다.'
          + (hasOrigin ? '\n원본 텍스트는 유지됩니다.' : '')
          + '\n계속하시겠습니까?';
        if (!await showConfirm(msg, { confirmVariant: 'danger' })) return;
      }
    }
    setSiNoOutline(isFree);
    setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({}); setSiExpanded({});
    if (!isFree) {
      // 자유 → 골자 전환: 자유 편집 state만 클리어.
      // siSourceSttJobId/siSttOriginalText는 유지 → 골자 선택 전까지 원본 블록 노출 유지.
      setSiFreeText(''); setSiFreeTopic(''); setSiFreeSubtopics([]);
    }
    setSiSaveMsg('');
  };

  const handleSelectOutline = (g) => {
    setSiOutline(g);
    setSiSourceSttJobId(''); // 골자 선택 시 STT 링크 해제 (다른 draft 오염 방지)
    setSiQuery(`${g.outline_type_name || g.outline_type || ''} ${g.outline_num} - ${g.title}`);
    setSiNotes({}); setSiDetails({}); setSiExpanded({}); setSiSaveMsg(''); setSiDraftInfo(null); setSiNoteInfo(null);
    // 소주제 로드 (version 포함 — 같은 번호 다른 버전 섞임 방지)
    const oid = `${g.outline_type || 'S-34'}_${g.outline_num}`;
    setSiSubLoading(true);
    outlineDetail(oid, g.outline_type_name || g.outline_type || '', g.version || '').then(r => { setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || ''); }).catch(() => setSiSubtopics({})).finally(() => setSiSubLoading(false));
    // draft/note 체크는 연사/날짜 변경 시 useEffect에서 처리
    // 기본 날짜
    if (!siDate) { const d = new Date(); setSiDate(String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')); }
  };

  const handleClearOutline = () => {
    setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({}); setSiExpanded({});
  };

  const handleVerseToggle = (ptKey, scriptures) => {
    const open = !siVerseOpen[ptKey];
    setSiVerseOpen(p => ({ ...p, [ptKey]: open }));
    if (open && !siVerseData[ptKey]) {
      setSiVerseLoading(p => ({ ...p, [ptKey]: true }));
      bibleLookup(scriptures)
        .then(r => setSiVerseData(p => ({ ...p, [ptKey]: r.verses || [] })))
        .catch(() => setSiVerseData(p => ({ ...p, [ptKey]: [] })))
        .finally(() => setSiVerseLoading(p => ({ ...p, [ptKey]: false })));
    }
  };

  // ── JSX ──
  return (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', padding: 14, overflow: 'hidden' }}>

          {siTransferMemo && (
            <div style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, fontSize: '0.786rem', color: 'var(--accent-orange)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              📋 메모에서 이동 중 — 저장하면 원본 메모가 삭제됩니다
              <div style={{ flex: 1 }} />
              <button onClick={() => setSiTransferMemo(null)} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>✕</button>
            </div>
          )}

          {/* Build-5D-2 (hotfix1): STT 원본 텍스트 상단 고정 — 원본 존재만으로 표시 (링크 독립) */}
          <OriginalBlock
            text={siSttOriginalText}
            onTextChange={setSiSttOriginalText}
            originType={siOriginType}
            editing={siSttOriginalEditing}
            onEditingChange={setSiSttOriginalEditing}
            collapsed={siSttOriginalCollapsed}
            onCollapsedChange={setSiSttOriginalCollapsed}
          />

          {/* 1. 골자 선택 / 자유 입력 */}
          <OutlineSelectorBar
            outline={siOutline}
            noOutline={siNoOutline}
            outlines={outlines}
            query={siQuery}
            freeTopic={siFreeTopic}
            freeType={siFreeType}
            onQueryChange={setSiQuery}
            onFreeTopicChange={setSiFreeTopic}
            onFreeTypeChange={setSiFreeType}
            onToggleMode={handleToggleMode}
            onSelectOutline={handleSelectOutline}
            onClearOutline={handleClearOutline}
          />

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

          {/* 3. 모드 전환 (골자 선택 시만) */}
          {siOutline && !siNoOutline && (
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
                        const ptKey = `${(stKey || '0').split('.')[0]}_${points[0].point_num}`;
                        if (!(newDetails[ptKey]?.text || '').trim()) newDetails[ptKey] = { ...newDetails[ptKey], text: note };
                      }
                    });
                    setSiDetails(newDetails);
                  }
                  setSiMode(k);
                }} style={{
                  flex: 1, padding: '6px 0', border: 'none', fontSize: '0.786rem', fontWeight: siMode === k ? 700 : 500, cursor: 'pointer',
                  background: siMode === k ? 'var(--bg-card, #fff)' : 'transparent',
                  color: siMode === k ? 'var(--accent)' : 'var(--c-muted)',
                  borderRadius: 8, fontFamily: 'inherit', transition: 'all 0.2s ease',
                  boxShadow: siMode === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{l}</button>
              ))}
            </div>
          )}

          {/* 6. 골자 없는 연설 — 자유 입력 */}
          {siNoOutline && (
            <FreeStructureEditor
              subtopics={siFreeSubtopics}
              onSubtopicsChange={setSiFreeSubtopics}
            />
          )}

          {/* 4. 간단 입력 모드 */}
          {siOutline && !siNoOutline && siMode === 'quick' && (
            <OutlineQuickEditor
              subtopics={siSubtopics}
              subLoading={siSubLoading}
              expanded={siExpanded}
              onExpandedChange={setSiExpanded}
              notes={siNotes}
              onNotesChange={setSiNotes}
              details={siDetails}
              onDetailsChange={setSiDetails}
              verseOpen={siVerseOpen}
              verseData={siVerseData}
              verseLoading={siVerseLoading}
              onVerseToggle={handleVerseToggle}
            />
          )}

          {/* 5. 상세 입력 모드 */}
          {siOutline && !siNoOutline && siMode === 'detail' && (
            <OutlineDetailEditor
              subtopics={siSubtopics}
              subLoading={siSubLoading}
              expanded={siExpanded}
              onExpandedChange={setSiExpanded}
              details={siDetails}
              onDetailsChange={setSiDetails}
              verseOpen={siVerseOpen}
              verseData={siVerseData}
              verseLoading={siVerseLoading}
              onVerseToggle={handleVerseToggle}
            />
          )}

          {/* 7. 저장/완료 버튼 (2층 구조) */}
          <SaveActions
            outline={siOutline}
            noOutline={siNoOutline}
            mode={siMode}
            saveMsg={siSaveMsg}
            draftInfo={siDraftInfo}
            noteInfo={siNoteInfo}
            saving={siSaving}
            completing={siCompleting}
            onSaveDraft={handleSaveDraft}
            onComplete={handleComplete}
            onReset={handleReset}
            onLoadDraft={handleLoadDraft}
            onDiscardDraft={handleDiscardDraft}
            onLoadNote={handleLoadNote}
          />

        </div>
  );
}
