# Cloudflare Worker Build Architecture & Resilience Implementation Plan

Resolve Cloudflare Worker build and deployment failures for full-stack and complex server projects (such as Next.js applications, server route handlers, and projects with heavy Node.js or cloud dependencies like DO/R2/child_process).

## User Review & Critical Decisions

> [!IMPORTANT]
> The following decisions were confirmed during the Planning Phase:
> - **Full-Stack Bundling Strategy**: Smart adapter fallback with mock and bypass. Full-stack applications containing server-only dependencies (`next/server`, `child_process`, `jszip`, `clsx`, `tailwind-merge`) will utilize intelligent adapter shims, mock stubs, and clean Workers ES Module contracts rather than forcing unbundled external dependencies that fail in Cloudflare Workers.
> - **Smoke Test Policy**: Skip smoke test and warn when mock detected. When synthetic shims, mock environments, or untestable runtime dependencies (such as Durable Objects, R2, or platform Node modules) are detected, the pipeline automatically bypasses the strict runtime smoke test and outputs a clear, non-blocking warning.

---

## 1. Overview & Core Concept

### What It Delivers
When users upload complex web applications, full-stack frameworks (like Next.js), or repositories containing server-side tools into the bundler, the system currently:
1. Picks internal endpoints (e.g. `app/api/hardening-test/route.ts`) as the root worker entry point due to topological graph anomalies.
2. Marks unbundled Node and server packages as external modules, which Cloudflare Workers' runtime cannot resolve at runtime (`Could not resolve "next/server"`).
3. Fails or hangs during smoke tests when sandboxed isolates cannot reach mocked database bindings or external binaries.

This enhancement introduces:
- **Intelligent Framework Adapter & Shims**: A resilient Next.js/Full-stack adapter with built-in lightweight browser/Workers compatible shims for `next/server` (e.g., standard `NextResponse`, `NextRequest` mapped to native `Response` and `Request`).
- **Internal Tool & Test Entry Filtering**: Prevents test suites (`hardening-test`, `smoke-runner`, internal benchmarks) from hijacking root entry candidate status.
- **Smart Stubbing & Mock Detection in esbuild**: Resolves `child_process`, `inspector`, `tty`, and Node-exclusive modules gracefully with safe stubbed exports.
- **Adaptive Smoke Test Strategy**: Bypasses smoke test execution with a transparent advisory warning when mocks or multi-file dependencies are active, ensuring valid workers deploy immediately.

---

## 2. User Experience & Visual Design

### Key User Flows
1. **Upload & Analysis**: User uploads a ZIP file (e.g. full Next.js project or complex Node worker). The UI immediately scans files and accurately identifies the true application entry or static export root instead of internal test scripts.
2. **Build Execution & Progress**: The build timeline displays real-time stages with clear, concise Persian/English indicators:
   - Scanning & Framework Detection
   - Smart Adapter Resolution (showing detected shims)
   - esbuild Compilation with In-Memory Mocks
   - Standalone Asset Embedding & Wrangler Dry-Run
3. **Smoke Test Bypass Feedback**: If a project relies on mocked cloud bindings or external Node modules, the UI displays a clean status card:
   - Status: `آماده دپلوی (با بای‌پس هوشمند اسموک تست)`
   - Note: Explains why smoke testing was bypassed (mocked bindings detected) without failing the build.
4. **Deploy & Download**: User downloads a completely self-contained `worker.js` that deploys cleanly to Cloudflare Workers with zero unresolved dependency crashes.

---

## 3. Technical Architecture & System Blueprint

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Project Workspace (ZIP/Files)                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Static Analyzer & Entry Point Detector                   │
│  - Filter out test harnesses (app/api/hardening-test, scripts/, tests)  │
│  - Select true application entry or primary static/worker entry        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Smart Framework Adapter & Mock Resolvers                 │
│  - next/server shim (NextResponse, NextRequest -> Web Standards)       │
│  - Node built-in stubs (child_process, inspector, tty safe mocks)      │
│  - Inline workspace npm bundling & graceful shims                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               esbuild Compiler & Asset Virtual Route Table             │
│  - Self-contained single-file worker.js generation                     │
│  - Static assets embedded losslessly into memory map                   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│               Adaptive Smoke Test & Deployment Verification            │
│  - Detects active mock shims -> Auto-bypasses sandbox smoke run        │
│  - Emits non-blocking advisory diagnostic                              │
│  - Wrangler dry-run validation passes with zero external errors        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Key Product Decisions & Trade-Offs

- **Decision 1: Provide Built-in Web Standard Shims for `next/server`**
  - *Chosen Approach*: Implement an in-memory virtual plugin in `esbuild-builder.ts` that intercepts `next/server` and provides lightweight implementations of `NextResponse` (`json`, `redirect`, `rewrite`, `next`), `NextRequest`, and cookies based on the native Web Fetch API.
  - *Why*: Cloudflare Workers natively implement the Web Standards `Request` and `Response`. Route handlers using `next/server` run seamlessly without needing the full Next.js Node.js server.
- **Decision 2: Strict Exclusion of Test Suites from Entry Detector**
  - *Chosen Approach*: Add `/(?:^|\/)(?:hardening-test|test-runner|audit-runner|fixtures?|mocks?)\//i` to `NON_ENTRY_PATTERNS`.
  - *Why*: Prevents internal development tools inside the uploaded codebase from masquerading as the primary application entry point.
- **Decision 3: Node-Exclusive Module Safe Stubs**
  - *Chosen Approach*: When modules like `child_process`, `inspector`, or `tty` are imported by utility libraries, provide stubbed exports (`exec: () => {}`, `spawn: () => {}`) instead of marking them external (which triggers Cloudflare runtime unresolved dependency errors).
- **Decision 4: Auto-Bypass Smoke Test for Mocked / Heavy Dependencies**
  - *Chosen Approach*: Check whether the build required synthetic mock shims or cloud storage mocks; if so, skip the local Node smoke execution and log an informative notice.

---

## 5. Verification Plan

1. **Self-Containment Test**: Bundle the project's own repository ZIP file and verify that `worker.js` contains zero unresolvable external dependencies (`next/server`, `child_process`, etc.).
2. **Entry Selection Verification**: Confirm that `app/api/hardening-test/route.ts` is never selected as the top entry point.
3. **Wrangler Dry-Run & Smoke Test**: Run automated verification suite ensuring 100% test pass rate with accurate bypass warnings when mocks are detected.
4. **Applet Compilation**: Run `compile_applet` and `lint_applet` to guarantee complete build integrity.
