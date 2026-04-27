// outline 분류 체계 SSOT (5h §3.12 commit 3.6a).
// - outline_type code → 카테고리 6종 ('공개 강연' / 'JW 방송' / '대회' / '특별 행사' / '생활과 봉사' / '기타')
// - outline_type code → 한국어 라벨 (단독 또는 카테고리 결합 표시 옵션)
// - 자유 입력 4종 (siFreeType + siFreeSubType) → 영문 코드 매핑
// backend _TYPE_NAMES (outline_parser.py) 와 정합 (5g §4.4 양쪽 동기화 패턴) — 라벨 정정은 commit 3.6c 영역.

import { matchOutlineType } from './outlineFormat';

export const OUTLINE_CATEGORIES = ['공개 강연', 'JW 방송', '대회', '특별 행사', '생활과 봉사', '기타'];

// outline_type 코드 → 카테고리 직접 매핑 (matchOutlineType 가 alias / 한글 / prefix 흡수)
const _CATEGORY_BY_CODE = {
  'S-34': '공개 강연',
  'S-31': '특별 행사',
  'S-123': '특별 행사',
  'S-211': '특별 행사',
  'CO_C': '대회',
  'CO_R': '대회',
  'SB': '생활과 봉사',
};

// wrapper 한국어 라벨 (백엔드 SSOT 외 영역, 사용자 메뉴 라벨)
const _CATEGORY_BY_LABEL = {
  '대회': '대회',
  '대회연설': '대회',
  '특별 행사': '특별 행사',
};

// outline_type 코드 → 한국어 라벨 SSOT (backend _TYPE_NAMES 와 정합)
const _OUTLINE_CODE_TO_LABEL = {
  'S-34': '공개강연',
  'S-31': '기념식',
  'S-123': '특별강연',
  'S-211': 'RP모임',
  'SB': '생활과봉사',
  'CO_C': '순회대회',
  'CO_R': '지역대회',
  'JWBC-SP': '연설',
  'JWBC-MW': '아침숭배',
  'JWBC-PG': '월간프로그램',
  'JWBC-AM': '연례총회',
  'ETC': '기타',
};

// 자유 입력 4종 (siFreeType + siFreeSubType) → 영문 코드 매핑 (sub 강제)
const _FREETYPE_MAPPING = {
  '생활과봉사': { code: 'SB' },
  '기타': { code: 'ETC' },
  '대회': {
    sub: {
      '순회대회': 'CO_C',
      '지역대회': 'CO_R',
    },
  },
  'JW방송': {
    sub: {
      '연설': 'JWBC-SP',
      '아침숭배': 'JWBC-MW',
      '월간프로그램': 'JWBC-PG',
      '연례총회': 'JWBC-AM',
    },
  },
};

export function getOutlineCategory(outlineType = '', outlineNum = '', source = '') {
  const gt = outlineType || '';
  const gn = outlineNum || '';
  const src = source || '';

  // 1. 직접 코드 매핑 (matchOutlineType 이 한글 / aliases / prefix 흡수)
  for (const [code, category] of Object.entries(_CATEGORY_BY_CODE)) {
    if (matchOutlineType(gt, code)) return category;
  }

  // 2. JWBC prefix 또는 source 표기
  if (gt.startsWith('JWBC') || src === 'JW 방송') return 'JW 방송';

  // 3. wrapper 한국어 라벨
  if (_CATEGORY_BY_LABEL[gt]) return _CATEGORY_BY_LABEL[gt];

  // 4. 구 데이터 fallback (outline_type 빈 값 + outline_num 패턴)
  if (!gt && gn) {
    if (/^\d{1,3}$/.test(gn)) return '공개 강연';
    if (gn === '기념식' || gn.startsWith('S-31')) return '특별 행사';
  }

  return '기타';
}

// outline_type code → 한국어 라벨.
// withCategory=true 시 카테고리 결합 표시 ("JW 방송 연설"). 단 카테고리 = 라벨 영역 중복 회피 ('S-34'/'SB').
export function getOutlineLabel(code, options = {}) {
  const label = _OUTLINE_CODE_TO_LABEL[code] || code || '';
  const { withCategory = false } = options;

  if (!withCategory) return label;

  const category = getOutlineCategory(code);
  if (
    category &&
    category !== '기타' &&
    label !== category &&
    label !== category.replace(/\s+/g, '')
  ) {
    return `${category} ${label}`;
  }
  return label;
}

// 자유 입력 4종 → 영문 코드. sub 미선택 시 빈 문자열 (UI 검증 차단).
export function freeTypeToOutlineCode(siFreeType, siFreeSubType = '') {
  const entry = _FREETYPE_MAPPING[siFreeType];
  if (!entry) return 'ETC';
  if (entry.code) return entry.code;
  if (entry.sub) {
    return entry.sub[siFreeSubType] || '';
  }
  return 'ETC';
}

export function freeTypeHasSub(siFreeType) {
  return Boolean(_FREETYPE_MAPPING[siFreeType]?.sub);
}
