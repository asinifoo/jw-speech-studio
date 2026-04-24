# JW Speech Studio v2

여호와의 증인 연설/봉사 준비를 위한 AI 도우미 시스템.
로컬 LLM + 클라우드 LLM + ChromaDB + WOL 검색을 결합한 RAG 기반 웹앱.

## 기술 스택

- **백엔드**: FastAPI (Python 3.12) — 모듈화 구조 (`backend/`)
- **프론트엔드**: React 18 + Vite — `frontend/src/` 하위
- **데이터베이스**: ChromaDB (HTTP 모드, `~/jw-system/db`)
- **임베딩**: Ollama `bge-m3` (1024차원)
- **로컬 LLM**: Ollama (`gemma4:26b` 기본, Qwen 2.5 등)
- **클라우드 LLM**: Gemini (Flash/Pro), Claude (Sonnet/Opus), GPT
- **하드웨어**: WSL2 + RTX 3090 Ti (Windows)

## 프로젝트 구조

```
~/jw-system/jw-speech-ui/
├── backend/
│   ├── main.py              # FastAPI 앱 초기화 + 라우터 등록
│   ├── config.py            # 설정, 상수, API 키 로드
│   ├── db.py                # ChromaDB 연결, get_embedding, BM25, 하이브리드 검색
│   ├── models.py            # Pydantic 모델 (Request/Response)
│   ├── routers/
│   │   ├── preprocess.py    # 전처리 API (parse-md, save-outline/speech/publication, 삭제)
│   │   ├── chat.py          # AI 대화 + 검색 + 채팅 세션
│   │   ├── bible.py         # 성경 검색 + WOL 검색 + 성구 조회
│   │   ├── generate.py      # 연설/봉사 생성 + 스트리밍 + 다듬기
│   │   ├── settings.py      # 설정 관리 API (키, 모델, 프롬프트, 프리셋, WOL 필터, 카테고리)
│   │   ├── manage.py        # DB 관리, 조회, 삭제, 일괄 추가, 원문 목록, 컬렉션 조회
│   │   └── draft.py         # 연설 입력 임시저장 (draft) API
│   ├── services/
│   │   ├── llm.py           # LLM 호출 (Ollama/Gemini/Claude/GPT 스트리밍)
│   │   ├── wol.py           # WOL 검색, 기사 수집, 캐시, 불용어
│   │   ├── outline_parser.py # md 파싱, 텍스트 파싱, 유형 코드, 검증
│   │   └── bible_utils.py   # 성경 약호 매핑, 성구 파싱, 단장 성경
│   └── .env                 # API 키, 환경변수
├── frontend/
│   ├── index.html           # 깜빡임 방지 (배경색/다크모드 즉시 적용)
│   └── src/
│       ├── App.jsx          # 메인 앱 (라우팅, 테마, 전역 스타일, 스크롤 복원)
│       ├── api.js           # API 클라이언트 (모든 fetch 함수)
│       ├── pages/
│       │   ├── ChatSearchPage.jsx   # AI 대화 + 검색 (DB/WOL/대화 모드)
│       │   ├── BibleSearchPage.jsx  # 성경 검색
│       │   ├── ServiceMeetingPage.jsx # 봉사 모임 준비
│       │   ├── VisitPage.jsx        # 방문 준비
│       │   ├── FreeSearchPage.jsx   # DB 검색
│       │   ├── ManagePage.jsx       # 추가/DB/설정 관리 (pageType으로 분리)
│       │   └── TranscriptPage.jsx   # 원문 조회
│       ├── components/
│       │   ├── SearchCard.jsx       # 검색 결과 카드 (rem 기반, 메타 그리드 + ScoreBar + DB 편집)
│       │   ├── utils.js             # parseDocument, tagColor, sourceLabel, cleanMd
│       │   └── ...                  # WolFiltersPanel, AiModelSelector, PresetPills 등
│       ├── utils/
│       │   ├── bible.js, sseReader.js, textHelpers.js
│       └── hooks/
│           └── useAiModel.js
└── CLAUDE.md
```

## 메뉴 구조

### 메인 탭: [준비] [검색] [추가] [관리]

준비:
├── 연설 (골자 파싱 → 검색 → AI 생성)
├── 봉사 모임
└── 방문

검색:
├── AI 대화 (DB/WOL/대화 모드)
├── DB 검색 (칩 필터)
├── 성구 (성경 검색)
└── 원문 (TranscriptPage)

추가 (ManagePage pageType="add"):
├── 입력 (addTab="input", inputMode로 분기)
│   ├── [연설] (inputMode="speech_input")
│   │   ├── [골자 선택] / [자유 입력] 세그먼트
│   │   ├── 골자 선택: 간단/상세 입력 + draft 2층 구조
│   │   └── 자유 입력: [소주제별 입력] / [한번에 입력]
│   │       ├── 소주제별: 동적 소주제 블록 (siFreeSubtopics)
│   │       └── 한번에: textarea + [AI 구조화] (준비 중)
│   ├── [토의] (inputMode="discussion", discForm)
│   ├── [봉사 모임] (inputMode="service", svcForm) — categories.json 연동
│   ├── [방문] (inputMode="visit_input", visitForm) — categories.json 연동
│   └── [출판물] (inputMode="pub_input", pubForm) — 약어 자동 매칭
├── 전처리 (addTab="preprocess")
│   ├── 파일 업로드 (.md / .txt preprocessed)
│   ├── txt 원본
│   └── 골자 입력 (소주제 파싱, 계층 편집, 성구/출판물 분리)
│       ├── [📄 DOCX에서 불러오기] — 골자 DOCX → 텍스트 자동 변환 + 메타 주입
│       │   (유형/번호/버전/제목/유의사항/시간/년도 자동 채움)
│       ├── 메타 입력: 유형/번호/버전/제목/시간/유의사항
│       │   + **년도** (유형이 S-123/S-211일 때만 조건부 표시)
│       ├── 요점 입력 textarea (들여쓰기 기반)
│       └── [파싱] → 결과 카드 리스트 + [🔢 번호 재정렬] 버튼
└── 임시저장 (addTab="drafts", draftsFilter로 분기)
    ├── 연설 draft (draftsFilter="draft")
    └── 메모 (draftsFilter="memo") — 이동 모달 (유형 선택 → 해당 입력 탭)

