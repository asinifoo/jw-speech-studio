// outline version/num 포맷 유틸 (세션 5c Phase 1 Step 2b).
// fail-soft — 알 수 없는 포맷은 raw 문자열 그대로 반환.

import { getOutlineType, getOutlineTypeName } from './outlineTypes';

// outline_type (code/한글/prefix) vs code 비교. fail-soft.
// cache 미로드 시 code/prefix 직접 비교만 통과 (검색 편의). alias 호환은 App preload 전제.
export function matchOutlineType(value, code) {
  if (!value || !code) return false;
  if (value === code) return true;
  if (typeof value === 'string' && value.startsWith(code + '_')) return true;
  const t = getOutlineType(code);
  if (t) {
    if (value === t.name) return true;
    if (Array.isArray(t.aliases) && t.aliases.includes(value)) return true;
  }
  return false;
}

// 공통 prefix 생성. type+num → "S-34_001" / "SB_041" / "S-31_001" 등.
// 삼항 연쇄 (`gt === '공개강연' || gt.startsWith('S-34')`) 흡수.
export function getOutlinePrefix(type, num) {
  if (matchOutlineType(type, 'S-34')) {
    if (!num) return 'S-34';
    const clean = String(num).replace(/^0+/, '');
    return 'S-34_' + (clean || '0').padStart(3, '0');
  }
  if (matchOutlineType(type, 'S-31')) {
    if (!num) return 'S-31';
    return 'S-31_' + (/^\d+$/.test(num) ? String(num).replace(/^0+/, '').padStart(3, '0') : num);
  }
  if (matchOutlineType(type, 'S-123')) return num ? `S-123_${String(num).padStart(3, '0')}` : 'S-123';
  if (matchOutlineType(type, 'S-211')) return num ? `S-211_${String(num).padStart(3, '0')}` : 'S-211';
  if (matchOutlineType(type, 'SB')) return num ? `SB_${String(num).padStart(3, '0')}` : 'SB';
  if (matchOutlineType(type, 'CO_C')) return num ? `CO_C_${String(num).padStart(3, '0')}` : 'CO_C';
  if (matchOutlineType(type, 'CO_R')) return num ? `CO_R_${String(num).padStart(3, '0')}` : 'CO_R';
  if (typeof type === 'string' && type.startsWith('JWBC')) return num ? `${type}_${num}` : type;
  // fallback: type+num 직접 조립
  if (!type && num && /^\d{1,3}$/.test(num)) return 'S-34_' + String(num).padStart(3, '0');
  return num ? `${type || ''}_${num}` : (type || '');
}

// "9/15" → "2015년 9월", "10/24" → "2024년 10월"
// 포맷 불일치 / 빈값 → raw 그대로.
export function formatVersion(version) {
  if (!version || typeof version !== 'string') return '';
  const m = version.match(/^(\d{1,2})\/(\d{2})$/);
  if (!m) return version;
  const month = parseInt(m[1], 10);
  const yy = parseInt(m[2], 10);
  if (month < 1 || month > 12) return version;
  return `${2000 + yy}년 ${month}월`;
}

// SB outline_num MMW 포맷: "041" → "4월 1주"
// 포맷 불일치 → raw 그대로.
export function formatSbMmw(num) {
  if (!num || typeof num !== 'string') return num || '';
  const m = num.match(/^(\d{1,2})(\d)$/);
  if (!m) return num;
  const month = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  if (month < 1 || month > 12 || week < 1 || week > 5) return num;
  return `${month}월 ${week}주`;
}

// 유형별 제목 조합.
// - S-34:  "공개강연 153번 (2024년 10월)"
// - SB:    "2026년 4월 1주차 생활과봉사"
// - S-31/S-123/S-211/CO_C/CO_R: "기념식 (2019년 8월)" — num 001 고정이라 생략
// - ETC / 알 수 없음: "기타" + 버전 있으면 괄호
export function formatOutlineTitle(type, num, version) {
  const name = getOutlineTypeName(type);
  const ver = formatVersion(version);

  if (type === 'SB') {
    const mmw = formatSbMmw(num);
    if (ver && mmw) return `${ver} ${mmw}차 ${name}`;
    if (ver) return `${ver} ${name}`;
    return name;
  }

  if (type === 'S-34') {
    const numPart = num ? ` ${parseInt(num, 10)}번` : '';
    return `${name}${numPart}${ver ? ` (${ver})` : ''}`;
  }

  // 단일 골자 (num=001 고정) — num 표기 생략
  return `${name}${ver ? ` (${ver})` : ''}`;
}
