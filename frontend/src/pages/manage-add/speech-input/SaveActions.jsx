export default function SaveActions({
  outline,
  noOutline,
  mode,
  saveMsg,
  draftInfo,
  noteInfo,
  saving,
  completing,
  onSaveDraft,
  onComplete,
  onReset,
  onLoadDraft,
  onDiscardDraft,
  onLoadNote,
}) {
  if (!outline && !noOutline) return null;
  return (
    <div style={{ marginTop: 10 }}>
      {/* draft 불러오기 안내 */}
      {draftInfo && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--tint-blue-soft)', border: '1px solid var(--tint-blue-bd)', marginBottom: 8 }}>
          <div style={{ fontSize: '0.786rem', color: 'var(--accent-blue)', fontWeight: 600, marginBottom: 6 }}>기존 임시저장 데이터 있음 ({draftInfo.filled}/{draftInfo.total} {draftInfo.mode === 'quick' ? '소주제 메모' : '요점'} 입력)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onLoadDraft} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>불러오기</button>
            <button onClick={onDiscardDraft} style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>새로 만들기</button>
          </div>
        </div>
      )}
      {/* 간단 메모 불러오기 안내 (상세 입력 모드에서) */}
      {noteInfo && mode === 'detail' && (
        <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--tint-orange-soft)', border: '1px solid #ffcc80', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.786rem', color: 'var(--accent-orange)', fontWeight: 600 }}>간단 입력 데이터 있음</span>
          <div style={{ flex: 1 }} />
          <button onClick={onLoadNote} style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: 'var(--accent-orange)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>불러오기</button>
        </div>
      )}

      {/* [저장] = draft만 저장 */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onSaveDraft} disabled={saving || completing} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--bd)',
          background: saving ? 'var(--bd-medium)' : 'var(--bg-card)', color: 'var(--c-text-dark)',
          fontSize: '0.929rem', fontWeight: 600, cursor: saving ? 'default' : 'pointer',
        }}>
          {saving ? '임시저장 중...' : '임시저장'}
        </button>

        {/* [완료] = DB 저장 + draft 삭제 (상세 입력 or 자유 입력) */}
        {(mode === 'detail' || noOutline) && <button onClick={onComplete} disabled={saving || completing} style={{
          flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
          background: completing ? 'var(--bd-medium)' : 'var(--accent)', color: '#fff',
          fontSize: '0.929rem', fontWeight: 700, cursor: completing ? 'default' : 'pointer',
          position: 'relative', overflow: 'hidden',
        }}>
          {completing && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
          <span style={{ position: 'relative', zIndex: 1 }}>{completing ? '저장 중...' : '저장'}</span>
        </button>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <div style={{ flex: 1 }} />
        <button onClick={onReset} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>초기화</button>
      </div>
      {saveMsg && <div style={{ marginTop: 6, fontSize: '0.786rem', textAlign: 'center', color: saveMsg.startsWith('✓') ? 'var(--accent)' : 'var(--c-danger)', fontWeight: 600 }}>{saveMsg}</div>}
    </div>
  );
}
