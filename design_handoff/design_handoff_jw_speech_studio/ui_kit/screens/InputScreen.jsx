/* global React, JW_Input, JW_Textarea, JW_Btn, JW_XsBtn, JW_TagBadge */
const { useState: useStateIS } = React;

const InputScreen = () => {
  const [type, setType] = useStateIS('연설');
  const [title, setTitle] = useStateIS('');
  const [body, setBody] = useStateIS('');
  const [refs, setRefs] = useStateIS('');
  const [saved, setSaved] = useStateIS(false);

  const types = ['연설', '메모', '봉사', '방문'];

  const onSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {types.map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            border: 'none', borderRadius: 6, padding: '6px 12px',
            background: type === t ? '#1D9E75' : '#EFEFF4',
            color: type === t ? '#fff' : '#48484A',
            fontFamily: 'inherit', fontSize: '0.786rem', fontWeight: 600,
            cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>제목</label>
        <JW_Input value={title} onChange={e => setTitle(e.target.value)} placeholder="예: 영적 양식의 가치" />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>성구</label>
        <JW_Input value={refs} onChange={e => setRefs(e.target.value)} placeholder="사 65:13 · 시 23:5" style={{ fontSize: '0.857rem' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>본문</label>
        <JW_Textarea value={body} onChange={e => setBody(e.target.value)} placeholder="요점·표현·예시를 자유롭게 입력하세요" style={{ minHeight: 140 }} />
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <JW_XsBtn>임시저장</JW_XsBtn>
        <JW_XsBtn>불러오기</JW_XsBtn>
        <div style={{ flex: 1 }} />
        {saved && <span style={{ fontSize: '0.786rem', color: '#1D9E75', fontWeight: 600 }}>저장 완료</span>}
        <JW_Btn variant="primary" size="sm" onClick={onSave}>저장</JW_Btn>
      </div>
    </div>
  );
};

window.JW_InputScreen = InputScreen;
