# DataMaster v2 — 하네스 엔지니어링 세팅 가이드

> **목적**: DBMLViewer(TableMaster) 프로젝트를 분석하여, 더 높은 완성도로 재구축하기 위한 아키텍처·기술 스택·작업 계획 정의
> **원본 리포**: https://github.com/dazelius/DBMLViewer
> **작성일**: 2026-04-06

---

## 1. 원본 프로젝트 분석 요약

### 1.1 프로젝트 정체

게임 프로젝트(Project AEGIS)의 **게임 데이터 관리·분석·시각화 웹 도구**. 엑셀 기반 게임 데이터 스키마를 DBML로 변환하여 ERD로 시각화하고, AI 챗봇으로 데이터를 질의하며, Git/Jira/Confluence/Unity 에셋과 통합된 올인원 내부 도구.

### 1.2 원본의 기능 목록 (12개 모듈)

| # | 모듈 | 설명 | 원본 핵심 파일 |
|---|------|------|---------------|
| 1 | DBML ERD 뷰어 | 엑셀→DBML 변환, ERD 시각화 (Dagre 레이아웃) | `EditorPage.tsx`, Canvas 컴포넌트 |
| 2 | SQL 쿼리 엔진 | 브라우저 내 alasql로 게임 데이터 SQL 조회 | `QueryPage.tsx`, `schemaQueryEngine.ts` |
| 3 | Git 연동 | GitLab clone/pull, 커밋 로그, Diff 비교 | `gitlabService.ts`, `DiffPage.tsx` |
| 4 | AI 챗봇 | Claude API, Tool Use 17+개, 스트리밍, 자동 연속 생성 | `chatEngine.ts` (~4164줄), `ChatPage.tsx` (~9010줄) |
| 5 | Jira/Confluence | JQL 검색, 이슈 CRUD, Confluence 페이지 조회 | `vite-git-plugin.ts` 내 API |
| 6 | 3D 뷰어 | Unity FBX/Prefab/Scene 파일 Three.js 렌더링 | `SceneViewer.tsx`, `FbxViewer.tsx` |
| 7 | 코드 가이드 | C# 소스코드 검색, 가이드 문서 열람 | `GuidePage.tsx` |
| 8 | 데이터 검증 | 스키마 기반 Validation | `ValidationPage.tsx` |
| 9 | 문서 출판 | AI 생성 HTML 보고서 저장·공유 (폴더 구조) | `published/` 디렉토리, Explore 페이지 |
| 10 | Slack 봇 | Socket Mode, SSE 스트리밍, 아티팩트 자동 출판 | `slack-bot.cjs` (~1498줄) |
| 11 | Knowledge Base | 지식 저장·조회·삭제 (AI 컨텍스트) | `knowledge/` 디렉토리 |
| 12 | 에셋 관리 | Unity 에셋 인덱스, 머티리얼, GUID 매핑 | PowerShell 동기화 스크립트 |

### 1.3 원본의 구조적 문제점

| 문제 | 상세 | 영향 |
|------|------|------|
| **모놀리식 파일** | `vite-git-plugin.ts` ~7,728줄, `ChatPage.tsx` ~9,010줄, `chatEngine.ts` ~4,164줄 | 유지보수 불가, 코드 리뷰 불가 |
| **백엔드가 Vite 플러그인** | 모든 서버 API가 Vite 미들웨어로 구현 | 프로덕션 배포 한계, 스케일링 불가 |
| **DB 없음** | JSON 파일 기반 저장 (`published/index.json`, `folders.json`) | 동시성 문제, 검색 비효율 |
| **테스트 없음** | 테스트 코드 전무 | 리팩토링 시 회귀 버그 위험 |
| **인증/인가 없음** | API 키만 .env에 보관, 사용자 인증 미구현 | 보안 취약 |
| **하드코딩된 경로** | PowerShell 스크립트 내 절대 경로 | 환경 이식성 없음 |
| **프론트/백 결합** | 빌드·서빙·API가 하나의 Vite 프로세스 | 독립 배포 불가 |
| **에러 핸들링 부재** | 체계적 에러 처리 없음, ad-hoc 대응 | 장애 원인 추적 어려움 |
| **코드 중복** | 웹앱 chatEngine과 Slack 봇이 유사 로직 독립 구현 | 기능 불일치 발생 이력 |

---

## 2. 재구축 아키텍처

### 2.1 전체 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                        클라이언트                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ 웹 앱    │  │ Slack Bot│  │ CLI Tool │  │ VS Code Ext │ │
│  │ (React)  │  │ (bolt)   │  │ (향후)   │  │ (향후)      │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬──────┘ │
└───────┼──────────────┼─────────────┼────────────────┼───────┘
        │              │             │                │
        ▼              ▼             ▼                ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway / Router                      │
│              (Express/Fastify + OpenAPI Spec)                │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Chat     │  │ Data     │  │ Git      │  │ Integration│  │
│  │ Service  │  │ Service  │  │ Service  │  │ Service    │  │
│  │          │  │          │  │          │  │            │  │
│  │ • Claude │  │ • Schema │  │ • Clone  │  │ • Jira     │  │
│  │ • Tools  │  │ • Query  │  │ • Diff   │  │ • Conflu   │  │
│  │ • Stream │  │ • Valid  │  │ • Log    │  │ • Slack    │  │
│  │ • Knowl  │  │ • Import │  │ • Sync   │  │ • Webhook  │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ Asset    │  │ Publish  │  │ Auth     │                   │
│  │ Service  │  │ Service  │  │ Service  │                   │
│  │          │  │          │  │          │                   │
│  │ • FBX    │  │ • HTML   │  │ • Login  │                   │
│  │ • Prefab │  │ • PDF    │  │ • RBAC   │                   │
│  │ • Scene  │  │ • Share  │  │ • Token  │                   │
│  │ • Image  │  │ • Folder │  │ • SSO    │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
├─────────────────────────────────────────────────────────────┤
│                     Storage Layer                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ SQLite   │  │ File     │  │ Cache    │                   │
│  │ (메타DB) │  │ System   │  │ (메모리) │                   │
│  └──────────┘  └──────────┘  └──────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 프론트엔드/백엔드 분리 원칙

