// outline_type → 카테고리 5종 ('공개 강연' / 'JW 방송' / '대회' / '특별 행사' / '기타') 매핑.
// 화면 정책 영역 (TranscriptPage 카테고리 탭, 미래 Phase 7 대시보드 영역).
// backend SSOT 와 별개 — backend 는 outline_type code 만 보유, 카테고리 그룹은 프론트 정책.

import { matchOutlineType } from './outlineFormat';

export const OUTLINE_CATEGORIES = ['공개 강연', 'JW 방송', '대회', '특별 행사', '기타'];

// outline_type 코드 → 카테고리 직접 매핑 (matchOutlineType 가 alias / 한글 / prefix 흡수)
const _CATEGORY_BY_CODE = {
  'S-34': '공개 강연',
  'S-31': '특별 행사',
  'S-123': '특별 행사',
  'S-211': '특별 행사',
  'CO_C': '대회',
  'CO_R': '대회',
};

// wrapper 한국어 라벨 (백엔드 SSOT 외 영역, 사용자 메뉴 라벨)
const _CATEGORY_BY_LABEL = {
  '대회': '대회',
  '대회연설': '대회',
  '특별 행사': '특별 행사',
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
