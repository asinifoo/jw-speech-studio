# Handoff: JW Speech Studio — Design System & Component Library

## Overview

This handoff package contains a complete design system and component library for **JW Speech Studio**, a Korean-language RAG-based AI assistant for preparing Jehovah's Witness speeches. The target repo is `asinifoo/jw-speech-studio` (React SPA, Vite, inline styles via `styles.js`).

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these designs in the existing React codebase** (`frontend/src/`) using its established patterns (inline style objects, `S.*` tokens from `styles.js`, functional components with hooks).

## Fidelity

**High-fidelity.** These mocks use exact hex values, spacing, border-radii, and type sizes extracted from the actual codebase's CSS variables and `styles.js`. The developer should match them pixel-perfectly.

---

## Design Tokens

### Colors — Accents (role mapping)

| Role | Variable | Light | Dark | Usage |
|---|---|---|---|---|
| Primary / 연설 / Success | `--accent` | `#1D9E75` | `#22B888` | 검색 btn, primary actions, 골자 tag, 연설/봉사/방문 cards |
| Orange / 원문 / 연사메모 | `--accent-orange` | `#D85A30` | `#E87A55` | 원문 cards, 연사메모, 제목검색, 표현 badge |
| Blue / 성구 / 중요도 | `--accent-blue` | `#378ADD` | `#5AA0E8` | Scripture refs, importance badge, 편집됨 |
| Brown / 출판물 / WOL | `--accent-brown` | `#C7842D` | `#D8A050` | Publications, WOL filter, 예시 badge |
| Purple / AI / 자유입력 | `--accent-purple` | `#7F77DD` | `#9B94E8` | AI chat answers, pub reference strips, LLM filter |
| Gold / 별점 | `--accent-gold` | `#F5A623` | `#F5B84A` | Rating stars, favorites |
| Danger | `--c-danger` | `#cc4444` | `#E06060` | Delete, DB edit, errors |

### Colors — Surfaces

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#F2F2F7` | `#1a1a1a` |
| `--bg-card` | `#FFFFFF` | `#2a2a2a` |
| `--bg-subtle` | `#EFEFF4` | `#222` |
| `--bg-input` | `#EFEFF4` | `#333` |
| `--bg-muted` | `#E5E5EA` | `#333` |

### Colors — Text

| Token | Light | Dark |
|---|---|---|
| `--c-text` | `#3C3C43` | `#f0f0f0` |
| `--c-text-dark` | `#000000` | `#f0f0f0` |
| `--c-sub` | `#636366` | `#ccc` |
| `--c-hint` | `#48484A` | `#ddd` |
| `--c-faint` | `#8E8E93` | `#aaa` |
| `--c-muted` | `#AEAEB2` | `#999` |
| `--c-dim` | `#C7C7CC` | `#777` |

### Colors — Borders

| Token | Light | Dark |
|---|---|---|
| `--bd` | `#C6C6C8` | `#444` |
| `--bd-light` | `#E5E5EA` | `#333` |
| `--bd-medium` | `#AEAEB2` | `#555` |
| `--bd-soft` | `#D1D1D6` | `#3a3a3a` |

### Colors — Tint families

Each accent has a matching tint trio for card backgrounds:

| Accent | `--tint-{x}` (fill) | `--tint-{x}-bd` (border) | `--tint-{x}-header` |
|---|---|---|---|
| Blue | `#eef6ff` | `#cce3f8` | `#e0eef8` |
| Purple | `#f8f5ff` | `#e0dbf5` | — |
| Green | `#e6f5ec` | `#b8e0d0` | `#e0f5ec` |
| Orange | `#ffeedd` | `#e8c0a8` | `#f5e8e0` |
| Red | `#fff0f0` | `#fcc` | — |

Full dark-mode overrides in `colors_and_type.css` under `.dk` class.

### Typography

- **Font**: `'Noto Sans KR', -apple-system, sans-serif` — weights 300/400/500/600/700/800
- **Base**: `html { font-size: 14px }` mobile, `16px` at ≥1024px. User-adjustable 12–20px via slider.
- **All font-sizes in rem** (relative to html base).

