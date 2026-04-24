import { useState } from 'react';
import { S } from '../../../styles';
import { getOutlinePrefix } from '../../../utils/outlineFormat';

export default function OutlineSelectorBar({
  outline,
  noOutline,
  outlines,
  query,
  freeTopic,
  freeType,
  onQueryChange,
  onFreeTopicChange,
  onFreeTypeChange,
  onToggleMode,
  onSelectOutline,
  onClearOutline,
}) {
  const [queryFocus, setQueryFocus] = useState(false);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ ...S.pillContainer, marginBottom: 8 }}>
        {[['outline', '골자 선택'], ['free', '자유 입력']].map(([k, l]) => (
          <button key={k} onClick={() => onToggleMode(k === 'free')} style={{ ...S.pillL4(k === 'free' ? noOutline : !noOutline), padding: '6px 0' }}>{l}</button>
        ))}
      </div>

      {!noOutline && (
        <div style={{ position: 'relative' }}>
          <input value={query} onChange={e => onQueryChange(e.target.value)} onFocus={() => setQueryFocus(true)} onBlur={() => setTimeout(() => setQueryFocus(false), 200)}
            placeholder="골자 번호 또는 제목 검색..." style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          {queryFocus && query.trim() && (() => {
            const q = query.trim().toLowerCase();
            const matched = outlines.filter(g => (g.outline_num || '').toLowerCase().includes(q) || (g.title || '').toLowerCase().includes(q) || (g.outline_type_name || '').toLowerCase().includes(q));
            if (!matched.length) return null;
            return (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} className="chat-input">
                {matched.map(g => (
                  <div key={g.filename} onMouseDown={() => { setQueryFocus(false); onSelectOutline(g); }} style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem', flexShrink: 0 }}>{getOutlinePrefix(g.outline_type, g.outline_num)}</span>
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

      {outline && !noOutline && (
        <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 8, background: 'var(--tint-green)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{outline.outline_type_name || outline.outline_type}</span>
          <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem' }}>{outline.outline_num}</span>
          <span style={{ fontSize: '0.786rem', color: 'var(--c-text)' }}>{outline.title}</span>
          <div style={{ flex: 1 }} />
          <button onClick={onClearOutline} style={{ padding: '2px 6px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>✕</button>
        </div>
      )}

      {noOutline && (
        <div style={{ marginTop: 6 }}>
          {/* 연설 유형 */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>연설 유형</div>
            <select value={freeType} onChange={e => onFreeTypeChange(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', outline: 'none', boxSizing: 'border-box', appearance: 'none', cursor: 'pointer' }}>
              {['생활과봉사', 'JW방송', '대회', '기타'].map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
          {/* 주제 */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ fontSize: '0.643rem', color: 'var(--c-muted)', marginBottom: 3 }}>주제</div>
            <input value={freeTopic} onChange={e => onFreeTopicChange(e.target.value)} placeholder="연설 주제 입력..."
              style={{ width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          </div>
        </div>
      )}
    </div>
  );
}
