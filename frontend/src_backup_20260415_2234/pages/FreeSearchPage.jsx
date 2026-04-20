import { useState, useEffect, useMemo, Fragment } from 'react';
import { copyText as doCopyText } from '../components/copyUtil';
import KoreanTextarea from '../components/KoreanTextarea';
import { parseDocument, cleanMd, sourceLabel, tagLabel, tagColor } from '../components/utils';
import { BIBLE_ABBR, BIBLE_FULL } from '../utils/bible';
import { getBody } from '../utils/textHelpers';
import { freeSearch, dbUpdate, dbDelete } from '../api';

export default function FreeSearchPage({ fontSize }) {
  const _fs = (() => { try { return JSON.parse(localStorage.getItem('jw-free-state')); } catch(e) { return null; } })();
  const [query, setQuery] = useState(_fs?.query || '');
  const [results, setResults] = useState(_fs?.results || []);
  const [loading, setLoading] = useState(false);
  const [showCount, setShowCount] = useState(20);
  useEffect(() => {
    try {
      if (results.length > 0) localStorage.setItem('jw-free-state', JSON.stringify({ query, results }));
      else localStorage.removeItem('jw-free-state');
    } catch(e) {}
  }, [query, results]);
  const [copied, setCopied] = useState({});
  const [dbEditIdx, setDbEditIdx] = useState(-1);
  const [dbEditVal, setDbEditVal] = useState('');
  const [dbStat, setDbStat] = useState('');
  const [expandedFree, setExpandedFree] = useState({});
  const [chipFilter, setChipFilter] = useState('전체');
  const [dbEditMeta, setDbEditMeta] = useState({});

  const scriptureMatch = (scriptures, q) => {
    const s = (scriptures || '').toLowerCase();
    if (s.includes(q)) return true;
    const parts = q.match(/^(\S+)\s*(.*)/);
    if (!parts) return false;
    const book = parts[1], rest = parts[2];
    const alt = BIBLE_ABBR[book] || BIBLE_FULL[book] || Object.entries(BIBLE_ABBR).find(([k, v]) => v.toLowerCase() === book)?.[0];
    if (alt && s.includes((alt + ' ' + rest).trim().toLowerCase())) return true;
    return false;
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setResults([]); setShowCount(20); setCopied({}); setDbEditIdx(-1);
    try { const res = await freeSearch(query.trim(), 40); setResults(res.results || []); }
    catch (e) { alert('검색 오류: ' + e.message); }
    finally { setLoading(false); }
  };

  const copyText = (idx, text) => {
    doCopyText(text);
    setCopied(p => ({ ...p, [idx]: true }));
    setTimeout(() => setCopied(p => ({ ...p, [idx]: false })), 2000);
  };

  const filtered = useMemo(() => {
    if (chipFilter === '전체') return results;
    return results.filter(r => {
      const col = r.collection || '';
      const src = r.metadata?.source || '';
      const tags = r.metadata?.tags || '';
      const kw = r.metadata?.keywords || '';
      if (chipFilter === '골자') return col === 'speech_points' || src === 'outline';
      if (chipFilter === '연설') return col === 'speech_expressions' && (src === 'speech' || src === 'note') && !tags;
      if (chipFilter === '표현/예시') return col === 'speech_expressions' && tags;
      if (chipFilter === '키워드') return !!kw;
      if (chipFilter === '출판물') return col === 'publications' || src === 'publication';
      if (chipFilter === '봉사모임') return src === 'service';
      if (chipFilter === '방문') return src === 'visit';
      return true;
    });
  }, [results, chipFilter]);

  const iS = { padding: '6px 10px', border: '1px solid var(--bd)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-input)', boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 8px' }}>
          <KoreanTextarea value={query} onChange={setQuery} placeholder="검색어를 입력하세요 (예: 대속물, 부활 희망, 용서)"
            rows={5} style={{ display: 'block', width: '100%', padding: 12, boxSizing: 'border-box', border: 'none', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', resize: 'vertical', lineHeight: 1.8 }} />
        </div>
        <div style={{ padding: '4px 14px 2px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2,
            background: 'var(--bg-subtle, #f5f5f5)', borderRadius: 10, padding: 2,
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }} className="chat-input">
            {['전체', '연설', '표현/예시', '키워드', '출판물', '봉사모임', '방문', '골자'].map(f => (
              <button key={f} onClick={() => setChipFilter(f)} style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 11.5, fontWeight: chipFilter === f ? 700 : 500,
                border: 'none', whiteSpace: 'nowrap', flexShrink: 0,
                background: chipFilter === f ? 'var(--bg-card, #fff)' : 'transparent',
                color: chipFilter === f ? '#1D9E75' : 'var(--c-muted)',
                cursor: 'pointer', fontFamily: 'inherit',
                transition: 'all 0.2s ease',
                boxShadow: chipFilter === f ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{f}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 14px 6px' }}>
          <div style={{ flex: 1 }} />
          {(query.trim() || results.length > 0) && (
            <button onClick={() => { setQuery(''); setResults([]); setShowCount(20); setCopied({}); setDbEditIdx(-1); setExpandedFree({}); setChipFilter('전체'); }}
              style={{
                width: 22, height: 22, borderRadius: 11, border: 'none', padding: 0,
                background: 'var(--bg-subtle, #f5f5f5)', color: 'var(--c-dim)',
                fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
          )}
          <button onClick={doSearch} disabled={loading || !query.trim()} style={{
            width: 80, padding: '5px 0', borderRadius: 8, border: 'none', textAlign: 'center',
            background: (loading || !query.trim()) ? 'var(--bd-medium)' : '#1D9E75', color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: (loading || !query.trim()) ? 'default' : 'pointer',
            position: 'relative', overflow: 'hidden',
          }}>
            {loading && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
            <span style={{ position: 'relative', zIndex: 1 }}>검색</span>
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--c-muted)', marginBottom: 8, textAlign: 'center' }}>
          {chipFilter !== '전체' ? `${filtered.length}/${results.length}건 (${chipFilter})` : `${results.length}건`}
        </div>
      )}

      {filtered.slice(0, showCount).map((r, i) => {
        const meta = r.metadata || {};
        const col = r.collection || 'speech_points';
        const parsed = parseDocument(r.text || '');
        const body = getBody(r.text || '');
        const score = Math.round((r.score || 0) / 0.035 * 100);
        const gt = meta.outline_type || '', gn = meta.outline_num || '';
        let prefix = '';
        if (gt === '공개강연' || gt.startsWith('S-34')) prefix = 'S-34_' + (gn || '').replace(/^0+/, '').padStart(3, '0');
        else if (gt === '기념식' || gt.startsWith('S-31')) prefix = 'S-31_기념식';
        else if (gt.startsWith('JWBC-')) prefix = gn ? gt + '_' + gn : gt;
        else if (gn) prefix = gn;
        const isPub = col === 'publications';
        return (
          <div key={i} style={{
            borderRadius: 8, overflow: 'hidden', marginBottom: 8,
            border: '1px solid var(--bd-soft)', background: 'var(--bg-card)',
          }}>
            {/* 헤더 */}
            <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: tagColor[col] || 'var(--c-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || tagLabel[col] || col}</span>
                {meta.speaker && <span style={{ fontSize: 11, color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                {meta.date && meta.date !== '0000' && <span style={{ fontSize: 10, color: 'var(--c-dim)' }}>{meta.date}</span>}
                {meta.service_type && meta.service_type !== '일반' && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--tint-green-soft)', color: '#2e7d32', fontWeight: 600 }}>{meta.service_type}</span>}
                {meta.tags && (() => {
                  const t = meta.tags;
                  const badges = [];
                  if (t.includes('표현')) badges.push({ label: '표현', bg: '#D85A30' });
                  if (t.includes('예시(실화)')) badges.push({ label: '예시·실화', bg: '#C7842D' });
                  if (t.includes('예시(비유)')) badges.push({ label: '예시·비유', bg: '#C7842D' });
                  if (t.includes('예시(성경)')) badges.push({ label: '예시·성경', bg: '#2D8FC7' });
                  if (!badges.length && t.includes('예시')) badges.push({ label: '예시', bg: '#C7842D' });
                  return badges.map((b, bi) => <span key={bi} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 3, background: b.bg, color: '#fff', fontWeight: 700 }}>{b.label}</span>);
                })()}
                <div style={{ flex: 1 }} />
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 44, height: 4, borderRadius: 2, background: 'var(--bg-dim)', overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: Math.min(score, 100) + '%', height: '100%', borderRadius: 2, background: score > 80 ? '#1D9E75' : score > 50 ? '#BA7517' : '#c44' }} />
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--c-muted)', minWidth: 26 }}>{Math.min(score, 100)}%</span>
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                <div style={{ flex: 1 }} />
                {dbEditIdx !== i && (
                  <>
                    <button onClick={() => copyText(i, body)} style={{
                      padding: '2px 6px', borderRadius: 4, border: '1px solid ' + (copied[i] ? '#1D9E75' : 'var(--bd)'),
                      background: copied[i] ? 'var(--tint-green)' : 'var(--bg-card)', color: copied[i] ? '#1D9E75' : 'var(--c-faint)',
                      fontSize: 9, cursor: 'pointer', fontWeight: 600,
                    }}>{copied[i] ? '✓ 복사됨' : '복사'}</button>
                    <button onClick={() => { setDbEditIdx(i); setDbEditVal(r.text || ''); setDbEditMeta({ point_content: meta.point_content || '', pub_code: meta.pub_code || '', keywords: parsed?.keywords || '', scriptures: parsed?.scripture || '', outline_title: meta.outline_title || meta.topic || '', source: meta.source || '', sub_source: meta.sub_source || '', service_type: meta.service_type || '' }); setDbStat(''); }} style={{
                      padding: '2px 6px', borderRadius: 4, border: '1px solid var(--tint-red-bd)',
                      background: 'var(--bg-card)', color: '#c44', fontSize: 9, cursor: 'pointer', minWidth: 32, textAlign: 'center',
                    }}>DB</button>
                  </>
                )}
              </div>
            </div>
            {/* 메타 그리드 */}
            {(() => {
              const cColor = tagColor[col] || 'var(--c-muted)';
              const title = meta.outline_title || '';
              const metaRows = [
                isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: '#7F77DD' },
                isPub && meta.pub_title && { label: '출판물명', value: meta.pub_title },
                !isPub && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
                (parsed?.subtopic || meta.sub_topic || meta.subtopic) && { label: '소주제', value: parsed?.subtopic || meta.sub_topic || meta.subtopic },
                (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: cColor },
                cleanMd(parsed?.scripture || meta.scriptures || '') && { label: '성구', value: cleanMd(parsed?.scripture || meta.scriptures || ''), color: '#2D8FC7' },
                (parsed?.keywords || meta.keywords) && { label: '키워드', value: parsed?.keywords || meta.keywords },
              ].filter(Boolean);
              return metaRows.length > 0 ? (
                <div style={{ padding: '8px 10px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline', fontSize: 12, lineHeight: 1.8, color: 'var(--c-sub)' }}>
                  {metaRows.map((row, mi) => (
                    <Fragment key={mi}>
                      <span style={{ fontSize: 9, color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                      <span style={{ fontSize: 11, color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                    </Fragment>
                  ))}
                </div>
              ) : null;
            })()}
            {body && dbEditIdx !== i && (
              <div style={{ padding: '6px 10px 10px', borderTop: '1px solid var(--bd-light)' }}>
                <div style={{ fontSize: 13, lineHeight: 1.9, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: expandedFree[i] ? 400 : 80, overflow: expandedFree[i] ? 'auto' : 'hidden' }}>
                  {body.length > 150 && !expandedFree[i] ? body.slice(0, 150) + '...' : body}
                </div>
                {body.length > 150 && (
                  <button onClick={() => setExpandedFree(p => ({ ...p, [i]: !p[i] }))} style={{
                    marginTop: 4, padding: '2px 10px', borderRadius: 4, border: '1px solid var(--bd)', background: 'var(--bg-subtle)', color: 'var(--c-faint)', fontSize: 10, cursor: 'pointer',
                  }}>{expandedFree[i] ? '접기' : '전체 보기'}</button>
                )}
              </div>
            )}
            {dbEditIdx === i && (
              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--tint-red-bd)' }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#c44', marginBottom: 6 }}>DB 직접 편집</div>
                {(meta.mode === 'manual' || meta.pub_type === 'manual') && (<>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>출처</div>
                    <select value={dbEditMeta.source || ''} onChange={e => { const s = e.target.value; setDbEditMeta(p => ({ ...p, source: s, sub_source: s === '연설' ? '공개 강연' : s === '토의' ? '파수대' : '', service_type: '' })); }}
                      style={{ width: '100%', padding: '3px 4px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 10, outline: 'none', boxSizing: 'border-box' }}>
                      {['연설', '토의', '봉사 모임', '방문', 'JW 방송', '메모'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>구분</div>
                    <input value={dbEditMeta.sub_source || ''} onChange={e => setDbEditMeta(p => ({ ...p, sub_source: e.target.value }))}
                      style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 10, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  {(dbEditMeta.source === '봉사 모임' || dbEditMeta.sub_source === '기타 연설' || dbEditMeta.service_type) && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>종류</div>
                      <input value={dbEditMeta.service_type || ''} onChange={e => setDbEditMeta(p => ({ ...p, service_type: e.target.value }))}
                        style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 10, outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>주제</div>
                    <input value={dbEditMeta.outline_title || ''} onChange={e => setDbEditMeta(p => ({ ...p, outline_title: e.target.value }))}
                      style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>출판물</div>
                    <input value={dbEditMeta.pub_code || ''} onChange={e => setDbEditMeta(p => ({ ...p, pub_code: e.target.value }))}
                      style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>요점</div>
                  <input value={dbEditMeta.point_content || ''} onChange={e => setDbEditMeta(p => ({ ...p, point_content: e.target.value }))}
                    style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>키워드</div>
                    <input value={dbEditMeta.keywords || ''} onChange={e => setDbEditMeta(p => ({ ...p, keywords: e.target.value }))}
                      placeholder="쉼표 구분" style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: 'var(--c-muted)', marginBottom: 1 }}>성구</div>
                    <input value={dbEditMeta.scriptures || ''} onChange={e => setDbEditMeta(p => ({ ...p, scriptures: e.target.value }))}
                      placeholder="사 53:3" style={{ width: '100%', padding: '3px 6px', border: '1px solid var(--bd)', borderRadius: 4, fontSize: 11, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                </>)}
                <KoreanTextarea value={dbEditVal} onChange={setDbEditVal} rows={8}
                  style={{ display: 'block', width: '100%', padding: 10, boxSizing: 'border-box',
                    border: '1px solid var(--tint-red-bd)', borderRadius: 8, background: 'var(--bg-card)', color: 'var(--c-text-dark)',
                    fontSize: 12, lineHeight: 1.7, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 4, marginTop: 6, alignItems: 'center' }}>
                  <button onClick={async () => {
                    setDbStat('저장 중...');
                    try {
                      let finalText = dbEditVal;
                      const tagUpdates = [['출처', dbEditMeta.source || ''], ['골자', dbEditMeta.outline_title ? (meta.outline_num ? meta.outline_num + ' - ' : '') + dbEditMeta.outline_title : ''], ['요점', dbEditMeta.point_content || ''], ['키워드', dbEditMeta.keywords || ''], ['성구', dbEditMeta.scriptures || ''], ['출판물', dbEditMeta.pub_code || '']];
                      for (const [tag, val] of tagUpdates) { const regex = new RegExp(`^\\[${tag}\\].*$`, 'm'); if (regex.test(finalText)) { finalText = val ? finalText.replace(regex, `[${tag}] ${val}`) : finalText.replace(regex, '').replace(/\n{3,}/g, '\n\n'); } else if (val) { const idx = finalText.indexOf('\n\n'); if (idx >= 0) finalText = finalText.slice(0, idx) + `\n[${tag}] ${val}` + finalText.slice(idx); else finalText = `[${tag}] ${val}\n\n` + finalText; } }
                      finalText = finalText.replace(/\n{3,}/g, '\n\n').trim();
                      await dbUpdate(col, r.id, finalText, dbEditMeta);
                      setResults(prev => prev.map(rr => rr.id === r.id ? { ...rr, text: finalText, metadata: { ...rr.metadata, ...dbEditMeta } } : rr));
                      setDbStat('저장 완료'); setTimeout(() => { setDbEditIdx(-1); setDbStat(''); }, 1000);
                    } catch (e) { setDbStat('오류: ' + e.message); }
                  }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid #D85A30', background: '#D85A30', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>DB 저장</button>
                  <button onClick={async () => {
                    if (!confirm('이 항목을 DB에서 삭제하시겠습니까?')) return;
                    setDbStat('삭제 중...');
                    try {
                      await dbDelete(col, r.id);
                      setResults(prev => prev.filter(rr => rr.id !== r.id));
                      setDbEditIdx(-1); setDbStat('');
                    } catch (e) { setDbStat('오류: ' + e.message); }
                  }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid #c44', background: 'var(--bg-card)', color: '#c44', fontSize: 11, cursor: 'pointer' }}>삭제</button>
                  <button onClick={() => { setDbEditIdx(-1); setDbStat(''); }} style={{ padding: '3px 10px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: 11, cursor: 'pointer' }}>취소</button>
                  {dbStat && <span style={{ fontSize: 10, color: dbStat.startsWith('오류') ? '#c44' : '#1D9E75', fontWeight: 600 }}>{dbStat}</span>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {filtered.length > showCount && (
        <button onClick={() => setShowCount(s => s + 20)} style={{
          display: 'block', width: '100%', padding: '10px 0', borderRadius: 8,
          border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)',
          fontSize: 12, cursor: 'pointer', marginBottom: 8,
        }}>더 보기 ({showCount}/{filtered.length})</button>
      )}
    </div>
  );
}