플로팅 메모 버튼 (App.jsx):
- 우측 하단 고정 ✎ (모든 페이지)
- 클릭 → 모달 (주제 + 내용, ESC/✕로만 닫힘)
- 저장: source="memo" → speech_expressions

관리 (ManagePage pageType="manage"):
├── DB (mode="mydb")
│   ├── 골자 (그룹 뷰 — 골자 단위 아코디언)
│   ├── 연설 (그룹/목록 — discussion/service/visit 포함, memo 제외)
│   ├── 출판물 (카드 리스트)
│   ├── 원문 (파일 목록)
│   └── 연사메모 (그룹/목록 + 카테고리 필터)
└── AI (mode="ai" — 모델/프롬프트/API키 관리)

## ChromaDB 컬렉션 — 3개 저장소 완전 분리

| 컬렉션 | 내용 | 검색 대상 | 임베딩 |
|--------|------|----------|--------|
| `jw_ai` | 성경 31,105절 | ✅ | bge-m3 1024차원 |
| `speech_points` | 골자 요점 (outline) | ❌ 검색 제외 | bge-m3 1024차원 |
| `speech_expressions` | 연설/메모/봉사/방문 | ✅ (speaker_memo 제외) | bge-m3 1024차원 |
| `publications` | 출판물 본문 | ✅ | bge-m3 1024차원 |

### speech_points 저장 규칙 (version 단독 식별)

- **document ID 패턴**: `{type}_{num}_v{version-safe}_{point_num}`
  - 예: `S-34_005_v9-15_2.2.1`, `S-123_001_v10-26_1.1`
- **JSON 파일명 패턴**: `{type}_{num}_v{version-safe}.json`
  - 예: `S-34_005_v9-15.json`, `S-123_001_v10-26.json`
- **메타 필드**: `outline_type`, `outline_num`, `outline_title`, `version`, `source="outline"`, ...
- **중복 판정**: `outline_type + outline_num + version` 3-tuple (version 빈 값끼리도 매치)
- **삭제 규칙** (DELETE `/api/preprocess/outline/{id}`):
  - outline_id 로 DB doc_id prefix 매치 + 동일 prefix JSON glob 삭제
- **버전별 병렬 보관**: 같은 type+num이라도 version 다르면 별개 레코드로 공존 (version MM/YY 가 년도 정보 흡수 — Doc-45)

## 전처리 시스템

### 저장소 3개 — 완전 분리
- `speech_points` ← 골자 요점만 (save-outline)
- `speech_expressions` ← 연설/메모/봉사/방문 (save-speech)
- `publications` ← 출판물 본문만 (save-publication)

### 메타데이터 키
- `outline_*` 사용 (`golza_*` 사용 금지)
- outline_type, outline_type_name, outline_num, outline_title, version

### 유형 코드 (번호 규칙)

모든 유형에서 년도는 version (MM/YY) 에 포함. 별도 year 필드 없음 (Doc-45).

| 유형 | code | 번호 | version 예시 |
|---|---|---|---|
| 공개 강연 | S-34 | 001~196 | 10/24 |
| 생활과 봉사 | SB | MMW (예: 041) | 4/26 |
| 기념식 | S-31 | 001 (고정) | 8/19 |
| 특별 강연 | S-123 | 001 (고정) | 5/26 |
| RP 모임 | S-211 | 001 (고정) | 6/26 |
| 순회 대회 | CO_C | 001(상)/002(하) | 3/26 |
| 지역 대회 | CO_R | 001 | 7/26 |
| JW 방송 | JWBC-SP/MW/PG/AM | 자유 | — (5d 설계) |
| 기타 | ETC | 자유 | — |

**outline_type 영문 통일 원칙 (필수, Phase 3.1)**:
- DB 저장 시 outline_type은 항상 영문 코드 사용 ("S-34" / "S-31" / "S-123" / "CO_C" / "CO_R" / "SB" / "ETC" 등)
- 한글 유형명("공개 강연", "기념식")은 outline_type_name 별도 필드에만 저장 (UI 표시용)
- 백엔드 `normalize_outline_type()` (services/outline_parser.py)이 한글→영문 변환 후 저장
- 적용 경로: parse-md, save_outline, save_speech, save_publication, db_add publication
- 매핑 테이블: 공개강연/공개 강연→S-34, 기념식→S-31, 특별강연/특별 강연→S-123, RP모임/RP 모임→S-211, 순회대회/순회 대회→CO_C, 지역대회/지역 대회→CO_R, 생활과 봉사→SB, 기타→ETC
- 영문 prefix(S-*/CO_*/SB/ETC/JWBC*)는 변환 없이 통과
- 알 수 없는 값은 원본 반환 (호출측 판단)
- 기존 한글 저장 데이터는 Phase 3 재주입으로 자연 정리됨

### source 영문 통일 원칙 (필수)

**DB 저장은 항상 영문 source 사용** — 한국어 source로 DB 저장 금지:

| 영문 source | UI 표시 (sourceLabel) | 컬렉션 | 검색 포함 |
|---|---|---|---|
| `outline` | 골자 | speech_points | ❌ |
| `speech` | 연설 | speech_expressions | ✅ |
| `note` | 간단 입력 | speech_expressions | ✅ |
| `memo` | 간단 메모 | speech_expressions | ❌ |
| `discussion` | 토의 | speech_expressions | ✅ |
| `speaker_memo` | 연사 메모 | speech_expressions | ❌ |
| `service` | 봉사 모임 | speech_expressions | ❌ (연설 준비) |
| `visit` | 방문 | speech_expressions | ❌ (연설 준비) |
| `publication` | 출판물 | publications | ✅ |

