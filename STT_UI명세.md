# STT 변환 UI 메뉴 명세

> **목적**: STT(음성→텍스트) 파이프라인 관련 UI 전수 정리. 외부 Claude가 체크 시나리오 안내 시 상상 명칭 대신 실제 라벨 사용.
> **원칙**: 코드에서 확인된 문자열만 기록. 확인 불가 영역은 "확인 필요"로 명시.
> **범위**: STT 업로드·검토, 오탈자 교정 규칙 관리, STT 관련 프롬프트.

---

## 1. STT 전체 흐름 맵

```
[전처리] > [가져오기] > [STT 업로드]      (2. 업로드/검토)
      ↓ (mp4/mp3 등 업로드)
Whisper 변환 (서버)
      ↓ (완료 후 [검토하기])
검토 화면 (교정 옵션 + 4탭 비교 + 메타 입력)
      ↓ (파이프라인: 파서 → 로컬 LLM → 클라우드 LLM)
      ↓ ([임시저장으로 보내기])
[전처리] > [임시저장] > [연설 draft]   (STT 뱃지 있는 draft)
      ↓ ([이어서 편집])
[구조화] > [연설] 자유 입력 (원본 블록 상단 노출)

[관리] > [전처리]                       (3. 파서 규칙 편집)
      ↳ stt_corrections.json 편집

[관리] > [AI] > [프롬프트]              (4. LLM 교정 프롬프트)
      ↳ stt_local_cleanup / stt_correction 편집
```

**3단계 파이프라인** (`stt.py:547-604`):
1. **파서**: `apply_local_corrections()` — [관리]>[전처리]의 JSON 규칙 기계 치환 (항상 실행)
2. **로컬 LLM** (선택): `stt_local_cleanup` 프롬프트 적용
3. **클라우드 LLM** (선택): `stt_correction` 프롬프트 적용

각 단계는 독립. 프롬프트는 `{text}` 플레이스홀더로 이전 단계 결과 주입.

---

## 2. [전처리] > [가져오기] > [STT 업로드] (`Gather.jsx`, `gatherMode='stt'`)

### 2.1 진입 경로

루트 **[전처리]** → 서브 **[가져오기]** → 카드 헤더 **[STT 업로드]** (녹색)

### 2.2 업로드 목록 화면 (`!sttReviewJob`일 때, `Gather.jsx:1220~`)

**업로드 영역** (점선 dashed 박스):
- 문구: "음성/영상 파일을 드래그하거나 선택하세요"
- 부제: "mp4, m4a, mp3, wav 등 · 최대 300MB"
- accept: `.mp4,.mkv,.avi,.mov,.webm,.flv,.wmv,.mp3,.wav,.m4a,.flac,.ogg,.aac`
- 버튼: **파일 선택** (주황) — 업로드 중엔 "업로드 중..."
- 진행 메시지 (`sttUploadStatus`): 성공/실패 색상 분기

**작업 목록 헤더**: "작업 목록 (N)" — N은 `sttJobs.length`

**빈 상태**: "업로드된 파일이 없습니다"

**각 STT 작업 카드** (`Gather.jsx:1289~`):
- 파일명 (ellipsis)
- 상태 뱃지 (우측, 상태별 색상)
- 메타: `{size}MB · {duration} · 예상 변환 {est}` (status별로 표시 조건 다름)
- 진행 바 (`transcribing` 상태): 경과/예상 초, 초과 시 빨강
- 실패 에러 메시지 (`failed` 상태): "⚠️ {error_message}"

### 2.3 STT 작업 상태 라벨 (`Gather.jsx:336~`)

| 서버 status | 한글 라벨 | 색상 |
|---|---|---|
| `uploaded` | 업로드됨 | 기본 |
| `transcribing` | 변환 중 | 금 (gold) |
| `transcribed` | 변환됨 | 파랑 (blue) |
| `correcting` | 교정 중 | 금 |
| `reviewing` | 검토 중 | 파랑 |
| `draft_sent` | 임시저장 중 | 파랑 |
| `saved` | 저장됨 | 녹 |
| `failed` | 실패 | 빨강 |

### 2.4 카드 상태별 버튼

