/**
 * Extract body text from a stored document, stripping metadata tags.
 * Handles [연설내용_전체] prefix and [tag] lines.
 */
export function getBody(text) {
  return (text || '').split('\n').filter(l => {
    if (l.startsWith('[연설내용_전체] ')) return true;
    if (l.startsWith('[')) return false;
    return l.trim() !== '';
  }).map(l => l.startsWith('[연설내용_전체] ') ? l.slice(10).trim() : l).join('\n').trim();
}

/**
 * Extract body for transcript page (handles ## 연설 원문 header).
 */
export function getTranscriptBody(text) {
  const lines = (text || '').split('\n');
  const startIdx = lines.findIndex(l => l.startsWith('## 연설 원문'));
  if (startIdx >= 0) {
    return lines.slice(startIdx + 1).filter(l => l.trim() && !l.startsWith('---')).join('\n').trim();
  }
  return lines.filter(l => {
    if (l.startsWith('[') && l.includes(']')) return false;
    return l.trim() !== '';
  }).join('\n').trim();
}