**변환 흐름:**
1. 프론트에서 한국어로 전달해도 OK
2. 백엔드 `normalize_source()` (config.py)가 영문으로 변환 후 저장
3. 조회 시 `list_by_source`, `list_collection`은 한/영 양방향 매칭 (마이그레이션 전 데이터 호환)
4. UI 표시는 `sourceLabel` (utils.js)로 한국어 변환

**금지사항:**
- 한국어 source를 DB에 직접 저장 금지
- 새 source 추가 시 반드시 영문 영단어 사용
- alias 매핑 추가 금지 (임시 호환만 유지)

**마이그레이션:** `POST /api/migrate/source-values` — 기존 한국어 source를 영문으로 일괄 변환

### md 파싱 우선순위
- 본문 메타데이터 우선, 파일명은 폴백
- `- **유의사항**:` / `- **유의 사항**:` → note 필드
- 파일명에서 `v숫자-숫자` 패턴 → 버전 (연사로 잘못 할당 방지)

### DOCX → 텍스트 변환 (결정론적, LLM 미사용)

**파일**: `backend/services/outline_parser.py`

- `parse_outline_docx(bytes) → dict` — python-docx로 들여쓰기 + 스타일 기반 계층 분류 (raw_lines + subtopics)
- `_lines_to_indented_text(raw_lines) → str` — raw_lines를 프론트 [골자 입력] 파서와 호환되는 들여쓰기 plain text로 변환 (L1=0칸, L2=1칸, L3=2칸...)
- `_extract_meta_from_docx(parsed, filename) → dict` — title/note/version/total_time 추출
- `parse_outline_filename(filename) → dict` — `{type}_KO_{num}_v**-**.docx` 패턴 파싱 (year 추출 제거 — Doc-45)

**엔드포인트**: `POST /api/preprocess/docx-to-text` → `{text, meta}` (저장 안 함, 프론트 textarea로 주입)

**후처리 4종 (parse_outline_docx 내부)**:
1. **유의 사항 병합** — `[유의]` 태그 다음 줄이 본문만 있으면 한 줄로 합침
2. **성구 줄바꿈 병합** — `(벧후` + `3:13)` → `(벧후 3:13)`
3. **출판물 꼬리 병합** — `(「깨」 15/6` + `8-9면)` → `(「깨」 15/6 8-9면)` (패턴: `[\d\-,\s]+(면|쪽|항)`)
4. **독립 성구 병합** — `...것이다` + `(고전 13:4-7)` → 한 줄 (레벨 보호: 이전 줄이 L 태그이고 현재 줄 레벨 ≥ 이전일 때만)

**마커 처리 (parse_outline_text + 프론트 [파싱] 버튼, 양쪽 대칭)**:
- 줄 끝 마커 목록: `[시각 자료 N]`, `[지시문]`, `[연사 지시]`, `[영상 N]`, `[낭독]`
- 처리 순서: (1) 대괄호 낭독 성구 추출 + 치환 → (2) 마커 분리 → (3) 괄호 성구/출판물 추출 → (4) 마커 복원
- **대괄호 낭독 성구**: `[이사야 48:17 낭독]` → content에는 `[낭독]`만 남기고 scriptures에 `"이사야 48:17 (낭독)"` 추가
- **책명 지원**: 공백 포함 (`요한 계시록`), 숫자 포함 (`요한 1서`, `베드로 2서`), 구판 (`요한 첫째`, `베드로 둘째`), 단순 (`시편`, `단`)
- 정규식: `[가-힣]+(?:\s+(?:[가-힣]+|\d+서))*\s+\d+:[\d,\s\-]+(?:\s*(?:및\s*)?각주)?`
- 본문 텍스트는 **절대 수정하지 않음** — 마커는 content에 복원, 성구만 별도 필드로 분리

### 골자 입력 파싱 (프론트 [파싱] 버튼)
- `(N분)` → 소주제 (L1 위 계층)
- 스페이스 0개 → L1, 1개 → L2, 2개 → L3, 3개 → L4, 4개+ → L5
- 줄 끝 `(성구; 「출판물」)` 괄호에서 자동 분리
- `N분` 패턴 성구 제외
- 제로 너비 공백 자동 제거
- 소주제별 subtopics 분리 저장
- 레벨 드롭다운 편집, 성구/출판물 수동 편집
- **[🔢 번호 재정렬] 버튼**: 중간 요점 삭제 후 1.1, 1.2, 1.2.1 순차 재부여 (소주제 경계에서 카운터 리셋, 상위 빈 카운터 자동 1)

### 골자 유형 선택 (골자 입력)
- [공개 강연] [생활과 봉사] [특별 행사] [대회] [기타]
- 특별 행사 하위: [기념식] [특별 강연] [RP 모임]
- 대회 하위: [순회 대회] [지역 대회]
- 유의사항 필드 포함

### `_outline_prefix()` — 파일명/ID 생성
- 모든 유형에서 숫자 번호 3자리 패딩 (001)
- 비숫자 번호는 그대로

## 연설 입력 시스템 (2층 구조)

### Layer 1: draft (작업용)
- `~/jw-system/speech_drafts/` 폴더에 JSON 저장
- 파일명: `S-34_035_김OO_2604.json`
- 검색에 안 잡힘
- [임시저장] 버튼 → draft만 저장

### Layer 2: speech_expressions (검색용)
- [저장] 버튼 → DB 저장 + draft 삭제 (상세 입력 모드만)
- 내용 있는 요점만 저장 (빈 요점 제거)

### Draft API
- `POST /api/speech-draft/save` — draft JSON 저장
- `GET /api/speech-draft/check` — draft 존재 여부
- `GET /api/speech-draft/load` — draft 로드
- `POST /api/speech-draft/complete` — DB 저장 + draft 삭제
- `DELETE /api/speech-draft/{id}` — draft 삭제
- `GET /api/speech-draft/list` — draft 목록

