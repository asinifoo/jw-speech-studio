/* global React, JW_L2Tabs, JW_SearchCard, JW_StatusDot, JW_XsBtn */
const { useState: useStateSS } = React;

const SAMPLE_CARDS = [
  {
    source: '출판물', dotColor: '#C7842D', relevance: 0.89, checked: true,
    searchSource: '의미#8 + 키워드#2',
    meta: [['출판물', '「깨08/12」 7면', 'var(--accent-purple)'], ['출판물명', '깨어라! 2008년 12월호'], ['키워드', '하느님의 목적, 이사야 55:10-11, 영적 양식, 에덴동산, 아담의 불순종, 로마 5:12, 낙원, 땅에 대한 목적, 이사야 45:18']],
    body: '성서에서는 하느님의 약속의 확실성을 위 성구에 묘사되어 있는 물순환에 비합니다. 오늘날 우리가 알고 있는 것처럼, 대양과 바다와 호수에 있는 물은 태양열을 통해 증발되어 그 후 다시 강수의 형태로 땅에 내립니다. 여호와께서는 그러한 물순환에 주의를 이끄시면서 이렇게 말…',
    usedIn: 1,
  },
  {
    source: '연설', speaker: '유하진', stamp: '2506', dotColor: '#1D9E75', relevance: 0.48, checked: true,
    searchSource: '키워드#1',
    meta: [['주제', 'S-34_006 노아 시대의 홍수와 당신'], ['소주제', '2. 불경건한 세상의 멸망은 우리 시대를 위한 본보기가 된다'], ['요점', '2.2.2 - 악귀의 영향', 'var(--accent)'], ['성구', '창 6:1, 2', 'var(--accent-blue)'], ['키워드', '참하느님의 아들들, 악한 천사들의 물질화, 인간 여자와 결혼, 악의 만연']],
    pubRef: { code: '「파08」 6/1 5면 3-5항' },
    body: '네, 두 번째로 노아 시대 때는 악귀들의 영향이 세상에 가득했습니다. 왜 그런 이유가 있었을까요? 함께 창세기 6장 1절과 2절을 통해서 그 이유를 살펴보시겠습니다.\n창세기 6장 1절과 2절입니다. 1절, "땅 위에 사람들이 늘어나기 시작하고 그들에게 딸들이 태어나게 …',
  },
  {
    source: '연설', speaker: '미상', stamp: '2309', dotColor: '#1D9E75', relevance: 0.35, checked: false,
    tags: [{ label: '표현', bg: 'var(--accent-orange)' }],
    meta: [['주제', 'S-34_166 진정한 믿음이란 무엇이며 어떻게 나타낼 수 있는가?'], ['소주제', '4. 당신도 진정한 믿음을 기를 수 있다'], ['요점', '4.3.1 - 아브라함처럼 여러분도 확신을 가지고 하느님께서 약속하신 상을 바라볼 수 있다!', 'var(--accent)'], ['성구', '딤전 4:10; 히 11:8-10', 'var(--accent-blue)'], ['키워드', '신명기 31:6 용기와 힘, 여호와께서 함께 진군하심, 버리지도 떠나지도 않으심, 황금빛 미래, 믿음과 용기로 미래를 당당히 직면']],
    body: '이런 미래가 있는데 미래가 불안하십니까? 이런 미래가 있는데 아직도 미래가 조금은 미덥지 않으십니까? 그렇다면 마지막으로 성구 하나만 읽어 보도록 하죠.',
  },
  {
    source: '원문', speaker: '손병진', stamp: '2308', dotColor: '#D85A30', relevance: 0.30, checked: false,
    meta: [['주제', 'S-34_113 청소년들은 어떻게 행복하고 성공적인 삶을 살 수 있는가?']],
    body: '# 연설 원문 수정본\n\n## 메타데이터',
  },
  // Readonly preset example
  {
    source: '출판물', dotColor: '#C7842D', relevance: 0.95, checked: true, _preset: 'readonly',
    meta: [['출판물', '「파11」 9/15 25면 1-4항', 'var(--accent-purple)'], ['출판물명', '파수대 2011년 9월 15일호'], ['키워드', '하느님을 사랑, 하느님이 아시다, 충실, 여호와의 사랑, 떠내려가지 않기']],
    body: '어느 날, 한 바리새인이 예수께 다가와 "율법에서 가장 큰 계명은 어떤 것입니까?" 하고 물었습니다. 그러자 예수께서는 "네 마음을 다하고 네 영혼을 다하고 네 정신을 다하여 너의 하느님 여호와를 사랑해야 한다"고 말씀하셨습니다. (마태 22:3…',
  },
];

const FILTERS = [
  { label: '전체', count: 5 },
  { label: '표현', count: 1 },
  { label: '예시', count: 0 },
  { label: '출판물', count: 2 },
];

const SearchScreen = () => {
  const [q, setQ] = useStateSS('영적 양식 · 인내');
  const [filter, setFilter] = useStateSS('전체');
  const [searching, setSearching] = useStateSS(false);
  const [phase, setPhase] = useStateSS('완료');

  const runSearch = () => {
    setSearching(true);
    let i = 0;
    const phases = ['파싱 중…', 'DB 검색 중…', '필터 중…', '완료'];
    const tick = () => {
      setPhase(phases[i++]);
      if (i < phases.length) setTimeout(tick, 450);
      else setSearching(false);
    };
    tick();
  };

  const getPreset = (card) => {
    if (card._preset) return card._preset;
    if (card.source === '원문' || card.source === '연사메모') return 'raw';
    return 'default';
  };

  const visible = SAMPLE_CARDS.filter(c => {
    if (filter === '전체') return true;
    if (filter === '표현') return c.tags && c.tags.some(t => t.label === '표현');
    if (filter === '출판물') return c.source === '출판물';
    return true;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: 'var(--bg-subtle)', borderRadius: 8, padding: '6px 10px' }}>
        <span style={{ color: 'var(--c-muted)' }}>⌕</span>
        <input value={q} onChange={e => setQ(e.target.value)}
          style={{ background: 'transparent', border: 'none', flex: 1, fontFamily: 'inherit', fontSize: '0.929rem', color: 'var(--c-text-dark)', outline: 'none', padding: '4px 0' }}
          placeholder="검색어 입력…" />
        <button onClick={runSearch} disabled={searching}
          style={{
            background: searching ? 'var(--bd-medium)' : 'var(--accent)',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '5px 14px', fontSize: '0.786rem', fontWeight: 600,
            fontFamily: 'inherit', cursor: searching ? 'default' : 'pointer',
          }}>
          {searching ? '…' : '검색'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.786rem', color: 'var(--c-sub)' }}>
        <JW_StatusDot color={phase === '완료' ? 'var(--accent)' : 'var(--accent-gold)'} />
        <span>{phase}</span>
        <span style={{ color: 'var(--c-dim)' }}>·</span>
        <span style={{ color: 'var(--c-muted)' }}>4 collections · {SAMPLE_CARDS.length}개 결과</span>
        <div style={{ flex: 1 }} />
        <span style={{ color: 'var(--c-muted)' }}>{SAMPLE_CARDS.filter(c => c.checked !== false).length}/{SAMPLE_CARDS.length}건 선택</span>
      </div>

      <JW_L2Tabs tabs={FILTERS} value={filter} onChange={setFilter} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {visible.map((c, i) => <JW_SearchCard key={i} card={c} preset={getPreset(c)} />)}
      </div>
    </div>
  );
};

window.JW_SearchScreen = SearchScreen;
window.JW_SAMPLE_CARDS = SAMPLE_CARDS;
