import KoreanTextarea from '../../../components/KoreanTextarea';
import { cleanMd } from '../../../components/utils';

export default function OutlineDetailEditor({
  subtopics,
  subLoading,
  expanded,
  onExpandedChange,
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
        const stLabel2 = stKey || '전체 요점';
        const isOpen2 = stKey ? expanded[stKey] : (expanded[stLabel2] !== false);
        return (
        <div key={stLabel2} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--bd-light)', overflow: 'hidden' }}>
          <div onClick={() => onExpandedChange(p => ({ ...p, [stLabel2]: !isOpen2 }))} style={{
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
                const d = details[ptKey] || {};
                const upd = (field, val) => onDetailsChange(p => ({ ...p, [ptKey]: { ...p[ptKey], [field]: val } }));
                return (
                  <div key={pt.point_num} style={{ marginBottom: 8, padding: '8px 0', borderBottom: '1px solid var(--bd-light)' }}>
                    <div style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-text-dark)', marginBottom: 4 }}>
                      {pt.point_num}. {cleanMd(pt.content)}
                      {(() => { const scr = cleanMd(pt.scriptures || ''); const hasPub = scr.includes('「') || scr.includes('」'); const hasScr = scr && !hasPub; return (<>
                        {hasScr && (<>
                          <span onClick={() => onVerseToggle(ptKey, pt.scriptures)} style={{
                            display: 'inline-block', marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', cursor: 'pointer',
                            background: verseOpen[ptKey] ? 'var(--accent-purple)' : '#7F77DD0A', color: verseOpen[ptKey] ? '#fff' : 'var(--accent-purple)', fontWeight: 600, whiteSpace: 'nowrap',
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
                    {verseOpen[ptKey] && cleanMd(pt.scriptures || '') && !cleanMd(pt.scriptures || '').includes('「') && (
                      <div style={{ margin: '0 0 4px', padding: '4px 8px', borderRadius: 6, background: 'var(--bg-subtle, #EFEFF4)', border: '1px solid var(--bd-light)', fontSize: '0.786rem', lineHeight: 1.6, color: 'var(--c-text)' }}>
                        {verseLoading[ptKey] && <div style={{ height: 14, borderRadius: 4, background: 'linear-gradient(90deg, var(--bd-light) 25%, var(--bd-medium) 50%, var(--bd-light) 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
                        {!verseLoading[ptKey] && (verseData[ptKey] || []).length === 0 && <span style={{ color: 'var(--c-dim)' }}>본문을 찾을 수 없습니다.</span>}
                        {!verseLoading[ptKey] && (verseData[ptKey] || []).map((v, vi) => (
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
  );
}
