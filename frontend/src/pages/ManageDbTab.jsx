import { useState, useEffect, Fragment } from 'react';
import KoreanTextarea from '../components/KoreanTextarea';
import { parseDocument, sourceLabel, cleanMd, parseKeywords } from '../components/utils';
import { getBody } from '../utils/textHelpers';
import { S } from '../styles';
import { dbDelete, dbUpdate, deleteOutline, deleteTranscriptFile, listManualEntries, listCollection, listOriginals, listSpeakerMemos } from '../api';
import { useConfirm } from '../providers/ConfirmProvider';
import { useAlert } from '../providers/AlertProvider';
import { formatSbMmw, getOutlinePrefix } from '../utils/outlineFormat';
import { resolveOutlineCode } from '../utils/outlineTypes';
import { MSG } from '../utils/messages';

// App preload 로 useOutlineTypes 캐시가 마운트 시점에 채워짐 → cache 기반 resolve 우선.
// 캐시 미로드 (preload 실패) 시 prefix passthrough 로 fail-soft.
function normalizeOutlineCode(type) {
  if (!type) return '';
  const resolved = resolveOutlineCode(type);
  if (resolved) return resolved;
  if (type.startsWith('S-') || type.startsWith('CO') || type.startsWith('SB')
      || type.startsWith('JWBC') || type.startsWith('ETC')) return type;
  return '';
}