| 영역 | 원본 | v2 |
|------|------|-----|
| 프론트엔드 | Vite + React (API도 여기) | **Vite + React (순수 클라이언트)** |
| 백엔드 | vite-git-plugin.ts 미들웨어 | **독립 Express/Fastify 서버** |
| 통신 | fetch + EventSource (패치됨) | **REST + SSE (표준)** |
| 배포 | `npx vite preview` 단일 프로세스 | **프론트: 정적 호스팅 / 백: Node 서버** |

---

## 3. 기술 스택 결정

### 3.1 프론트엔드

| 분류 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **React 19 + TypeScript** | 원본과 동일, 생태계 성숙 |
| 빌드 | **Vite 7** | 원본과 동일, 빠른 HMR |
| 스타일링 | **Tailwind CSS 4** | 원본과 동일, 유틸리티 우선 |
| 상태관리 | **Zustand 5** | 원본과 동일, 경량 |
| 라우팅 | **React Router 7** | 원본과 동일 |
| 코드 에디터 | **Monaco Editor** | 원본과 동일, DBML 하이라이팅 |
| ERD 렌더링 | **React Flow** (신규) | Dagre 직접 사용 대신 노드 기반 인터랙션 내장 |
| 3D 렌더링 | **Three.js + React Three Fiber** | 원본 Three.js 직접 사용 대비 React 통합 우수 |
| 차트/시각화 | **Recharts** 또는 **Nivo** | 출판 아티팩트 내 차트 지원 |
| HTTP 클라이언트 | **ky** 또는 **ofetch** | fetch 래퍼, 인터셉터/리트라이 내장 |
| 폼 관리 | **React Hook Form + Zod** | 타입 안전 유효성 검사 |

### 3.2 백엔드

| 분류 | 선택 | 이유 |
|------|------|------|
| 런타임 | **Node.js 22 LTS** | 원본과 동일 런타임 |
| 프레임워크 | **Fastify 5** | Express 대비 2x 성능, 스키마 검증 내장 |
| API 문서 | **@fastify/swagger (OpenAPI 3.1)** | 자동 API 문서 생성 |
| DB | **SQLite (better-sqlite3)** | 서버리스, 파일 기반이지만 SQL 지원 |
| ORM | **Drizzle ORM** | 타입 안전, SQLite 지원 우수 |
| AI | **Anthropic SDK (@anthropic-ai/sdk)** | Claude API 공식 SDK, 스트리밍 지원 |
| Git 연산 | **simple-git** | git CLI 래퍼, 원본의 child_process 직접 호출 대체 |
| 파일 처리 | **xlsx-populate** 또는 **ExcelJS** | 엑셀 파싱 (원본 xlsx 라이브러리 대체) |
| DBML 파싱 | **@dbml/core** | 원본과 동일 |
| SQL 엔진 | **alasql** (프론트) + **better-sqlite3** (백) | 프론트: 브라우저 쿼리, 백: 메타 저장 |
| 검증 | **Zod** | 런타임 타입 검증 (API 입력, 스키마 검증 공용) |
| 로깅 | **pino** | Fastify 기본 로거, 구조화된 JSON 로그 |
| 태스크 큐 | **BullMQ** 또는 인메모리 큐 | Git sync, 에셋 인덱싱 등 비동기 작업 |

### 3.3 공유 (Monorepo 구조)

| 분류 | 선택 | 이유 |
|------|------|------|
| 모노레포 | **pnpm workspaces** | 패키지 관리 효율, 디스크 절약 |
| 공유 타입 | **packages/shared** | 프론트/백 공통 타입, 상수, 유틸 |
| 빌드 오케스트레이션 | **turborepo** | 병렬 빌드, 캐시 |

### 3.4 인프라/DX

| 분류 | 선택 | 이유 |
|------|------|------|
| 테스트 | **Vitest** + **Testing Library** + **Playwright** | 유닛/통합/E2E |
| 린팅 | **Biome** | ESLint + Prettier 대체, 빠름 |
| CI/CD | **GitHub Actions** | 자동 빌드/테스트/배포 |
| 컨테이너 | **Docker + docker-compose** | 로컬 개발·배포 환경 통일 |
| 환경 변수 | **dotenv + Zod 검증** | 타입 안전한 환경 변수 |

---

## 4. 프로젝트 디렉토리 구조 (v2)

