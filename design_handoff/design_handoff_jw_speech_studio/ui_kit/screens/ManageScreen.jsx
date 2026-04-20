/* global React, JW_L3Tabs, JW_Input, JW_XsBtn, JW_TagBadge, JW_LevelBadge */
const { useState: useStateMS } = React;

const COLLECTIONS = [
  { label: '골자',     count: 128 },
  { label: '연설',     count: 42 },
  { label: '출판물',   count: 7310 },
  { label: '원문',     count: 31105 },
  { label: '연사메모', count: 19 },
];

const ROWS = {
  '골자': [
    { code: 'S-34', title: '영적 양식을 즐깁니다', stamp: '2604·035', kind: '골자', lvl: 'L2' },
    { code: 'S-35', title: '여호와의 위로의 손길', stamp: '2604·030', kind: '골자', lvl: 'L2' },
    { code: 'S-36', title: '시련 가운데서의 평온함', stamp: '2603·412', kind: '골자', lvl: 'L3' },
    { code: 'S-37', title: '봉사 모임 — 4월 둘째 주', stamp: '2603·408', kind: '골자', lvl: 'L1' },
    { code: 'S-38', title: '공개 강연 준비 점검', stamp: '2603·402', kind: '골자', lvl: 'L1' },
  ],
  '연설': [
    { code: 'P-128', title: '시험에 처한 형제자매를 위로함', stamp: '2603·112', kind: '연설', lvl: 'L3' },
    { code: 'P-127', title: '봉사의 기쁨을 회복하는 법', stamp: '2603·105', kind: '연설', lvl: 'L2' },
  ],
  '출판물': [
    { code: 'w24-04', title: '「파수대」 2024년 4월호', stamp: 'w24·12', kind: '출판물', lvl: null },
    { code: 'w24-03', title: '「파수대」 2024년 3월호', stamp: 'w24·10', kind: '출판물', lvl: null },
  ],
  '원문': [
    { code: '사65:13', title: '이사야 65장 13절', stamp: 'sg·65', kind: '원문', lvl: null },
    { code: '시23:5',  title: '시편 23편 5절',     stamp: 'sg·23', kind: '원문', lvl: null },
  ],
  '연사메모': [
    { code: 'M-19', title: '지난 주 청중 반응 메모', stamp: '2603·412', kind: '연사메모', lvl: null },
  ],
};

const ManageScreen = () => {
  const [tab, setTab] = useStateMS('골자');
  const [q, setQ] = useStateMS('');
  const rows = ROWS[tab].filter(r => !q || r.title.includes(q) || r.code.includes(q));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <JW_L3Tabs tabs={COLLECTIONS} value={tab} onChange={setTab} />

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#EFEFF4', borderRadius: 8, padding: '6px 10px' }}>
        <span style={{ color: '#8E8E93' }}>⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={`${tab} 안에서 검색…`}
          style={{ background: 'transparent', border: 'none', flex: 1, fontFamily: 'inherit', fontSize: '0.857rem', color: '#000', outline: 'none', padding: '4px 0' }} />
        <JW_XsBtn tone="solid">+ 새로</JW_XsBtn>
      </div>

      <div style={{ background: '#fff', border: '1px solid #C6C6C8', borderRadius: 12, overflow: 'hidden' }}>
        {rows.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8E8E93', fontSize: '0.857rem' }}>결과 없음</div>}
        {rows.map((r, i) => (
          <div key={r.code} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderBottom: i < rows.length - 1 ? '1px solid #E5E5EA' : 'none',
          }}>
            <JW_TagBadge kind={r.kind} />
            {r.lvl && <JW_LevelBadge level={r.lvl} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.857rem', fontWeight: 600, color: '#000', wordBreak: 'keep-all' }}>{r.title}</div>
              <div style={{ fontSize: '0.714rem', color: '#8E8E93', marginTop: 2 }}>{r.code} · {r.stamp}</div>
            </div>
            <JW_XsBtn>수정</JW_XsBtn>
            <JW_XsBtn tone="red">삭제</JW_XsBtn>
          </div>
        ))}
      </div>
    </div>
  );
};

window.JW_ManageScreen = ManageScreen;
