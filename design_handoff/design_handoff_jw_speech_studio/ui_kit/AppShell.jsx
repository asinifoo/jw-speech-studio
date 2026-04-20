/* global React, JW_L1Tabs, JW_SearchScreen, JW_PrepareScreen, JW_ManageScreen, JW_InputScreen, JW_PreprocessScreen */
const { useState: useStateAS, useEffect: useEffectAS } = React;

const TABS = ['입력', '준비', '검색', '전처리', '관리'];

const AppShell = () => {
  const initial = (() => { try { return localStorage.getItem('jw.tab') || '검색'; } catch { return '검색'; } })();
  const [tab, setTab] = useStateAS(initial);
  const [dark, setDark] = useStateAS(false);
  const [fontPx, setFontPx] = useStateAS(15);
  const [memoOpen, setMemoOpen] = useStateAS(false);

  useEffectAS(() => { try { localStorage.setItem('jw.tab', tab); } catch {} }, [tab]);

  const bg = dark ? '#1a1a1a' : '#F2F2F7';
  const cardBg = dark ? '#2a2a2a' : '#FFFFFF';
  const textC = dark ? '#f0f0f0' : '#3C3C43';
  const headerBg = dark ? '#111' : '#FFFFFF';
  const borderC = dark ? '#444' : '#C6C6C8';

  return (
    <div className={dark ? 'dk' : ''} style={{ minHeight: '100vh', background: bg, color: textC, fontSize: `${fontPx}px` }}>
      {/* header */}
      <div style={{
        background: headerBg, borderBottom: `1px solid ${borderC}`,
        padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
        position: 'sticky', top: 0, zIndex: 5,
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 7, background: '#1D9E75', color: '#fff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', letterSpacing: '-0.5px' }}>JW</div>
        <div style={{ flex: 1, fontSize: '1.071rem', fontWeight: 700, color: dark ? '#fff' : '#000' }}>Speech Studio</div>
        <button onClick={() => setDark(!dark)} title="테마"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}>
          {dark ? '☀' : '🌙'}
        </button>
      </div>

      {/* tab bar */}
      <div style={{ padding: '12px 16px 8px', overflowX: 'auto' }}>
        <JW_L1Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {/* content column */}
      <div style={{ padding: '8px 16px 80px', maxWidth: 720, margin: '0 auto' }}>
        {tab === '입력' && <JW_InputScreen />}
        {tab === '준비' && <JW_PrepareScreen />}
        {tab === '검색' && <JW_SearchScreen />}
        {tab === '전처리' && <JW_PreprocessScreen />}
        {tab === '관리' && <JW_ManageScreen />}
      </div>

      {/* font slider — bottom-left */}
      <div style={{ position: 'fixed', left: 12, bottom: 12, background: cardBg, border: `1px solid ${borderC}`, borderRadius: 8, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.714rem', color: dark ? '#aaa' : '#8E8E93', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
        <span>가</span>
        <input type="range" min="12" max="20" value={fontPx} onChange={e => setFontPx(+e.target.value)} style={{ width: 90 }} />
        <span style={{ fontWeight: 700 }}>가</span>
      </div>

      {/* memo FAB — bottom-right */}
      <button onClick={() => setMemoOpen(!memoOpen)} title="연사메모"
        style={{
          position: 'fixed', right: 16, bottom: 16,
          width: 48, height: 48, borderRadius: 24,
          background: '#1D9E75', color: '#fff', border: 'none',
          fontSize: 22, cursor: 'pointer',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>✎</button>

      {memoOpen && (
        <div style={{
          position: 'fixed', right: 16, bottom: 76, width: 280,
          background: cardBg, border: `1px solid ${borderC}`, borderRadius: 12,
          padding: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: '0.857rem', fontWeight: 700, color: dark ? '#fff' : '#000' }}>💭 연사메모</span>
            <div style={{ flex: 1 }} />
            <button onClick={() => setMemoOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 14, color: '#8E8E93' }}>✕</button>
          </div>
          <textarea placeholder="이번 부분에 대한 메모…"
            style={{ width: '100%', boxSizing: 'border-box', minHeight: 70, background: dark ? '#333' : '#EFEFF4', border: 'none', borderRadius: 6, padding: 8, fontFamily: 'inherit', fontSize: '0.857rem', resize: 'vertical', color: dark ? '#fff' : '#000', outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
            <button style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 5, padding: '4px 10px', fontFamily: 'inherit', fontSize: '0.714rem', fontWeight: 600, cursor: 'pointer' }}>저장</button>
          </div>
        </div>
      )}
    </div>
  );
};

window.JW_AppShell = AppShell;