| Class | rem | px@14 | Weight | Usage |
|---|---|---|---|---|
| `.jw-h1` | 1.286 | 18 | 800 | App title |
| `.jw-h2` | 1.071 | 15 | 700 | Page title |
| `.jw-h3` | 0.929 | 13 | 700 | Card title, body |
| `.jw-h4` | 0.857 | 12 | 700 | Inline heading |
| `.jw-body` | 0.929 | 13 | 400 | Body text |
| `.jw-body-sm` | 0.857 | 12 | 400 | Secondary body |
| `.jw-meta` | 0.786 | 11 | 600 | Filter pills, meta |
| `.jw-label` | 0.75 | 10.5 | 500 | L3 tab |
| `.jw-caption` | 0.643 | 9 | 600 | XS button |
| `.jw-micro` | 0.571 | 8 | 600 | L3 count, micro badge |

### Spacing

Tight, iOS-like: `2, 4, 6, 8, 10, 12, 14, 16, 24` px. Card padding: `8px 10px` or `10px 14px`.

### Border Radii

| Element | px |
|---|---|
| Micro badge / score bar | 2–4 |
| XS button | 5 |
| Rating button | 6 |
| Inline tint row | 7 |
| Input / primary button / tab pill | 8 |
| Container / card header | 10 |
| Card | 12 |
| Status dot / reset button | 50% |

### Shadows

| Usage | Value |
|---|---|
| Card (light only) | `0 1px 2px rgba(0,0,0,0.04)` |
| Active tab pill | `0 1px 3px rgba(0,0,0,0.1)` |
| Floating panel | `0 4px 12px rgba(0,0,0,0.15)` |
| Status dot glow | `0 0 6px {accent}60` |

### Animations

- Transitions: `all 0.15s` or `all 0.2s ease`
- `@keyframes shimmer` — 1.5s ease-in-out infinite (검색 button loading)
- Page fade-in: `opacity 0.15s` on `#root.ready`

---

## Components (9 new + updated SearchCard)

### 1. SearchCard — 3 Presets

**File**: `ui_kit/SearchCard.jsx`, `preview/components-card-presets.html`

Three card presets with distinct action button colors:

#### Preset 1: 일반 (Green actions `--accent`)
- **Usage**: 연설, 봉사, 방문, DB 관리, 검색 결과
- **Header row 1**: `[checkbox] · [dot 7px] · source label · speaker · date stamp → [score bar 50×4px] [percentage]`
- **Header row 2**: `[search source tag] → [수정 btn green] [DB btn danger]`
- **Body**: meta grid → pub reference strip (if any) → content with fade gradient → 전체보기 button
- Checkbox + header area click = toggle selection (stopPropagation on buttons)
- Checked: opacity 1; unchecked: opacity 0.5

#### Preset 2: 읽기전용 (Purple actions `--accent-purple`)
- **Usage**: AI 대화 답변
- No checkbox. Only `[복사]` button.
- Dot color: purple

#### Preset 3: 원문/메모 (Orange actions `--accent-orange`)
- **Usage**: 원문, 연사메모
- When unchecked: shows `[삭제]` button instead of `[수정][DB]`
- Dot color: orange

#### Inline expand behavior
- Content capped at `max-height: 4.2em` (~3-4 lines)
- Fade gradient overlay: `linear-gradient(transparent, var(--bg-card))`, height `2em`
- Click 전체보기 → expands to `max-height: 400px` with `overflow: auto`
- Transition: `max-height 0.2s ease`

#### XS Button style (header actions)
```js
{ height: 20, padding: '0 8px', borderRadius: 5,
  border: '1px solid {bd}', background: 'var(--bg-card)',
  color: '{actionColor}', fontSize: '0.643rem',
  minWidth: 36, fontFamily: 'inherit' }
```

### 2. Modal

**File**: `preview/components-modal.html`

- Backdrop: `rgba(0,0,0,0.3)`
- Container: `bg-card`, `border-radius: 12`, `border: 1px solid var(--bd)`, `max-width: 360px`, `box-shadow: 0 4px 24px rgba(0,0,0,0.15)`
- Header: `padding: 12px 16px`, bottom border, title (0.929rem/700) + ✕ close button
- Body: `padding: 14px 16px`, stacked form fields
- Footer: `padding: 10px 16px`, top border, right-aligned [취소][저장] buttons

### 3. Toast Notifications