### 연설 입력 모드
- [골자 선택]: [간단 입력] / [상세 입력] 세그먼트
  - 간단: 소주제별 메모 → [임시저장] → draft만
  - 상세: 요점별 입력 (내용/키워드/태그/사용여부/성구 낭독) → [임시저장]+[저장]
  - 간단→상세 전환: 소주제 메모가 첫 요점에 자동 채움
  - 골자 선택 시 draft/note 자동 체크 + [불러오기]/[새로 만들기]
  - 성구 터치 → 성경 본문 펼침 (GET /api/bible/lookup)
- [자유 입력]: [소주제별 입력] / [한번에 입력] 세그먼트
  - 소주제별: 동적 소주제 블록 (siFreeSubtopics: [{title, memo}])
  - 한번에: 큰 textarea + [AI 구조화] 버튼 (준비 중)
  - 전환 시 데이터 보존 (소주제→한번에: 합쳐서 표시)

### 탭별 독립 state (입력 탭)
- discForm (토의): sub_source, pub_code, topic, date, subtopic, keywords, scriptures, content
- svcForm (봉사): service_type, date, scriptures, pub_code, keywords, content, rating, favorite
- visitForm (방문): visit_target, situation, date, keywords, scriptures, pub_code, content, rating, favorite
- pubForm (출판물): pub_code, reference, pub_title, pub_type, point_summary, keywords, scriptures, content, outline_title, outline_type, outline_num, version, point_id, subtopic
- linked_outlines 필드 폐기 (Phase 3, referenced_by_json으로 대체)
- 탭 전환해도 각자 입력값 유지, 저장 시 해당 탭만 초기화

### 출판물 입력 약어 자동 매칭
- ~/jw-system/jw_abbreviations.json — 정기 간행물/서책/팜플렛/소책자/성경/웹 기사/색인
- `GET /api/publications/lookup?code=` — 약어 기반 자동 생성 + DB 폴백
- `GET /api/publications/abbreviations` — 전체 약어 목록
- 파싱: 「파10」 11/15 7면 2항 → 출판물명: "파수대 2010년 11월 15일호", reference: "7면 2항"
- 출판물 유형: [정기 간행물] [서책] [팜플렛] [소책자] [성경] [웹 연재 기사] [색인]

## 출판물 데이터 모델 (Phase 3)

### 핵심 원칙
- **유일 ID 규칙**: `pub_{code_safe}_{ref_safe}` (pub_code + reference 조합)
  - 예: `pub_깨13-8_6면`, `pub_파배19.3_5면_3-4항`
  - 같은 출판물 + 같은 참조면 단일 레코드로 통합 (업서트)
- **referenced_by 배열**: 한 출판물이 여러 골자에서 참조되는 관계를 배열로 표현
  - 기존 linked_outlines 문자열 방식 폐기
  - 각 항목 필드: outline_type, outline_num, version, point_num, outline_title, subtopic_title, point_text
- **ChromaDB 메타 저장**: `referenced_by_json` (JSON 문자열, ChromaDB primitive 제약 대응)
- **keywords 메타 저장**: JSON 배열 문자열 → 프론트에서 `parseKeywords()` 헬퍼로 파싱

### 업서트 동작
- 같은 pub_code + reference 재저장 시:
  - 동일한 reference_info(outline_type+num+version+point_num) → 갱신 (`updated`)
  - 다른 reference_info → 추가 (`appended`)
  - reference_info 빈 값 → 변화 없음 (`no_ref_change`)
- content 충돌: 기존 content 보존 (이미 임베딩된 것 유지)
- BM25 캐시 무효화 자동 (검색 결과 즉시 반영)

### 의미 있는 참조 판정 (`_is_meaningful_ref`)
- 6개 필드 중 하나라도 값 있으면 유효: outline_type, outline_num, point_num, outline_title, subtopic_title, point_text
- 전 필드 빈값이면 referenced_by에 저장 안 함 (출판물만 등록)
- 프론트도 동일 6필드 기준으로 필터해서 뱃지 카운트 표시

### 삭제 (참조 단위 vs 레코드 전체)
- DELETE `/api/preprocess/publication/{doc_id}` — 레코드 전체 삭제
- DELETE `/api/preprocess/publication/{doc_id}?ref_key=...` — 특정 참조 1건만 제거
  - ref_key 형식: `{outline_id}:{point_num}` (예: `S-34_035_v1-20:1.1.1`)
  - 마지막 참조 제거 시 레코드 자동 삭제
- 정리 스크립트: `backend/scripts/cleanup_empty_refs.py` (--dry 옵션)

### 폐기된 필드/경로
- ❌ `linked_outlines` 메타 필드 — referenced_by_json으로 대체
- ❌ `pub_abbr` 메타 필드 — pub_code에 통합 (파서엔 남아있으나 저장 시 제외)
- ❌ md 파서의 `[소주제]` 대괄호 형태 — `- **소주제**:` (대괄호 없음) 사용

### 출판물 카드 UI (Phase 3)
- 카드 메타에 `📚 N개 골자에서 사용 ▼` 펼치기 뱃지 (referenced_by 길이)
- 펼치면 각 참조마다: `{type}_{num} v{version} 요점 {point_num}` + 주제/소주제/요점 라벨 표시
- 출판물 클릭 동작: 표시만 (점프/이동 없음)
- 적용 경로: SearchCard, ManagePage 출판물 탭, ChatSearchPage, FreeSearchPage, VisitPage, ServiceMeetingPage

### 1회성 변환 스크립트
- `backend/scripts/inject_subtopic.py`: 기존 출판물 md에 [소주제] 필드 자동 주입
- 골자 md에서 point_num → subtopic_title 매핑 추출 → 출판물 md 청크에 삽입
- CLI: `--input-dir --output-dir --outline-dir`
- 원본 무수정, 별도 디렉토리에 변환 결과 저장

### 요점 메타 필드 (Phase 3.5 흡수)
- **speech_points**:
  - `memo` (string): 연설 준비 메모/사후 참고
  - `importance` (string, "0"~"5"): 중요도 (정렬용)
- **speech_expressions**:
  - `rating_note` (string): 별점 이유/선호 이유
