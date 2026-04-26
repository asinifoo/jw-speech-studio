/**
 * 사이트 알림 메시지 표준 (Single Source of Truth)
 *
 * 사용 패턴:
 * - 실패: setMsg(MSG.fail.save + e.message)
 * - 성공: setMsg(MSG.success.save)
 * - 처리 중: setMsg(MSG.progress.save)
 * - 경고: setMsg(MSG.warn.validateWarning(3))
 * - 풍부 컨텍스트: setMsg(MSG.helpers.saveBatch(7))
 *
 * 색상 분기 (인라인 메시지):
 * - getStatusColor(msg) 사용
 *   - msg.startsWith('✓') → var(--accent) (초록, 성공)
 *   - msg.startsWith('⚠️') → var(--c-warning) (호박, 경고)
 *   - msg.startsWith('⏳') → var(--c-faint) (회색, 처리 중)
 *   - else → var(--c-danger) (빨강, 실패)
 *
 * 새 메시지 추가 시:
 * - 사이트 표준 액션 이름 표 (12군 + 특수) 따라 키 추가
 * - 표준 외 표현 (예: '오류') 사용 금지
 * - 풍부 컨텍스트는 helpers 함수로
 */

export const MSG = {
  fail: {
    save: '저장 실패: ',
    versionSave: '버전 저장 실패: ',
    delete: '삭제 실패: ',
    update: '수정 실패: ',
    upload: '업로드 실패: ',
    fetch: '조회 실패: ',
    parse: '파싱 실패: ',
    convert: '변환 실패: ',
    correct: '교정 실패: ',
    transfer: '전달 실패: ',
    validate: '검증 실패: ',
    reload: '리로드 실패: ',
    search: '검색 실패: ',
    pwVerify: '확인 실패: ',
    pwChange: '변경 실패: ',
  },
  success: {
    save: '✓ 저장 완료',
    serverSave: '✓ 서버 저장 완료',
    saveTransient: '✓ 임시저장 완료',
    versionSave: '✓ 버전 저장 완료',
    delete: '✓ 삭제 완료',
    update: '✓ 수정 완료',
    upload: '✓ 업로드 완료',
    parse: '✓ 파싱 완료',
    convert: '✓ 변환 완료',
    correct: '✓ 교정 완료',
    transfer: '✓ 전달 완료',
    validate: '✓ 검증 통과',
    reload: '✓ 리로드 완료',
    move: '✓ 이동 완료',
    pwChange: '✓ 비밀번호 변경 완료',
    numReorder: '✓ 번호 재정렬 완료',
    loadDraft: '✓ 임시저장 불러오기 완료',
    loadMemo: '✓ 간단 메모 불러오기 완료',
    newDraft: '✓ 기존 임시저장 삭제, 새로 시작',
    revert: '✓ 되돌림 완료',
  },
  warn: {
    validateWarning: (count) => `⚠️ 경고 ${count}건`,
    fileTooLarge: (sizeMb, maxLabel) => `⚠️ 파일이 너무 큽니다 (${sizeMb}MB, 최대 ${maxLabel})`,
  },
  progress: {
    save: '⏳ 저장 중...',
    delete: '⏳ 삭제 중...',
    upload: '⏳ 업로드 중...',
    correct: '⏳ 교정 중...',
    transfer: '⏳ 임시저장 전달 중...',
  },
  helpers: {
    saveWithBackup: (count) => `✓ 저장 완료 (백업 ${count}개)`,
    saveBatch: (total) => `✓ ${total}건 저장 완료 (임시저장 삭제됨)`,
    moveTo: (collection, label = '') => `✓ 이동 완료 (${collection})${label}`,
    saveTo: (collection, label = '') => `✓ 저장 완료 (${collection})${label}`,
    saveByLink: (id) => `✓ 저장 완료 — [전처리] > [임시저장]에서 확인 가능 (${id})`,
    updateByLink: (id) => `✓ 수정 완료 (${id})`,
    parseStats: (parts) => `✓ ${parts.join(' · ')}`,
    uploadNamed: (filename) => `✓ 업로드 완료: ${filename}`,
    uploadProgress: (filename, sizeMb) => `⏳ 업로드 중: ${filename} (${sizeMb}MB)`,
    convertDocx: () => `✓ DOCX 변환 완료. 들여쓰기를 검수한 후 [파싱] 버튼을 눌러주세요.`,
    successFromBackend: (msg) => `✓ ${msg}`,
  },
};

export function getStatusColor(msg) {
  if (!msg) return undefined;
  if (msg.startsWith('✓')) return 'var(--accent)';
  if (msg.startsWith('⚠️')) return 'var(--c-warning)';
  if (msg.startsWith('⏳')) return 'var(--c-faint)';
  return 'var(--c-danger)';
}
