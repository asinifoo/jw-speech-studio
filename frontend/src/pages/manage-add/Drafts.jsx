import { useState } from 'react';
import { S } from '../../styles';
import { draftList, draftDelete, listBySource, dbDelete } from '../../api';

export default function ManageDrafts({
  dbDrafts, setDbDrafts,
  memoEntries, setMemoEntries,
  onDraftMove,
  onMemoMove,
}) {
  const [draftsFilter, setDraftsFilter] = useState('draft');
  const [memoMoveModal, setMemoMoveModal] = useState(null);
  const [memoLoading, setMemoLoading] = useState(false);

  return (
    <>
        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 12 }}>
          {/* 임시저장 하위 — 카드 헤더 언더라인 */}
          <div style={S.underlineContainer}>
            {[['draft', '연설 draft', 'var(--accent-blue)'], ['memo', '메모', 'var(--accent-orange)']].map(([k, l, c]) => {
              const active = draftsFilter === k;
              return (
                <button key={k} onClick={() => { setDraftsFilter(k); if (k === 'memo' && memoEntries.length === 0) { setMemoLoading(true); listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}).finally(() => setMemoLoading(false)); } }} style={S.underlineTab(active, c)}>
                  <span style={S.underlineLabel(active, c)}>{l}</span>
                  <span style={{ fontSize: '0.571rem', visibility: 'hidden' }}>0</span>
                </button>
              );
            })}
          </div>

        {/* 연설 draft 목록 */}
        {draftsFilter === 'draft' && (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{dbDrafts.length}건</span>
              <button onClick={() => { draftList().then(r => setDbDrafts(r.drafts || [])).catch(() => {}); }} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
            </div>
            {dbDrafts.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>임시저장된 데이터가 없습니다.</div>}
            {dbDrafts.map((dr, di) => {
              const isStt = !!dr.source_stt_job_id;
              // Hotfix 8: 빠른 입력 draft 감지 (outline_type='QUICK' 또는 outline_num prefix)
              const isQuickInput = (dr.outline_type === 'QUICK') || /^(SP|DC|SV|VS|PB|ET)_/.test(dr.outline_num || '');
              const quickTypeLabels = { speech: '연설', discussion: '토의', service: '봉사 모임', visit: '방문', publication: '출판물', other: '기타' };
              const quickTypeFromPrefix = (() => {
                const m = (dr.outline_num || '').match(/^([A-Z]{2})_/);
                const mp = { SP: 'speech', DC: 'discussion', SV: 'service', VS: 'visit', PB: 'publication', ET: 'other' };
                return m ? (mp[m[1]] || 'speech') : 'speech';
              })();
              return (
              <div key={dr.draft_id} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 6 }}>
                <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-blue)', flexShrink: 0 }} />
                  {isStt && <span title="STT에서 전달됨" style={{ fontSize: '0.643rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(55,138,221,0.15)', color: 'var(--accent-blue)', fontWeight: 600 }}>STT</span>}
                  {dr.outline_num && <span style={{ fontSize: '0.786rem', color: 'var(--accent)', fontWeight: 700 }}>{dr.outline_num}</span>}
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-text)' }}>{dr.outline_title || dr.free_topic || (isStt ? '(STT 녹음)' : '')}</span>
                  {dr.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{dr.speaker}</span>}
                  {dr.date && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{dr.date}</span>}
                  <div style={{ flex: 1 }} />
                  {!isStt && (isQuickInput
                    ? <span style={{ fontSize: '0.643rem', color: 'var(--accent-orange)', fontWeight: 600 }}>{(dr.free_text || '').length}자</span>
                    : <span style={{ fontSize: '0.643rem', color: 'var(--accent-blue)', fontWeight: 600 }}>{dr.filled}/{dr.total} {(dr.no_outline || dr.mode !== 'quick') ? '요점' : '소주제'}</span>
                  )}
                </div>
                <div style={{ padding: '6px 10px', display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{
                    isStt ? 'STT 자유 입력'
                      : isQuickInput ? `빠른 입력 · ${quickTypeLabels[quickTypeFromPrefix] || '연설'}`
                      : dr.no_outline ? '자유 입력'
                      : dr.mode === 'quick' ? '간단 입력'
                      : '상세 입력'
                  }</span>
                  {dr.saved_at && <span style={{ fontSize: '0.571rem', color: 'var(--c-dim)' }}>{dr.saved_at.split('T')[0]}</span>}
                  <div style={{ flex: 1 }} />
                  {/* Phase 5-2: 통합 [이동] 버튼 — draft 타입별 라우팅은 handleDraftMove 내부 */}
                  <button onClick={() => onDraftMove(dr)}
                    style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--bg-card)', color: 'var(--accent)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>
                    이동
                  </button>
                  <button onClick={async () => {
                    if (!confirm('이 임시저장을 삭제하시겠습니까?')) return;
                    await draftDelete(dr.draft_id);
                    setDbDrafts(p => p.filter((_, i) => i !== di));
                  }} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                </div>
              </div>
              );
            })}
          </div>
        )}

        {/* 메모 목록 */}
        {draftsFilter === 'memo' && (
          <div style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <div style={{ flex: 1 }} />
              <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{memoEntries.length}건</span>
              <button onClick={() => { setMemoLoading(true); listBySource('memo', 100).then(r => setMemoEntries(r.entries || [])).catch(() => {}).finally(() => setMemoLoading(false)); }} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
            </div>
            {memoLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 16 }}>로딩...</div>}
            {!memoLoading && memoEntries.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>저장된 메모가 없습니다.</div>}
            {!memoLoading && memoEntries.map((me, mi) => {
              const mt = me.metadata || {};
              const body = (me.text || me.document || '').split('\n').filter(l => !l.startsWith('[')).join('\n').trim();
              return (
                <div key={me.id} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 6 }}>
                  <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-orange)', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-text)', flex: 1 }}>{mt.outline_title || mt.topic || '(제목 없음)'}</span>
                    {mt.date && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{mt.date}</span>}
                  </div>
                  <div style={{ padding: '6px 10px' }}>
                    <div style={{ fontSize: '0.786rem', color: 'var(--c-sub)', lineHeight: 1.6, maxHeight: 60, overflow: 'hidden' }}>{body || '(내용 없음)'}</div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => setMemoMoveModal({ id: me.id, collection: 'speech_expressions', topic: mt.outline_title || mt.topic || '', body })}
                        style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent-orange)', background: 'var(--bg-card)', color: 'var(--accent-orange)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>이동</button>
                      <button onClick={async () => {
                        if (!confirm('이 메모를 삭제하시겠습니까?')) return;
                        await dbDelete('speech_expressions', me.id);
                        setMemoEntries(p => p.filter(e => e.id !== me.id));
                      }} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        </div>

        {/* 메모 이동 유형 선택 모달 */}
        {memoMoveModal && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}>
            <div style={{ width: '85%', maxWidth: 320, borderRadius: 16, background: 'var(--bg-card)', padding: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
                <span style={{ fontSize: '1.0rem', fontWeight: 700, flex: 1 }}>이동할 유형 선택</span>
                <button onClick={() => setMemoMoveModal(null)} style={{ width: 28, height: 28, borderRadius: 14, border: 'none', background: 'var(--bg-subtle)', color: 'var(--c-muted)', fontSize: '0.929rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
              {memoMoveModal.topic && <div style={{ fontSize: '0.786rem', color: 'var(--c-sub)', marginBottom: 10, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle)' }}>{memoMoveModal.topic}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[['speech_input', '연설 입력', 'var(--accent)'], ['discussion', '토의', 'var(--accent-blue)'], ['service', '봉사 모임', 'var(--accent)'], ['visit_input', '방문', 'var(--accent-orange)'], ['pub_input', '출판물', 'var(--accent-purple)']].map(([k, l, c]) => (
                  <button key={k} onClick={() => {
                    onMemoMove(k, memoMoveModal);
                    setMemoMoveModal(null);
                  }} style={{
                    padding: '10px 14px', borderRadius: 10, border: '1px solid var(--bd)',
                    background: 'var(--bg-card)', color: c, fontSize: '0.929rem', fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                  }}>{l}</button>
                ))}
              </div>
            </div>
          </div>
        )}
    </>
  );
}