- 편집 UI: SearchCard, FreeSearchPage [DB 수정] 모드 인라인
- 표시: 카드 헤더 뱃지 (importance ★N 파랑 #378ADD) + 본체 박스 (memo 💭 회색)
- 색상 컨벤션: rating/favorite 주황(#F5A623), importance 파랑(#378ADD)

### 봉사/방문 입력
- 카테고리: categories.json (service_types, visit_targets, visit_situations)
- 인라인 편집: [+ 편집] 버튼으로 추가/삭제 → categories.json 자동 저장
- 선호도: 별점 1~5 (36x36px 숫자 버튼) + 즐겨찾기 ☆/★ 토글
- 메타: rating (0~5), favorite ("true"/"false"), used_count, last_used
- 과거 기록 정렬: 즐겨찾기 → rating 높은순 → 최신순

### 메모 이동 흐름
- 추가 > 임시저장 > 메모 > [이동] → 유형 선택 모달
- 유형별 데이터 매핑: 연설(siFreeTopic/siFreeText), 토의(discForm), 봉사(svcForm), 방문(visitForm), 출판물(pubForm)
- 저장 후 원본 메모 삭제

## DB 관리 탭 구조

### 5개 탭 (카드 헤더 언더라인 + 건수)
골자 | 연설 | 출판물 | 원문 | 연사메모

### 골자 탭
- 골자 단위 그룹 (outline_type + outline_num)
- 아코디언 펼치기 → 요점 목록 (번호순 정렬, 계층 들여쓰기)
- 체크박스 선택 + 전체 선택 + 선택 삭제 (deleteOutline API)

### 연설 탭
- [그룹] [목록] 필터 (임시저장은 추가 > 임시저장으로 이동)
- source 필터: speech, note, discussion, service, visit (memo 제외)
- 그룹 뷰: outline_num+speaker+date 기준 아코디언, 그룹 키로 선택/삭제
- 목록 뷰: 개별 카드, 개별 id로 선택/삭제 (봉사/방문 포함)
- 토의/봉사/방문 전용 뱃지 + 별점/즐겨찾기 표시

### 출판물/원문 탭
- 개별 카드 리스트
- 체크박스 선택 + 전체 선택 + 선택 삭제

### 연사메모 탭
- [그룹] [목록] 필터
- 그룹: 연사별 아코디언 (카테고리 뱃지)
- 목록: 카테고리 칩 필터 [전체][원본][도입][구조][성구][예시][언어습관][마무리]
- 편집/삭제 가능
- 체크박스 선택 + 전체 선택 + 선택 삭제

### 공통 UI
- 검색 바 (전체 폭)
- 선택 툴바: ☐ 전체 선택 ... N그룹/건 [새로고침] 또는 N개 선택 [선택 해제][선택 삭제]
- 선택 툴바 minHeight: 28 고정
- 탭별 데이터 캐시 (dbCache) — 탭 전환 시 재호출 없음, 새로고침으로 강제 갱신
- 더 보기 (50건씩)
- dbTabCounts: localStorage 캐시 (jw-db-tab-counts)

### 카드 표시 (SearchCard + ManagePage 목록)
- 토의: [토의] 라벨 + [파수대] 뱃지 (파란), 메타: 출판물/주제/질문/키워드/성구
- 봉사: [봉사 모임] + [호별] 뱃지 (초록), 메타: 주제/상황/키워드/성구
- 방문: [방문] + [청년] 뱃지 (주황) + [낙담] 뱃지, 메타: 주제/대상/상황/키워드/성구
- 공통: ★ 즐겨찾기 (노란), ★★★☆☆ 별점 (rating>0일 때만)
- DB 편집: 별점 1~5 버튼 (28x28px) + ☆/★ 즐겨찾기 → dbUpdate로 영구 저장
- 봉사/방문 과거 기록 + 검색 결과: [수정] (임시) + [DB] (영구) 버튼
- 카드 본문: borderTop 구분선 + [전체 보기] 클릭 시 maxHeight 280 + 스크롤 (`chat-input` 스타일)
- 카드 체크 토글: **헤더 영역 클릭만** (본문 클릭은 토글 안 됨)
- 수정/DB 모드 진입 시: 본문 숨김, 편집 UI만 표시

### 3단 메뉴 UI (전체 통일)
- **1단 (메인)**: iOS 세그먼트, `padding: '8px 0', fontSize: '0.929rem'` — [준비][검색][추가][관리]
- **2단 (중간)**: iOS 세그먼트, `padding: '7px 0', fontSize: '0.857rem'`
  - 준비 [연설][봉사 모임][방문], 검색 [AI][DB][성구][원문]
  - 추가 [입력][전처리][임시저장], 관리 [DB][AI]
- **3단 (하위)**: **카드 헤더 언더라인** `padding: '9px 0 7px', fontSize: '0.75rem'`
  - 탭이 카드 안에 위치 (borderRadius: 12, borderBottom 1px on headers)
  - DB 하위 [골자][연설][출판물][원문][연사메모] — **건수 표시 ✅**
  - 추가 > 입력 [연설][토의][봉사 모임][방문][출판물]
  - 추가 > 임시저장 [연설 draft][메모]
  - 추가 > 전처리 [파일 업로드][txt 원본][골자 입력]
  - 검색 > 원문 [공개 강연][JW 방송][대회][특별 행사][기타]
  - 2줄 구조: 탭 이름 + 건수(없으면 `visibility: hidden`으로 자리만)

### 카드 액션 버튼 통일 (xs 크기)
- **수정/DB/삭제/원래대로/확인/취소** 버튼:
  - `height: 20, padding: '0 8px', borderRadius: 5, fontSize: rem(9)`
  - `minWidth: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1`
- 색상: 일반 `var(--bd)` + `var(--c-faint)`, 위험(DB/삭제) `var(--tint-red-bd)` + `#c44`
- 적용: SearchCard, ServiceMeetingPage, VisitPage (과거 기록 + 검색 결과)

### iOS 라이트모드 색상
- --bg: #F2F2F7, --bg-card: #FFFFFF, --bg-subtle: #EFEFF4
- --c-text: #3C3C43, --c-text-dark: #000000, --bd: #C6C6C8
- --card-shadow: 0 1px 2px rgba(0,0,0,0.04) (다크: none)

## 폰트/스타일 시스템

### rem 기반 (전체 프론트엔드)
- html fontSize로 전체 스케일링 (슬라이더 12~20px)
- 기본값: 모바일 14px, 데스크톱(≥1024px) 16px
- 모든 fontSize: rem 단위 (766개 변환 완료)
- padding/margin/border: px 유지

### 입력 필드 통일
- background: var(--bg-subtle) + border: none + borderRadius: 8
- 한 줄 input: padding 8px 10px
- textarea: padding 8px 10px (작은), 10px 12px (큰)

### 데스크톱 레이아웃
- ≥1024px: maxWidth 800px
- ≥1440px: maxWidth 860px
- ≥1920px: maxWidth 920px

### 다크모드
- 테마 전환 시 body + html 배경색 즉시 변경
- 다크 텍스트: #f0f0f0(본문), #ccc(sub), #ddd(hint), #aaa(faint), #999(muted), #777(dim)

## API 엔드포인트

### 전처리
- `POST /api/preprocess/parse-md` — md 파일 파싱 (본문 메타 우선, 파일명 폴백)
- `POST /api/preprocess/docx-to-text` — **DOCX → 들여쓰기 텍스트 + meta** (결정론적, LLM 미사용)
  - 응답: `{text, meta: {outline_type, outline_type_name, outline_num, version, title, note, total_time}}`
  - 프론트 [골자 입력] textarea로 주입 후 사용자가 [파싱] 버튼 수동 클릭
- `POST /api/preprocess/check-duplicates` — 중복 체크 (type+num+version 3-tuple 매칭)
  - 응답: `{duplicates: [{type, outline_num, version, count, message}], has_duplicates}`
- `POST /api/preprocess/save-outline` — speech_points만
  - body: `{files:[{meta:{...}, subtopics}], overwrite}`
  - JSON 파일명: `{prefix}_v{version}.json`
  - overwrite 시 type+num+version 매치로 기존 삭제 후 재저장
- `POST /api/preprocess/save-speech` — speech_expressions만
- `POST /api/preprocess/save-publication` — publications만
- `POST /api/preprocess/save-original` — ~/jw-system/speeches/ 파일 저장 (path traversal 방어 — Doc-52)
- `DELETE /api/preprocess/outline/{id}` — speech_points + JSON 삭제
  - outline_id 로 doc_id startswith + 동일 prefix JSON glob 삭제
  - 응답: `{deleted, json_deleted}` — 프론트는 `deleted === 0` 검증 필수

### 조회
- `GET /api/outline/list` — 골자 목록 (JSON 파일 기반)
- `GET /api/outline/{id}?outline_type=&version=` — 골자 상세
  - version 선택, 명시 시 후필터. 빈 값이면 하위 호환 (기존 동작)
- `GET /api/db/collection/{col}?source=` — 컬렉션별 조회 (쉼표 구분 source 필터)
- `GET /api/db/speaker-memos` — 연사메모 전체 목록
- `GET /api/bible/lookup?ref=` — 성구 본문 조회

### 출판물 약어 (신규)
- `GET /api/publications/abbreviations` — `~/jw-system/jw_abbreviations.json` 전체 반환
- `GET /api/publications/lookup?code=` — 출판물 코드 파싱 + 매칭
  - 응답: `{pub_title, pub_type, reference, pub_code, exact_match, source}`
  - 우선순위: **1) DB 저장본 (사용자 수정본 포함)** → 2) 약어 기반 자동 생성
  - `exact_match`: pub_code + reference 모두 일치 시 기존 항목 반환 (중복 경고용)
  - 파싱: `「파10」 11/15 7면 2항` → pub_title `"파수대 2010년 11월 15일호"`, reference `"7면 2항"`