```
DataMaster_2/
├── package.json                  # 루트 (pnpm workspace)
├── pnpm-workspace.yaml
├── turbo.json
├── docker-compose.yml
├── .env.example
├── .github/
│   └── workflows/
│       ├── ci.yml                # 빌드 + 테스트
│       └── deploy.yml            # 배포
│
├── packages/
│   └── shared/                   # 공유 패키지
│       ├── package.json
│       └── src/
│           ├── types/
│           │   ├── schema.ts     # SchemaTable, SchemaRef, ParsedSchema 등
│           │   ├── chat.ts       # ChatMessage, ToolCall, StreamEvent 등
│           │   ├── git.ts        # GitCommit, GitDiff 등
│           │   ├── publish.ts    # Artifact, Folder 등
│           │   └── api.ts        # API Request/Response 타입
│           ├── constants/
│           │   ├── tools.ts      # AI 도구 이름/라벨 매핑
│           │   └── sql.ts        # alasql 예약어 매핑 테이블
│           └── utils/
│               ├── dbml.ts       # DBML 유틸리티
│               └── sanitize.ts   # 입력 정제 공용 함수
│
├── apps/
│   ├── web/                      # 프론트엔드 (React)
│   │   ├── package.json
│   │   ├── vite.config.ts
│   │   ├── index.html
│   │   ├── public/
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── routes/           # 라우팅 설정
│   │       │   └── index.tsx
│   │       ├── pages/            # 페이지 (Lazy Load)
│   │       │   ├── editor/
│   │       │   │   ├── EditorPage.tsx
│   │       │   │   └── components/
│   │       │   ├── chat/
│   │       │   │   ├── ChatPage.tsx
│   │       │   │   ├── components/
│   │       │   │   │   ├── MessageList.tsx
│   │       │   │   │   ├── MessageBubble.tsx
│   │       │   │   │   ├── ToolResultCard.tsx
│   │       │   │   │   ├── SqlResultCard.tsx
│   │       │   │   │   ├── SchemaCard.tsx
│   │       │   │   │   ├── DiffCard.tsx
│   │       │   │   │   ├── JiraCard.tsx
│   │       │   │   │   ├── ArtifactPreview.tsx
│   │       │   │   │   └── ChatInput.tsx
│   │       │   │   └── hooks/
│   │       │   │       ├── useChatStream.ts
│   │       │   │       └── useChatSession.ts
│   │       │   ├── query/
│   │       │   ├── docs/
│   │       │   ├── diff/
│   │       │   ├── validation/
│   │       │   ├── guide/
│   │       │   ├── explore/
│   │       │   ├── viewer/       # 3D 뷰어
│   │       │   │   ├── SceneViewer.tsx
│   │       │   │   ├── FbxViewer.tsx
│   │       │   │   └── PrefabViewer.tsx
│   │       │   └── knowledge/
│   │       ├── components/       # 공용 UI 컴포넌트
│   │       │   ├── ui/           # 기본 UI (Button, Modal, Card, Toast 등)
│   │       │   ├── layout/       # AppLayout, Sidebar, Header
│   │       │   ├── canvas/       # ERD 캔버스 (React Flow 기반)
│   │       │   │   ├── TableNode.tsx
│   │       │   │   ├── RelationEdge.tsx
│   │       │   │   └── CanvasToolbar.tsx
│   │       │   ├── editor/       # Monaco 에디터 래퍼
│   │       │   └── three/        # Three.js / R3F 공용 컴포넌트
│   │       ├── hooks/            # 공용 훅
│   │       │   ├── useAutoLoad.ts
│   │       │   ├── useDebouncedParse.ts
│   │       │   └── usePresence.ts
│   │       ├── stores/           # Zustand 스토어
│   │       │   ├── editorStore.ts
│   │       │   ├── schemaStore.ts
│   │       │   ├── canvasStore.ts
│   │       │   ├── chatStore.ts
│   │       │   ├── queryStore.ts
│   │       │   └── syncStore.ts
│   │       ├── lib/              # 클라이언트 로직
│   │       │   ├── api.ts        # API 클라이언트 (공통 fetch 래퍼)
│   │       │   ├── dbml/         # DBML 파싱·변환
│   │       │   ├── sql/          # alasql 엔진 래퍼
│   │       │   ├── excel/        # 엑셀→DBML 변환
│   │       │   └── export/       # 이미지/SQL 내보내기
│   │       └── styles/
│   │           └── index.css     # Tailwind 엔트리
│   │
│   ├── server/                   # 백엔드 (Fastify)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts          # 서버 엔트리
│   │       ├── config.ts         # 환경 변수 (Zod 검증)
│   │       ├── app.ts            # Fastify 인스턴스 생성
│   │       ├── plugins/          # Fastify 플러그인
│   │       │   ├── cors.ts
│   │       │   ├── swagger.ts
│   │       │   └── auth.ts
│   │       ├── routes/           # API 라우트 (기능별 분리)
│   │       │   ├── chat.ts       # POST /api/chat (SSE 스트리밍)
│   │       │   ├── git.ts        # /api/git/*
│   │       │   ├── data.ts       # /api/data/* (엑셀, 스키마)
│   │       │   ├── code.ts       # /api/code/*
│   │       │   ├── assets.ts     # /api/assets/*
│   │       │   ├── jira.ts       # /api/jira/*
│   │       │   ├── confluence.ts # /api/confluence/*
│   │       │   ├── publish.ts    # /api/publish/*
│   │       │   ├── knowledge.ts  # /api/knowledge/*
│   │       │   └── health.ts     # GET /api/health
│   │       ├── services/         # 비즈니스 로직 (라우트에서 분리)
│   │       │   ├── chat/
│   │       │   │   ├── chatService.ts
│   │       │   │   ├── toolExecutor.ts
│   │       │   │   ├── toolDefinitions.ts
│   │       │   │   ├── systemPromptBuilder.ts
│   │       │   │   └── streamManager.ts
│   │       │   ├── git/
│   │       │   │   ├── gitService.ts
│   │       │   │   └── diffService.ts
│   │       │   ├── data/
│   │       │   │   ├── excelParser.ts
│   │       │   │   ├── dbmlConverter.ts
│   │       │   │   └── queryEngine.ts
│   │       │   ├── integration/
│   │       │   │   ├── jiraClient.ts
│   │       │   │   └── confluenceClient.ts
│   │       │   ├── asset/
│   │       │   │   ├── assetIndexer.ts
│   │       │   │   ├── sceneParser.ts    # Unity .scene YAML 파서
│   │       │   │   └── fuzzySearch.ts
│   │       │   ├── publish/
│   │       │   │   ├── publishService.ts
│   │       │   │   └── htmlBuilder.ts
│   │       │   └── knowledge/
│   │       │       └── knowledgeService.ts
│   │       ├── db/               # 데이터베이스
│   │       │   ├── schema.ts     # Drizzle 스키마 정의
│   │       │   ├── migrate.ts    # 마이그레이션
│   │       │   └── client.ts     # DB 인스턴스
│   │       └── utils/
│   │           ├── logger.ts     # pino 래퍼
│   │           ├── errors.ts     # 커스텀 에러 클래스
│   │           └── stream.ts     # SSE 유틸리티
│   │
│   └── slack-bot/                # Slack 봇 (독립 프로세스)
│       ├── package.json
│       └── src/
│           ├── index.ts
│           ├── handlers/
│           │   ├── messageHandler.ts
│           │   ├── reactionHandler.ts
│           │   └── homeTab.ts
│           ├── services/
│           │   ├── datamasterClient.ts   # 서버 API SSE 클라이언트
│           │   ├── sessionManager.ts
│           │   ├── slackFormatter.ts     # Markdown → Slack mrkdwn
│           │   └── artifactPublisher.ts
│           └── config.ts
│
├── scripts/                      # 유틸리티 스크립트
│   ├── sync-assets.ts            # 에셋 동기화 (PS1→TS 마이그레이션)
│   ├── sync-code.ts
│   ├── build-indexes.ts
│   └── generate-guides.ts
│
├── docs/                         # 프로젝트 문서
│   ├── api-reference.md
│   ├── deployment.md
│   └── architecture.md
│
└── tests/                        # E2E 테스트
    ├── playwright.config.ts
    └── e2e/
        ├── editor.spec.ts
        ├── chat.spec.ts
        └── query.spec.ts
```

