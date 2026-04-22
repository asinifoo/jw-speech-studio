export default function OriginalBlock({
  text,
  onTextChange,
  originType,
  editing,
  onEditingChange,
  collapsed,
  onCollapsedChange,
}) {
  if (!text) return null;
  const isQuick = originType === 'quick';
  const c = isQuick ? 'var(--accent-orange)' : 'var(--accent-blue)';
  const cAlpha05 = isQuick ? 'rgba(216,90,48,0.05)' : 'rgba(55,138,221,0.05)';
  const cAlpha10 = isQuick ? 'rgba(216,90,48,0.1)' : 'rgba(55,138,221,0.1)';
  const cAlpha20 = isQuick ? 'rgba(216,90,48,0.2)' : 'rgba(55,138,221,0.2)';
  const label = isQuick ? '빠른 입력 원본' : 'STT 원본';
  return (
    <div style={{ marginBottom: 12, border: `1px solid ${c}`, borderRadius: 8, background: cAlpha05, overflow: 'hidden' }}>
      <div onClick={() => onCollapsedChange(v => !v)}
        style={{ padding: '8px 10px', background: cAlpha10, borderBottom: collapsed ? 'none' : `1px solid ${cAlpha20}`, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <span style={{ fontSize: '0.714rem', fontWeight: 700, color: c }}>{label}</span>
        <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flex: 1 }}>
          {collapsed ? '클릭하여 펼치기' : '클릭하여 접기'}
        </span>
        {!collapsed && (
          <button onClick={(e) => { e.stopPropagation(); onEditingChange(v => !v); }}
            style={{
              padding: '2px 8px', border: `1px solid ${c}`,
              background: editing ? c : 'transparent',
              color: editing ? '#fff' : c,
              borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600,
            }}>
            {editing ? '편집 종료' : '편집'}
          </button>
        )}
        <span style={{ fontSize: '0.786rem', color: c }}>{collapsed ? '▼' : '▲'}</span>
      </div>
      {!collapsed && (
        <div style={{ padding: 10 }}>
          {editing ? (
            <textarea value={text} onChange={e => onTextChange(e.target.value)}
              style={{
                width: '100%', minHeight: 150, maxHeight: 400, padding: 8,
                border: '1px solid var(--bd)', borderRadius: 6,
                fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit',
                background: 'var(--bg-card)', color: 'var(--c-text-dark)',
                outline: 'none', resize: 'vertical', boxSizing: 'border-box',
              }} />
          ) : (
            <div style={{
              padding: 8, background: 'var(--bg-card)', borderRadius: 6,
              maxHeight: 250, overflowY: 'auto',
              fontSize: '0.857rem', lineHeight: 1.6,
              color: 'var(--c-text-dark)', whiteSpace: 'pre-wrap', userSelect: 'text',
            }}>{text}</div>
          )}
          <div style={{ marginTop: 6, fontSize: '0.643rem', color: 'var(--c-dim)' }}>
            원본을 참고하여 아래 구조화 영역에 분류해 사용하세요.
            {editing && ' (편집 중)'}
          </div>
        </div>
      )}
    </div>
  );
}