### 마이그레이션
- `POST /api/migrate/source-values` — 한국어 source → 영문 일괄 변환

### Draft
- `POST /api/speech-draft/save` / `GET check` / `GET load` / `POST complete` / `DELETE {id}` / `GET list`

## 설정 파일 위치

```
~/jw-system/
├── db/                     # ChromaDB 데이터
├── outlines/               # 골자 JSON (S-34_001_v09-15.json 등)
├── speeches/               # 원문 파일
├── speech_drafts/          # 연설 입력 임시저장 (draft JSON)
├── my_styles.json          # 스타일 프리셋
├── categories.json         # 카테고리 (봉사/방문 유형)
├── api_keys.json           # API 키, 비밀번호, 모델 설정
├── api_keys.json.bak       # 자동 백업
├── jw_abbreviations.json   # 출판물 약어 (정기간행물/서책/팜플렛/소책자/성경/웹연재/색인)
├── wol_filters.json        # 불용어/접미사 (사용자)
├── wol_filters_default.json # 불용어/접미사 (기본값)
├── uploads/                # 업로드 파일
├── chat_sessions.json      # 대화 세션 (atomic write)
└── chat_sessions/          # 대화 세션 개별 파일
```

## 코딩 규칙

### Python (backend/)
- 모듈화 구조: main.py(진입점) + config/db/models + routers/ + services/
- 함수명: `snake_case`, 내부: `_` 접두사
- ChromaDB 저장 시 반드시 `get_embedding()` 포함
- 3개 저장소 완전 분리 — save 함수는 자기 컬렉션만 접근
- 메타데이터 키: `outline_*` 사용 (`golza_*` 사용 금지)
- 변수명: `golza` 사용 금지 → `outline` 사용
- md 파싱: 본문 메타데이터 우선, 파일명 폴백
- 골자 삭제: glob 패턴으로 버전 포함 JSON 매칭 삭제
- **신규 메타 필드는 where 절에 넣지 말고 후처리 필터로** (ChromaDB는 필드 부재 레코드를 매칭 실패로 처리, 기존 데이터 호환 깨짐)
- **document ID와 파일명 패턴 비대칭** 인식: 삭제/조회 시 양쪽 경로 분리 처리 (DB startswith vs JSON glob)

