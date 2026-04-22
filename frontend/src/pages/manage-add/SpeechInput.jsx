import { useState, useEffect, useRef } from 'react';
import KoreanTextarea from '../../components/KoreanTextarea';
import { S } from '../../styles';
import { bibleLookup, draftSave, draftLoad, draftComplete, draftDelete, draftCheck, dbDelete, saveSpeech, outlineDetail, listBySource } from '../../api';
import { cleanMd } from '../../components/utils';
import OriginalBlock from './speech-input/OriginalBlock';

// si* state 초기값 복원
const _siInit = (() => { try { return JSON.parse(localStorage.getItem('jw-speech-state')) || {}; } catch { return {}; } })();
const _siDateDefault = (() => { const d = new Date(); return String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0'); })();

export default function ManageSpeechInput({ siTransferTick, outlines }) {

  // ── si* state (33개) ──
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
  const [siFreeSubtopics, setSiFreeSubtopics] = useState(_siInit.freeSubtopics || []); // [{ title, memo }]
  const [siFreeMode, setSiFreeMode] = useState(_siInit.freeMode || 'subtopic'); // 항상 'subtopic' (bulk 제거됨)
  const [siFreeType, setSiFreeType] = useState(_siInit.freeType || '생활과 봉사'); // 생활과 봉사 | JW방송 | 대회 | 기타
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
    outlineDetail(oid, siOutline.outline_type_name || siOutline.outline_type || '', siOutline.version || '', siOutline.outline_year || '').then(r => { setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || ''); }).catch(() => {}).finally(() => setSiSubLoading(false));
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
    setSiExpanded({}); setSiNoOutline(false); setSiFreeText(''); setSiFreeTopic(''); setSiFreeSubtopics([]); setSiFreeType('생활과 봉사');
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
      setSiFreeType(t.free_type || '생활과 봉사');
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
        outlineDetail(oid, oType, matched.version || '', matched.outline_year || '').then(r => {
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
  }, [siTransferTick]);

  // ── useEffect 4: draft/note 체크 ──
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
        if ((pts || []).some(pt => { const d = r.details?.[`${stKey.split('.')[0]}_${pt.point_num}`]; return d && ((d.text || '').trim() || (d.tags || '').trim()); })) exp[stKey] = true;
      });
      setSiExpanded(exp);
      setSiDraftInfo(null);
      setSiSaveMsg('✓ 임시저장 불러오기 완료');
    }
  };

  const handleDiscardDraft = async () => {
    if (!confirm('기존 데이터가 삭제됩니다. 새로 만드시겠습니까?')) return;
    await draftDelete(siDraftInfo.draft_id);
    setSiNotes({}); setSiDetails({}); setSiExpanded({});
    setSiDraftInfo(null);
    setSiSaveMsg('✓ 기존 임시저장 삭제, 새로 시작');
  };

  const handleLoadNote = () => {
    const text = (siNoteInfo.text || '').replace(/\[.*?\].*\n?/g, '').trim();
    if (text) {
      const keys = Object.keys(siSubtopics);
      if (keys.length) setSiNotes(p => ({ ...p, [keys[0]]: text }));
    }
    setSiNoteInfo(null);
    setSiSaveMsg('✓ 간단 메모 불러오기 완료');
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
      setSiSaveMsg('✓ 임시저장 완료');
    } catch (e) { setSiSaveMsg('오류: ' + e.message); }
    finally { setSiSaving(false); }
  };

  const handleComplete = async () => {
    // 공통 검증
    if (!siSpeaker.trim()) { alert('연사를 입력해주세요'); return; }
    if (!siDate.trim()) { alert('날짜를 입력해주세요'); return; }

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
              outline_type_name: siFreeType || '생활과 봉사',
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
        setSiSaveMsg(`✓ ${res.total_new || 0}건 저장 완료 (임시저장 삭제됨)`);
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
        if (res.status === 'error') { setSiSaveMsg(res.message); setSiCompleting(false); return; }
        if (siTransferMemo) { try { await dbDelete(siTransferMemo.col, siTransferMemo.id); } catch {} setSiTransferMemo(null); }
        setSiSaveMsg(`✓ ${res.total}건 저장 완료 (임시저장 삭제됨)`);
        setSiNotes({}); setSiDetails({});
        // ManageDbTab이 mode='mydb' 활성 시 체크하여 연설 탭 캐시 무효화.
        localStorage.setItem('jw-db-stale-tab', '연설');
      }
    } catch (e) { setSiSaveMsg('오류: ' + e.message); }
    finally { setSiCompleting(false); }
  };

  const handleReset = () => {
    if (!confirm('입력한 내용을 모두 초기화하시겠습니까?')) return;
    setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiSpeaker(''); setSiDate(_siDateDefault);
    setSiMode('quick'); setSiExpanded({}); setSiNotes({}); setSiDetails({});
    setSiNoOutline(false); setSiFreeText(''); setSiFreeTopic(''); setSiFreeSubtopics([]); setSiFreeType('생활과 봉사'); siDraftLoadedRef.current = false;
    setSiSourceSttJobId(''); setSiSttOriginalText(''); setSiSttOriginalEditing(false); setSiSttOriginalCollapsed(false);
    setSiVerseOpen({}); setSiVerseData({}); setSiSaveMsg(''); setSiDraftInfo(null); setSiNoteInfo(null);
    try { localStorage.removeItem('jw-speech-state'); } catch {}
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
          <div style={{ marginBottom: 10 }}>
            <div style={{ ...S.pillContainer, marginBottom: 8 }}>
              {[['outline', '골자 선택'], ['free', '자유 입력']].map(([k, l]) => (
                <button key={k} onClick={() => {
                  const isFree = k === 'free';
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
                      if (!window.confirm(msg)) return;
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
                      if (!window.confirm(msg)) return;
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
                }} style={{ ...S.pillL4(k === 'free' ? siNoOutline : !siNoOutline), padding: '6px 0' }}>{l}</button>
              ))}
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
                          setSiSourceSttJobId(''); // 골자 선택 시 STT 링크 해제 (다른 draft 오염 방지)
                          setSiQuery(`${g.outline_type_name || g.outline_type || ''} ${g.outline_num} - ${g.title}`);
                          setSiQueryFocus(false);
                          setSiNotes({}); setSiDetails({}); setSiExpanded({}); setSiSaveMsg(''); setSiDraftInfo(null); setSiNoteInfo(null);
                          // 소주제 로드 (version 포함 — 같은 번호 다른 버전 섞임 방지)
                          const oid = `${g.outline_type || 'S-34'}_${g.outline_num}`;
                          setSiSubLoading(true);
                          outlineDetail(oid, g.outline_type_name || g.outline_type || '', g.version || '', g.outline_year || '').then(r => { setSiSubtopics(r.subtopics || {}); setSiOutlineNote(r.note || ''); }).catch(() => setSiSubtopics({})).finally(() => setSiSubLoading(false));
                          // draft/note 체크는 연사/날짜 변경 시 useEffect에서 처리
                          // 기본 날짜
                          if (!siDate) { const d = new Date(); setSiDate(String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0')); }
                        }} style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem', flexShrink: 0 }}>{g.outline_num}</span>
                          {g.outline_year && <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 600,
                            background: 'var(--tint-orange, #fef3ec)', color: 'var(--accent-orange)',
                            flexShrink: 0, lineHeight: 1.3,
                          }}>{g.outline_year}년</span>}
                          {g.version && <span style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 600,
                            background: 'var(--tint-blue, #eef4fb)', color: 'var(--accent-blue)',
                            flexShrink: 0, lineHeight: 1.3,
                          }}>v{g.version}</span>}
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
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem' }}>{siOutline.outline_num}</span>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-text)' }}>{siOutline.title}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setSiOutline(null); setSiSubtopics({}); setSiQuery(''); setSiNotes({}); setSiDetails({}); setSiExpanded({}); }} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>✕</button>
              </div>
            )}

            {siNoOutline && (
              <div style={{ marginTop: 6 }}>
                {/* 연설 유형 */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>연설 유형</div>
                  <select value={siFreeType} onChange={e => setSiFreeType(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box', appearance: 'none', cursor: 'pointer' }}>
                    {['생활과 봉사', 'JW방송', '대회', '기타'].map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
                {/* 주제 */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>주제</div>
                  <input value={siFreeTopic} onChange={e => setSiFreeTopic(e.target.value)} placeholder="연설 주제 입력..."
                    style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
                </div>
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
                  color: siMode === k ? 'var(--accent)' : 'var(--c-muted)',
                  borderRadius: 8, fontFamily: 'inherit', transition: 'all 0.2s ease',
                  boxShadow: siMode === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                }}>{l}</button>
              ))}
            </div>
          )}

          {/* 6. 골자 없는 연설 — 자유 입력 */}
          {siNoOutline && (
            <div style={{ marginBottom: 10 }}>
              {/* subtopic 단일 모드 */}
              {(<>
                {siFreeSubtopics.map((st, si) => {
                  const isStandaloneTopLevel = st._mode === 'top';
                  return (
                  <div key={si} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--bd-light)', overflow: 'hidden' }}>
                    {!isStandaloneTopLevel && (
                      <div style={{ padding: '6px 10px', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--bd-light)' }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: '0.714rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{si + 1}</span>
                        <input value={st.title} onChange={e => setSiFreeSubtopics(p => p.map((x, j) => j === si ? { ...x, title: e.target.value } : x))} placeholder="소주제 제목" style={{ flex: 1, padding: '4px 8px', border: 'none', borderRadius: 6, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'transparent', boxSizing: 'border-box' }} />
                        <button onClick={() => setSiFreeSubtopics(p => p.filter((_, j) => j !== si))} style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                      </div>
                    )}
                    {/* 요점 배열 */}
                    <div style={{ padding: '6px 10px' }}>
                      <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 6 }}>요점</div>
                      {(st.points || []).map((pt, pi) => {
                        const curTags = (pt.tags || '').split(',').map(s => s.trim()).filter(Boolean);
                        const ptLabel = isStandaloneTopLevel ? `요점 ${pi + 1}` : `${si + 1}.${pi + 1}`;
                        const showScrInput = pt._scripturesOpen || (pt.scriptures || '').trim();
                        const showPubInput = pt._publicationsOpen || (pt.publications || '').trim();
                        const updPoint = (field, val) => setSiFreeSubtopics(p => p.map((x, j) =>
                          j === si ? { ...x, points: (x.points || []).map((pp, pj) => pj === pi ? { ...pp, [field]: val } : pp) } : x
                        ));
                        return (
                        <div key={pi} style={{ marginBottom: 6, padding: 8, borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)' }}>
                          {/* 헤더 */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <span style={{ fontSize: '0.714rem', fontWeight: 600, color: 'var(--accent-blue)', flexShrink: 0 }}>{ptLabel}</span>
                            <div style={{ flex: 1 }} />
                            <button onClick={() => setSiFreeSubtopics(p => p.map((x, j) =>
                              j === si ? { ...x, points: (x.points || []).filter((_, pj) => pj !== pi) } : x
                            ))} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>✕</button>
                          </div>
                          {/* 1. 요점 제목 */}
                          <input value={pt.title || ''}
                            onChange={e => updPoint('title', e.target.value)}
                            placeholder="요점 제목 (예: 남편은 아내를 사랑해야)"
                            style={{ display: 'block', width: '100%', padding: '5px 7px', boxSizing: 'border-box', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.786rem', fontWeight: 600, fontFamily: 'inherit', outline: 'none', marginBottom: 6 }} />
                          {/* 2. 성구 (접기/펼치기) */}
                          {showScrInput ? (
                            <input value={pt.scriptures || ''}
                              onChange={e => updPoint('scriptures', e.target.value)}
                              placeholder="성구 (여러 개는 ; 로 구분, 예: 엡 5:28; 시편 119:105)"
                              style={{ width: '100%', padding: '4px 7px', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.714rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
                          ) : (
                            <button onClick={() => updPoint('_scripturesOpen', true)}
                              style={{ width: '100%', padding: '4px 10px', borderRadius: 4, border: '1px dashed var(--bd-light)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left' }}>
                              + 성구 추가
                            </button>
                          )}
                          {/* 3. 출판물 (접기/펼치기) */}
                          {showPubInput ? (
                            <input value={pt.publications || ''}
                              onChange={e => updPoint('publications', e.target.value)}
                              placeholder="출판물 (여러 개는 ; 로 구분, 예: 파21 8월호 p.15 §3)"
                              style={{ width: '100%', padding: '4px 7px', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.714rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
                          ) : (
                            <button onClick={() => updPoint('_publicationsOpen', true)}
                              style={{ width: '100%', padding: '4px 10px', borderRadius: 4, border: '1px dashed var(--bd-light)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left' }}>
                              + 출판물 추가
                            </button>
                          )}
                          {/* 4. 키워드 */}
                          <input value={pt.keywords || ''}
                            onChange={e => updPoint('keywords', e.target.value)}
                            placeholder="키워드 (쉼표 구분)"
                            style={{ width: '100%', padding: '4px 7px', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.714rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
                          {/* 5. 태그 */}
                          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                            {['표현', '예시·실화', '예시·비유', '예시·성경'].map(tag => {
                              const active = curTags.includes(tag);
                              return (
                                <button key={tag} onClick={() => {
                                  const next = active ? curTags.filter(t => t !== tag) : [...curTags, tag];
                                  updPoint('tags', next.join(','));
                                }} style={{
                                  padding: '3px 8px', borderRadius: 6, fontSize: '0.714rem', fontWeight: active ? 700 : 500, cursor: 'pointer',
                                  border: 'none',
                                  background: active ? (tag === '표현' ? '#D85A3018' : tag === '예시·성경' ? '#2D8FC718' : '#C7842D18') : 'var(--bg-card)',
                                  color: active ? (tag === '표현' ? 'var(--accent-orange)' : tag === '예시·성경' ? '#2D8FC7' : 'var(--accent-brown)') : 'var(--c-muted)',
                                  transition: 'all 0.15s',
                                }}>{tag}</button>
                              );
                            })}
                          </div>
                          {/* 6. 연설 내용 */}
                          <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 3 }}>연설 내용</div>
                          <textarea value={pt.content || ''}
                            onChange={e => updPoint('content', e.target.value)}
                            placeholder="실제 연설 내용을 입력하세요..." rows={3}
                            style={{ display: 'block', width: '100%', padding: '5px 7px', boxSizing: 'border-box', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.786rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                        </div>
                        );
                      })}
                      {/* 최상위 모드에선 최하단 [+ 최상위 요점 추가]와 중복이므로 숨김 */}
                      {!isStandaloneTopLevel && (
                        <button onClick={() => setSiFreeSubtopics(p => p.map((x, j) =>
                          j === si ? { ...x, points: [...(x.points || []), { title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] } : x
                        ))} style={{
                          width: '100%', padding: '5px 0', borderRadius: 6, border: '1px dashed var(--bd-light)',
                          background: 'transparent', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer', fontFamily: 'inherit',
                        }}>+ 요점 추가</button>
                      )}
                    </div>
                  </div>
                  );
                })}
                {/* 버튼 완전 대칭 — 각 모드에서 해당 버튼만 노출 */}
                {(() => {
                  const isEmpty = siFreeSubtopics.length === 0;
                  const isTopMode = siFreeSubtopics.length === 1 && siFreeSubtopics[0]._mode === 'top';
                  const isSubtopicMode = siFreeSubtopics.some(s => s._mode === 'subtopic');
                  const canAddSubtopic = isEmpty || isSubtopicMode;
                  const canAddTopLevel = isEmpty || isTopMode;
                  return (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {canAddSubtopic && (
                        <button onClick={() => {
                          // 단순 소주제 추가 (Q10 편입 제거)
                          setSiFreeSubtopics(p => [...p, { title: '', memo: '', _mode: 'subtopic', points: [{ title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] }]);
                        }} style={{
                          flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--accent)',
                          background: 'var(--bg-card)', color: 'var(--accent)', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}>+ 소주제 추가</button>
                      )}
                      {canAddTopLevel && (
                        <button onClick={() => {
                          if (isEmpty) {
                            setSiFreeSubtopics([{ title: '', memo: '', _mode: 'top', points: [{ title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] }]);
                          } else {
                            setSiFreeSubtopics(p => p.map((x, j) =>
                              j === 0 ? { ...x, points: [...(x.points || []), { title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] } : x
                            ));
                          }
                        }} style={{
                          flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--accent-blue)',
                          background: 'var(--bg-card)', color: 'var(--accent-blue)', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                        }}>+ 최상위 요점 추가</button>
                      )}
                    </div>
                  );
                })()}
              </>)}
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
                              background: siVerseOpen[qPtKey] ? 'var(--accent-purple)' : '#7F77DD0A', color: siVerseOpen[qPtKey] ? '#fff' : 'var(--accent-purple)', fontWeight: 600, whiteSpace: 'nowrap',
                              transition: 'all 0.15s',
                            }}>📖 {scr}</span>
                            <span onClick={(e) => { e.stopPropagation(); const nv = qSu === '낭독' ? '' : '낭독'; setSiDetails(p => ({ ...p, [qPtKey]: { ...p[qPtKey], scripture_usage: nv } })); }} style={{
                              display: 'inline-block', marginLeft: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.571rem', cursor: 'pointer',
                              background: qSu === '낭독' ? 'var(--accent-orange)' : 'var(--bg-subtle, #EFEFF4)', color: qSu === '낭독' ? '#fff' : 'var(--c-dim)', fontWeight: 600,
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
                                <div key={vi}><span style={{ fontWeight: 700, color: 'var(--accent-purple)', marginRight: 4 }}>{v.ref}</span>{v.text}</div>
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
                                    background: siVerseOpen[ptKey] ? 'var(--accent-purple)' : '#7F77DD0A', color: siVerseOpen[ptKey] ? '#fff' : 'var(--accent-purple)', fontWeight: 600, whiteSpace: 'nowrap',
                                    transition: 'all 0.15s',
                                  }}>📖 {scr}</span>
                                  <span onClick={() => { const nv = (d.scripture_usage || '') === '낭독' ? '' : '낭독'; upd('scripture_usage', nv); }} style={{
                                    display: 'inline-block', marginLeft: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.571rem', cursor: 'pointer',
                                    background: d.scripture_usage === '낭독' ? 'var(--accent-orange)' : 'var(--bg-subtle, #EFEFF4)', color: d.scripture_usage === '낭독' ? '#fff' : 'var(--c-dim)', fontWeight: 600,
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
                                  <div key={vi}><span style={{ fontWeight: 700, color: 'var(--accent-purple)', marginRight: 4 }}>{v.ref}</span>{v.text}</div>
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
                                    color: active ? (tag === '표현' ? 'var(--accent-orange)' : tag === '예시·성경' ? '#2D8FC7' : 'var(--accent-brown)') : 'var(--c-muted)',
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
                                  color: (d.usage || '사용') === u ? 'var(--accent)' : 'var(--c-muted)',
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
                  <div style={{ fontSize: '0.786rem', color: 'var(--accent-blue)', fontWeight: 600, marginBottom: 6 }}>기존 임시저장 데이터 있음 ({siDraftInfo.filled}/{siDraftInfo.total} {siDraftInfo.mode === 'quick' ? '소주제 메모' : '요점'} 입력)</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={handleLoadDraft} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>불러오기</button>
                    <button onClick={handleDiscardDraft} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>새로 만들기</button>
                  </div>
                </div>
              )}
              {/* 간단 메모 불러오기 안내 (상세 입력 모드에서) */}
              {siNoteInfo && siMode === 'detail' && (
                <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: '0.786rem', color: 'var(--accent-orange)', fontWeight: 600 }}>간단 입력 데이터 있음</span>
                  <div style={{ flex: 1 }} />
                  <button onClick={handleLoadNote} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--accent-orange)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>불러오기</button>
                </div>
              )}

              {/* [저장] = draft만 저장 */}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleSaveDraft} disabled={siSaving || siCompleting} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--bd)',
                  background: siSaving ? 'var(--bd-medium)' : 'var(--bg-card)', color: 'var(--c-text-dark)',
                  fontSize: '0.929rem', fontWeight: 600, cursor: siSaving ? 'default' : 'pointer',
                }}>
                  {siSaving ? '임시저장 중...' : '임시저장'}
                </button>

                {/* [완료] = DB 저장 + draft 삭제 (상세 입력 or 자유 입력) */}
                {(siMode === 'detail' || siNoOutline) && <button onClick={handleComplete} disabled={siSaving || siCompleting} style={{
                  flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                  background: siCompleting ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
                  fontSize: '0.929rem', fontWeight: 700, cursor: siCompleting ? 'default' : 'pointer',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {siCompleting && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                  <span style={{ position: 'relative', zIndex: 1 }}>{siCompleting ? '저장 중...' : '저장'}</span>
                </button>}
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }} />
                <button onClick={handleReset} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>초기화</button>
              </div>
              {siSaveMsg && <div style={{ marginTop: 6, fontSize: '0.786rem', textAlign: 'center', color: siSaveMsg.startsWith('✓') ? 'var(--accent)' : 'var(--c-danger)', fontWeight: 600 }}>{siSaveMsg}</div>}
            </div>
          )}

        </div>
  );
}
