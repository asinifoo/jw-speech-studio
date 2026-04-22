import KoreanTextarea from '../../../components/KoreanTextarea';
import { cleanMd } from '../../../components/utils';
import { parseScriptures } from './helpers';

export default function OutlineQuickEditor({
  subtopics,
  subLoading,
  expanded,
  onExpandedChange,
  notes,
  onNotesChange,
  details,
  onDetailsChange,
  verseOpen,
  verseData,
  verseLoading,
  onVerseToggle,
}) {
  return (
    <div>
      {subLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 12 }}>소주제 로딩...</div>}
      {!subLoading && Object.keys(subtopics).length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 12 }}>소주제가 없습니다.</div>}
      {Object.entries(subtopics).map(([stKey, points]) => {
        const stLabel = stKey || '전체 요점';
        const isOpen = stKey ? expanded[stKey] : (expanded[stLabel] !== false); // 빈키는 기본 펼침
        return (
        <div key={stLabel} style={{ marginBottom: 6, borderRadius: 8, border: '1px solid var(--bd-light)', overflow: 'hidden' }}>
          <div onClick={() => onExpandedChange(p => ({ ...p, [stLabel]: !isOpen }))} style={{
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
                const qSu = (details[qPtKey] || {}).scripture_usage || '';
                const { scr, hasPub, hasScr } = parseScriptures(pt.scriptures);
                return (
                <div key={pi} style={{ fontSize: '0.786rem', color: 'var(--c-faint)', padding: '3px 0', borderBottom: pi < points.length - 1 ? '1px solid var(--bd-light)' : 'none' }}>
                  <span style={{ fontWeight: 600, color: 'var(--c-text)' }}>{pt.point_num}</span> {cleanMd(pt.content)}
                  {hasScr && (<>
                    <span onClick={(e) => { e.stopPropagation(); onVerseToggle(qPtKey, pt.scriptures); }} style={{
                      display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                      background: verseOpen[qPtKey] ? 'var(--accent-purple)' : '#7F77DD0A', color: verseOpen[qPtKey] ? '#fff' : 'var(--accent-purple)', fontWeight: 600, whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}>📖 {scr}</span>
                    <span onClick={(e) => { e.stopPropagation(); const nv = qSu === '낭독' ? '' : '낭독'; onDetailsChange(p => ({ ...p, [qPtKey]: { ...p[qPtKey], scripture_usage: nv } })); }} style={{
                      display: 'inline-block', marginLeft: 2, padding: '1px 5px', borderRadius: 4, fontSize: '0.571rem', cursor: 'pointer',
                      background: qSu === '낭독' ? 'var(--accent-orange)' : 'var(--bg-subtle, #EFEFF4)', color: qSu === '낭독' ? '#fff' : 'var(--c-dim)', fontWeight: 600,
                      transition: 'all 0.15s',
                    }}>낭독</span>
                  </>)}
                  {hasPub && (
                    <span style={{ display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', background: '#9C27B00A', color: '#9C27B0', fontWeight: 600, whiteSpace: 'nowrap' }}>📚 {scr}</span>
                  )}
                  {verseOpen[qPtKey] && hasScr && (
                    <div style={{ margin: '4px 0 2px 16px', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle, #EFEFF4)', border: '1px solid var(--bd-light)', fontSize: '0.786rem', lineHeight: 1.6, color: 'var(--c-text)' }}>
                      {verseLoading[qPtKey] && <div style={{ height: 14, borderRadius: 4, background: 'linear-gradient(90deg, var(--bd-light) 25%, var(--bd-medium) 50%, var(--bd-light) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                      {!verseLoading[qPtKey] && (verseData[qPtKey] || []).length === 0 && <span style={{ color: 'var(--c-dim)' }}>본문을 찾을 수 없습니다.</span>}
                      {!verseLoading[qPtKey] && (verseData[qPtKey] || []).map((v, vi) => (
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
            <KoreanTextarea value={notes[stKey] || ''} onChange={v => onNotesChange(p => ({ ...p, [stKey]: v }))} rows={2} placeholder="이 소주제에 대한 메모..."
              style={{ display: 'block', width: '100%', padding: '6px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
          </div>
        </div>
        );})}
    </div>
  );
}