| 상태 | 버튼 라벨 | 색상 | 동작 |
|---|---|---|---|
| `uploaded` | **변환 시작** | 주황 | `sttTranscribe(jobId)` → Whisper 호출 |
| `transcribed` / `reviewing` | **검토하기** | 파랑 | `enterSttReview(job)` → 검토 화면 진입 |
| `draft_sent` | **이어서 편집** | 녹 | `handleStartSttDraftEdit` → 구조화 자유 입력 |
| `failed` | **재시도** | 금 | `sttTranscribe(jobId)` 재호출 |
| 전체 (`transcribing`/`correcting` 제외) | **삭제** | 회(아웃라인), 비활성 시 not-allowed | `sttDelete(jobId)` |

### 2.5 검토 화면 (`sttReviewJob` 있을 때, `Gather.jsx:1427~`)

화면 구성 (위→아래):

#### 2.5.1 헤더
- **← 돌아가기** (회) → `exitSttReview()` (교정 중이면 confirm: "교정이 진행 중입니다. 정말 나가시겠습니까?")
- 파일명 + 메타 (`{duration} · {size}MB`)

#### 2.5.2 교정 옵션 카드
**제목**: "교정 옵션"

**3단계 체크박스**:
1. **파서 규칙** (고정, 비활성 체크박스): "파서 규칙 (항상 자동 적용)"
2. **로컬 LLM** (토글): "로컬 LLM (반복/공백 정리)" + 활성 시 model input (기본: `gemma4:e4b`)
3. **클라우드 LLM** (토글): "클라우드 LLM (정교한 문장 교정)" + 활성 시 [플랫폼 select] + [모델 select]

**교정 버튼**:
- 라벨: `final_text` 있을 땐 **다시 교정**, 없을 땐 **교정 적용** (주황)
- 교정 중: "**교정 중...**" (비활성)
- 결과 상태 메시지 (`sttReviewStatus`): 성공 녹 / 실패 빨강
- 우측 말림: `correction_elapsed` 단계별 초 (예: "parser: 0.1초 · local: 3.5초 · cloud: 8.2초")

#### 2.5.3 4탭 비교 뷰 (`Gather.jsx:1547~`)

**탭 pill** (결과가 있을 때만 표시):
- **원본** (`raw`) — `raw_text` 있을 때
- **파서** (`parsed`) — `parsed_text` 있을 때
- **로컬** (`local`) — `local_text` 있을 때
- **클라우드** (`cloud`) — `cloud_text` 있을 때

**선택 탭이 마지막 단계**면 → **편집 가능한 textarea** (`sttReviewFinalText`, minHeight 300)
**그 외 탭**이면 → **readonly div** (pre-wrap, maxHeight 500 스크롤). 빈 결과 시 "(빈 결과)" 표시.

#### 2.5.4 기본 정보 입력

**제목**: "기본 정보"
**부제**: "골자·수정은 임시저장 탭에서 입력합니다."

| 필드 | 라벨 | placeholder | 타입 |
|---|---|---|---|
| speaker | 연사 * | "연사 이름" | text (필수) |
| speech_date | 날짜 * `(YYMM)` | "YYMM (예: 2604)" | text, maxLength 4 |
| source | 유형 * | — | select: 연설 / 봉사 모임 / 방문 / 메모 |
| topic | 주제 (선택) | "이 연설의 주제 (임시저장에서 식별용)" | text |

source select 값 매핑: `speech` / `service` / `visit` / `memo`

#### 2.5.5 하단 액션

- **취소** (회) → `exitSttReview()`
- **임시저장으로 보내기** (녹) → `saveSttSpeech()` — validation:
  - speaker 공백 체크
  - speech_date 4자리 숫자 체크
  - source 필수
  - `final_text` 비어있으면 "저장할 텍스트가 없습니다. 교정을 먼저 실행해주세요."

### 2.6 임시저장 완료 모달 (`Gather.jsx:1687~`)

- 제목: "**✓ 임시저장 완료**" (녹)
- 본문: "임시저장 탭에서 유형/골자/수정을 입력하고 최종 저장하세요."
- 버튼:
  - **목록으로** → 모달 닫기 + 검토 화면 종료 + `sttLoadJobs()`
  - **이어서 편집** (녹) → 모달 닫기 + `handleStartSttDraftEdit(draftId, speaker, date, jobId)` → 구조화 자유 입력 진입

