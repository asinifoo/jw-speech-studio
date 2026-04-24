// /api/outline/types 캐시 + 훅 + 동기 lookup (세션 5c Phase 1 Step 2b).
// 모듈 레벨 _cache — 탭 전환/remount 에도 재 fetch 없음 (B4 교훈).
// _loading Promise — 동시 mount 시 중복 fetch 방지.
// fail-soft — 오류 시 빈 배열 반환, 앱 깨뜨리지 않음.

import { useEffect, useState } from 'react';

let _cache = null;
let _loading = null;

async function _fetch() {
  if (_cache) return _cache;
  if (_loading) return _loading;
  _loading = fetch('/api/outline/types')
    .then(r => r.json())
    .then(d => {
      _cache = Array.isArray(d?.types) ? d.types : [];
      return _cache;
    })
    .catch(() => {
      _loading = null; // 실패 시 재시도 허용
      return [];
    });
  return _loading;
}

export function useOutlineTypes() {
  const [types, setTypes] = useState(() => _cache || []);
  const [loading, setLoading] = useState(() => !_cache);

  useEffect(() => {
    if (_cache) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    _fetch().then(t => {
      if (cancelled) return;
      setTypes(t);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  return { types, loading };
}

// 동기 lookup (이미 캐시 로드된 상태에서만 유효. 캐시 없으면 null/'').
export function getOutlineType(code) {
  if (!_cache || !code) return null;
  return _cache.find(t => t.code === code) || null;
}

export function getOutlineTypeName(code) {
  const t = getOutlineType(code);
  return t?.name || code || '';
}

// 한글명/alias → code 역방향 조회
export function resolveOutlineCode(name) {
  if (!_cache || !name) return null;
  for (const t of _cache) {
    if (t.name === name) return t.code;
    if (Array.isArray(t.aliases) && t.aliases.includes(name)) return t.code;
  }
  return null;
}

// 테스트/초기화용
export function _resetOutlineTypesCache() {
  _cache = null;
  _loading = null;
}
