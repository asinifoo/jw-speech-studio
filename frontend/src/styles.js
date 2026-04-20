// ── 공통 스타일 상수 ─────────────────────────────────────
// 전체 사이트 일관성을 위한 디자인 토큰.
// 사용: import { S } from '../styles'; 또는 import { S } from './styles';

// ── 탭 컨테이너 ──────────────────────────────────────────

const PILL_CONTAINER = {
  display: 'flex', alignItems: 'center', gap: 2,
  background: 'var(--bg-subtle, #EFEFF4)', borderRadius: 10, padding: 2,
};

const UNDERLINE_CONTAINER = {
  display: 'flex',
  borderBottom: '1px solid var(--bd-light)',
  background: 'var(--bg-subtle)',
};

// ── 탭 버튼 팩토리 ──────────────────────────────────────

/** Level 1 (최상단): [입력]|[준비][검색][전처리][관리] */
const pillL1 = (active, color = 'var(--c-text-dark)') => ({
  flex: 1, padding: '8px 0', border: 'none', borderRadius: 8,
  fontSize: '0.929rem', fontWeight: active ? 700 : 500,
  background: active ? 'var(--bg-card, #fff)' : 'transparent',
  color: active ? color : 'var(--c-muted)',
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
});

/** Level 2 (대탭): [DB][AI], [연설][봉사 모임][방문], [AI대화][DB검색][성구][원문] */
const pillL2 = (active, color = 'var(--accent)') => ({
  flex: 1, padding: '7px 0', border: 'none', borderRadius: 8,
  fontSize: '0.857rem', fontWeight: active ? 700 : 500,
  background: active ? 'var(--bg-card, #fff)' : 'transparent',
  color: active ? color : 'var(--c-muted)',
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s ease',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
});

/** Level 3 (서브탭 — 밑줄): [골자][연설][출판물][원문][연사메모] */
const underlineTab = (active, color = 'var(--accent)') => ({
  flex: 1, padding: '9px 0 7px', border: 'none',
  borderBottom: active ? `2px solid ${color}` : '2px solid transparent',
  background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
});

/** Level 3 라벨 텍스트 */
const underlineLabel = (active, color = 'var(--accent)') => ({
  fontSize: '0.75rem', fontWeight: active ? 700 : 500,
  color: active ? color : 'var(--c-muted)', lineHeight: 1.2,
});

/** Level 3 카운트 텍스트 */
const underlineCount = (active, color = 'var(--accent)') => ({
  fontSize: '0.571rem', fontWeight: 600,
  color: active ? color : 'var(--c-dim)',
});

/** Level 4 (세그먼트): [그룹][목록], [골자 선택][자유 입력] */
const pillL4 = (active, color = 'var(--accent)') => ({
  flex: 1, padding: '5px 0', border: 'none', borderRadius: 8,
  fontSize: '0.786rem', fontWeight: active ? 700 : 500,
  background: active ? 'var(--bg-card, #fff)' : 'transparent',
  color: active ? color : 'var(--c-muted)',
  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
});

/** 스크롤 가능 pill (다수 항목): 봉사 유형, 방문 상황 등 */
const pillScroll = (active, color = 'var(--accent)') => ({
  padding: '5px 12px', border: 'none', borderRadius: 8,
  fontSize: '0.821rem', fontWeight: active ? 700 : 500,
  background: active ? 'var(--bg-card, #fff)' : 'transparent',
  color: active ? color : 'var(--c-muted)',
  cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0,
  transition: 'all 0.2s ease',
  boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
});

// ── 버튼 ─────────────────────────────────────────────────