### React (frontend/src/)
- 단일 파일 컴포넌트 (CSS 분리 안 함, inline style 사용)
- JSX 내 한국어 UI 텍스트 (영문 사용 금지)
- 변수명: `golza` 사용 금지 → `outline` 사용
- 폰트 크기: rem 단위 (px 사용 금지)
- 입력 필드: bg-subtle + border none 통일
- 카드 메타 그리드: 모든 페이지에서 동일 스타일 통일
- 성구 표시: 반드시 `cleanMd()` 적용
- source 표시: 반드시 `sourceLabel` 매핑 적용
- borderRadius: 8 통일
- console.log/error 사용 금지
- DB 탭 데이터 캐시 (dbCache) — 탭 전환 시 재호출 없음
- 연설 입력 state: localStorage 저장 (jw-si-state), subtopics/expanded 제외
- 골자 저장 성공 시 outlineList() 재호출 → outlines 갱신
- **삭제 API 호출 후 응답 `deleted` 값 검증 필수** — 0이면 캐시 업데이트 취소 + 사용자 알림
- **outline_id 생성**: `{type}_{num}_v{version}` (Doc-45: year 태그 제거)

## 주의사항

- 검색 대상 (용도별):
  - AI 대화/연설 준비/봉사/방문: speech_expressions + publications (speaker_memo, outline 제외)
  - DB 검색: speech_points + speech_expressions + publications 전부
  - 스타일 검색: speech_expressions (source=speaker_memo만)
- outline_type 필터: outline_type + outline_type_name 둘 다 매칭 (DB에 "S-34" 또는 "공개강연"으로 저장됨)
- 출판물 매칭: referenced_by_json 배열에서 outline_type + outline_num + point_num 매칭 (Phase 3)
- 백엔드 헬퍼: `_match_publications` (services/publication_utils.py)
- ChromaDB 실행 시 `--path ~/jw-system/db` 필수
- `- **유형**:` 패턴은 출판물 유형이므로 골자유형으로 파싱하면 안 됨
- 제로 너비 공백(\u200B) 처리: WOL/골자 텍스트에 포함
- 숫자가 아닌 outline_num에 "번" 안 붙임
- 추가 > 메모: source="메모" → 백엔드에서 source="memo"로 변환, speech_expressions 저장

### DB 캐시 관련
- 프론트 [DB>골자] 탭은 `dbCache`로 한 번 로드 후 탭 전환에도 유지 — **저장/삭제 후 [🔄 새로고침] 버튼**을 눌러야 최신 상태 반영
- 삭제 API 호출 시 응답 `{deleted, json_deleted}`의 **deleted 값으로 성공/실패 확인 필수** — 0이면 매칭 실패, 프론트에서 사용자 알림

### 삭제 경로 비대칭 주의
- **document ID**엔 year 포함 안 됨 (`S-123_001_v10-21_1.1`)
- **JSON 파일명**엔 year 포함됨 (`S-123_001_y26_v10-21.json`)
- `delete_outline` 내부에서 outline_id → `re.sub(r'_y\d+(?=_v|$)', '', outline_id)`로 DB prefix 정규화 → DB startswith 매치 + year 후필터. JSON glob은 원본 outline_id 유지

## Phase 4 STT 파이프라인 (Build-5D 기준)

### STT 교정 3단계 파이프라인
파서 (apply_local_corrections) → 로컬 LLM (gemma4:e4b) → 클라우드 LLM (Gemini/Claude)
- 파서: 항상 자동 실행 (stt_corrections.json 규칙 치환)
- 로컬: 선택, 반복 제거 + 공백 정리 (`stt_local_cleanup` 프롬프트)
- 클라우드: 선택, 문장 구조 + 성구 맥락 (`stt_correction` 프롬프트)
- `final_text` = 마지막 성공 단계 결과
- 재교정 시 raw_text에서 새로 시작 (이전 단계 초기화)

### STT Job 상태 흐름
transcribed → reviewing → draft_sent → saved
- `draft_sent`: 임시저장으로 전달됨 (linked_draft_id 설정)
- `saved`: DB 저장 완료

### STT → 임시저장 연계
- STT 저장 시 즉시 DB 저장 X, draft 생성 (`save_draft_internal` 호출)
- 사용자가 임시저장 탭에서 요점 분석 → DB 저장
- 양방향 링크: SttJob.linked_draft_id ↔ Draft.source_stt_job_id

### 날짜 포맷 (중요)
- **전체 시스템 YYMM 사용** (예: "2604" = 26년 4월)
- 일(day) 저장 안 함
- `<input type="date">` 사용 금지 — 텍스트 input + `_siDateDefault` 재사용
- STT 검토 화면도 YYMM

### Outline 매칭 (중요)
- outline_num 중복 가능 (예: S-31/001 기념식, S-34/001 공개강연)
- 매칭 시 반드시 `outline_num + outline_type` 조합:
```jsx
const matched = outlines.find(g =>
  g.outline_num === t.outline_num &&
  (!t.outline_type || g.outline_type === t.outline_type)
);
```

### Draft ID 규칙
- 일반: `{outline_type}_{outline_num}_{speaker}_{date}`
  - 예: `S-34_001_김보성_2604`
- STT 출처: 위 + `_stt{해시6}` (source_stt_job_id 마지막 6자리)
  - 예: `S-34_001_최진규_2604_stt169b2c`
- 자유 입력 STT: `ETC__{speaker}_{date}_stt{해시6}`
  - 예: `ETC_최진규_2604_stt169b2c`

### State 역할 분리 (ManagePage.jsx)
- `siSourceSttJobId`: draft STT 링크 플래그
  - draftSave 시 `source_stt_job_id` 필드 전송
  - 골자 선택 시 해제 (골자 draft에 STT ID 안 붙음)
  - localStorage는 `siNoOutline=true`일 때만 저장
  