---

## 3. [관리] > [전처리] (`ManagePreprocessTab.jsx`) — STT 파서 규칙 편집

**저장 파일**: `~/jw-system/stt_corrections.json` (JSON, backend `services/stt_corrections_service.py`)

### 3.1 상단 헤더 (`L476~`)

**제목**: "STT 교정 규칙" (bold)

**통계**: "{N} 섹션 · {N} 그룹 · {N} 오류 · 활성 {N}섹션"

**변경 요약 (dirty)**: "⚠️ 변경: +N추가 · ~N수정 · -N삭제" (금)

**액션 버튼** (우측):
- **검증** (회) → `/api/stt/corrections/validate` (경고 수집)
- **되돌리기** (금, dirty일 때만) → confirm: "변경 사항을 모두 취소하고 마지막 저장 상태로 되돌리시겠습니까?"
- **저장** (주황, 변경 있음 / dirty 아닐 땐 비활성) — dirty 시 "**저장 (변경 있음)**", 저장 중엔 "저장 중..."
- **리로드** (회) → `/api/stt/corrections/reload` (서버 캐시 리로드)

### 3.2 상태 메시지 영역

색상 분기:
- "실패" 포함 → 빨강 배경 (#ffebeb)
- "경고" 포함 → 금 배경 (#fff5e6)
- 그 외 → 녹 배경 (#e6f7ed)

### 3.3 경고 배지 (조건부)

- 제목: "⚠️ 경고 N건" (클릭 시 펼치기/접기)
- 내용: "• `{section_id}` → {target} ({error_text}): {issue}"

### 3.4 섹션 목록 (`L570~`)

각 섹션 = 아코디언 카드:

**헤더**:
- **섹션명** (bold) + "N 그룹 · N 오류"
- description (있으면 회색)
- 우측 **[☑ 활성/비활성]** 체크박스 (독립 이벤트, stopPropagation)
- ▲/▼ 화살표

**확장 시 내부**:

#### 3.4.1 섹션 도구 모음

- **검색 input**: placeholder "검색 (타겟/오류/메모)"
- 선택된 그룹/오류 있을 때: "N개 선택" + **선택 삭제** (빨강)

#### 3.4.2 초성 필터 pill

```
전체 (N) | ㄱ (N) | ㄴ (N) | ... | ㅎ (N) | A-Z (N) | 0-9 (N) | 기타 (N)
```

- 선택된 칩: 녹 배경 + 흰 글자
- 미선택: 회 배경

#### 3.4.3 그룹 (target) 목록

각 그룹 = 작은 카드:
- target 표시 (큰 글자)
- errors 개수 뱃지
- 그룹 편집/추가 버튼

**그룹 편집 인라인**:
- target input + 첫 오류 text input
- 버튼: **확인** (파랑), **취소** (회)

#### 3.4.4 각 오류 행

- 체크박스 (선택)
- 오류 텍스트
- 메모 (회색 italic, 있으면)
- 버튼: **편집** (회), **삭제** (빨강 아웃라인)
- 편집 모드: input 2개 (텍스트/메모) + **확인** (파랑) / **취소** (회)

**신규 오류 추가 인라인** (그룹별):
- placeholder: "오류 텍스트" + "메모" (선택)
- 버튼: **추가** (녹), **취소** (회)

삭제 확인: "이 오류를 삭제하시겠습니까?"

### 3.5 신규 그룹 추가 (섹션별, `L683~`)

- placeholder: "타겟 (예: 여호와)" + "첫 오류 텍스트"
- 버튼: **확인** (파랑), **취소** (회)
- validation: "타겟과 첫 오류 텍스트 모두 입력해주세요"

### 3.6 특수 규칙 섹션 (`L860~`)

**제목**: "특수 규칙"

4개 체크박스 (토글):
- "타임스탬프 삭제" (`remove_timestamps`)
- "\n 리터럴 변환" (`fix_newline_literal`)
- "숫자 쉼표 보호" (`protect_number_comma`)
- "연속 공백 정리" (`collapse_spaces`)

각 규칙은 description 표시.

### 3.7 수정 제외 단어 (`L877~`)

**제목**: "수정 제외 단어 (N)"

**[+ 단어 추가]** 버튼 (녹)

**추가 인라인 폼**: placeholder "단어" + "이유 (선택)" + **추가** / **취소**
- Enter 키로 확정, Esc 키로 취소 가능

**기존 목록**: 단어 + 이유(있으면 italic) + **편집** / **×** (빨강, 삭제)

**빈 상태**: "등록된 제외 단어가 없습니다"

삭제 확인: "이 단어를 수정 제외 목록에서 삭제하시겠습니까?"

### 3.8 자동 백업 (`L960~`)

**제목**: "자동 백업 (N개 · 최대 10개 FIFO)" — 클릭 시 펼치기

**확장 시**: 백업 파일 목록 (타임스탬프별). 복원 버튼 **확인 필요** (JSX 추가 탐색).

---

## 4. [관리] > [AI] > [프롬프트] — STT LLM 교정 프롬프트

**진입**: [관리] → [AI] → **프롬프트** 섹션 펼치기

### 4.1 STT 관련 2개 프롬프트 (`ManageAiTab.jsx:652-653`)

| 프롬프트 | 라벨 | 색상 | 용도 |
|---|---|---|---|
| `stt_local_cleanup` | **STT 로컬 LLM 교정** | 갈 (`--accent-brown`) | 2단계: 반복/공백 정리 |
| `stt_correction` | **STT 클라우드 LLM 교정** | 파랑 (`--accent-blue`) | 3단계: 정교한 문장 교정 |

### 4.2 프롬프트 카드 구성

**평소 (readOnly div)**: 내용 일부 표시 (line-clamp 6줄)

**우측 버튼** (평소): **[편집]** (회)

**편집 중 버튼**:
- **[초기화]** (조건부, 수정된 상태일 때만) — `resetPrompt(key)` + 편집 종료
- **[기본값 저장]** (주황) — `savePromptDefault(key, text)` — 커스텀 기본값으로 보존 (편집 유지)
- **[저장]** (녹) — `setPrompt(key, text)` + 편집 종료
- **[취소]** (회) — 변경 폐기 + 편집 종료

**힌트**: 편집 중 변수 포함 시 작게 표시
```
⚠️ 필수 변수: {text} — 제거 시 동작 깨짐
```

### 4.3 기본 프롬프트 내용 (config.py:99-136)

**stt_local_cleanup**: "당신은 STT(음성 인식) 결과를 기계적으로 정리하는 전문가입니다..." 로 시작 — 5가지 기계적 정리 규칙, `{text}` 플레이스홀더 포함

**stt_correction**: "너는 한국어 연설/봉사 모임/방문 녹음을 정리하는 전문가다..." 로 시작 — 7단계 교정 지침, `{text}` 플레이스홀더 포함

### 4.4 ★ 뱃지

사용자가 **[기본값 저장]**을 눌러 커스텀 기본값이 있으면 라벨 옆에 **★** (주황) 표시.

---

## 5. 임시저장 → 구조화 연계 (STT draft)

### 5.1 STT draft 식별

[전처리] > [임시저장] > [연설 draft] 목록에서 STT 출처 draft:
- 파란 **STT** 뱃지
- 서브라인: "**STT 자유 입력**"
- draft_id 패턴: `ETC_{speaker}_{date}_stt{해시6}` (예: `ETC_최진규_2604_stt169b2c`)

### 5.2 [이동] 버튼 → 구조화 자유 입력 진입

이동 후 [구조화] > [연설] 화면:
- **자유 입력** 모드 자동 활성
- 상단에 **"STT 원본" 블록 (파랑 테두리)** 표시 — 편집/접기/펼치기 가능
- 연사/날짜/주제 필드에 값 복원
- 자유 입력 영역은 비어있음 (사용자가 STT 원본 참고하며 직접 분류)

### 5.3 `source_stt_job_id` 추적

- Draft에 원본 STT job ID 저장
- 같은 STT job은 1:1 매핑 (다른 draft 자동 삭제)

---

## 6. 백엔드 API 엔드포인트 (참조용)

### 6.1 STT 작업 (stt.py)

| 엔드포인트 | 메서드 | 용도 |
|---|---|---|
| `/api/stt/jobs` | GET | 전체 작업 목록 |
| `/api/stt/jobs/{id}` | GET | 단일 작업 상세 |
| `/api/stt/upload` | POST | 파일 업로드 |
| `/api/stt/jobs/{id}/transcribe` | POST | Whisper 변환 시작 |
| `/api/stt/jobs/{id}/correct` | POST | 3단계 교정 (use_local, use_cloud 옵션) |
| `/api/stt/jobs/{id}/save` | POST | 임시저장으로 전달 (draft 생성) |
| `/api/stt/jobs/{id}` | DELETE | 작업 삭제 |

### 6.2 교정 규칙 (stt.py:401-435)

| 엔드포인트 | 메서드 | 용도 |
|---|---|---|
| `/api/stt/corrections` | GET | 규칙 JSON 전체 조회 |
| `/api/stt/corrections/save` | POST | 규칙 저장 (자동 백업) |
| `/api/stt/corrections/validate` | GET | 구조 검증 + 경고 수집 |
| `/api/stt/corrections/reload` | POST | 서버 캐시 리로드 |

---

## 7. 색상 시맨틱 (STT 범위)

- **파랑** (`--accent-blue`): STT 뱃지, [검토하기], stt_correction 프롬프트
- **갈색** (`--accent-brown`): stt_local_cleanup 프롬프트
- **주황** (`--accent-orange`): [변환 시작], [교정 적용], [저장 (변경 있음)]
- **녹** (`--accent`): [임시저장으로 보내기], [이어서 편집], ✓ 임시저장 완료
- **금** (`--accent-gold`): 변환 중 진행 바, 실패 시 [재시도]
- **빨강** (`--c-danger`): 실패 상태, [삭제], 삭제 확인
- **회**: [← 돌아가기], [취소], [편집], 비활성 버튼

---

## 8. 확인 필요 (명세 누락)

- **자동 백업 복원 버튼** (`ManagePreprocessTab.jsx` 백업 섹션 확장 시 UI) — JSX 후반부 추가 탐색 필요
- **STT 업로드 파일 타입 제한 초과 시 에러 메시지** 정확 문자열 — `sttUploadStatus` 세팅 로직 위치 확인 필요
- **Whisper 변환 에러 유형별 메시지** (서버 측) — routers/stt.py Transcribe 핸들러 확인 필요

---

## 9. 권장 표현 (외부 Claude 시나리오 안내 시)

| 상상/추측 | 실제 라벨 |
|---|---|
| "STT 목록" | [전처리] > [가져오기] > [STT 업로드] |
| "교정 사전" | [관리] > [전처리] (STT 교정 규칙) |
| "교정 프롬프트" | [관리] > [AI] > [프롬프트] 섹션의 **STT 로컬 LLM 교정** / **STT 클라우드 LLM 교정** |
| "STT로 저장" | **임시저장으로 보내기** |
| "교정 버튼" | 첫 교정: **교정 적용** / 재교정: **다시 교정** |
| "연설로 이동" (I1 이전 추측) | (검토 화면 → [임시저장으로 보내기] → 임시저장 모달 → **이어서 편집**) |
| "변환 버튼" | **변환 시작** (uploaded 상태 카드) |
| "규칙 저장" | [관리] > [전처리] 우상단 **저장** (변경 있음 표시) |
| "규칙 추가" | 그룹 단위 **확인** / 오류 단위 **추가** |
| "백업" | [관리] > [전처리] > **자동 백업** 섹션 펼치기 |

---

## 10. 변수 플레이스홀더

프롬프트 튜닝 시 **반드시 유지**해야 하는 변수:

| 프롬프트 | 필수 변수 | 용도 |
|---|---|---|
| `stt_local_cleanup` | `{text}` | 이전 단계(파서) 결과 주입 지점 |
| `stt_correction` | `{text}` | 이전 단계(파서 or 로컬 LLM) 결과 주입 지점 |

제거 시 **원문이 LLM에 전달되지 않아** 교정이 기본 프롬프트 응답만 생성됨 (동작 깨짐).
[관리] > [AI] > [프롬프트] 편집 모드 진입 시 자동 경고 표시.
