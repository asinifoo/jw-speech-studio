/* global React */
const { useState: useStateSC, useRef: useRefSC, useCallback: useCallbackSC } = React;

// Presets:
// default (green): 연설, 봉사, 방문, DB관리, 검색결과 → [수정][DB]
// readonly (purple): AI 대화 답변 → [복사] only, no checkbox
// raw (orange): 원문, 연사메모 → [수정][DB] or [삭제] when unchecked
const CARD_PRESETS = {
  default:  { actionColor: 'var(--accent)',        actionBd: 'var(--tint-green-bd)' },
  readonly: { actionColor: 'var(--accent-purple)',  actionBd: 'var(--tint-purple-bd)' },
  raw:      { actionColor: 'var(--accent-orange)',  actionBd: 'var(--tint-orange-bd)' },
};

const SearchCard = ({ card, preset = 'default' }) => {
  const [expanded, setExpanded] = useStateSC(false);
  const [checked, setChecked] = useStateSC(card.checked !== false);
  const p = CARD_PRESETS[preset] || CARD_PRESETS.default;
  const isFiltered = card.filtered;
  const isEdited = card.edited;

  const headerClick = useCallbackSC((e) => {
    // Don't toggle if clicking buttons
    if (e.target.closest('button') || e.target.closest('input[type="checkbox"]')) return;
    if (preset !== 'readonly') setChecked(v => !v);
  }, [preset]);

  const borderColor = isFiltered ? 'var(--tint-red-bd)' : isEdited ? 'var(--tint-blue-bd)' : 'var(--bd-soft)';
  const cardBg = isFiltered ? 'var(--tint-red-soft)' : isEdited ? 'var(--tint-blue-soft)' : 'var(--bg-card)';
  const headerBg = isFiltered ? 'var(--tint-red)' : 'var(--bg-subtle)';

  // XS button style
  const xsBtn = (color, bd) => ({
    height: 20, padding: '0 8px', borderRadius: 5,
    border: `1px solid ${bd || 'var(--bd)'}`, background: 'var(--bg-card)',
    color: color || 'var(--c-faint)', fontSize: '0.643rem',
    cursor: 'pointer', minWidth: 36, fontFamily: 'inherit',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  });

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${borderColor}`,
      background: cardBg,
      opacity: checked ? 1 : 0.5,
    }}>
      {/* ── Header ── */}
      <div onClick={headerClick} style={{
        padding: '8px 10px', cursor: preset !== 'readonly' ? 'pointer' : 'default',
        background: headerBg,
        borderBottom: '1px solid var(--bd-light)',
      }}>
        {/* Row 1: [checkbox] · dot · source · speaker · date ... score% */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {preset !== 'readonly' && (
            <input type="checkbox" checked={checked} onChange={() => setChecked(v => !v)}
              onClick={e => e.stopPropagation()}
              style={{ cursor: 'pointer', accentColor: card.dotColor || p.actionColor }} />
          )}
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: card.dotColor || 'var(--c-muted)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-hint)' }}>{card.source || ''}</span>
          {card.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{card.speaker}</span>}
          {card.stamp && <span style={{ fontSize: '0.714rem', color: 'var(--c-dim)', fontVariantNumeric: 'tabular-nums' }}>{card.stamp}</span>}

          {/* Inline tag badges */}
          {card.tags && card.tags.map((t, i) => (
            <span key={i} style={{ fontSize: '0.571rem', padding: '1px 5px', borderRadius: 3, background: t.bg, color: t.fg || '#fff', fontWeight: 700 }}>{t.label}</span>
          ))}
          {card.favorite && <span style={{ fontSize: '0.714rem', color: 'var(--accent-gold)' }}>★</span>}
          {card.rating > 0 && <span style={{ fontSize: '0.571rem', color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(card.rating)}{'☆'.repeat(5 - card.rating)}</span>}
          {isEdited && <span style={{ fontSize: '0.643rem', padding: '1px 4px', borderRadius: 3, background: 'var(--tint-blue)', color: 'var(--accent-blue)', fontWeight: 600 }}>편집됨</span>}
          {isFiltered && <span style={{ fontSize: '0.714rem', fontWeight: 700, color: 'var(--c-danger)' }}>LLM 제외</span>}

          <div style={{ flex: 1 }} />

          {/* Score bar + percentage (right-aligned) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <div style={{ width: 50, height: 4, background: 'var(--bg-muted)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.round((card.relevance || 0) * 100)}%`, height: '100%', background: card.dotColor || p.actionColor, borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: '0.786rem', color: card.dotColor || p.actionColor, fontVariantNumeric: 'tabular-nums', fontWeight: 700, minWidth: 28 }}>{Math.round((card.relevance || 0) * 100)}%</span>
          </div>
        </div>

        {/* Row 2: search_source tag ... [수정][DB] or [복사] or [삭제] */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          {card.searchSource && (
            <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', padding: '0 4px', borderRadius: 3, background: 'var(--bg)' }}>{card.searchSource}</span>
          )}
          <div style={{ flex: 1 }} />
          {preset === 'readonly' ? (
            <button onClick={e => e.stopPropagation()} style={xsBtn(p.actionColor, p.actionBd)}>복사</button>
          ) : !checked && preset === 'raw' ? (
            <button onClick={e => e.stopPropagation()} style={xsBtn('var(--c-danger)', 'var(--tint-red-bd)')}>삭제</button>
          ) : (
            <>
              <button onClick={e => e.stopPropagation()} style={xsBtn(p.actionColor, p.actionBd)}>수정</button>
              <button onClick={e => e.stopPropagation()} style={xsBtn('var(--c-danger)', 'var(--tint-red-bd)')}>DB</button>
            </>
          )}
        </div>
      </div>

      {/* ── Body: meta grid ── */}
      <div style={{ padding: '8px 10px', fontSize: '0.857rem', lineHeight: 1.8, color: 'var(--c-sub)' }}>
        {card.meta && card.meta.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline', marginBottom: 6 }}>
            {card.meta.map(([label, value, color], i) => (
              <React.Fragment key={i}>
                <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{label}</span>
                <span style={{ fontSize: '0.714rem', color: color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{value}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Publication reference strip */}
        {card.pubRef && (
          <div style={{
            margin: '0 -10px', padding: '6px 10px',
            background: 'var(--tint-purple)', borderTop: '1px solid var(--tint-purple-bd)',
            borderBottom: '1px solid var(--tint-purple-bd)',
            display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '0.714rem', marginBottom: 6,
          }}>
            <span style={{ fontSize: '0.571rem', padding: '1px 3px', borderRadius: 2, background: 'var(--accent-purple)', color: '#fff', fontWeight: 800, flexShrink: 0, marginTop: 2 }}>P</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ color: '#6b5fbd', fontWeight: 600 }}>{card.pubRef.code}</span>
              {card.pubRef.desc && <div style={{ color: 'var(--c-faint)', fontSize: '0.714rem', lineHeight: 1.5, marginTop: 1 }}>{card.pubRef.desc}</div>}
            </div>
            <button onClick={e => e.stopPropagation()} style={{ padding: '1px 6px', borderRadius: 3, border: '1px solid var(--tint-purple-input)', background: 'var(--bg-card)', color: 'var(--accent-purple)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600, flexShrink: 0, fontFamily: 'inherit' }}>보기</button>
          </div>
        )}

        {/* Content with inline expand + fade gradient */}
        {card.body && (
          <div>
            <div style={{
              maxHeight: expanded ? 400 : '4.2em',
              overflow: expanded ? 'auto' : 'hidden',
              position: 'relative',
              transition: 'max-height 0.2s ease',
              fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-text)',
              wordBreak: 'keep-all', whiteSpace: 'pre-wrap',
            }}>
              {card.body}
              {!expanded && card.body.length > 120 && (
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2em', background: `linear-gradient(transparent, ${isFiltered ? 'var(--tint-red-soft)' : isEdited ? 'var(--tint-blue-soft)' : 'var(--bg-card)'})`, pointerEvents: 'none' }} />
              )}
            </div>
            {card.body.length > 120 && (
              <button onClick={() => setExpanded(!expanded)} style={{
                marginTop: 4, padding: '4px 12px', borderRadius: 8,
                border: '1px solid var(--bd-light)', background: 'var(--bg-card)',
                color: 'var(--c-sub)', fontSize: '0.786rem', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>{expanded ? '접기' : '전체 보기'}</button>
            )}
          </div>
        )}
      </div>

      {/* ── Memo strip ── */}
      {card.memo && (
        <div style={{
          margin: '0 10px 6px', padding: '4px 8px',
          background: 'var(--bg-subtle)', borderRadius: 4,
          fontSize: '0.786rem', color: 'var(--c-sub)', lineHeight: 1.5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>💭 {card.memo}</div>
      )}

      {/* ── 골자에서 사용 strip ── */}
      {card.usedIn && (
        <div style={{
          padding: '4px 10px 6px', borderTop: '1px solid var(--tint-purple-bd)',
          background: 'var(--tint-purple)', fontSize: '0.786rem', color: 'var(--c-sub)',
        }}>📚 {card.usedIn}개 골자에서 사용 ▼</div>
      )}
    </div>
  );
};

window.JW_SearchCard = SearchCard;
window.JW_CARD_PRESETS = CARD_PRESETS;