- `siSttOriginalText`: UI 원본 텍스트 상단 블록 표시
  - `siSourceSttJobId`와 독립적으로 유지
  - 골자 모드로 전환/재진입해도 유지 (흐름 2 지원)
  - 자유 입력 재진입 (`isSttDraft`): `stt_original_text` 복원
  - 골자 draft 재진입 (`outline_num + isDraft`): draftLoad 응답에서 복원

### STT Draft 1:1 매핑
- `save_draft_internal`에서 같은 `source_stt_job_id` 가진 다른 draft 자동 삭제
- draft_id에 STT 해시 포함으로 고유성 보장
- 단, 골자 선택하면 `siSourceSttJobId` 해제되므로 새 draft는 STT 링크 없음
  → ETC draft는 별도 남음 (사용자 수동 삭제)

### 흐름별 지원
- **흐름 1**: 연설 듣고 직접 작성 → 골자 선택 → 간단/상세 저장 (기존 구현)
- **흐름 2**: 공개강연 녹음 → STT → 교정 → 골자 분류 → 저장 (Build-5D-2 완료)
  - STT 원본 블록 상단 고정, 골자 전환해도 유지
  - 재진입 시 원본 복원 (작업 중단 후 재개 지원)
- **흐름 3**: 생활과 봉사 연설 → STT → 자유 입력 소주제/요점/성구/키워드 (Build-5D-3 예정)

### 금지 사항
- Draft/SttJob 모델 기존 필드 제거 금지 (추가만)
- `_siInit` localStorage 키 구조 변경 금지
- 기존 골자 기반 UI 로직 수정 금지 (STT 기능만 추가)
- `<input type="date">` 사용 금지
- `outlines.find`에서 `outline_num`만 매칭 금지

### 관련 API 엔드포인트
- STT: `/api/stt/jobs` (list), `/upload`, `/jobs/{id}/transcribe`, `/correct`, `/save`, DELETE
- Draft: `/api/speech-draft/list`, `/load`, `/save`, `/check`, `/complete`, DELETE

### STT 파일 경로
- 업로드 원본: `~/jw-system/stt_uploads/`
- 교정본: `~/jw-system/stt_drafts/`
- Job 상태: `~/jw-system/stt_jobs.json`
- Draft: `~/jw-system/speech_drafts/`
- 교정 규칙: `~/jw-system/stt_corrections.json`

## 향후 계획

- [x] 전처리 시스템 재구현 — 완료
- [x] 백엔드 모듈화 — 완료
- [x] 카드 스타일 전체 통일 + tags 뱃지 — 완료
- [x] 연사메모 카테고리 분리 — 완료
- [x] 스타일 참고 기능 — 완료
- [x] DB 검색 칩 필터 — 완료
- [x] 메뉴 구조 변경 (4탭: 준비/검색/추가/관리) — 완료
- [x] 연설 입력 기능 (간단/상세 + draft 2층 구조) — 완료
- [x] DB 관리 5탭 (골자/연설/출판물/원문/연사메모) — 완료
- [x] 그룹 뷰 (골자, 연설, 연사메모) — 완료
- [x] 전체 선택 + 선택 삭제 — 완료
- [x] rem 기반 폰트 시스템 — 완료
- [x] 골자 유의사항 (note) — 완료
- [x] 성구 본문 조회 (bible/lookup) — 완료
- [x] 골자 DOCX 업로드 자동 텍스트 변환 (Phase 1-A) — 완료
- [x] 골자 후처리 개선 (마커/낭독 성구/책명 확장) — 완료
- [x] 번호 재정렬 버튼 — 완료
- [x] 중복 덮어쓰기 (type+num+version 3-tuple) — 완료
- [x] Phase 2.5: save_outline JSON points 저장 누락 — 완료
- [x] Phase 3: 출판물 referenced_by 모델 (linked_outlines/pub_abbr 폐기, subtopic_title/point_text/요점 메타 추가) — 완료
- [x] Phase 3.1: outline_type 영문 정규화 (normalize_outline_type 헬퍼) — 완료
- [x] Phase 4 Build-1~5D-2: STT 파이프라인 + 흐름 1/2 지원 — 완료
- [x] Doc-45: outline_year 필드 완전 제거 (version MM/YY 가 년도 흡수) — 완료
- [ ] Phase 4 Build-5D-3: 자유 입력 UI 확장 (흐름 3)
- [ ] Phase 4 Build-6: e2e 안정화
- [ ] Phase 4.6: STT 성구 참조 교정 + AI 자동 분류
- [ ] 봉사 모임/방문 저장 기능 고도화
- [ ] 카테고리 관리 UI
- [ ] 웹 검색 모드 (DuckDuckGo)

### 로드맵 (Phase 4+)
- [ ] **Phase 4**: STT 파이프라인 (mp4 → Whisper → 교정 사전 → 골자 매핑 → speech_expressions 저장)
- [ ] **Phase 4.5**: 디자인 시스템 정립
  - DESIGN_TOKENS.md (색상/간격/폰트 변수)
  - CSS 변수 통합 (현재 inline 흩어진 색상값 정리)
  - 공통 부품 (RatingButtons, ImportanceButtons, MemoBox, Badge, ExpandSection 등)
  - 카드 프리셋 3종 (SearchResultCard, DataEntryCard, InputCard)
  - 점진 마이그레이션
- [ ] **Phase 5**: 성구/출판물 목록 UI (2-2 탭)
- [ ] **Phase 6**: 주제 연결 시각화 (골자×출판물 그래프)
- [ ] **Phase 7**: DB 현황 대시보드 (골자 유형 필터 흡수)
- [ ] **Phase 8**: AI 삭제 후보 추천 (중복/저질 데이터)
- [ ] **Phase 9**: 골자×연설 매핑 AI (어느 연설이 어느 골자인지 자동 추정)
- [ ] **Phase 10**: 백업 스케줄러 (월 2회 + 스냅샷) + export 기능
- [ ] **Phase 11**: 에러 로깅 시스템
- [ ] **Phase 12**: 배포 (Nginx Proxy Manager) + 읽기/쓰기 권한 분리
