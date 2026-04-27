import { useState, useEffect } from 'react';
import { copyText } from '../components/copyUtil';
import KoreanTextarea from '../components/KoreanTextarea';
import { getTranscriptBody } from '../utils/textHelpers';
import { listTranscripts, dbUpdate, dbDelete } from '../api';
import { useConfirm } from '../providers/ConfirmProvider';
import { useAlert } from '../providers/AlertProvider';
import { getOutlinePrefix } from '../utils/outlineFormat';
import { getOutlineCategory, OUTLINE_CATEGORIES } from '../utils/outlineCategory';
import { MSG, getStatusColor } from '../utils/messages';

export default function TranscriptPage({ fontSize }) {
  const showConfirm = useConfirm();
  const showAlert = useAlert();
  const [transcripts, setTranscripts] = useState({});
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('공개 강연');
  const [selOutline, setSelOutline] = useState('');
  const [selSpeaker, setSelSpeaker] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [editStat, setEditStat] = useState('');
  const [copyLabel, setCopyLabel] = useState('복사');
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    listTranscripts().then(r => setTranscripts(r.transcripts || {}))
      .catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  const getCategory = (t) => getOutlineCategory(
    t.outline_type || '',
    t.outline_num || '',
    t.source || ''
  );

  const getPrefix = (t) => {
    const gt = t?.outline_type || ''; const gn = t?.outline_num || '';
    return getOutlinePrefix(gt, gn);
  };

  const categories = OUTLINE_CATEGORIES;
  const filteredKeys = Object.keys(transcripts).filter(k => getCategory(transcripts[k]) === category).filter(k => {
    if (!searchQ.trim()) return true;
    const q = searchQ.trim().toLowerCase();
    const t = transcripts[k];
    return (t.outline_title || t.outline_title || '').toLowerCase().includes(q) || (t.outline_num || t.outline_num || '').toLowerCase().includes(q) || getPrefix(t).toLowerCase().includes(q) || (t.speakers || []).some(s => (s.speaker || '').toLowerCase().includes(q));
  }).sort((a, b) => {
    const pa = getPrefix(transcripts[a]), pb = getPrefix(transcripts[b]);
    return pa.localeCompare(pb);
  });
  const speakers = selOutline ? (transcripts[selOutline]?.speakers || []) : [];
  const catCounts = {};
  categories.forEach(c => { catCounts[c] = Object.keys(transcripts).filter(k => getCategory(transcripts[k]) === c).length; });

  const iS = { padding: '6px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' };

  return (
    <div>
      {loading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.857rem', padding: 20 }}>로딩...</div>}
      {!loading && Object.keys(transcripts).length === 0 && (
        <div style={{ textAlign: 'center', padding: 20 }}>
          <div style={{ color: 'var(--c-dim)', fontSize: '0.857rem', marginBottom: 8 }}>저장된 원문이 없습니다. Manage {'>'} Add에서 원문을 추가하세요.</div>
          <button onClick={() => { setLoading(true); listTranscripts()
              .then(r => { setTranscripts(r.transcripts || {}); showAlert(MSG.success.reload, { variant: 'success' }); })
              .catch(e => showAlert(MSG.fail.reload + e.message, { variant: 'error' }))
              .finally(() => setLoading(false)); }}
            style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>새로고침</button>
        </div>
      )}
      {!loading && Object.keys(transcripts).length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 14, overflow: 'hidden' }}>
          {/* 카드 헤더 언더라인 */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--bd-light)', background: 'var(--bg-subtle)' }}>
            {categories.map(c => {
              const active = category === c;
              const cnt = catCounts[c] || 0;
              return (
                <button key={c} onClick={() => { setCategory(c); setSelOutline(''); setSelSpeaker(null); setExpanded(false); setEditing(false); setSearchQ(''); }} style={{
                  flex: 1, padding: '9px 0 7px', border: 'none', borderBottom: active ? '2px solid var(--accent-orange)' : '2px solid transparent',
                  background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: active ? 700 : 500, color: active ? 'var(--accent-orange)' : 'var(--c-muted)', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{c}</span>
                  <span style={{ fontSize: '0.571rem', fontWeight: 600, color: active ? 'var(--accent-orange)' : 'var(--c-dim)', visibility: cnt > 0 ? 'visible' : 'hidden' }}>{cnt}</span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: '10px 14px 8px' }}>
            <input value={searchQ} onChange={e => { setSearchQ(e.target.value); setSelOutline(''); setSelSpeaker(null); }} placeholder="번호, 제목, 연사 검색..."
              style={{ width: '100%', padding: '8px 12px', border: 'none', borderRadius: 8, fontSize: '0.929rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
            borderTop: '1px solid var(--bd-light)',
          }}>
            <span style={{ fontSize: '0.786rem', color: 'var(--c-muted)' }}>{filteredKeys.length}개 연설</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => { setLoading(true); listTranscripts()
                .then(r => { setTranscripts(r.transcripts || {}); showAlert(MSG.success.reload, { variant: 'success' }); })
                .catch(e => showAlert(MSG.fail.reload + e.message, { variant: 'error' }))
                .finally(() => setLoading(false)); }}
              style={{ padding: '4px 10px', borderRadius: 8, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', transition: 'all 0.15s' }}>새로고침</button>
          </div>
          {filteredKeys.length > 0 && (
            <div style={{ maxHeight: 200, overflowY: 'auto', margin: '0 14px 8px', borderRadius: 8, border: '1px solid var(--bd-light)' }} className="chat-input">
              {filteredKeys.map(k => {
                const t = transcripts[k];
                const isSelected = selOutline === k;
                return (
                  <div key={k} onClick={() => { setSelOutline(isSelected ? '' : k); setSelSpeaker(null); setExpanded(false); setEditing(false); }} style={{
                    padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd-light)',
                    background: isSelected ? 'var(--tint-green)' : 'var(--bg-card)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem', flexShrink: 0 }}>{getPrefix(t)}</span>
                    <span style={{ flex: 1, fontSize: '0.786rem', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.outline_title || t.outline_title || ''}</span>
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{t.speakers.length}명</span>
                  </div>
                );
              })}
            </div>
          )}
          {filteredKeys.length === 0 && (
            <div style={{ fontSize: '0.786rem', color: 'var(--c-dim)', padding: '8px 14px' }}>이 종류에 저장된 원문이 없습니다.</div>
          )}
          {speakers.length > 0 && (
            <div style={{ padding: '8px 14px 10px', borderTop: '1px solid var(--bd-light)' }}>
              <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 4 }}>연사</div>
              <div style={{
                display: 'grid', gridTemplateColumns: `repeat(${Math.min(speakers.length, 4)}, 1fr)`, gap: 3,
              }}>
                {speakers.map((s, i) => (
                  <button key={i} onClick={() => { setSelSpeaker(selSpeaker?.id === s.id ? null : s); setExpanded(false); setEditing(false); }} style={{
                    padding: '6px 4px', borderRadius: 8, border: 'none',
                    background: selSpeaker?.id === s.id ? '#1D9E7512' : 'var(--bg-subtle, #EFEFF4)',
                    color: selSpeaker?.id === s.id ? 'var(--accent)' : 'var(--c-muted)',
                    fontSize: '0.786rem', fontWeight: selSpeaker?.id === s.id ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'center',
                    transition: 'all 0.15s',
                    boxShadow: selSpeaker?.id === s.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                  }}>
                    <span>{s.speaker}</span>
                    <span style={{ fontSize: '0.571rem', color: 'var(--c-dim)' }}>{s.date}{s.subtopic ? ' v' + s.subtopic : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {selSpeaker && (
        <div style={{ borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '10px 14px', background: 'var(--tint-green)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '0.929rem', color: 'var(--accent)' }}>
                {getPrefix(transcripts[selOutline])} {transcripts[selOutline]?.outline_title || ''}
              </div>
              <div style={{ fontSize: '0.786rem', color: 'var(--c-faint)', marginTop: 2 }}>{selSpeaker.speaker} | {selSpeaker.date}{selSpeaker.subtopic ? ' | v' + selSpeaker.subtopic : ''}</div>
            </div>
          </div>
          {!editing && (
            <div style={{ padding: '16px 20px', fontSize: '1.0rem', lineHeight: 2, whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: expanded ? 'none' : 300, overflow: expanded ? 'visible' : 'hidden' }}>
              {getTranscriptBody(selSpeaker.text)}
            </div>
          )}
          {editing && (
            <div style={{ padding: '8px 14px' }}>
              <KoreanTextarea value={editVal} onChange={setEditVal} rows={12} style={{ display: 'block', width: '100%', padding: '10px 12px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
            </div>
          )}
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--bd-light)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {!editing && (
              <>
                <button onClick={() => setExpanded(p => !p)} style={{ padding: '4px 14px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>{expanded ? '접기' : '전체 보기'}</button>
                <button onClick={async () => { const ok = await copyText(getTranscriptBody(selSpeaker.text)); if (ok) { setCopyLabel('복사됨'); setTimeout(() => setCopyLabel('복사'), 1500); } }} style={{ padding: '4px 14px', borderRadius: 8, border: '1px solid ' + (copyLabel === '복사됨' ? 'var(--accent)' : 'var(--bd)'), background: copyLabel === '복사됨' ? 'var(--tint-green)' : 'var(--bg-card)', color: copyLabel === '복사됨' ? 'var(--accent)' : 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer', fontWeight: copyLabel === '복사됨' ? 600 : 400 }}>{copyLabel}</button>
                <div style={{ flex: 1 }} />
                <button onClick={() => { setEditing(true); setEditVal(selSpeaker.text); setEditStat(''); }} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--accent-purple)', background: 'var(--bg-card)', color: 'var(--accent-purple)', fontSize: '0.786rem', cursor: 'pointer' }}>수정</button>
                <button onClick={async () => {
                  if (!await showConfirm('이 원문을 삭제하시겠습니까?', { confirmVariant: 'danger' })) return;
                  try {
                    await dbDelete(selSpeaker.collection, selSpeaker.id);
                    setTranscripts(prev => {
                      const next = { ...prev };
                      if (next[selOutline]) {
                        next[selOutline] = { ...next[selOutline], speakers: next[selOutline].speakers.filter(s => s.id !== selSpeaker.id) };
                        if (next[selOutline].speakers.length === 0) delete next[selOutline];
                      }
                      return next;
                    });
                    setSelSpeaker(null);
                  } catch (e) { showAlert(MSG.fail.delete + e.message, { variant: 'error' }); }
                }} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.786rem', cursor: 'pointer' }}>삭제</button>
              </>
            )}
            {editing && (
              <>
                <button onClick={async () => {
                  setEditStat(MSG.progress.save);
                  try {
                    await dbUpdate(selSpeaker.collection, selSpeaker.id, editVal);
                    selSpeaker.text = editVal;
                    setSelSpeaker({ ...selSpeaker });
                    setEditing(false); setEditStat('');
                  } catch (e) { setEditStat(MSG.fail.update + e.message); }
                }} style={{ padding: '4px 14px', borderRadius: 8, border: '1px solid var(--accent-purple)', background: 'var(--accent-purple)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>저장</button>
                <button onClick={() => { setEditing(false); setEditStat(''); }} style={{ padding: '4px 14px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                {editStat && <span style={{ fontSize: '0.786rem', color: getStatusColor(editStat) }}>{editStat}</span>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
