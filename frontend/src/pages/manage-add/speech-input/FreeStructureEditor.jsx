export default function FreeStructureEditor({ subtopics, onSubtopicsChange }) {
  return (
    <div style={{ marginBottom: 10 }}>
      {/* subtopic 단일 모드 */}
      {(<>
        {subtopics.map((st, si) => {
          const isStandaloneTopLevel = st._mode === 'top';
          return (
          <div key={si} style={{ marginBottom: 8, borderRadius: 8, border: '1px solid var(--bd-light)', overflow: 'hidden' }}>
            {!isStandaloneTopLevel && (
              <div style={{ padding: '6px 10px', background: 'var(--bg-subtle)', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid var(--bd-light)' }}>
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', color: '#fff', fontSize: '0.714rem', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{si + 1}</span>
                <input value={st.title} onChange={e => onSubtopicsChange(p => p.map((x, j) => j === si ? { ...x, title: e.target.value } : x))} placeholder="소주제 제목" style={{ flex: 1, padding: '4px 8px', border: 'none', borderRadius: 6, fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none', color: 'var(--c-text-dark)', background: 'transparent', boxSizing: 'border-box' }} />
                <button onClick={() => onSubtopicsChange(p => p.filter((_, j) => j !== si))} style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.786rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
              </div>
            )}
            {/* 요점 배열 */}
            <div style={{ padding: '6px 10px' }}>
              <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 6 }}>요점</div>
              {(st.points || []).map((pt, pi) => {
                const curTags = (pt.tags || '').split(',').map(s => s.trim()).filter(Boolean);
                const ptLabel = isStandaloneTopLevel ? `요점 ${pi + 1}` : `${si + 1}.${pi + 1}`;
                const showScrInput = pt._scripturesOpen || (pt.scriptures || '').trim();
                const showPubInput = pt._publicationsOpen || (pt.publications || '').trim();
                const updPoint = (field, val) => onSubtopicsChange(p => p.map((x, j) =>
                  j === si ? { ...x, points: (x.points || []).map((pp, pj) => pj === pi ? { ...pp, [field]: val } : pp) } : x
                ));
                return (
                <div key={pi} style={{ marginBottom: 6, padding: 8, borderRadius: 6, background: 'var(--bg-subtle)', border: '1px solid var(--bd-light)' }}>
                  {/* 헤더 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: '0.714rem', fontWeight: 600, color: 'var(--accent-blue)', flexShrink: 0 }}>{ptLabel}</span>
                    <div style={{ flex: 1 }} />
                    <button onClick={() => onSubtopicsChange(p => p.map((x, j) =>
                      j === si ? { ...x, points: (x.points || []).filter((_, pj) => pj !== pi) } : x
                    ))} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--c-dim)', fontSize: '0.714rem', cursor: 'pointer' }}>✕</button>
                  </div>
                  {/* 1. 요점 제목 */}
                  <input value={pt.title || ''}
                    onChange={e => updPoint('title', e.target.value)}
                    placeholder="요점 제목 (예: 남편은 아내를 사랑해야)"
                    style={{ display: 'block', width: '100%', padding: '5px 7px', boxSizing: 'border-box', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.786rem', fontWeight: 600, fontFamily: 'inherit', outline: 'none', marginBottom: 6 }} />
                  {/* 2. 성구 (접기/펼치기) */}
                  {showScrInput ? (
                    <input value={pt.scriptures || ''}
                      onChange={e => updPoint('scriptures', e.target.value)}
                      placeholder="성구 (여러 개는 ; 로 구분, 예: 엡 5:28; 시편 119:105)"
                      style={{ width: '100%', padding: '4px 7px', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.714rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
                  ) : (
                    <button onClick={() => updPoint('_scripturesOpen', true)}
                      style={{ width: '100%', padding: '4px 10px', borderRadius: 4, border: '1px dashed var(--bd-light)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left' }}>
                      + 성구 추가
                    </button>
                  )}
                  {/* 3. 출판물 (접기/펼치기) */}
                  {showPubInput ? (
                    <input value={pt.publications || ''}
                      onChange={e => updPoint('publications', e.target.value)}
                      placeholder="출판물 (여러 개는 ; 로 구분, 예: 파21 8월호 p.15 §3)"
                      style={{ width: '100%', padding: '4px 7px', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.714rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
                  ) : (
                    <button onClick={() => updPoint('_publicationsOpen', true)}
                      style={{ width: '100%', padding: '4px 10px', borderRadius: 4, border: '1px dashed var(--bd-light)', background: 'transparent', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4, textAlign: 'left' }}>
                      + 출판물 추가
                    </button>
                  )}
                  {/* 4. 키워드 */}
                  <input value={pt.keywords || ''}
                    onChange={e => updPoint('keywords', e.target.value)}
                    placeholder="키워드 (쉼표 구분)"
                    style={{ width: '100%', padding: '4px 7px', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.714rem', fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
                  {/* 5. 태그 */}
                  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginBottom: 6 }}>
                    {['표현', '예시·실화', '예시·비유', '예시·성경'].map(tag => {
                      const active = curTags.includes(tag);
                      return (
                        <button key={tag} onClick={() => {
                          const next = active ? curTags.filter(t => t !== tag) : [...curTags, tag];
                          updPoint('tags', next.join(','));
                        }} style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.714rem', fontWeight: active ? 700 : 500, cursor: 'pointer',
                          border: 'none',
                          background: active ? (tag === '표현' ? '#D85A3018' : tag === '예시·성경' ? '#2D8FC718' : '#C7842D18') : 'var(--bg-card)',
                          color: active ? (tag === '표현' ? 'var(--accent-orange)' : tag === '예시·성경' ? '#2D8FC7' : 'var(--accent-brown)') : 'var(--c-muted)',
                          transition: 'all 0.15s',
                        }}>{tag}</button>
                      );
                    })}
                  </div>
                  {/* 6. 연설 내용 */}
                  <div style={{ fontSize: '0.643rem', color: 'var(--c-dim)', marginBottom: 3 }}>연설 내용</div>
                  <textarea value={pt.content || ''}
                    onChange={e => updPoint('content', e.target.value)}
                    placeholder="실제 연설 내용을 입력하세요..." rows={3}
                    style={{ display: 'block', width: '100%', padding: '5px 7px', boxSizing: 'border-box', border: '1px solid var(--bd-light)', borderRadius: 4, background: 'var(--bg-card)', color: 'var(--c-text-dark)', fontSize: '0.786rem', lineHeight: 1.6, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                </div>
                );
              })}
              {/* 최상위 모드에선 최하단 [+ 최상위 요점 추가]와 중복이므로 숨김 */}
              {!isStandaloneTopLevel && (
                <button onClick={() => onSubtopicsChange(p => p.map((x, j) =>
                  j === si ? { ...x, points: [...(x.points || []), { title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] } : x
                ))} style={{
                  width: '100%', padding: '5px 0', borderRadius: 6, border: '1px dashed var(--bd-light)',
                  background: 'transparent', color: 'var(--c-muted)', fontSize: '0.714rem', cursor: 'pointer', fontFamily: 'inherit',
                }}>+ 요점 추가</button>
              )}
            </div>
          </div>
          );
        })}
        {/* 버튼 완전 대칭 — 각 모드에서 해당 버튼만 노출 */}
        {(() => {
          const isEmpty = subtopics.length === 0;
          const isTopMode = subtopics.length === 1 && subtopics[0]._mode === 'top';
          const isSubtopicMode = subtopics.some(s => s._mode === 'subtopic');
          const canAddSubtopic = isEmpty || isSubtopicMode;
          const canAddTopLevel = isEmpty || isTopMode;
          return (
            <div style={{ display: 'flex', gap: 6 }}>
              {canAddSubtopic && (
                <button onClick={() => {
                  // 단순 소주제 추가 (Q10 편입 제거)
                  onSubtopicsChange(p => [...p, { title: '', memo: '', _mode: 'subtopic', points: [{ title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] }]);
                }} style={{
                  flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--accent)',
                  background: 'var(--bg-card)', color: 'var(--accent)', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>+ 소주제 추가</button>
              )}
              {canAddTopLevel && (
                <button onClick={() => {
                  if (isEmpty) {
                    onSubtopicsChange([{ title: '', memo: '', _mode: 'top', points: [{ title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] }]);
                  } else {
                    onSubtopicsChange(p => p.map((x, j) =>
                      j === 0 ? { ...x, points: [...(x.points || []), { title: '', content: '', scriptures: '', publications: '', keywords: '', tags: '' }] } : x
                    ));
                  }
                }} style={{
                  flex: 1, padding: '8px', borderRadius: 6, border: '1px solid var(--accent-blue)',
                  background: 'var(--bg-card)', color: 'var(--accent-blue)', fontSize: '0.786rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>+ 최상위 요점 추가</button>
              )}
            </div>
          );
        })()}
      </>)}
    </div>
  );
}