export default function ManageDbTab({ mode }) {
  const showConfirm = useConfirm();
  const showAlert = useAlert();
  // ── 상수 (원본 ManagePage.jsx L495-503) ──
  const _dbTabs = [
    { key: '골자', color: 'var(--accent)' },
    { key: '연설', color: 'var(--accent-orange)' },
    { key: '출판물', color: 'var(--accent-purple)' },
    { key: '원문', color: '#2D8FC7' },
    { key: '연사메모', color: 'var(--accent-brown)' },
  ];
  const _dbTabKeys = _dbTabs.map(t => t.key);
  const _dbTabColor = Object.fromEntries(_dbTabs.map(t => [t.key, t.color]));

  // ── state (원본 ManagePage.jsx L475-537) ──
  const [myEntries, setMyEntries] = useState([]);
  const [myLoading, setMyLoading] = useState(false);
  const [myDbEditIdx, setMyDbEditIdx] = useState(-1);
  const [myDbEditVal, setMyDbEditVal] = useState('');
  const [myDbEditMeta, setMyDbEditMeta] = useState({});
  const [myDbStat, setMyDbStat] = useState('');
  const [expandedMyDb, setExpandedMyDb] = useState({});
  const [memoEditIdx, setMemoEditIdx] = useState(-1);
  const [memoEditVal, setMemoEditVal] = useState('');
  const [memoStat, setMemoStat] = useState('');
  const [expandedMemo, setExpandedMemo] = useState({});
  const [memoCalMonth, setMemoCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [memoDateFilter, setMemoDateFilter] = useState('all');
  const [memoSortOrder, setMemoSortOrder] = useState('desc');
  const [myDateFilter, setMyDateFilter] = useState('all');
  const [mySortOrder, setMySortOrder] = useState('desc');
  const [viewSource, _setViewSource] = useState(() => { try { const v = localStorage.getItem('jw-db-view'); return _dbTabKeys.includes(v) ? v : '골자'; } catch(e) { return '골자'; } });
  const setViewSource = (v) => { _setViewSource(v); try { localStorage.setItem('jw-db-view', v); } catch(e) {} };
  const [dbCache, setDbCache] = useState({}); // { '골자': [...], '연설': [...], ... }
  const dbEntries = dbCache[viewSource] || [];
  const setDbEntries = (v) => setDbCache(p => ({ ...p, [viewSource]: typeof v === 'function' ? v(p[viewSource] || []) : v }));
  const [dbLoading, setDbLoading] = useState(false);
  const [dbSearch, setDbSearch] = useState('');
  const [speechFilter, setSpeechFilter] = useState('그룹'); // 그룹|목록
  const [expandedDbEntry, setExpandedDbEntry] = useState({});
  const [dbShowLimit, setDbShowLimit] = useState(50);
  const [dbSelected, setDbSelected] = useState(new Set());
  const [dbDeleting, setDbDeleting] = useState(false);
  const [dbTabCounts, setDbTabCounts] = useState(() => { try { return JSON.parse(localStorage.getItem('jw-db-tab-counts') || '{}'); } catch { return {}; } });
  const [batchGroups, setBatchGroups] = useState([]);
  const [colCounts, setColCounts] = useState({});
  const [batchGroupLoading, setBatchGroupLoading] = useState(false);
  const [selTranscripts, setSelTranscripts] = useState(new Set());
  const [selBatchGroups, setSelBatchGroups] = useState(new Set());
  const [batchFilter, setBatchFilter] = useState('전체');
  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [transcriptCat, setTranscriptCat] = useState('전체');
  const [origSubTab, setOrigSubTab] = useState('원문');
  const [speakerMemos, setSpeakerMemos] = useState([]);
  const [spMemoLoading, setSpMemoLoading] = useState(false);
  const [memoCatFilter, setMemoCatFilter] = useState('전체');
  const [memoViewMode, setMemoViewMode] = useState('그룹'); // 그룹|목록
  const [memoSearchQ, setMemoSearchQ] = useState('');
  const [expandedSpMemo, setExpandedSpMemo] = useState({});
  const [editingSpMemo, setEditingSpMemo] = useState({});  // { idx: editValue }
  const [manualSearch, setManualSearch] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [calMonth, setCalMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });

  // ── 함수 (원본 ManagePage.jsx L1242-1250) ──
  // Doc-47: 원문 파일(collection='file')과 DB 레코드 통합 삭제 헬퍼
  const deleteEntry = async (entry) => {
    if (entry.collection === 'file') {
      const filename = entry.metadata?.filename
        || (entry.id?.startsWith('file_') ? entry.id.slice(5) : null);
      if (!filename) throw new Error('파일명 추출 실패');
      return await deleteTranscriptFile(filename);
    }
    return await dbDelete(entry.collection, entry.id);
  };

  const _loadDbTab = (tab) => {
    setDbLoading(true);
    if (tab === '골자') listCollection('speech_points', 'outline').then(r => { setDbCache(p => ({ ...p, '골자': r.entries || [] })); setDbTabCounts(p => ({ ...p, '골자': r.total ?? (r.entries || []).length })); }).catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' })).finally(() => setDbLoading(false));
    else if (tab === '연설') listCollection('speech_expressions', 'speech,note,discussion,service,visit').then(r => { setDbCache(p => ({ ...p, '연설': r.entries || [] })); setDbTabCounts(p => ({ ...p, '연설': r.total ?? (r.entries || []).length })); }).catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' })).finally(() => setDbLoading(false));
    else if (tab === '출판물') listCollection('publications').then(r => { setDbCache(p => ({ ...p, '출판물': r.entries || [] })); setDbTabCounts(p => ({ ...p, '출판물': r.total ?? (r.entries || []).length })); }).catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' })).finally(() => setDbLoading(false));
    else if (tab === '원문') listOriginals().then(r => { const fe = []; for (const [, g] of Object.entries(r.originals || {})) for (const sp of (g.speakers || [])) fe.push({ id: sp.id, collection: sp.source_type === 'file' ? 'file' : 'speech_expressions', text: sp.text, metadata: { ...sp.metadata, source: '원문' } }); setDbCache(p => ({ ...p, '원문': fe })); setDbTabCounts(p => ({ ...p, '원문': fe.length })); }).catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' })).finally(() => setDbLoading(false));
    else if (tab === '연사메모') { setSpMemoLoading(true); listSpeakerMemos().then(r => { setSpeakerMemos(r.memos || []); setDbTabCounts(p => ({ ...p, '연사메모': (r.memos || []).length })); }).catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' })).finally(() => { setSpMemoLoading(false); setDbLoading(false); }); }
    else setDbLoading(false);
  };

  // ── useEffect ──

  // dbTabCounts localStorage 저장 (원본 L518)
  useEffect(() => { try { localStorage.setItem('jw-db-tab-counts', JSON.stringify(dbTabCounts)); } catch {} }, [dbTabCounts]);

  // 마운트 시 현재 탭 자동 로드 (원본 L1153 대체)
  useEffect(() => {
    _loadDbTab(viewSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Add 탭에서 연설 저장 시 localStorage.setItem('jw-db-stale-tab', '연설')로 신호.
  // ManageDbTab이 mode='mydb'로 활성화될 때 체크하여 해당 탭 캐시 무효화.
  // 원본 ManagePage.jsx에서 setDbCache(...) 직접 호출하던 구조 대체.
  useEffect(() => {
    if (mode !== 'mydb') return;
    const staleTab = localStorage.getItem('jw-db-stale-tab');
    if (staleTab) {
      localStorage.removeItem('jw-db-stale-tab');
      setDbCache(p => { const n = { ...p }; delete n[staleTab]; return n; });
      if (staleTab === viewSource) {
        _loadDbTab(viewSource);
      }
    }
  }, [mode, viewSource]);

  // ── JSX (원본 ManagePage.jsx L4477-5145) ──
  return (<>

        <div style={{ borderRadius: 12, border: '1px solid var(--bd)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 12 }}>
        {/* DB 탭 — 카드 헤더 언더라인 */}
        <div style={S.underlineContainer}>
            {_dbTabs.map(({ key: t, color: tc }) => {
              const active = viewSource === t;
              const cnt = dbTabCounts[t];
              return (
              <button key={t} onClick={() => {
                if (t === viewSource) return;
                setViewSource(t); setDbSearch(''); setExpandedDbEntry({}); setDbShowLimit(50); setDbSelected(new Set());
                if (t === '연사메모') { if (!speakerMemos.length) { setSpMemoLoading(true); listSpeakerMemos().then(r => { setSpeakerMemos(r.memos || []); setDbTabCounts(p => ({ ...p, '연사메모': (r.memos || []).length })); }).catch(e => showAlert(MSG.fail.fetch + e.message, { variant: 'error' })).finally(() => setSpMemoLoading(false)); } return; }
                if (dbCache[t]?.length) return;
                _loadDbTab(t);
              }} style={S.underlineTab(active, tc)}>
                <span style={S.underlineLabel(active, tc)}>{t}</span>
                <span style={{ ...S.underlineCount(active, tc), visibility: cnt != null ? 'visible' : 'hidden' }}>{cnt ?? 0}</span>
              </button>
              );
            })}
        </div>

        {/* ── 골자/연설/출판물/원문 공통 ── */}
        {['골자', '연설', '출판물', '원문'].includes(viewSource) && (
        <div style={{ padding: 12 }}>
          {/* 연설 필터 */}
          {viewSource === '연설' && (
            <div style={{ ...S.pillContainer, marginBottom: 8 }}>
              {['그룹', '목록'].map(f => (
                <button key={f} onClick={() => { setSpeechFilter(f); }} style={S.pillL4(speechFilter === f, 'var(--accent-orange)')}>{f}</button>
              ))}
            </div>
          )}
          {/* 검색 */}
          <div style={{ marginBottom: 8 }}>
            <input value={dbSearch} onChange={e => setDbSearch(e.target.value)} placeholder="검색..." style={{ width: '100%', padding: '6px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          </div>

          {/* 선택 툴바 + 건수 + 새로고침 */}
          {(
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.786rem', color: 'var(--c-muted)' }}>
                <input type="checkbox" checked={dbSelected.size > 0 && dbSelected.size === (() => {
                  if (viewSource === '골자') { const g = {}; dbEntries.forEach(r => { g[`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}_${r.metadata?.outline_version || ''}`] = true; }); return Object.keys(g).length; }
                  if (viewSource === '연설' && speechFilter === '그룹') { const g = {}; dbEntries.forEach(r => { const m = r.metadata || {}; g[`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`] = true; }); return Object.keys(g).length; }
                  return dbEntries.length;
                })()} onChange={e => {
                  if (e.target.checked) {
                    if (viewSource === '골자') {
                      const groups = {}; dbEntries.forEach(r => { groups[`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}_${r.metadata?.outline_version || ''}`] = true; });
                      setDbSelected(new Set(Object.keys(groups)));
                    } else if (viewSource === '연설' && speechFilter === '그룹') {
                      const groups = {}; dbEntries.forEach(r => { const m = r.metadata || {}; groups[`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`] = true; });
                      setDbSelected(new Set(Object.keys(groups)));
                    } else setDbSelected(new Set(dbEntries.map(r => r.id)));
                  } else setDbSelected(new Set());
                }} style={{ accentColor: 'var(--accent)' }} />
                전체 선택
              </label>
              <div style={{ flex: 1 }} />
              {dbSelected.size === 0 && (<>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{(() => {
                  if (viewSource === '연설' && speechFilter === '그룹') { const g = {}; dbEntries.forEach(r => { const m = r.metadata || {}; g[`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`] = true; }); return `${Object.keys(g).length}그룹`; }
                  if (viewSource === '골자') { const g = {}; dbEntries.forEach(r => { g[`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}_${r.metadata?.outline_version || ''}`] = true; }); return `${Object.keys(g).length}그룹`; }
                  return `${dbEntries.length}건`;
                })()}</span>
                <button onClick={() => _loadDbTab(viewSource)} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
              </>)}
              {dbSelected.size > 0 && (
                <>
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-danger)', fontWeight: 600 }}>{dbSelected.size}개 선택</span>
                  <button onClick={() => setDbSelected(new Set())} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.714rem', cursor: 'pointer' }}>선택 해제</button>
                  <button onClick={async () => {
                    const count = viewSource === '골자'
                      ? dbEntries.filter(r => dbSelected.has(`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}_${r.metadata?.outline_version || ''}`)).length
                      : dbSelected.size;
                    if (!await showConfirm(`선택한 ${dbSelected.size}개 항목 (${count}건)을 삭제하시겠습니까?`, { confirmVariant: 'danger' })) return;
                    setDbDeleting(true);
                    try {
                      if (viewSource === '골자') {
                        const failedKeys = [];
                        for (const gKey of dbSelected) {
                          const items = dbEntries.filter(r => `${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}_${r.metadata?.outline_version || ''}` === gKey);
                          if (items.length) {
                            const m = items[0].metadata || {};
                            const code = normalizeOutlineCode(m.outline_type) || m.outline_type || '';
                            const num = m.outline_num || '';
                            const ver = m.outline_version || '';
                            const verSafe = ver ? '_v' + ver.replace(/\//g, '-') : '';
                            const base = code && /^\d+$/.test(num) ? code + '_' + num.replace(/^0+/, '').padStart(3, '0') : code || num;
                            const res = await deleteOutline(base + verSafe);
                            if (!res || (res.deleted || 0) === 0) failedKeys.push(gKey);
                          }
                        }
                        if (failedKeys.length) {
                          showAlert(`삭제 실패 ${failedKeys.length}건: 매칭 레코드 없음\n(${failedKeys.slice(0, 3).join(', ')}${failedKeys.length > 3 ? ' 등' : ''})`, { variant: 'error' });
                        }
                      } else {
                        // Doc-50: bulk 삭제 실패 집계 (404 silent success 차단)
                        const bulkFailed = [];
                        let targets = [];
                        if (viewSource === '연설' && speechFilter === '그룹') {
                          for (const gKey of dbSelected) {
                            const items = dbEntries.filter(r => { const m = r.metadata || {}; return `${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}` === gKey; });
                            for (const item of items) targets.push({ collection: item.collection, id: item.id });
                          }
                        } else {
                          const defaultCol = (viewSource === '연설' && speechFilter === '목록') ? 'speech_expressions' : null;
                          for (const id of dbSelected) {
                            const entry = dbEntries.find(r => r.id === id);
                            if (entry) targets.push({ collection: entry.collection || defaultCol, id: entry.id });
                          }
                        }
                        for (const t of targets) {
                          try {
                            const entry = dbEntries.find(e => e.id === t.id);
                            if (!entry) { bulkFailed.push(`${t.id}: 항목 조회 실패`); continue; }
                            await deleteEntry(entry);
                          }
                          catch (e) { bulkFailed.push(`${t.id}: ${e.message}`); }
                        }
                        if (bulkFailed.length) {
                          showAlert(`삭제 실패 ${bulkFailed.length}건:\n${bulkFailed.slice(0, 3).join('\n')}${bulkFailed.length > 3 ? '\n...' : ''}`, { variant: 'error' });
                        }
                      }
                      setDbCache(p => ({ ...p, [viewSource]: (p[viewSource] || []).filter(r => {
                        if (viewSource === '골자') return !dbSelected.has(`${r.metadata?.outline_type || ''}_${r.metadata?.outline_num || ''}_${r.metadata?.outline_version || ''}`);
                        if (viewSource === '연설' && speechFilter === '그룹') { const m = r.metadata || {}; return !dbSelected.has(`${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`); }
                        return !dbSelected.has(r.id);
                      }) }));
                      setDbTabCounts(p => ({ ...p, [viewSource]: Math.max(0, (p[viewSource] || 0) - count) }));
                      setDbSelected(new Set());
                    } catch (e) { showAlert(MSG.fail.delete + e.message, { variant: 'error' }); }
                    finally { setDbDeleting(false); }
                  }} disabled={dbDeleting} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--c-danger)', background: dbDeleting ? 'var(--bd)' : 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.714rem', cursor: dbDeleting ? 'default' : 'pointer', fontWeight: 600 }}>{dbDeleting ? '삭제 중...' : '선택 삭제'}</button>
                </>
              )}
            </div>
          )}

          {/* 항목 목록 */}
          {dbLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 16 }}>로딩...</div>}

          {/* 골자 그룹 표시 */}
          {viewSource === '골자' && !dbLoading && (() => {
            const groups = {};
            dbEntries.forEach(r => {
              const m = r.metadata || {};
              const ot = m.outline_type || '';
              const on = m.outline_num || '기타';
              const ver = m.outline_version || '';
              const key = `${ot}_${on}_${ver}`;
              if (!groups[key]) groups[key] = { num: on, outline_title: m.outline_title || '', type: ot, outline_version: ver, items: [] };
              if (!groups[key].outline_title && m.outline_title) groups[key].outline_title = m.outline_title;
              groups[key].items.push(r);
            });
            const sorted = Object.values(groups).sort((a, b) => {
              const codeA = normalizeOutlineCode(a.type) || a.type || 'ZZZ';
              const codeB = normalizeOutlineCode(b.type) || b.type || 'ZZZ';
              const ka = `${codeA}_${(a.num || '').padStart(5, '0')}_${a.outline_version || ''}`;
              const kb = `${codeB}_${(b.num || '').padStart(5, '0')}_${b.outline_version || ''}`;
              return ka.localeCompare(kb);
            });
            const q = dbSearch.trim().toLowerCase();
            const filtered = q ? sorted.filter(g => g.num.toLowerCase().includes(q) || (g.outline_title || '').toLowerCase().includes(q) || (g.outline_version || '').toLowerCase().includes(q)) : sorted;
            return filtered.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>골자가 없습니다.</div> : filtered.map(g => {
              const gKey = `${g.type}_${g.num}_${g.outline_version || ''}`;
              const isOpen = expandedDbEntry['g_' + gKey];
              const gt = g.type || '';
              const code = normalizeOutlineCode(gt);
              const num = g.num || '';
              // SSOT 호출 — 비숫자 num (JWBC-MW + '연합' 등) 영영 'JWBC-MW_연합' 정합 (5h §3.3).
              const pfxBase = getOutlinePrefix(gt, num);
              const sbLabel = code === 'SB' ? formatSbMmw(num) : '';
              const verSafe = g.outline_version ? '_v' + g.outline_version.replace(/\//g, '-') : '';
              const pfx = pfxBase + verSafe;
              const headerLabel = g.outline_version ? `${pfxBase} v${g.outline_version}` : pfxBase;
              return (
                <div key={gKey} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                  <div onClick={() => setExpandedDbEntry(p => ({ ...p, ['g_' + gKey]: !p['g_' + gKey] }))} style={{
                    padding: '8px 10px', background: 'var(--bg-subtle)', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <input type="checkbox" checked={dbSelected.has(gKey)} onChange={e => { e.stopPropagation(); setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(gKey); else n.delete(gKey); return n; }); }} onClick={e => e.stopPropagation()} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem' }}>{pfxBase || g.num}</span>
                    {sbLabel && sbLabel !== num && <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 600,
                      background: 'var(--tint-green, #e6f5ec)', color: 'var(--accent)',
                      flexShrink: 0, lineHeight: 1.3,
                    }}>{sbLabel}</span>}
                    {g.outline_version && <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '1px 6px', borderRadius: 4, fontSize: '0.643rem', fontWeight: 600,
                      background: 'var(--tint-blue, #eef4fb)', color: 'var(--accent-blue)',
                      flexShrink: 0, lineHeight: 1.3,
                    }}>v{g.outline_version}</span>}
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.outline_title}</span>
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.items.length}개 요점</span>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if (!await showConfirm(`${headerLabel || g.num} 골자를 삭제하시겠습니까? (${g.items.length}개 요점 + JSON 파일)`, { confirmVariant: 'danger' })) return;
                      try {
                        const res = await deleteOutline(pfx || g.num);
                        if (!res || (res.deleted || 0) === 0) {
                          showAlert('삭제 실패: 매칭 레코드 없음 (outline_id=' + (pfx || g.num) + ')', { variant: 'error' });
                          return;
                        }
                        setDbCache(p => ({ ...p, '골자': (p['골자'] || []).filter(r => !g.items.some(gi => gi.id === r.id)) }));
                        setDbTabCounts(p => ({ ...p, '골자': Math.max(0, (p['골자'] || 0) - g.items.length) }));
                      } catch (err) { showAlert(MSG.fail.delete + err.message, { variant: 'error' }); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.643rem', cursor: 'pointer', flexShrink: 0 }}>삭제</button>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '4px 10px 6px', maxHeight: 250, overflowY: 'auto' }} className="chat-input">
                      {[...g.items].sort((a, b) => {
                        const pa = (a.metadata?.point_num || '').split('.').map(Number);
                        const pb = (b.metadata?.point_num || '').split('.').map(Number);
                        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
                          const diff = (pa[i] || 0) - (pb[i] || 0);
                          if (diff !== 0) return diff;
                        }
                        return 0;
                      }).map((r, ri) => {
                        const m = r.metadata || {};
                        return (
                          <div key={r.id} style={{ fontSize: '0.786rem', padding: '3px 0', borderBottom: ri < g.items.length - 1 ? '1px solid var(--bd-light)' : 'none', display: 'flex', gap: 4, alignItems: 'baseline' }}>
                            <span style={{ fontWeight: 600, color: 'var(--accent)', flexShrink: 0 }}>{m.point_num || ''}</span>
                            <span style={{ color: 'var(--c-text)', flex: 1 }}>{cleanMd(m.point_content || '')}</span>
                            {m.scriptures && <span style={{ color: 'var(--accent-purple)', fontSize: '0.643rem', flexShrink: 0 }}>{cleanMd(m.scriptures)}</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* 항목 목록 (전체/간단입력) — 골자는 위에서 그룹 표시 */}
          {/* 연설 그룹 표시 */}
          {viewSource === '연설' && speechFilter === '그룹' && !dbLoading && (() => {
            const groups = {};
            dbEntries.forEach(r => {
              const m = r.metadata || {};
              if (dbSearch.trim()) {
                const q = dbSearch.trim().toLowerCase();
                const txt = (r.text || '').toLowerCase();
                if (!(m.outline_title || m.topic || '').toLowerCase().includes(q) && !(m.speaker || '').toLowerCase().includes(q) && !(m.outline_num || '').toLowerCase().includes(q) && !txt.includes(q)) return;
              }
              const key = `${m.outline_num || ''}_${m.speaker || ''}_${m.date || ''}`;
              if (!groups[key]) groups[key] = { num: m.outline_num || '', outline_title: m.outline_title || m.topic || '', speaker: m.speaker || '', date: m.date || '', type: m.outline_type || '', items: [] };
              groups[key].items.push(r);
            });
            const sorted = Object.entries(groups).sort((a, b) => {
              const ga = a[1], gb = b[1];
              const codeA = normalizeOutlineCode(ga.type) || ga.type || 'ZZZ';
              const codeB = normalizeOutlineCode(gb.type) || gb.type || 'ZZZ';
              const ka = `${codeA}_${(ga.num || '').padStart(5, '0')}_${ga.speaker || ''}_${ga.date || ''}`;
              const kb = `${codeB}_${(gb.num || '').padStart(5, '0')}_${gb.speaker || ''}_${gb.date || ''}`;
              return ka.localeCompare(kb);
            });
            return sorted.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>데이터가 없습니다.</div> : (<>
              {sorted.slice(0, dbShowLimit).map(([gKey, g]) => {
                const isOpen = expandedDbEntry['sg_' + gKey];
                const gt = g.type || '';
                const num = g.num || '';
                // SSOT 호출 — JWBC-SP + 비숫자 num (소중함 등 626건) 영영 동일 결과 (5h §3.3).
                const pfx = getOutlinePrefix(gt, num);
                return (
                  <div key={gKey} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                    <div onClick={() => setExpandedDbEntry(p => ({ ...p, ['sg_' + gKey]: !p['sg_' + gKey] }))} style={{
                      padding: '8px 10px', background: 'var(--bg-subtle)', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <input type="checkbox" checked={dbSelected.has(gKey)} onChange={e => { e.stopPropagation(); setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(gKey); else n.delete(gKey); return n; }); }} onClick={e => e.stopPropagation()} style={{ accentColor: 'var(--accent-orange)', cursor: 'pointer' }} />
                      <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                      {pfx && <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.786rem' }}>{pfx}</span>}
                      {g.items[0]?.metadata?.source === 'discussion' && (g.items[0]?.metadata?.discussion_type || g.items[0]?.metadata?.sub_source) && <span style={{ fontSize: '0.571rem', padding: '1px 5px', borderRadius: 3, background: '#378ADD15', color: 'var(--accent-blue)', fontWeight: 600 }}>{g.items[0].metadata.discussion_type || g.items[0].metadata.sub_source}</span>}
                      <span style={{ fontSize: '0.786rem', color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.outline_title}</span>
                      {g.speaker && <span style={{ fontSize: '0.714rem', color: 'var(--c-faint)', flexShrink: 0 }}>{g.speaker}</span>}
                      {g.date && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.date}</span>}
                      <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{g.items.length}건</span>
                    </div>
                    {isOpen && (
                      <div style={{ padding: '4px 10px 6px', maxHeight: 300, overflowY: 'auto' }} className="chat-input">
                        {[...g.items].sort((a, b) => {
                          const pa = (a.metadata?.point_num || '').split('.').map(Number);
                          const pb = (b.metadata?.point_num || '').split('.').map(Number);
                          for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const diff = (pa[i] || 0) - (pb[i] || 0); if (diff !== 0) return diff; }
                          return 0;
                        }).map((r, ri) => {
                          const m = r.metadata || {};
                          const parsed = parseDocument(r.text || '');
                          const body = (r.text || '').replace(/\[.*?\].*\n?/g, '').trim();
                          const lvl = (m.point_num || '').split('.').length;
                          return (
                            <div key={r.id} style={{ fontSize: '0.786rem', padding: '4px 0', borderBottom: ri < g.items.length - 1 ? '1px solid var(--bd-light)' : 'none', marginLeft: Math.max(0, lvl - 1) * 12 }}>
                              <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                                <span style={{ fontWeight: 600, color: 'var(--accent-orange)', flexShrink: 0 }}>{m.point_num || m.sub_topic || ''}</span>
                                <span style={{ color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanMd(m.point_content || parsed?.point || '')}</span>
                                {m.source === 'note' && <span style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: '#C7842D20', color: 'var(--accent-brown)', fontWeight: 600 }}>간단</span>}
                              </div>
                              {(m.scriptures || m.keywords) && (
                                <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginTop: 1 }}>
                                  {m.scriptures && <span style={{ color: '#2D8FC7', marginRight: 6 }}>📖 {cleanMd(m.scriptures)}</span>}
                                  {m.keywords && <span>{m.keywords}</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {sorted.length > dbShowLimit && (
                <div style={{ textAlign: 'center', padding: 8 }}>
                  <button onClick={() => setDbShowLimit(p => p + 50)} style={{ padding: '6px 20px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>더 보기 ({sorted.length - dbShowLimit}개 남음)</button>
                </div>
              )}
            </>);
          })()}

          {/* 출판물/원문 개별 표시 */}
          {((!['골자', '연설'].includes(viewSource)) || (viewSource === '연설' && speechFilter === '목록')) && !dbLoading && (() => { const _filtered = dbEntries.filter(r => {
            const m = r.metadata || {};
            if (!dbSearch.trim()) return true;
            const q = dbSearch.trim().toLowerCase();
            const txt = (r.text || '').toLowerCase();
            return (m.outline_title || m.topic || '').toLowerCase().includes(q) || (m.speaker || '').toLowerCase().includes(q) || (m.outline_num || '').toLowerCase().includes(q) || (m.point_content || '').toLowerCase().includes(q) || (m.pub_code || '').toLowerCase().includes(q) || txt.includes(q);
          }); return (<>{_filtered.slice(0, dbShowLimit).map((r, i) => {
            const meta = r.metadata || {};
            const parsed = parseDocument(r.text || '');
            const isExpanded = expandedDbEntry[r.id];
            const body = (r.text || '').replace(/\[.*?\].*\n?/g, '').trim();
            const cColor = r.collection === 'speech_points' ? 'var(--accent)' : r.collection === 'publications' ? 'var(--accent-purple)' : 'var(--accent-orange)';
            const isPub = r.collection === 'publications';
            const gt = meta.outline_type || '';
            const gn = meta.outline_num || '';
            const prefix = getOutlinePrefix(gt, gn);
            const isDisc = meta.source === 'discussion';
            const title = meta.outline_title || meta.topic || '';
            const subTopic = parsed?.subtopic || meta.sub_topic || '';
            const scripture = cleanMd(parsed?.scripture || meta.scriptures || '');
            const discTopic = meta.topic || parsed?.topic || meta.outline_title || '';
            const discQuestion = meta.question || parsed?.question || meta.subtopic || '';
            const metaRows = [
              isPub && meta.pub_code && { label: '출판물', value: meta.pub_code, color: 'var(--accent-purple)' },
              isDisc && meta.pub_code && { label: '출판물', value: meta.pub_code, color: 'var(--accent-purple)' },
              isDisc && discTopic && { label: '주제', value: discTopic },
              isDisc && discQuestion && { label: '질문', value: discQuestion, color: 'var(--accent-blue)' },
              !isPub && !isDisc && title && { label: '주제', value: (prefix ? prefix + ' ' : '') + title },
              !isPub && !isDisc && subTopic && { label: '소주제', value: subTopic },
              !isDisc && (parsed?.point || meta.point_content) && { label: '요점', value: parsed?.point || meta.point_content, color: cColor },
              scripture && { label: '성구', value: scripture, color: '#2D8FC7' },
              (parsed?.keywords || meta.keywords) && (() => {
                const kwsRaw = parsed?.keywords || meta.keywords;
                const display = isPub ? parseKeywords(kwsRaw).join(', ') : kwsRaw;
                return display ? { label: '키워드', value: display } : null;
              })(),
            ].filter(Boolean);
            return (
              <div key={r.id} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 6 }}>
                {/* 헤더 */}
                <div style={{ padding: '8px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)' }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="checkbox" checked={dbSelected.has(r.id)} onChange={e => setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} style={{ accentColor: cColor, cursor: 'pointer' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: cColor, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--c-hint)' }}>{sourceLabel[meta.source] || meta.source || viewSource}</span>
                    {meta.source === 'discussion' && (meta.discussion_type || meta.sub_source) && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 3, background: '#378ADD15', color: 'var(--accent-blue)', fontWeight: 600 }}>{meta.discussion_type || meta.sub_source}</span>}
                    {meta.service_type && meta.service_type !== '일반' && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 3, background: '#1D9E7515', color: 'var(--accent)', fontWeight: 600 }}>{meta.service_type}</span>}
                    {meta.visit_target && <span style={{ fontSize: '0.643rem', padding: '1px 5px', borderRadius: 3, background: '#D85A3015', color: 'var(--accent-orange)', fontWeight: 600 }}>{meta.visit_target}</span>}
                    {meta.favorite === 'true' && <span style={{ fontSize: '0.714rem', color: 'var(--accent-gold)' }}>★</span>}
                    {parseInt(meta.rating || '0') > 0 && <span style={{ fontSize: '0.571rem', color: 'var(--accent-gold)', letterSpacing: -1 }}>{'★'.repeat(parseInt(meta.rating))}{'☆'.repeat(5 - parseInt(meta.rating))}</span>}
                    {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                    {meta.date && meta.date !== '0000' && <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)' }}>{meta.date}</span>}
                    {meta.tags && (() => {
                      const t = meta.tags;
                      const badges = [];
                      if (t.includes('표현')) badges.push({ label: '표현', bg: 'var(--accent-orange)' });
                      if (t.includes('예시(실화)') || t.includes('예시·실화')) badges.push({ label: '예시·실화', bg: 'var(--accent-brown)' });
                      if (t.includes('예시(비유)') || t.includes('예시·비유')) badges.push({ label: '예시·비유', bg: 'var(--accent-brown)' });
                      if (t.includes('예시(성경)') || t.includes('예시·성경')) badges.push({ label: '예시·성경', bg: '#2D8FC7' });
                      if (!badges.length && t.includes('예시')) badges.push({ label: '예시', bg: 'var(--accent-brown)' });
                      return badges.map((b, bi) => <span key={bi} style={{ fontSize: '0.571rem', padding: '1px 5px', borderRadius: 3, background: b.bg, color: '#fff', fontWeight: 700 }}>{b.label}</span>);
                    })()}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    <div style={{ flex: 1 }} />
                    {viewSource === '연설' && meta.source === 'note' && (
                      <button onClick={() => {
                        try { localStorage.setItem('jw-speech-transfer', JSON.stringify({
                          speaker: meta.speaker || '', date: meta.date || '',
                          outline_num: meta.outline_num || '', outline_title: meta.outline_title || meta.topic || '',
                          outline_type: meta.outline_type || '', content: body,
                          memoId: r.id, memoCol: r.collection,
                        })); localStorage.setItem('jw-prep-subtab', 'structure'); localStorage.setItem('jw-structure-mode', 'speech_input'); window.dispatchEvent(new Event('si-transfer')); } catch {}
                        if (onGoAdd) onGoAdd(); else { setSubTab('structure'); setStructureMode('speech_input'); setMode('add'); }
                      }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--accent)', background: 'var(--bg-card)', color: 'var(--accent)', fontSize: '0.643rem', cursor: 'pointer', fontWeight: 600 }}>→상세</button>
                    )}
                    <button onClick={async () => {
                      if (!await showConfirm('삭제하시겠습니까?', { confirmVariant: 'danger' })) return;
                      try { await deleteEntry(r); setDbEntries(p => p.filter(e => e.id !== r.id)); } catch (e) { showAlert(MSG.fail.delete + e.message, { variant: 'error' }); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                  </div>
                </div>
                {/* 메타 그리드 */}
                {metaRows.length > 0 && (
                <div style={{ padding: '8px 10px', fontSize: '0.857rem', lineHeight: 1.8, color: 'var(--c-sub)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 8px', alignItems: 'baseline' }}>
                    {metaRows.map((row, idx) => (
                      <Fragment key={idx}>
                        <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{row.label}</span>
                        <span style={{ fontSize: '0.786rem', color: row.color || 'var(--c-text)', lineHeight: 1.5, wordBreak: 'keep-all' }}>{row.value}</span>
                      </Fragment>
                    ))}
                  </div>
                </div>
                )}
                {/* 출판물 referenced_by */}
                {isPub && (() => {
                  const refsRaw = Array.isArray(meta.referenced_by) ? meta.referenced_by : (() => { try { return JSON.parse(meta.referenced_by_json || '[]'); } catch { return []; } })();
                  const refs = refsRaw.filter(rf => (rf.outline_type || '').trim() || (rf.outline_num || '').trim() || (rf.point_num || '').trim() || (rf.outline_title || '').trim() || (rf.subtopic_title || '').trim() || (rf.point_text || '').trim());
                  if (!refs.length) return null;
                  const refsKey = 'refs_' + r.id;
                  const isRefOpen = expandedDbEntry[refsKey];
                  return (
                    <div style={{ padding: '4px 10px 6px', borderTop: '1px solid var(--tint-purple-bd)', background: 'var(--tint-purple)' }}>
                      <div onClick={(e) => { e.stopPropagation(); setExpandedDbEntry(p => ({ ...p, [refsKey]: !p[refsKey] })); }} style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '4px 0', cursor: 'pointer', fontSize: '0.786rem', color: 'var(--c-sub)', userSelect: 'none',
                      }}>
                        <span>📚 {refs.length}개 골자에서 사용</span>
                        <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{isRefOpen ? '▲' : '▼'}</span>
                      </div>
                      {isRefOpen && (
                        <div style={{ marginTop: 4, padding: '6px 8px', background: 'var(--bg-subtle)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {refs.map((rf, i) => (
                            <div key={i} style={{ fontSize: '0.714rem', paddingBottom: i < refs.length - 1 ? 6 : 0, borderBottom: i < refs.length - 1 ? '1px solid var(--bd)' : 'none' }}>
                              <div style={{ fontWeight: 600, color: 'var(--c-text)', marginBottom: 2 }}>
                                {[rf.outline_type, rf.outline_num].filter(Boolean).join('_')}
                                {rf.version ? ` v${rf.version}` : ''}
                                {rf.point_num ? ` 요점 ${rf.point_num}` : ''}
                              </div>
                              {rf.outline_title && <div style={{ color: 'var(--c-sub)', marginBottom: 1 }}>주제: {rf.outline_title}</div>}
                              {rf.subtopic_title && <div style={{ color: 'var(--c-hint)', fontSize: '0.643rem', marginBottom: 1 }}>소주제: {rf.subtopic_title}</div>}
                              {rf.point_text && <div style={{ color: 'var(--c-text)' }}>요점: {rf.point_text}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* 본문 */}
                {body && (
                  <div style={{ padding: '6px 10px 10px', fontSize: '0.929rem', lineHeight: 1.8, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: isExpanded ? 300 : 60, overflow: isExpanded ? 'auto' : 'hidden' }} className={isExpanded ? 'chat-input' : undefined}>
                    {body.slice(0, isExpanded ? undefined : 150)}
                  </div>
                )}
                {body && body.length > 150 && (
                  <div style={{ padding: '0 10px 6px', borderTop: '1px solid var(--bd-light)', textAlign: 'right' }}>
                    <button onClick={() => setExpandedDbEntry(p => ({ ...p, [r.id]: !p[r.id] }))} style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer' }}>{isExpanded ? '접기' : '전체 보기'}</button>
                  </div>
                )}
              </div>
            );
          })}
            {_filtered.length > dbShowLimit && (
              <div style={{ textAlign: 'center', padding: 8 }}>
                <button onClick={() => setDbShowLimit(p => p + 50)} style={{ padding: '6px 20px', borderRadius: 8, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>더 보기 ({_filtered.length - dbShowLimit}건 남음)</button>
              </div>
            )}
            {_filtered.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>데이터가 없습니다.</div>}
          </>); })()}
        </div>
        )}

        {/* ── 연사메모 ── */}
        {viewSource === '연사메모' && (<>
        <div style={{ padding: 12 }}>
          {/* [그룹] [목록] 세그먼트 */}
          <div style={{ ...S.pillContainer, marginBottom: 8 }}>
            {['그룹', '목록'].map(m => (
              <button key={m} onClick={() => { setMemoViewMode(m); setDbSelected(new Set()); }} style={S.pillL4(memoViewMode === m, 'var(--accent-brown)')}>{m}</button>
            ))}
          </div>
          {/* 카테고리 필터 — 목록에서만 */}
          {memoViewMode === '목록' && (
            <div style={{ ...S.pillContainer, marginBottom: 6 }}>
              {['전체', '원본', '도입', '구조', '성구', '예시', '언어습관', '마무리'].map(cat => (
                <button key={cat} onClick={() => setMemoCatFilter(cat)} style={{ ...S.pillL4(memoCatFilter === cat, 'var(--accent-purple)'), padding: '4px 0', fontSize: '0.714rem', whiteSpace: 'nowrap' }}>{cat}</button>
              ))}
            </div>
          )}
          {/* 검색 */}
          <div style={{ marginBottom: 8 }}>
            <input value={memoSearchQ} onChange={e => setMemoSearchQ(e.target.value)} placeholder="연사/골자번호 검색..." style={{ width: '100%', padding: '6px 10px', border: 'none', borderRadius: 8, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'var(--bg-subtle)', boxSizing: 'border-box' }} />
          </div>
          {/* 연사메모 선택 툴바 + 건수 + 새로고침 */}
          {(
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, minHeight: 28 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: '0.786rem', color: 'var(--c-muted)' }}>
                <input type="checkbox" checked={dbSelected.size > 0 && dbSelected.size === speakerMemos.length} onChange={e => {
                  if (e.target.checked) setDbSelected(new Set(speakerMemos.map(m => m.id)));
                  else setDbSelected(new Set());
                }} style={{ accentColor: 'var(--accent-purple)' }} />
                전체 선택
              </label>
              <div style={{ flex: 1 }} />
              {dbSelected.size === 0 && (<>
                <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', whiteSpace: 'nowrap' }}>{memoViewMode === '그룹' ? (() => { const g = {}; speakerMemos.forEach(m => { g[m.metadata?.speaker || ''] = true; }); return `${Object.keys(g).length}그룹`; })() : (() => {
                  const cnt = speakerMemos.filter(m => {
                    if (memoCatFilter === '전체') return true;
                    if (memoCatFilter === '원본') return m.metadata?.reprocessed === 'true' || (!m.metadata?.memo_category && !m.metadata?.reprocessed);
                    return m.metadata?.memo_category === memoCatFilter;
                  }).length;
                  return `${cnt}건`;
                })()}</span>
                <button onClick={() => { setSpMemoLoading(true); listSpeakerMemos().then(r => { setSpeakerMemos(r.memos || []); setDbTabCounts(p => ({ ...p, '연사메모': (r.memos || []).length })); showAlert(MSG.success.reload, { variant: 'success' }); }).catch(e => showAlert(MSG.fail.reload + e.message, { variant: 'error' })).finally(() => setSpMemoLoading(false)); }} style={{ padding: '3px 8px', borderRadius: 6, border: 'none', background: 'var(--bg-subtle, #EFEFF4)', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>새로고침</button>
              </>)}
              {dbSelected.size > 0 && (
                <>
                  <span style={{ fontSize: '0.786rem', color: 'var(--c-danger)', fontWeight: 600 }}>{dbSelected.size}개 선택</span>
                  <button onClick={() => setDbSelected(new Set())} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.714rem', cursor: 'pointer' }}>선택 해제</button>
                  <button onClick={async () => {
                    if (!await showConfirm(`선택한 ${dbSelected.size}개 연사메모를 삭제하시겠습니까?`, { confirmVariant: 'danger' })) return;
                    setDbDeleting(true);
                    try {
                      const bulkFailed = [];
                      for (const id of dbSelected) {
                        try { await dbDelete('speech_expressions', id); }
                        catch (e) { bulkFailed.push(`${id}: ${e.message}`); }
                      }
                      if (bulkFailed.length) {
                        showAlert(`삭제 실패 ${bulkFailed.length}건:\n${bulkFailed.slice(0, 3).join('\n')}`, { variant: 'error' });
                      }
                      setSpeakerMemos(p => p.filter(m => !dbSelected.has(m.id)));
                      setDbTabCounts(p => ({ ...p, '연사메모': Math.max(0, (p['연사메모'] || 0) - dbSelected.size) }));
                      setDbSelected(new Set());
                    } catch (e) { showAlert(MSG.fail.delete + e.message, { variant: 'error' }); }
                    finally { setDbDeleting(false); }
                  }} disabled={dbDeleting} style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid var(--c-danger)', background: dbDeleting ? 'var(--bd)' : 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.714rem', cursor: dbDeleting ? 'default' : 'pointer', fontWeight: 600 }}>{dbDeleting ? '삭제 중...' : '선택 삭제'}</button>
                </>
              )}
            </div>
          )}
          {/* 연사메모 그룹 뷰 — 연사별 */}
          {memoViewMode === '그룹' && !spMemoLoading && (() => {
            const groups = {};
            speakerMemos.filter(m => {
              if (!memoSearchQ.trim()) return true;
              const q = memoSearchQ.trim().toLowerCase();
              return (m.metadata?.speaker || '').toLowerCase().includes(q) || (m.metadata?.outline_num || '').toLowerCase().includes(q) || (m.metadata?.outline_title || '').toLowerCase().includes(q);
            }).forEach(m => {
              const key = m.metadata?.speaker || '(연사 없음)';
              if (!groups[key]) groups[key] = [];
              groups[key].push(m);
            });
            const sorted = Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
            return sorted.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>연사메모가 없습니다.</div> : sorted.map(([speaker, items]) => {
              const gKey = 'sm_' + speaker;
              const isOpen = expandedDbEntry[gKey];
              const cats = {};
              items.forEach(m => { const c = m.metadata?.memo_category || '원본'; cats[c] = (cats[c] || 0) + 1; });
              return (
                <div key={gKey} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                  <div onClick={() => setExpandedDbEntry(p => ({ ...p, [gKey]: !p[gKey] }))} style={{
                    padding: '8px 10px', background: 'var(--bg-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <input type="checkbox" checked={items.every(m => dbSelected.has(m.id))} onChange={e => { e.stopPropagation(); setDbSelected(p => { const n = new Set(p); items.forEach(m => e.target.checked ? n.add(m.id) : n.delete(m.id)); return n; }); }} onClick={e => e.stopPropagation()} style={{ accentColor: 'var(--accent-brown)', cursor: 'pointer' }} />
                    <span style={{ fontSize: '0.786rem', color: 'var(--c-dim)', transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
                    <span style={{ fontWeight: 700, color: 'var(--accent-brown)', fontSize: '0.786rem' }}>{speaker}</span>
                    <div style={{ flex: 1, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                      {Object.entries(cats).map(([c, n]) => (
                        <span key={c} style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: '#7F77DD15', color: 'var(--accent-purple)', fontWeight: 600 }}>{c} {n}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)', flexShrink: 0 }}>{items.length}건</span>
                  </div>
                  {isOpen && (
                    <div style={{ padding: '4px 10px 6px', maxHeight: 300, overflowY: 'auto' }} className="chat-input">
                      {items.map((m, mi) => {
                        const meta = m.metadata || {};
                        const rawText = (m.text || m.document || '').trim();
                        const body = (meta.memo_category && meta.memo_category !== '원본') ? getBody(rawText) : rawText;
                        return (
                          <div key={m.id} style={{ fontSize: '0.786rem', padding: '4px 0', borderBottom: mi < items.length - 1 ? '1px solid var(--bd-light)' : 'none' }}>
                            <div style={{ display: 'flex', gap: 4, alignItems: 'baseline' }}>
                              <span style={{ fontSize: '0.571rem', padding: '1px 4px', borderRadius: 3, background: '#7F77DD15', color: 'var(--accent-purple)', fontWeight: 600, flexShrink: 0 }}>{meta.memo_category || '원본'}</span>
                              {meta.outline_num && <span style={{ color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>{meta.outline_num}</span>}
                              <span style={{ color: 'var(--c-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{body.split('\n')[0] || '(내용 없음)'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}

          {/* 연사메모 목록 뷰 */}
          {spMemoLoading && <div style={{ textAlign: 'center', color: 'var(--c-muted)', fontSize: '0.786rem', padding: 16 }}>로딩...</div>}
          {memoViewMode === '목록' && !spMemoLoading && speakerMemos.filter(m => {
            if (memoCatFilter !== '전체') {
              if (memoCatFilter === '원본') { if (m.metadata?.memo_category && m.metadata?.memo_category !== '원본' && m.metadata?.reprocessed !== 'true') return false; if (!m.metadata?.reprocessed && m.metadata?.memo_category) return false; }
              else if (m.metadata?.memo_category !== memoCatFilter) return false;
            }
            if (!memoSearchQ.trim()) return true;
            const q = memoSearchQ.trim().toLowerCase();
            return (m.metadata?.speaker || '').toLowerCase().includes(q) || (m.metadata?.outline_num || '').toLowerCase().includes(q) || (m.metadata?.outline_title || '').toLowerCase().includes(q);
          }).map((m, i) => {
            const meta = m.metadata || {};
            const isExpanded = expandedSpMemo[i];
            const isEditing = editingSpMemo[i] !== undefined;
            const rawText = (m.text || m.document || '').trim();
            const body = (meta.memo_category && meta.memo_category !== '원본') ? getBody(rawText) : rawText;
            return (
              <div key={m.id || i} style={{ borderRadius: 8, border: '1px solid var(--bd-soft)', background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ padding: '6px 10px', background: 'var(--bg-subtle)', borderBottom: '1px solid var(--bd-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={dbSelected.has(m.id)} onChange={e => setDbSelected(p => { const n = new Set(p); if (e.target.checked) n.add(m.id); else n.delete(m.id); return n; })} style={{ accentColor: 'var(--accent-purple)', cursor: 'pointer' }} />
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-purple)', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.786rem', fontWeight: 600, color: 'var(--accent-purple)' }}>{meta.memo_category || '원본'}</span>
                  {meta.speaker && <span style={{ fontSize: '0.786rem', color: 'var(--c-faint)' }}>{meta.speaker}</span>}
                  {meta.outline_num && <span style={{ fontSize: '0.643rem', color: 'var(--c-dim)' }}>{meta.outline_num}</span>}
                  <div style={{ flex: 1 }} />
                  {!isEditing && <>
                    <button onClick={() => setEditingSpMemo(p => ({ ...p, [i]: body }))} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--accent-purple)', background: 'var(--bg-card)', color: 'var(--accent-purple)', fontSize: '0.643rem', cursor: 'pointer' }}>편집</button>
                    <button onClick={async () => {
                      if (!await showConfirm('삭제하시겠습니까?', { confirmVariant: 'danger' })) return;
                      try { await dbDelete(m.collection || 'speech_expressions', m.id); setSpeakerMemos(p => p.filter((_, j) => j !== i)); } catch (e) { showAlert(MSG.fail.delete + e.message, { variant: 'error' }); }
                    }} style={{ padding: '2px 6px', borderRadius: 4, border: '1px solid var(--c-danger)', background: 'var(--bg-card)', color: 'var(--c-danger)', fontSize: '0.643rem', cursor: 'pointer' }}>삭제</button>
                  </>}
                </div>
                {!isEditing && (
                  <div onClick={() => setExpandedSpMemo(p => ({ ...p, [i]: !p[i] }))} style={{ padding: '6px 10px', fontSize: '0.786rem', lineHeight: 1.7, color: 'var(--c-text)', whiteSpace: 'pre-wrap', wordBreak: 'keep-all', maxHeight: isExpanded ? 'none' : 50, overflow: isExpanded ? 'visible' : 'hidden', cursor: 'pointer' }}>
                    {body || '(내용 없음)'}
                  </div>
                )}
                {isEditing && (
                  <div style={{ padding: '6px 10px' }}>
                    <KoreanTextarea value={editingSpMemo[i] || ''} onChange={v => setEditingSpMemo(p => ({ ...p, [i]: v }))} rows={4}
                      style={{ display: 'block', width: '100%', padding: '6px 10px', boxSizing: 'border-box', border: 'none', borderRadius: 8, background: 'var(--bg-subtle)', color: 'var(--c-text-dark)', fontSize: '0.857rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical', marginBottom: 4 }} />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={async () => {
                        try { await dbUpdate(m.collection || 'speech_expressions', m.id, editingSpMemo[i]); setSpeakerMemos(p => p.map((x, j) => j === i ? { ...x, document: editingSpMemo[i] } : x)); setEditingSpMemo(p => { const n = { ...p }; delete n[i]; return n; }); } catch (e) { showAlert(MSG.fail.update + e.message, { variant: 'error' }); }
                      }} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: 'var(--accent-purple)', color: '#fff', fontSize: '0.786rem', cursor: 'pointer', fontWeight: 600 }}>저장</button>
                      <button onClick={() => setEditingSpMemo(p => { const n = { ...p }; delete n[i]; return n; })} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--bg-card)', color: 'var(--c-faint)', fontSize: '0.786rem', cursor: 'pointer' }}>취소</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {memoViewMode === '목록' && !spMemoLoading && speakerMemos.length === 0 && <div style={{ textAlign: 'center', color: 'var(--c-dim)', fontSize: '0.786rem', padding: 16 }}>연사메모가 없습니다.</div>}
        </div>
        </>)}

        </div>
  </>);
}