const BTN_BASE = {
  border: 'none', borderRadius: 8, cursor: 'pointer',
  fontFamily: 'inherit', fontWeight: 700, transition: 'all 0.15s',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

const BTN_PRIMARY = {
  ...BTN_BASE,
  padding: '8px 16px', fontSize: '0.857rem',
  background: 'var(--accent)', color: '#fff',
};

const BTN_SECONDARY = {
  ...BTN_BASE,
  padding: '8px 16px', fontSize: '0.857rem',
  background: 'var(--bg-subtle)', color: 'var(--c-text)',
  border: '1px solid var(--bd)',
};

const BTN_DANGER = {
  ...BTN_BASE,
  padding: '8px 16px', fontSize: '0.857rem',
  background: 'var(--c-danger)', color: '#fff',
};

/** 카드 내부 소형 액션 버튼 (수정/DB/삭제 등) */
const BTN_XS = {
  height: 20, padding: '0 8px', borderRadius: 5,
  border: '1px solid var(--bd)', background: 'var(--bg-card)',
  color: 'var(--c-faint)', fontSize: '0.643rem',
  cursor: 'pointer', minWidth: 36,
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  lineHeight: 1, fontFamily: 'inherit',
};

const BTN_XS_DANGER = {
  ...BTN_XS,
  border: '1px solid var(--tint-red-bd)',
  color: 'var(--c-danger)',
};

// ── 카드 프리셋별 XS 버튼 ────────────────────────────────

const BTN_XS_ACCENT = {
  ...BTN_XS,
  border: '1px solid var(--tint-green-bd)',
  color: 'var(--accent)',
};

const BTN_XS_ORANGE = {
  ...BTN_XS,
  border: '1px solid var(--tint-orange-bd)',
  color: 'var(--accent-orange)',
};

const BTN_XS_PURPLE = {
  ...BTN_XS,
  border: '1px solid var(--tint-purple-bd)',
  color: 'var(--accent-purple)',
};

// ── 카드 / 입력 ──────────────────────────────────────────

/** 컨테이너 카드 (탭+폼 래퍼): borderRadius 12 */
const CARD = {
  borderRadius: 12, border: '1px solid var(--bd)',
  background: 'var(--bg-card)', overflow: 'hidden',
};

/** 데이터 아이템 카드: borderRadius 8 */
const CARD_ITEM = {
  borderRadius: 8, border: '1px solid var(--bd-soft)',
  background: 'var(--bg-card)', overflow: 'hidden', marginBottom: 6,
};

const CARD_ITEM_HEADER = {
  padding: '8px 10px', background: 'var(--bg-subtle)',
  borderBottom: '1px solid var(--bd-light)',
  cursor: 'pointer',
};

const CARD_ITEM_BODY = {
  padding: '8px 10px',
};

const CARD_ITEM_META = {
  display: 'grid', gridTemplateColumns: 'auto 1fr',
  gap: '2px 8px', alignItems: 'baseline',
};

const INPUT = {
  width: '100%', padding: '8px 10px', border: 'none', borderRadius: 8,
  background: 'var(--bg-subtle)', color: 'var(--c-text-dark)',
  fontSize: '0.857rem', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};

const TEXTAREA = {
  ...INPUT,
  padding: '10px 12px', resize: 'vertical', lineHeight: 1.8,
};

// ── Export ────────────────────────────────────────────────

export const S = {
  // 탭 컨테이너
  pillContainer: PILL_CONTAINER,
  underlineContainer: UNDERLINE_CONTAINER,

  // 탭 버튼 (팩토리 함수)
  pillL1,
  pillL2,
  pillL4,
  pillScroll,
  underlineTab,
  underlineLabel,
  underlineCount,

  // 버튼
  btnPrimary: BTN_PRIMARY,
  btnSecondary: BTN_SECONDARY,
  btnDanger: BTN_DANGER,
  btnXs: BTN_XS,
  btnXsDanger: BTN_XS_DANGER,
  btnXsAccent: BTN_XS_ACCENT,
  btnXsOrange: BTN_XS_ORANGE,
  btnXsPurple: BTN_XS_PURPLE,

  // 카드 컨테이너
  card: CARD,

  // 데이터 카드
  cardItem: CARD_ITEM,
  cardItemHeader: CARD_ITEM_HEADER,
  cardItemBody: CARD_ITEM_BODY,
  cardItemMeta: CARD_ITEM_META,

  // 입력
  input: INPUT,
  textarea: TEXTAREA,
};