---

## 5. 데이터 모델 설계

### 5.1 SQLite 스키마 (Drizzle ORM)

원본의 JSON 파일 기반 저장소를 SQLite로 마이그레이션:

```typescript
// apps/server/src/db/schema.ts

// 출판 아티팩트
artifacts: {
  id: text('id').primaryKey(),           // UUID
  title: text('title').notNull(),
  description: text('description'),
  html: text('html').notNull(),
  folderId: text('folder_id').references(() => folders.id),
  source: text('source'),                // 'web' | 'slack' | 'api'
  author: text('author'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
}

// 폴더
folders: {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id').references(() => folders.id),
  createdAt: integer('created_at'),
}

// 채팅 세션
chatSessions: {
  id: text('id').primaryKey(),
  title: text('title'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
}

// 채팅 메시지
chatMessages: {
  id: text('id').primaryKey(),
  sessionId: text('session_id').references(() => chatSessions.id),
  role: text('role').notNull(),          // 'user' | 'assistant'
  content: text('content').notNull(),
  toolCalls: text('tool_calls'),         // JSON string
  createdAt: integer('created_at'),
}

// Knowledge Base
knowledge: {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),   // 식별 키
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'),                    // JSON string array
  source: text('source'),
  createdAt: integer('created_at'),
  updatedAt: integer('updated_at'),
}

// 에셋 인덱스 (캐시)
assetIndex: {
  id: integer('id').primaryKey({ autoIncrement: true }),
  path: text('path').notNull(),
  name: text('name').notNull(),
  type: text('type'),                    // 'fbx' | 'png' | 'prefab' | 'material'
  size: integer('size'),
  lastModified: integer('last_modified'),
}
```

### 5.2 alasql 게임 데이터 (프론트엔드, 기존 유지)

브라우저 내 게임 데이터 SQL 조회는 원본 방식을 유지. 엑셀 파일을 파싱하여 alasql 테이블로 로드.

**개선점**: 예약어 충돌 매핑을 `packages/shared/src/constants/sql.ts`에 중앙 관리:

```typescript
export const RESERVED_WORD_MAP: Record<string, string> = {
  Enum: '__u_enum',
  Index: '__u_index',
  Key: '__u_key',
  Value: '__u_value',
  Status: '__u_status',
  Type: '__u_type',
  Level: '__u_level',
  Group: '__u_group',
  Order: '__u_order',
};
```

---

## 6. API 설계 (RESTful + SSE)

### 6.1 API 엔드포인트 정의

원본의 ~30개 엔드포인트를 체계적으로 재구성:

