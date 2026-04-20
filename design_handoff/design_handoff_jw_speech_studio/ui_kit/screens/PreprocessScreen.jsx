/* global React, JW_L2Tabs, JW_Btn, JW_XsBtn, JW_Textarea, JW_Input, JW_TagBadge, JW_LevelBadge, JW_StatusDot */
const { useState: useStatePP } = React;

// ── Import sub-tab ──
const ImportTab = () => {
  const [mode, setMode] = useStatePP('파일');
  const [parsed, setParsed] = useStatePP(false);
  const [sttProgress, setSttProgress] = useStatePP(0);

  const modes = ['파일', '직접 입력', 'STT 변환', '출판물 등록'];

  const parsedData = {
    info: { code: 'S-34', title: '영적 양식을 즐깁니다', year: '2024', version: '9' },
    points: [
      { lvl: 'L1', text: '영적 양식을 즐깁니다', ref: '사 65:13' },
      { lvl: 'L2', text: '고통을 인내하는 데 도움', ref: '사 65:14-17' },
      { lvl: 'L2', text: '환난 속의 위로를 깨닫게 함', ref: null },
      { lvl: 'L3', text: '만나의 교훈', ref: '출 16장' },
      { lvl: 'L3', text: '광야의 시험', ref: '신 8:3' },
    ],
    scriptures: ['사 65:13', '사 65:14-17', '출 16장', '신 8:3'],
    pubs: ['w24-04 12-15면'],
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {modes.map(m => (
          <button key={m} onClick={() => setMode(m)} style={{
            border: 'none', borderRadius: 6, padding: '5px 11px',
            background: mode === m ? '#1D9E75' : '#EFEFF4',
            color: mode === m ? '#fff' : '#48484A',
            fontFamily: 'inherit', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer',
          }}>{m}</button>
        ))}
      </div>

      {mode === '파일' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ border: '2px dashed #C6C6C8', borderRadius: 10, padding: 20, textAlign: 'center', color: '#8E8E93', fontSize: '0.857rem' }}>
            MD / DOCX 파일을 드래그하거나 클릭해서 업로드
            <div style={{ marginTop: 6 }}>
              <JW_Btn variant="secondary" size="sm" onClick={() => setParsed(true)}>샘플 파싱 미리보기</JW_Btn>
            </div>
          </div>

          {parsed && (
            <div style={{ background: '#fff', border: '1px solid #C6C6C8', borderRadius: 12, overflow: 'hidden' }}>
              {/* 골자 정보 */}
              <div style={{ background: '#EFEFF4', padding: '8px 12px', borderBottom: '1px solid #C6C6C8', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <JW_TagBadge kind="골자" />
                <span style={{ fontSize: '0.786rem', fontWeight: 600, color: '#48484A' }}>
                  {parsedData.info.code} · {parsedData.info.title}
                </span>
                <span style={{ fontSize: '0.714rem', color: '#8E8E93' }}>{parsedData.info.year}년 · v{parsedData.info.version}</span>
                <div style={{ flex: 1 }} />
                <JW_StatusDot color="#1D9E75" />
                <span style={{ fontSize: '0.714rem', color: '#1D9E75', fontWeight: 600 }}>파싱 완료</span>
              </div>

              {/* 소주제/요점 트리 */}
              <div style={{ padding: '8px 0' }}>
                <div style={{ padding: '4px 12px', fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>소주제 / 요점 트리</div>
                {parsedData.points.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'baseline', gap: 8,
                    padding: '6px 12px', borderBottom: i < parsedData.points.length - 1 ? '1px solid #E5E5EA' : 'none',
                    paddingLeft: p.lvl === 'L2' ? 24 : p.lvl === 'L3' ? 40 : 12,
                  }}>
                    <JW_LevelBadge level={p.lvl} />
                    <span style={{ flex: 1, fontSize: '0.857rem', color: '#3C3C43', wordBreak: 'keep-all' }}>{p.text}</span>
                    {p.ref && <span style={{ fontSize: '0.714rem', color: '#378ADD', fontWeight: 600 }}>[{p.ref}]</span>}
                  </div>
                ))}
              </div>

              {/* 성구 목록 */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid #E5E5EA' }}>
                <div style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600, marginBottom: 4 }}>성구 (자동 추출)</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {parsedData.scriptures.map((s, i) => (
                    <span key={i} style={{ background: '#eef6ff', color: '#378ADD', border: '1px solid #cce3f8', borderRadius: 4, padding: '1px 6px', fontSize: '0.714rem', fontWeight: 600 }}>{s}</span>
                  ))}
                </div>
              </div>

              {/* 출판물 목록 */}
              <div style={{ padding: '8px 12px', borderTop: '1px solid #E5E5EA' }}>
                <div style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600, marginBottom: 4 }}>출판물 (자동 추출)</div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                  {parsedData.pubs.map((p, i) => (
                    <span key={i} style={{ background: '#fef5f0', color: '#C7842D', border: '1px solid #e8c0a8', borderRadius: 4, padding: '1px 6px', fontSize: '0.714rem', fontWeight: 600 }}>{p}</span>
                  ))}
                  <button style={{ background: 'none', border: '1px dashed #C6C6C8', borderRadius: 4, padding: '1px 6px', fontSize: '0.714rem', color: '#8E8E93', cursor: 'pointer', fontFamily: 'inherit' }}>+ 추가</button>
                </div>
              </div>

              {/* Save */}
              <div style={{ padding: '10px 12px', borderTop: '1px solid #C6C6C8', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <JW_Btn variant="primary" size="sm">저장</JW_Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === '직접 입력' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>텍스트 직접 입력</div>
          <JW_Textarea placeholder={'골자 요점을 붙여넣으세요\n\n여러 요점:\n영적 양식을 즐깁니다 (사 65:13)'} style={{ minHeight: 140 }} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <JW_Btn variant="primary" size="sm">파싱</JW_Btn>
          </div>
        </div>
      )}

      {mode === 'STT 변환' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ border: '2px dashed #C6C6C8', borderRadius: 10, padding: 20, textAlign: 'center', color: '#8E8E93', fontSize: '0.857rem' }}>
            오디오 파일 (mp3, wav, m4a) 업로드
          </div>
          {/* Progress */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: '#EFEFF4', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: '42%', height: '100%', background: '#1D9E75', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: '0.786rem', color: '#48484A', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>42%</span>
            <JW_XsBtn>중단</JW_XsBtn>
          </div>
          <div style={{ fontSize: '0.786rem', color: '#8E8E93' }}>Whisper 변환 중… 예상 완료: 1분 30초</div>
        </div>
      )}

      {mode === '출판물 등록' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>출판물 코드</label>
            <JW_Input placeholder="예: w24-04" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>출판물명</label>
            <JW_Input placeholder="「파수대」 2024년 4월호" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>본문</label>
            <JW_Textarea placeholder="출판물 본문을 붙여넣으세요" style={{ minHeight: 100 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <JW_Btn variant="primary" size="sm">등록</JW_Btn>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Structure sub-tab ──
const StructureTab = () => {
  const [type, setType] = useStatePP('연설');
  const types = ['연설', '토의', '봉사 모임', '방문'];

  const typeFields = {
    '연설': [
      { label: '원본 텍스트', type: 'textarea', ph: '연설 원본 텍스트를 입력하세요' },
      { label: '골자 선택', type: 'select', ph: '골자를 선택하거나 자유 입력' },
    ],
    '토의': [
      { label: '주제', type: 'input', ph: '토의 주제' },
      { label: '날짜 (YYMM)', type: 'date' },
      { label: '원본', type: 'textarea', ph: '토의 원본' },
    ],
    '봉사 모임': [
      { label: '날짜 (YYMM)', type: 'date' },
      { label: '원본', type: 'textarea', ph: '봉사 모임 원본' },
    ],
    '방문': [
      { label: '주제', type: 'input', ph: '방문 주제' },
      { label: '대상', type: 'input', ph: '방문 대상' },
      { label: '날짜 (YYMM)', type: 'date' },
      { label: '원본', type: 'textarea', ph: '방문 원본' },
    ],
  };

  const fields = typeFields[type] || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {types.map(t => (
          <button key={t} onClick={() => setType(t)} style={{
            border: 'none', borderRadius: 6, padding: '5px 11px',
            background: type === t ? '#1D9E75' : '#EFEFF4',
            color: type === t ? '#fff' : '#48484A',
            fontFamily: 'inherit', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer',
          }}>{t}</button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #C6C6C8', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {fields.map((f, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.75rem', color: '#8E8E93', fontWeight: 600 }}>{f.label}</label>
            {f.type === 'textarea' && <JW_Textarea placeholder={f.ph} style={{ minHeight: 80 }} />}
            {f.type === 'input' && <JW_Input placeholder={f.ph} />}
            {f.type === 'date' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input style={{ background: '#EFEFF4', border: 'none', borderRadius: 8, padding: '6px 10px', width: 48, textAlign: 'center', fontFamily: 'inherit', fontSize: '0.857rem', color: '#000' }} placeholder="26" />
                <span style={{ color: '#AEAEB2', fontWeight: 600 }}>년</span>
                <input style={{ background: '#EFEFF4', border: 'none', borderRadius: 8, padding: '6px 10px', width: 48, textAlign: 'center', fontFamily: 'inherit', fontSize: '0.857rem', color: '#000' }} placeholder="04" />
                <span style={{ color: '#AEAEB2', fontWeight: 600 }}>월</span>
              </div>
            )}
            {f.type === 'select' && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{ flex: 1, background: '#EFEFF4', border: '1px solid #C6C6C8', borderRadius: 8, padding: '8px 12px', fontSize: '0.857rem', color: '#8E8E93', display: 'flex', justifyContent: 'space-between' }}>
                  <span>골자 선택…</span><span>▾</span>
                </div>
                <JW_XsBtn>자유 입력</JW_XsBtn>
              </div>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
          <JW_Btn variant="primary" size="sm">구조화</JW_Btn>
        </div>
      </div>
    </div>
  );
};

// ── Drafts sub-tab ──
const DraftsTab = () => {
  const drafts = [
    { type: '연설', title: '영적 양식을 즐깁니다 (S-34)', stamp: '2604·035', status: '원본 추출 완료' },
    { type: '토의', title: '「파수대」 연구 — 4월 2주차', stamp: '2604·028', status: '구조화 완료' },
    { type: '봉사 모임', title: '4월 둘째 주 봉사 모임', stamp: '2604·020', status: '원본 추출 완료' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {drafts.length === 0 ? (
        <div style={{ background: '#fff', border: '1px solid #C6C6C8', borderRadius: 12, padding: 24, textAlign: 'center', color: '#8E8E93', fontSize: '0.857rem' }}>
          <div style={{ fontSize: 20, color: '#AEAEB2', marginBottom: 8 }}>○</div>
          임시저장된 초안이 없습니다
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #C6C6C8', borderRadius: 12, overflow: 'hidden' }}>
          {drafts.map((d, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 12px', borderBottom: i < drafts.length - 1 ? '1px solid #E5E5EA' : 'none',
            }}>
              <span style={{
                fontSize: '0.643rem', fontWeight: 700, color: '#fff',
                background: d.type === '연설' ? '#1D9E75' : d.type === '토의' ? '#378ADD' : '#D85A30',
                borderRadius: 4, padding: '1px 5px',
              }}>{d.type}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.857rem', fontWeight: 600, color: '#000', wordBreak: 'keep-all' }}>{d.title}</div>
                <div style={{ fontSize: '0.714rem', color: '#8E8E93', marginTop: 2 }}>{d.stamp} · {d.status}</div>
              </div>
              <JW_XsBtn tone="green">이동</JW_XsBtn>
              <JW_XsBtn tone="red">삭제</JW_XsBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main ──
const PreprocessScreen = () => {
  const [sub, setSub] = useStatePP('가져오기');
  const subs = [{ label: '가져오기' }, { label: '구조화' }, { label: '임시저장' }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <JW_L2Tabs tabs={subs} value={sub} onChange={setSub} />
      {sub === '가져오기' && <ImportTab />}
      {sub === '구조화' && <StructureTab />}
      {sub === '임시저장' && <DraftsTab />}
    </div>
  );
};

window.JW_PreprocessScreen = PreprocessScreen;
