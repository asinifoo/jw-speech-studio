/* global React, JW_Btn, JW_XsBtn, JW_Textarea, JW_StatusDot, JW_TagBadge */
const { useState: useStatePS } = React;

const PrepareScreen = () => {
  const [text, setText] = useStatePS(`영적 양식을 즐깁니다 (사 65:13)\n고통을 인내하는 데 도움 (사 65:14-17)\n환난 속의 위로를 깨닫게 함\n  - 만나의 교훈 (출 16장)\n  - 광야의 시험 (신 8:3)`);
  const [parsed, setParsed] = useStatePS(false);

  const points = [
    { lvl: 'L1', text: '영적 양식을 즐깁니다', ref: '사 65:13' },
    { lvl: 'L2', text: '고통을 인내하는 데 도움', ref: '사 65:14-17' },
    { lvl: 'L2', text: '환난 속의 위로를 깨닫게 함', ref: null },
    { lvl: 'L3', text: '만나의 교훈', ref: '출 16장' },
    { lvl: 'L3', text: '광야의 시험', ref: '신 8:3' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>골자 요점</label>
        <JW_Textarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: 120, fontSize: '0.857rem' }} />
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <JW_XsBtn>📄 DOCX에서 불러오기</JW_XsBtn>
          <JW_XsBtn>↺ 초기화</JW_XsBtn>
          <div style={{ flex: 1 }} />
          <JW_Btn variant="primary" size="sm" onClick={() => setParsed(true)}>파싱 → 검색</JW_Btn>
        </div>
      </div>

      {parsed && (
        <div style={{ background: '#fff', border: '1px solid #C6C6C8', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ background: '#EFEFF4', padding: '8px 12px', borderBottom: '1px solid #C6C6C8', display: 'flex', alignItems: 'center', gap: 8 }}>
            <JW_TagBadge kind="골자" />
            <span style={{ fontSize: '0.786rem', fontWeight: 600, color: '#48484A' }}>파싱된 요점 · {points.length}개</span>
            <div style={{ flex: 1 }} />
            <JW_StatusDot color="#1D9E75" />
            <span style={{ fontSize: '0.714rem', color: '#1D9E75', fontWeight: 600 }}>완료</span>
          </div>
          {points.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'baseline', gap: 8,
              padding: '8px 12px', borderBottom: i < points.length - 1 ? '1px solid #E5E5EA' : 'none',
              paddingLeft: p.lvl === 'L2' ? 24 : p.lvl === 'L3' ? 40 : 12,
            }}>
              <span style={{ fontSize: '0.571rem', fontWeight: 700, color: { L1: '#1D9E75', L2: '#D85A30', L3: '#7F77DD' }[p.lvl], minWidth: 18 }}>{p.lvl}</span>
              <span style={{ flex: 1, fontSize: '0.857rem', color: '#3C3C43', wordBreak: 'keep-all' }}>{p.text}</span>
              {p.ref && <span style={{ fontSize: '0.714rem', color: '#378ADD', fontWeight: 600 }}>[{p.ref}]</span>}
              <JW_XsBtn>DB</JW_XsBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

window.JW_PrepareScreen = PrepareScreen;