```
# 인증
POST   /api/auth/login
POST   /api/auth/refresh

# 채팅 (AI)
POST   /api/chat                          # SSE 스트리밍 응답
GET    /api/chat/sessions                 # 세션 목록
GET    /api/chat/sessions/:id/messages    # 세션 메시지 이력
DELETE /api/chat/sessions/:id             # 세션 삭제

# 게임 데이터
GET    /api/data/files                    # Git 저장소 파일 목록
GET    /api/data/schema                   # 파싱된 스키마 (DBML)
POST   /api/data/query                    # 서버 사이드 SQL 쿼리 (선택)

# Git
POST   /api/git/sync                      # 저장소 동기화
GET    /api/git/status                    # 저장소 상태
GET    /api/git/log                       # 커밋 로그
GET    /api/git/diff                      # Diff (커밋 간 비교)
GET    /api/git/files-at-commit           # 특정 커밋 시점 파일

# 코드
GET    /api/code/files                    # C# 파일 목록
GET    /api/code/file                     # 파일 내용
GET    /api/code/search                   # 코드 검색
GET    /api/code/stats                    # 코드 통계
GET    /api/code/guides                   # 가이드 목록
GET    /api/code/guide/:id               # 가이드 내용

# 에셋
GET    /api/assets/index                  # 에셋 인덱스
GET    /api/assets/file                   # 에셋 파일 서빙
GET    /api/assets/search                 # 퍼지 검색
GET    /api/assets/materials              # 머티리얼 인덱스
GET    /api/assets/scene                  # Scene YAML → JSON

# 이미지 (게임 UI)
GET    /api/images/list                   # 이미지 목록
GET    /api/images/file                   # 이미지 서빙
GET    /api/images/search                 # 이미지 이름 검색

# Jira
GET    /api/jira/search                   # JQL 검색
GET    /api/jira/issue/:key               # 이슈 상세
POST   /api/jira/issue                    # 이슈 생성
PUT    /api/jira/issue/:key               # 이슈 수정
POST   /api/jira/issue/:key/comment       # 댓글 추가
GET    /api/jira/projects                 # 프로젝트 목록

# Confluence
GET    /api/confluence/search             # CQL 검색
GET    /api/confluence/page/:id           # 페이지 내용

# 출판
POST   /api/publish                       # 아티팩트 생성
GET    /api/publish                       # 아티팩트 목록
GET    /api/publish/:id                   # 아티팩트 조회
PUT    /api/publish/:id                   # 아티팩트 수정
DELETE /api/publish/:id                   # 아티팩트 삭제
GET    /api/publish/folders               # 폴더 목록
POST   /api/publish/folders               # 폴더 생성

# Knowledge
GET    /api/knowledge                     # 목록
POST   /api/knowledge                     # 저장
GET    /api/knowledge/:key                # 조회
DELETE /api/knowledge/:key                # 삭제

# 헬스체크
GET    /api/health                        # 서버 상태
```

### 6.2 SSE 이벤트 프로토콜 (채팅)

원본의 SSE 프로토콜을 정규화:

```typescript
// packages/shared/src/types/chat.ts

type SSEEvent =
  | { event: 'session';    data: { sessionId: string } }
  | { event: 'text_delta'; data: { delta: string; snapshot: string } }
  | { event: 'tool_start'; data: { toolName: string; toolInput: Record<string, unknown> } }
  | { event: 'tool_done';  data: { toolName: string; result: string } }
  | { event: 'thinking';   data: { iteration: number } }
  | { event: 'done';       data: { content: string; toolCalls: ToolCall[]; usage: TokenUsage } }
  | { event: 'error';      data: { message: string; recoverable: boolean } }
  | { event: 'heartbeat';  data: {} };
```

---

## 7. AI 챗봇 리팩토링 계획

원본에서 가장 복잡한 모듈 (chatEngine.ts ~4164줄, ChatPage.tsx ~9010줄)을 분해:

### 7.1 서버 측 분해

```
services/chat/
├── chatService.ts          # 메인 오케스트레이터 (요청→Claude→도구→응답 루프)
├── toolDefinitions.ts      # Claude Tools JSON Schema 정의 (24개+)
├── toolExecutor.ts         # 도구별 실행 로직 (switch → 개별 핸들러 맵)
├── systemPromptBuilder.ts  # 시스템 프롬프트 동적 생성 (스키마, Enum, 가상테이블)
└── streamManager.ts        # SSE 스트림 관리, 자동 연속 생성 (max 5회)
```

**핵심 개선**:
- 도구 실행기를 플러그인 패턴으로: 새 도구 추가 시 한 파일만 작성
- 시스템 프롬프트 템플릿화: 스키마 변경 시 자동 반영
- 동시 요청 제어를 미들웨어로 분리

### 7.2 프론트엔드 측 분해

원본 `ChatPage.tsx` 9,010줄 → **15개+ 컴포넌트로 분리**:

```
pages/chat/
├── ChatPage.tsx            # 레이아웃 컨테이너 (~100줄)
├── components/
│   ├── MessageList.tsx     # 메시지 가상 스크롤 목록
│   ├── MessageBubble.tsx   # 개별 메시지 (user/assistant)
│   ├── ChatInput.tsx       # 입력창 + 전송 버튼
│   ├── WelcomeScreen.tsx   # 첫 화면 (예시 질문)
│   ├── ToolProgressBar.tsx # 도구 실행 진행 상황
│   ├── cards/
│   │   ├── SqlResultCard.tsx
│   │   ├── SchemaCard.tsx
│   │   ├── GitDiffCard.tsx
│   │   ├── JiraCard.tsx
│   │   ├── ConfluenceCard.tsx
│   │   ├── ImageCard.tsx
│   │   ├── ThreeDViewerCard.tsx
│   │   └── ArtifactPreview.tsx
│   └── modals/
│       ├── PublishModal.tsx
│       └── SessionHistoryModal.tsx
└── hooks/
    ├── useChatStream.ts    # SSE 연결 + 상태 관리
    └── useChatSession.ts   # 세션 CRUD
```

---

