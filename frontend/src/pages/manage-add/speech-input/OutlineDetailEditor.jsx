import KoreanTextarea from '../../../components/KoreanTextarea';
import { cleanMd } from '../../../components/utils';
import { parseScriptures } from './helpers';
import PublicationBadge from './PublicationBadge';
import VerseBadge from './VerseBadge';
import ScriptureUsageToggle from './ScriptureUsageToggle';
import VersePanel from './VersePanel';

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
                      {(() => { const { scr, hasPub, hasScr } = parseScriptures(pt.scriptures); return (<>
                        {hasScr && (<>
                          <VerseBadge open={verseOpen[ptKey]} scr={scr} onClick={() => onVerseToggle(ptKey, pt.scriptures)} />
                          <ScriptureUsageToggle value={d.scripture_usage || ''} onClick={() => { const nv = (d.scripture_usage || '') === '낭독' ? '' : '낭독'; upd('scripture_usage', nv); }} />
                        </>)}
                        {hasPub && <PublicationBadge text={scr} />}
                      </>); })()}
                    </div>
                    {verseOpen[ptKey] && cleanMd(pt.scriptures || '') && !cleanMd(pt.scriptures || '').includes('「') && <VersePanel loading={verseLoading[ptKey]} verses={verseData[ptKey]} />}
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
