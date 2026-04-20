import { useState, useEffect } from 'react';
import { copyText } from '../components/copyUtil';
import KoreanTextarea from '../components/KoreanTextarea';
import { bibleSearch } from '../api';

export default function BibleSearchPage({ fontSize }) {
  const _bs = (() => { try { return JSON.parse(localStorage.getItem('jw-bible-state')); } catch(e) { return null; } })();
  const [query, setQuery] = useState(_bs?.query || '');
  const [results, setResults] = useState(_bs?.results || []);
  const [loading, setLoading] = useState(false);
  const [refCount, setRefCount] = useState(_bs?.refCount || 0);
  const [errors, setErrors] = useState([]);
  const [showCount, setShowCount] = useState(20);
  const [copied, setCopied] = useState({});
  const doCopy = async (key, text) => { const ok = await copyText(text); if (ok) { setCopied(p => ({ ...p, [key]: true })); setTimeout(() => setCopied(p => ({ ...p, [key]: false })), 1500); } };
  useEffect(() => {
    try {
      if (results.length > 0) localStorage.setItem('jw-bible-state', JSON.stringify({ query, results, refCount }));
      else localStorage.removeItem('jw-bible-state');
    } catch(e) {}
  }, [query, results, refCount]);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await bibleSearch(query.trim());
      setResults(res.results || []);
      setRefCount(res.ref_count || 0);
      setErrors(res.errors || []);
      setShowCount(20);
    } catch (e) {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ padding: '12px 14px 8px' }}>
          <KoreanTextarea
            value={query}
            onChange={setQuery}
            placeholder={"사 65:13\n잠 13:20\n고전 15:33\n딤후 3:16, 17\n요한 1서 2:15-17\n단 1:6-20"}
            rows={5}
            style={{
              display: 'block', width: '100%', padding: 12, boxSizing: 'border-box',
              border: 'none', borderRadius: 8, fontSize: 13, outline: 'none',
              fontFamily: 'inherit', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)',
              resize: 'vertical', lineHeight: 1.8,
            }}
          />
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
          borderTop: '1px solid var(--bd-light)',
        }}>
          {query.trim().split('\n').filter(l => l.trim()).length > 1 && (
            <span style={{ fontSize: 10, color: 'var(--c-dim)' }}>여러 줄 감지</span>
          )}
          <div style={{ flex: 1 }} />
          {(query.trim() || results.length > 0) && (
            <button onClick={() => { setQuery(''); setResults([]); setRefCount(0); setErrors([]); setShowCount(20); }}
              style={{
                width: 22, height: 22, borderRadius: 11, border: 'none', padding: 0,
                background: 'var(--bg-subtle, #f5f5f5)', color: 'var(--c-dim)',
                fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
          )}
          <button onClick={search} disabled={!query.trim() || loading} style={{
            width: 80, padding: '5px 0', borderRadius: 8, border: 'none', textAlign: 'center',
            background: query.trim() && !loading ? '#1D9E75' : 'var(--bd-medium)', color: '#fff',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'background 0.15s',
            position: 'relative', overflow: 'hidden',
          }}>
            {loading && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '30%', borderRadius: 8, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)', animation: 'shimmer 1.5s ease-in-out infinite' }} />}
            <span style={{ position: 'relative', zIndex: 1 }}>검색</span>
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--c-faint)' }}>참조 {refCount}건</span>
          {errors.length > 0 && (
            <span style={{ fontSize: 11, color: '#c44', fontWeight: 600 }}>오류 {errors.length}건</span>
          )}
          <button onClick={() => {
            const text = results.map(r => {
              const header = r.original;
              const body = r.verses.map(v =>
                r.verses.length > 1 ? `${v.verse} ${v.text}` : v.text
              ).join('\n');
              return `[${header}]\n${body}`;
            }).join('\n\n');
            doCopy('all', text);
          }} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (copied['all'] ? '#1D9E75' : 'var(--bd)'), background: copied['all'] ? 'var(--tint-green)' : 'var(--bg-card)', color: copied['all'] ? '#1D9E75' : 'var(--c-faint)', fontSize: 10, cursor: 'pointer', fontWeight: copied['all'] ? 600 : 400 }}>{copied['all'] ? '복사됨' : '전체 복사'}</button>
        </div>
      )}

      {results.slice(0, showCount).map((r, i) => (
        <div key={i} style={{
          borderRadius: 8, border: '1px solid var(--tint-blue-bd)',
          background: 'var(--tint-blue)', marginBottom: 8, overflow: 'hidden',
        }}>
          <div style={{
            padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--tint-blue-header)', borderBottom: '1px solid var(--tint-blue-bd)',
          }}>
            <span style={{
              width: 20, height: 20, borderRadius: 4, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 800, color: '#fff', background: '#D85A30',
            }}>B</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#2a7ab5' }}>{r.original}</span>
            {r.book && <span style={{ fontSize: 11, color: 'var(--c-faint)' }}>{r.book}</span>}
          </div>
          <div style={{
            padding: '10px 12px', fontSize: fontSize || 14, lineHeight: 1.9,
            color: 'var(--c-text)', userSelect: 'text',
          }}>
            {r.verses.map((v, vi) => (
              <div key={vi} style={{ display: 'flex', gap: 8, marginBottom: r.verses.length > 1 ? 4 : 0 }}>
                {r.verses.length > 1 && (
                  <span style={{ color: '#2a7ab5', fontWeight: 700, minWidth: 20, textAlign: 'right', flexShrink: 0 }}>{v.verse}</span>
                )}
                <span style={{ wordBreak: 'keep-all' }}>{v.text}</span>
              </div>
            ))}
          </div>
          <div style={{ padding: '4px 12px 8px', display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => { const body = r.verses.map(v => r.verses.length > 1 ? `${v.verse} ${v.text}` : v.text).join('\n'); doCopy('v'+i, r.original + '\n' + body); }}
              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (copied['v'+i] ? '#1D9E75' : 'var(--bd)'), background: copied['v'+i] ? 'var(--tint-green)' : 'var(--bg-card)', color: copied['v'+i] ? '#1D9E75' : 'var(--c-faint)', fontSize: 10, cursor: 'pointer', fontWeight: copied['v'+i] ? 600 : 400 }}>{copied['v'+i] ? '복사됨' : '복사'}</button>
            <button onClick={() => { doCopy('r'+i, r.original); }}
              style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid ' + (copied['r'+i] ? '#1D9E75' : 'var(--bd)'), background: copied['r'+i] ? 'var(--tint-green)' : 'var(--bg-card)', color: copied['r'+i] ? '#1D9E75' : 'var(--c-faint)', fontSize: 10, cursor: 'pointer', fontWeight: copied['r'+i] ? 600 : 400 }}>{copied['r'+i] ? '복사됨' : '성구'}</button>
            {r.not_found && r.not_found.length > 0 && (
              <span style={{ fontSize: 9, color: '#c44', marginLeft: 4 }}>⚠ 미발견: {r.not_found.join(', ')}</span>
            )}
            {r.warning && (
              <span style={{ fontSize: 9, color: '#D85A30', marginLeft: 4 }}>⚠ {r.warning}</span>
            )}
          </div>
        </div>
      ))}

      {results.length > showCount && (
        <button onClick={() => setShowCount(s => s + 20)}
          style={{
            display: 'block', width: '100%', padding: '10px 0', borderRadius: 8,
            border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)',
            fontSize: 12, cursor: 'pointer', marginBottom: 8,
          }}>더 보기 ({showCount}/{results.length})</button>
      )}

      {errors.length > 0 && (
        <div style={{
          borderRadius: 8, border: '1px solid var(--tint-red-bd)',
          background: 'var(--tint-red)', padding: 12, marginBottom: 8,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#c44', marginBottom: 6 }}>
            ⚠ 검색 오류 {errors.length}건
          </div>
          {errors.map((err, i) => (
            <div key={i} style={{
              padding: '4px 8px', marginBottom: 3, borderRadius: 8,
              background: 'var(--tint-red-soft)', fontSize: 11, color: 'var(--c-text)',
              display: 'flex', gap: 8, alignItems: 'baseline',
            }}>
              <span style={{ fontWeight: 600, color: '#c44', flexShrink: 0 }}>{err.original}</span>
              <span style={{ color: 'var(--c-faint)', fontSize: 10 }}>
                {err.reason}{err.refs ? ` (${err.refs.join(', ')})` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && !loading && query && (
        <div style={{ textAlign: 'center', padding: 30, color: 'var(--c-dim)', fontSize: 13 }}>검색 결과가 없습니다</div>
      )}
    </div>
  );
}