**File**: `preview/components-toast.html`

4 variants:
- **Success** (t-ok): `bg: #1D9E75`, white text, "저장 완료"
- **Error** (t-err): `bg: #cc4444`, white text, "오류: ..."
- **Warning** (t-warn): `bg: #F5A623`, white text, "중단됨"
- **Info** (t-info): `bg: var(--bg-card)`, normal text + green dot, "파싱 중…"

Style: `padding: 10px 16px`, `border-radius: 8`, `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`, 0.857rem/600 weight. Leading 6px dot.

### 4. Empty & Loading States

**File**: `preview/components-states.html`

- **Empty**: centered card, `○` icon (24px, dim), "검색 결과 없음" (0.857rem), subtitle (0.786rem, muted)
- **Spinner**: 24×24px border spinner, `border: 3px solid #E5E5EA`, `border-top-color: #1D9E75`, `animation: rotate 0.8s linear infinite`
- **Skeleton**: shimmer animation, `background: linear-gradient(90deg, #EFEFF4 25%, #E5E5EA 50%, #EFEFF4 75%)`, `background-size: 200%`, `animation: shimmer 1.5s ease-in-out infinite`

### 5. Dropdown & Date Picker

**File**: `preview/components-dropdown-date.html`

- **Dropdown trigger**: `bg-subtle`, `border: 1px solid var(--bd)`, `border-radius: 8`, `padding: 8px 12px`, trailing `▾` arrow
- **Menu**: absolute positioned, `bg-card`, `border-radius: 8`, `box-shadow: 0 4px 12px rgba(0,0,0,0.12)`, items with left dot + label
- **Active item**: `bg-subtle`, green text, weight 600
- **Date input**: two segment inputs (YY/MM) with 년/월 labels. No `<input type="date">` — forbidden per CLAUDE.md.

### 6. Filter Panel (WOL)

**File**: `preview/components-filter-panel.html`

- Card container, collapsible (`▾ 불용어` trigger when compact)
- Two textarea fields: 접미사, 불용어 (line-separated)
- Test strip: input + 테스트 button → result preview
- Footer: [저장] [나의 기본값 저장] [↺ 초기화]

### 7. Refine Panel (다듬기)

**File**: `preview/components-refine-panel.html`

- Header: "다듬기 (RefinePanel)"
- **Preset pills**: toggleable rounded pills (border-radius: 20px), `✓`/`○` prefix, green tint when active
- Instruction textarea
- Progress bar: 4px height, green fill
- Footer: [다듬기] [중단] + status text "다듬기 중… 65%"

### 8. Editable Block

**File**: `preview/components-editable-block.html`

Three states:
- **Empty**: dashed border button "＋ 연사메모 추가"
- **Filled (view)**: colored container (orange for memo, green for priority), icon badge (20×20, r4) + label in header, [수정][삭제] buttons, content with 전체보기 expand
- **Editing**: same header with [확인][취소], textarea inside

Icon badge: `width: 20px, height: 20px, borderRadius: 4, background: {color}, color: #fff, fontWeight: 800, fontSize: 0.786rem`

### 9. Preset Pills

**File**: `preview/components-preset-pills.html`

- Pill: `padding: 4px 10px`, `border-radius: 20px`, `font-size: 0.786rem`
- **Active**: `border: 1px solid var(--accent)`, `bg: var(--tint-green)`, `color: var(--accent)`, weight 600, prefix `✓`
- **Inactive**: `border: 1px solid var(--bd)`, `bg: var(--bg-card)`, `color: var(--c-faint)`, prefix `○`
- **Add**: dashed border, `+` label
- **Edit mode**: red `완료` button, `×` delete badges on pills (14px red circle, absolute top-right)
- **Adding state**: inline input (border-radius: 20px, border: accent) + [추가][×] buttons

---

## Screens

### 전처리 (Preprocessing) — 3 Sub-tabs

**File**: `ui_kit/screens/PreprocessScreen.jsx`

#### Sub-tab 1: 가져오기
4 modes via segment buttons: 파일 / 직접 입력 / STT 변환 / 출판물 등록