## 8. 단계별 구현 로드맵

### Phase 0: 프로젝트 부트스트랩 (1~2일)

- [ ] pnpm workspace + turborepo 초기 설정
- [ ] `packages/shared` 패키지 생성, 공용 타입 정의
- [ ] `apps/web` Vite + React + Tailwind 프로젝트 생성
- [ ] `apps/server` Fastify 프로젝트 생성
- [ ] Docker Compose 설정 (web + server)
- [ ] Biome (린터/포매터) 설정
- [ ] GitHub Actions CI 기본 파이프라인

### Phase 1: 코어 데이터 레이어 (3~5일)

- [ ] SQLite + Drizzle ORM 스키마 정의 및 마이그레이션
- [ ] 환경 변수 관리 (Zod 검증 포함)
- [ ] Git 서비스 구현 (clone, pull, log, diff)
- [ ] 엑셀 파서 + DBML 변환기 구현 (`@dbml/core`)
- [ ] 앱 시작 시 자동 동기화 로직 (원본 `useAutoLoad` 서버 버전)

### Phase 2: ERD 에디터 (3~5일)

- [ ] Monaco Editor DBML 모드 설정
- [ ] DBML 파싱 → React Flow 노드/엣지 변환
- [ ] 테이블 노드 커스텀 컴포넌트 (컬럼, PK/FK 표시)
- [ ] 관계선(Relation Edge) 커스텀 렌더링
- [ ] 자동 레이아웃 (Dagre via React Flow)
- [ ] 줌/팬/미니맵
- [ ] 이미지/SQL 내보내기

### Phase 3: 문서 & 검증 (2~3일)

- [ ] 테이블 문서 자동 생성 뷰어 (Docs 페이지)
- [ ] Enum 문서 뷰어
- [ ] 스키마 유효성 검사 엔진 + UI
- [ ] Git Diff 스키마 비교 UI

### Phase 4: SQL 쿼리 엔진 (2~3일)

- [ ] 브라우저 내 alasql 엔진 래핑
- [ ] 예약어 자동 변환 미들웨어
- [ ] Monaco 에디터 SQL 모드 + 자동완성 (테이블/컬럼명)
- [ ] 쿼리 결과 테이블 뷰 (정렬, 필터, 페이지네이션)

### Phase 5: AI 챗봇 (5~7일)

- [ ] Anthropic SDK 통합, SSE 스트리밍 엔드포인트
- [ ] 시스템 프롬프트 빌더 (스키마 동적 주입)
- [ ] Tool Use 프레임워크 (플러그인 패턴)
- [ ] 24개+ 도구 구현 (원본 도구 마이그레이션)
- [ ] 자동 연속 생성 (max_tokens 초과 시)
- [ ] 채팅 UI 컴포넌트 (메시지, 카드, 진행 상태)
- [ ] 채팅 세션 저장/이력 관리

### Phase 6: 외부 연동 (3~5일)

- [ ] Jira Cloud API 클라이언트 (JQL 검색, 이슈 CRUD)
- [ ] Confluence API 클라이언트 (CQL 검색, 페이지 조회)
- [ ] C# 코드 검색 + 가이드 서비스
- [ ] Knowledge Base CRUD

### Phase 7: 3D 뷰어 (3~5일)

- [ ] React Three Fiber 기반 FBX 뷰어
- [ ] Unity Scene YAML 파서 (서버)
- [ ] Scene 뷰어 (다중 FBX + Transform)
- [ ] Prefab 뷰어
- [ ] 텍스처 로딩 + T_ 프리픽스 매칭
- [ ] 좌표계 변환 (Unity LH → Three.js RH)

### Phase 8: 문서 출판 (2~3일)

- [ ] 아티팩트 CRUD API + SQLite 저장
- [ ] 폴더 관리 (트리 구조)
- [ ] HTML 빌더 (인터랙티브 테이블, 차트, ERD 임베드)
- [ ] 출판된 문서 뷰어 (public URL)
- [ ] Explore 페이지 (아티팩트 탐색/검색)

### Phase 9: Slack 봇 (3~5일)

- [ ] `@slack/bolt` Socket Mode 설정
- [ ] 서버 API SSE 클라이언트 구현
- [ ] Markdown → Slack mrkdwn 변환기
- [ ] 아티팩트 자동 출판 로직 (3단계 조건)
- [ ] 진행 상황 실시간 표시
- [ ] 쓰레드 컨텍스트 관리
- [ ] Home Tab 대시보드

### Phase 10: 품질 & 마무리 (3~5일)

- [ ] Vitest 유닛 테스트 (서비스 레이어)
- [ ] Playwright E2E 테스트 (핵심 플로우)
- [ ] 에러 핸들링 통합 (커스텀 에러 클래스 + 글로벌 핸들러)
- [ ] API 문서 자동 생성 (Swagger UI)
- [ ] 배포 가이드 작성
- [ ] Docker 이미지 최적화

---

## 9. 핵심 개선 사항 상세

### 9.1 도구 플러그인 시스템

원본의 `toolExecutor`는 거대한 switch 문. v2에서는 자동 등록 패턴 적용:

```typescript
// apps/server/src/services/chat/toolExecutor.ts

interface ToolPlugin {
  name: string;
  description: string;
  inputSchema: ZodSchema;
  execute(input: unknown, context: ToolContext): Promise<string>;
}

// 자동 등록: services/chat/tools/ 폴더의 모든 파일을 스캔
const tools = new Map<string, ToolPlugin>();

export function registerTool(plugin: ToolPlugin) {
  tools.set(plugin.name, plugin);
}

export async function executeTool(name: string, input: unknown, ctx: ToolContext) {
  const tool = tools.get(name);
  if (!tool) throw new ToolNotFoundError(name);
  const validated = tool.inputSchema.parse(input);
  return tool.execute(validated, ctx);
}
```

