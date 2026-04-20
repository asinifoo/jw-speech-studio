// 문서 파싱 유틸리티

export function cleanMd(v) {
  if (!v) return '';
  let c = v.replace(/- \*\*[^*]+\*\*:\s*/g, '').replace(/\*\*/g, '').replace(/^---+$/gm, '').trim();
  if (/^[-─—=*#|\s]*$/.test(c)) return '';
  return c;
}

export const tagColor = {
  jw_ai: '#2D8FC7', speech_points: '#1D9E75', speech_expressions: '#D85A30', publications: '#7F77DD',
};

export const tagLabel = {
  jw_ai: '성경/원문', speech_points: '골자', speech_expressions: '연설', publications: '출판물',
};

export const sourceLabel = {
  outline: '골자', speech: '연설', note: '메모', speaker_memo: '연사메모',
  service: '봉사', visit: '방문', publication: '출판물',
  '골자': '골자', '연설': '연설', '메모': '메모', '봉사 모임': '봉사 모임', '원문': '원문',
};

export function parseDocument(text) {
  if (!text) return null;
  const result = {};
  const lines = text.split('\n');

  const isReference = text.includes('- **도입 방식**') || text.includes('- **연설 구조**');
  if (isReference) {
    result.isReference = true;
    result.sections = [];
    for (const line of lines) {
      const m = line.match(/^- \*\*(.+?)\*\*:\s*(.*)$/);
      if (m) {
        result.sections.push({ label: m[1], content: m[2] });
      }
    }
    return result;
  }

  // 태그 줄 파싱
  const contentLines = [];
  for (const line of lines) {
    if (line.startsWith('[골자] ')) result.golza = line.slice(5).trim();
    else if (line.startsWith('[골자요점] ')) { const m = line.slice(7).trim().match(/^[\w.-]+ - (.+)/); if (m) result.point = result.point || m[1]; }
    else if (line.startsWith('[소주제] ')) result.subtopic = line.slice(6).trim();
    else if (line.startsWith('[요점] ')) result.point = line.slice(5).trim();
    else if (line.startsWith('[성구] ')) result.scripture = line.slice(5).trim();
    else if (line.startsWith('[키워드] ')) result.keywords = line.slice(6).trim();
    else if (line.startsWith('[표현] ') || line.startsWith('[예시] ')) result.tag = line.trim();
    else if (line.startsWith('[연설내용_전체] ')) contentLines.push(line.slice(10).trim());
    else if (line.startsWith('[연설내용] ')) contentLines.push(line.slice(7).trim());
    else if (line.startsWith('[연설] ') || line.startsWith('[example] ') || line.startsWith('[expression] ') || line.startsWith('[speech] ')) {
      // 헤더 태그 — 무시
    } else if (line.startsWith('[출처] ')) result.source = line.slice(5).trim();
    else if (line.startsWith('[')) {
      // 기타 태그 — 무시
    } else if (line.trim() !== '') {
      contentLines.push(line);
    }
  }

  if (contentLines.length > 0) {
    result.content = contentLines.join('\n').trim();
  }
  return result;
}