- **파일**: drag-drop zone → parsed preview card (골자 info header + point tree with L1/L2/L3 indentation + auto-extracted 성구 badges + 출판물 badges with + 추가)
- **직접 입력**: textarea + 파싱 button
- **STT 변환**: audio file upload + progress bar (%) + 중단 button
- **출판물 등록**: form fields (출판물 코드, 출판물명, 본문 textarea)

#### Sub-tab 2: 구조화
4 types: 연설 / 토의 / 봉사 모임 / 방문

Each type has specific fields:
- **연설**: 원본 텍스트 + 골자 선택 dropdown (or 자유 입력 toggle)
- **토의**: 주제 + 날짜(YYMM) + 원본
- **봉사 모임**: 날짜(YYMM) + 원본
- **방문**: 주제 + 대상 + 날짜(YYMM) + 원본

#### Sub-tab 3: 임시저장
- Draft card list with type badge (colored by type), title, stamp, status
- Each card: [이동 green] [삭제 red] buttons
- Empty state when no drafts

### Other Screens (existing, updated)

- **검색 (Search)**: `SearchScreen.jsx` — search bar + status strip + L2 filter pills + card list using 3 presets
- **준비 (Prepare)**: `PrepareScreen.jsx` — textarea paste → parse → point tree
- **입력 (Input)**: `InputScreen.jsx` — type selector + title/성구/본문 fields
- **관리 (Manage)**: `ManageScreen.jsx` — L3 tabs (골자/연설/출판물/원문/연사메모) + search + CRUD list

---

## Dark Mode

Toggle via `.dk` class on root element. All CSS vars have dark overrides in `colors_and_type.css`. Key differences:
- Backgrounds shift to `#1a1a1a` / `#2a2a2a` / `#222`
- Text becomes `#f0f0f0` / `#ccc`
- Accents brighten slightly (e.g. `#1D9E75` → `#22B888`)
- Card shadows disabled in dark mode
- Tints shift to near-black (`#1a2a3a`, `#2a1a3a`, etc.)

UI toggle: `☀` / `🌙` button in app header.

---

## Files in This Package

```
design_handoff_jw_speech_studio/
├── README.md                          ← this file
├── colors_and_type.css                ← all CSS variables + type classes
├── assets/
│   └── favicon.svg                    ← JW green wordmark
├── ui_kit/                            ← interactive React prototypes
│   ├── index.html                     ← boot file (open to demo)
│   ├── AppShell.jsx                   ← shell: header, tabs, theme, FAB
│   ├── Atoms.jsx                      ← buttons, badges, score bar, rating, meta grid, inputs
│   ├── Tabs.jsx                       ← L1/L2/L3 tab primitives
│   ├── SearchCard.jsx                 ← canonical card with 3 presets
│   └── screens/
│       ├── SearchScreen.jsx           ← 검색 tab
│       ├── PrepareScreen.jsx          ← 준비 tab
│       ├── PreprocessScreen.jsx       ← 전처리 tab (NEW — 3 sub-tabs)
│       ├── InputScreen.jsx            ← 입력 tab
│       └── ManageScreen.jsx           ← 관리 tab
└── preview/                           ← static HTML component specimens
    ├── components-card-presets.html    ← 3 card presets side-by-side
    ├── components-modal.html
    ├── components-toast.html
    ├── components-states.html         ← empty + spinner + skeleton
    ├── components-dropdown-date.html
    ├── components-filter-panel.html   ← WolFiltersPanel
    ├── components-refine-panel.html   ← RefinePanel + PresetPills
    ├── components-editable-block.html ← EditableBlock 3 states
    └── components-preset-pills.html   ← PresetPills toggle/add/edit
```

## Implementation Notes

1. **Do not use `<input type="date">`** — explicitly forbidden in CLAUDE.md. Use YYMM segment inputs.
2. **All UI text must be Korean** — no English labels in JSX.
3. **Font sizes in rem**, padding/margin/border in **px**.
4. **Existing `styles.js` tokens** (`S.btnXs`, `S.card`, `S.input`, etc.) should be extended, not replaced.
5. **SearchCard presets** can be implemented by passing a `preset` prop to the existing `SearchCard.jsx` component and branching button rendering accordingly.
6. **New components** (Modal, Toast, FilterPanel, RefinePanel, EditableBlock, PresetPills) should follow the same inline-style pattern used throughout the codebase.