### 9.2 에러 처리 체계

```typescript
// apps/server/src/utils/errors.ts

class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public recoverable: boolean = true,
  ) { super(message); }
}

class ValidationError extends AppError { /* 400 */ }
class AuthError extends AppError { /* 401 */ }
class NotFoundError extends AppError { /* 404 */ }
class RateLimitError extends AppError { /* 429 */ }
class ExternalServiceError extends AppError { /* 502 */ }
```

### 9.3 동시 요청 제어 (미들웨어)

원본의 세션별 잠금을 Fastify 훅으로 분리:

```typescript
// apps/server/src/plugins/concurrency.ts

const activeRequests = new Map<string, number>();
const ZOMBIE_TIMEOUT = 5 * 60 * 1000;

fastify.addHook('preHandler', async (request, reply) => {
  const sessionId = request.headers['x-session-id'] as string;
  if (!sessionId) return;
  
  const ts = activeRequests.get(sessionId);
  if (ts && Date.now() - ts < ZOMBIE_TIMEOUT) {
    reply.status(429).send({ error: '이전 요청 처리 중', recoverable: true });
    return;
  }
  activeRequests.set(sessionId, Date.now());
});

fastify.addHook('onResponse', async (request) => {
  const sessionId = request.headers['x-session-id'] as string;
  if (sessionId) activeRequests.delete(sessionId);
});
```

### 9.4 환경 변수 타입 안전 관리

```typescript
// apps/server/src/config.ts
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  CLAUDE_API_KEY: z.string().min(1),
  CLAUDE_MODEL: z.string().default('claude-sonnet-4-20250514'),

  GITLAB_REPO_URL: z.string().url(),
  GITLAB_TOKEN: z.string().min(1),
  GITLAB_REPO2_URL: z.string().url().optional(),
  GITLAB_REPO2_TOKEN: z.string().optional(),

  JIRA_BASE_URL: z.string().url().optional(),
  CONFLUENCE_BASE_URL: z.string().url().optional(),
  JIRA_USER_EMAIL: z.string().email().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  JIRA_DEFAULT_PROJECT: z.string().default('AEGIS'),

  SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),

  DB_PATH: z.string().default('./data/datamaster.db'),
});

export const config = envSchema.parse(process.env);
export type Config = z.infer<typeof envSchema>;
```

---

## 10. 원본에서 가져올 것 vs 새로 작성할 것

### 10.1 그대로 재사용 (로직 이식)

| 항목 | 원본 위치 | 이유 |
|------|-----------|------|
| DBML 파싱 로직 | `core/parser/` | `@dbml/core` 활용, 안정적 |
| 엑셀→DBML 변환 | `excelToDbml.ts` | 도메인 특화 변환 로직 |
| alasql 예약어 매핑 | `chatEngine.ts` 내부 | 게임 데이터 특화 |
| Unity Scene YAML 파싱 | `vite-git-plugin.ts` 내부 | 복잡한 파싱 로직 |
| Claude 시스템 프롬프트 | `chatEngine.ts` 내부 | 축적된 도메인 지식 |
| 아티팩트 출판 조건 로직 | `slack-bot.cjs` | 잘 다듬어진 3단계 판별 |
| Markdown→Slack 변환 | `slack-bot.cjs` | 서식 변환 노하우 |

### 10.2 새로 작성

| 항목 | 이유 |
|------|------|
| 전체 프로젝트 구조 | 모노레포, 프론트/백 분리 |
| 백엔드 서버 | Vite 미들웨어 → 독립 Fastify |
| DB 레이어 | JSON 파일 → SQLite + Drizzle |
| 인증/인가 | 원본 미구현 |
| API 라우팅 | 단일 파일 → 기능별 분리 |
| ERD 캔버스 | Dagre 직접 → React Flow |
| 3D 뷰어 | Three.js 직접 → R3F 래퍼 |
| 테스트 코드 | 원본 전무 |
| CI/CD 파이프라인 | 원본 전무 |
| 에러 핸들링 | 원본 ad-hoc |

---

## 11. 환경 설정 체크리스트

### 11.1 개발 환경 사전 준비

```
[필수]
□ Node.js 22 LTS
□ pnpm 9+
□ Git 2.40+
□ Docker Desktop (선택이나 권장)

[API 키/토큰]
□ Claude API Key (Anthropic Console)
□ GitLab Personal Access Token (aegisdata, aegis 접근)
□ Jira/Confluence API Token (Atlassian ID)
□ Slack Bot Token + App Token (Socket Mode)

[로컬 경로]
□ Unity 프로젝트 경로 (에셋 동기화용)
□ C# 소스코드 경로 (코드 검색용)
```

### 11.2 .env.example 템플릿

