import { useState, useCallback } from 'react';

/**
 * 카드 본문 인라인 확장/접기 훅.
 *
 * - 접힌 상태: max-height 4.2em (~3-4줄) + overflow hidden
 * - 펼친 상태: max-height 400px + overflow auto (스크롤)
 * - transition 0.2s ease
 *
 * @param {number} [threshold=120] - 이 길이 이상이면 접기/펼치기 표시
 * @returns {{ expanded, toggle, isLong, bodyStyle, fadeStyle }}
 */
export default function useCardExpand(threshold = 120) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback((e) => {
    if (e) e.stopPropagation();
    setExpanded(v => !v);
  }, []);

  const isLong = (text) => (text || '').length > threshold;

  const bodyStyle = (long) => ({
    maxHeight: expanded ? 400 : '4.2em',
    overflow: expanded ? 'auto' : 'hidden',
    transition: 'max-height 0.2s ease',
    position: long && !expanded ? 'relative' : undefined,
  });

  /** fade overlay — 접힌 상태 + long 일 때만 표시 */
  const fadeStyle = (bgColor = 'var(--bg-card)') => ({
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '2em',
    background: `linear-gradient(transparent, ${bgColor})`,
    pointerEvents: 'none',
  });

  return { expanded, toggle, isLong, bodyStyle, fadeStyle };
}