```env
# === Server ===
PORT=3001
NODE_ENV=development

# === AI ===
CLAUDE_API_KEY=sk-ant-api03-...
CLAUDE_MODEL=claude-sonnet-4-20250514

# === Git (Primary: Game Data) ===
GITLAB_REPO_URL=http://example.com/data.git
GITLAB_TOKEN=glpat-...

# === Git (Secondary: Game Code) ===
GITLAB_REPO2_URL=http://example.com/code.git
GITLAB_REPO2_TOKEN=glpat-...

# === Jira ===
JIRA_BASE_URL=https://your-jira.atlassian.net
JIRA_USER_EMAIL=you@company.com
JIRA_API_TOKEN=ATATT3x...
JIRA_DEFAULT_PROJECT=PROJ

# === Confluence ===
CONFLUENCE_BASE_URL=https://your-confluence.atlassian.net
CONFLUENCE_USER_EMAIL=you@company.com
CONFLUENCE_API_TOKEN=ATATT3x...

# === Slack ===
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...

# === Paths ===
UNITY_PROJECT_PATH=C:/UnityProject
CS_SOURCE_PATH=C:/UnityProject/Assets/Scripts
DB_PATH=./data/datamaster.db
```

---

## 12. 품질 기준

| 항목 | 기준 |
|------|------|
| 단일 파일 최대 줄수 | **300줄** (원본 최대 9,010줄) |
| 컴포넌트 최대 줄수 | **200줄** |
| 함수 최대 줄수 | **50줄** |
| 테스트 커버리지 | 서비스 레이어 **80%+** |
| TypeScript strict | **true** |
| 린트 경고 | **0** |
| API 응답 시간 | P95 **< 500ms** (AI 제외) |
| 번들 사이즈 | 초기 로드 **< 500KB** gzip (코드 스플리팅 후) |

---

## 13. 알려진 함정 & 회피 전략

원본 개발 과정에서 발견된 이슈들의 사전 대응:

| 함정 | 원본 경험 | v2 대응 |
|------|-----------|---------|
| alasql 예약어 충돌 | `Enum`, `Index`, `Key` 등 → 쿼리 파싱 에러 | 공유 패키지에 매핑 테이블 중앙 관리 |
| Unity Scene 파싱 | fileID 음수, 좌표계 LH→RH 변환 | 전용 파서 모듈 + 유닛 테스트 |
| Jira Search API | `/rest/api/3/search` deprecated | `/rest/api/3/search/jql` 사용 |
| JQL project 필터 | 없으면 서버 거부 | 자동 주입 미들웨어 |
| Confluence URL 구성 | Jira/Confluence Base URL 상이 | 별도 환경 변수 |
| Three.js Deprecation | `Clock`, `PCFSoftShadowMap` 경고 | 최신 API 사용, deprecation 경고 0 |
| Claude max_tokens 잘림 | 긴 아티팩트 불완전 | 동적 토큰 + 자동 연속 생성 |
| Slack 이벤트 중복 | Socket Mode 재연결 시 중복 수신 | ts 기반 dedup + 쓰레드 잠금 |
| fetch/EventSource 프록시 | base path 불일치 | 표준 상대 경로, API 클라이언트 추상화 |
| T_ 텍스처 프리픽스 | `SafetyZone.png` → `T_SafetyZone.png` | 퍼지 검색 + 패턴 매칭 유틸 |
| 웰컴 화면 클릭 차단 | fixed overlay가 이벤트 가로챔 | `pointer-events-none/auto` 패턴 적용 |

---

## 14. 즉시 시작 명령어

```powershell
# 1. 프로젝트 초기화
cd C:\DataMaster_2
pnpm init
pnpm add -Dw turborepo

# 2. 워크스페이스 생성
mkdir -p packages/shared/src apps/web apps/server apps/slack-bot

# 3. 개별 앱 초기화
cd apps/web && pnpm create vite . --template react-ts && cd ../..
cd apps/server && pnpm init && cd ../..
cd apps/slack-bot && pnpm init && cd ../..

# 4. 공통 의존성 설치
pnpm add -w typescript
pnpm add --filter @datamaster/shared zod
pnpm add --filter @datamaster/web react react-dom zustand @monaco-editor/react tailwindcss
pnpm add --filter @datamaster/server fastify @fastify/cors drizzle-orm better-sqlite3 @anthropic-ai/sdk
pnpm add --filter @datamaster/slack-bot @slack/bolt
```

---

> **Phase 0~5 구현 완료 (2026-04-06)**
> DB는 `better-sqlite3` 네이티브 빌드 이슈로 JSON 파일 기반 스토리지로 대체.
> 이후 Phase 6~10은 점진적으로 추가 예정.

---

## 15. 설계 원칙 (유저 피드백 반영)

> **2026-04-06 추가** — 아래 원칙은 모든 기능 구현 시 반드시 준수합니다.

### 디자인 / UI
- **모바일 뷰 우선 검증**: 모든 UI 변경 시 모바일(< 768px) 레이아웃을 먼저 확인
- **Notion / Linear 수준 완성도**: 넓은 여백, 서브틀한 색상, 부드러운 트랜지션
- **디자인 시스템 준수**: `index.css` `@theme` 토큰을 사용하고 하드코딩 금지
- **최소 터치 타겟 44px**: `pointer: coarse` 환경에서 자동 적용

### 반응형 정책
- Desktop (≥ 768px): 좌측 사이드바 240px + 콘텐츠
- Mobile (< 768px): 콘텐츠 전체화면 + 하단 탭 바 56px
- 새 페이지/기능 추가 시 반드시 양쪽 레이아웃 모두 구현

### LLM Wiki 패턴
- Karpathy의 Wiki 패턴 적용: 챗봇이 대화 중 지식을 마크다운 위키에 영구 축적
- `[[wikilink]]` 표준, YAML frontmatter, Obsidian vault 호환
- `data/wiki/` 디렉토리에 entities / concepts / analysis / guides 카테고리
- BM25 텍스트 검색, 자동 index.md / log.md 유지
