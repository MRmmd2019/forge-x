# AutoForge - Autonomous Cloudflare Workers Bundler
### Zero-Config Self-Healing Compiler & Packaging Workbench for Edge Cloud Applications

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-workerd-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Next.js 15](https://img.shields.io/badge/Next.js-15_App_Router-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![esbuild](https://img.shields.io/badge/esbuild-0.28-FFCF00?logo=esbuild&logoColor=black)](https://esbuild.github.io/)
[![Persian Documentation](https://img.shields.io/badge/مستندات-فارسی-green)](README.fa.md)

[ **🇮🇷 برای مطالعه مستندات کامل به زبان فارسی، فایل `README.fa.md` را مشاهده فرمایید.** ](README.fa.md)

---

## Table of Contents
- [Executive Overview](#executive-overview)
- [Key Architectural Highlights](#key-architectural-highlights)
- [Autonomous Self-Healing Repair Engine](#autonomous-self-healing-repair-engine)
- [Smart Asset Filtering & Sanitization](#smart-asset-filtering--sanitization)
- [Cloudflare Workers Node.js Runtime Support](#cloudflare-workers-nodejs-runtime-support)
- [11-Stage End-to-End Build Pipeline](#11-stage-end-to-end-build-pipeline)
- [Web UI & Streaming Architecture](#web-ui--streaming-architecture)
- [HTTP API Reference](#http-api-reference)
- [Deploying to Cloudflare Workers](#deploying-to-cloudflare-workers)
- [Troubleshooting & Common Edge Scenarios](#troubleshooting--common-edge-scenarios)
- [Local Development & Hardening Tests](#local-development--hardening-tests)
- [Repository Structure](#repository-structure)

---

## Executive Overview

Cloudflare Workers operates on V8 isolates via `workerd`, requiring an idiomatic ES Module bundle (`export default { fetch }`) without native file-system bindings. When deploying multi-file projects, static web frontends, or mixed Node.js microservices, developers face complex bundler configurations, asset routing difficulties, broken relative imports, and runtime incompatibilities.

**AutoForge** is an autonomous, zero-config build engine and developer workbench. It ingests uncompiled web projects (TypeScript, JavaScript, static HTML/CSS, images, fonts, and API routes), analyzes module graphs, repairs broken references on the fly, embeds assets losslessly with virtual routing, and compiles everything into a **single, production-ready, zero-dependency `worker.js` file**.

---

## Key Architectural Highlights

* 🚀 **Zero-Config Architecture:** Automatically infers entry points, project archetypes (`worker_native`, `static_with_assets`, `hybrid_api_and_assets`), and framework adapters without requiring manual `wrangler.toml` or bundler config files.
* 🛡️ **Deterministic Self-Healing Loop:** Automatically intercepts build failures (such as missing relative paths like `./router.ts` vs `./core/router`, missing `nodejs_compat` flags, or unsupported external packages), fixes source code in memory, and re-runs compilation across up to 5 attempts.
* 📦 **Lossless Asset Embedding & Virtual Router:** Packages web assets (HTML, CSS, images, fonts) into an in-memory virtual routing table featuring SHA-256 ETag negotiation, HTTP 304 Not Modified caching, and SPA fallback routing.
* 🧹 **Smart Asset Filtering:** Intelligently ignores repository clutter (e.g. `.github/`, `.git/`, `.vscode/`, `node_modules/`, `package-lock.json`, documentation, and raw TS files) preventing bundle bloat.
* ⚡ **Lightning-Fast In-Memory esbuild:** Compiles modern ES2022 code in milliseconds without polluting disk storage.
* 🔬 **Pre-Flight Verification via Wrangler CLI & Smoke Tests:** Validates every generated bundle against an isolated `wrangler deploy --dry-run` sandbox and dispatches synthetic HTTP requests against runtime worker endpoints.
* 📡 **Live SSE Streaming UI:** Next.js 15 App Router interface with real-time Server-Sent Events, project structure tree, bundle diagnostics, code inspection modal, and live preview.

---

## Autonomous Self-Healing Repair Engine

Unlike conventional bundlers that fail immediately upon encountering an unresolved import or syntax variance, AutoForge integrates a multi-layered diagnostic and repair loop:

```
                      ┌───────────────────────────────┐
                      │      esbuild Compilation      │
                      └───────────────┬───────────────┘
                                      │
                         [Compilation Error Detected]
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │    Error Normalizer & AST     │
                      │ Extracts target, path & cause │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │  Deterministic Repair Engine  │
                      ├───────────────────────────────┤
                      │ • Recursive path reconciliation│
                      │ • Corrects faulty relative imports│
                      │ • Injects 'nodejs_compat' flag│
                      │ • Externals problematic deps  │
                      └───────────────┬───────────────┘
                                      │
                                      ▼
                      ┌───────────────────────────────┐
                      │ Retry Loop (Attempts 2..5)    │
                      │ Recompiles with auto-healed   │
                      │ code to produce clean output  │
                      └───────────────────────────────┘
```

### Real-World Example
If a project includes broken relative imports:
```typescript
import { Router } from "./router.ts";
import { jsonResponse } from "./response.ts";
```
When these files actually reside in `src/worker/core/router.ts` and `src/worker/core/response.ts`, the engine intercepts the esbuild error on **Attempt 1**, searches the project tree, rewrites the import paths:
```typescript
import { Router } from "./core/router";
import { jsonResponse } from "./core/response";
```
and completes the build cleanly on **Attempt 2** with 100% Wrangler dry-run validation!

---

## Smart Asset Filtering & Sanitization

To keep `worker.js` strictly under Cloudflare's 64 MiB limit and prevent sensitive configuration leakage, files are filtered at entry and embed time:

| Category | File Examples | Handling Policy |
| :--- | :--- | :--- |
| **VCS & CI/CD** | `.git/`, `.github/`, `.gitlab/` | Sanitized during intake; never unpacked to disk |
| **IDE & Package Caches** | `.vscode/`, `.idea/`, `node_modules/`, `.cache/` | Stripped completely from workspace |
| **Package Locks** | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | Preserved for dependency resolution, excluded from asset table |
| **Documentation & Licenses** | `README.md`, `LICENSE`, `CHANGELOG.md` | Excluded from web routes to prevent clutter |
| **Raw TypeScript Files** | `*.ts`, `*.tsx`, `*.mts` | Compiled by esbuild; raw files excluded from static download routes |
| **Web Assets & Media** | `index.html`, `style.css`, `.png`, `.svg`, `.woff2` | Base64/UTF-8 encoded into `__ASSETS__` table with ETag caching |

---

## Cloudflare Workers Node.js Runtime Support

Under Cloudflare Workers' `compatibility_flags = ["nodejs_compat"]`, Node.js APIs operate directly within V8:

* **Native Modules Supported:** `node:crypto`, `node:buffer`, `node:events`, `node:util`, `node:stream`, `node:path`, `node:async_hooks`, `node:assert`.
* **Dynamic Require Edge Guard:** In the `workerd` edge isolate, `import.meta.url` can be `undefined`, causing `createRequire(import.meta.url)` to trigger fatal crashes. AutoForge injects a safe edge banner:

```javascript
import { createRequire as __createRequire__ } from 'node:module';
var require;
try {
  var __cf_meta_url__ = (typeof import.meta !== 'undefined' && import.meta && typeof import.meta.url === 'string' && import.meta.url) || 'file:///worker.js';
  require = __createRequire__(__cf_meta_url__);
} catch {
  require = function(mod) { 
    throw new Error('Dynamic require of "' + mod + '" is not supported in this runtime isolate.'); 
  };
}
```

---

## 11-Stage End-to-End Build Pipeline

```
[1. Isolated Workspace] ──► [2. Project Scanner] ──► [3. Static Analysis]
                                                               │
[6. esbuild Compilation] ◄── [5. Plan Validation] ◄── [4. Planner (Deterministic/AI)]
         │
    [Failed?] ──► Yes ──► [7. Self-Healing Repair Loop] ──► (Retry at Stage 6)
         │
         ▼ No
[8. Asset Embedder] ──► [9. Worker Generator] ──► [10. Bundle Inspector]
                                                           │
                                                           ▼
                                    [11. Wrangler Dry-Run & Runtime Smoke Tests]
                                                           │
                                                           ▼
                                                [Production worker.js]
```

1. **Workspace Intake:** Extracts uploaded files or ZIP archives with active Zip-Slip & Zip-Bomb defenses.
2. **Scanner:** Classifies files into source, web assets, configuration, and documentation.
3. **Static Analysis:** Detects exported fetch handlers, routing paradigms, and Node.js APIs.
4. **Planner:** Generates a deterministic build plan (or leverages Gemini AI when module structure is ambiguous).
5. **Plan Validation:** Checks file existence, target flags, and security rules before execution.
6. **esbuild Compilation:** Compiles TypeScript and JavaScript into standard ES modules.
7. **Deterministic Repair Loop:** Diagnoses and automatically heals build errors across up to 5 iterations.
8. **Asset Embedding:** Encodes eligible static files and builds the virtual route table with ETag support.
9. **Worker Generation:** Integrates the compiled bundle with the virtual router, SPA fallback, and security headers.
10. **Bundle Inspector:** Verifies health metrics and guarantees output is below Cloudflare size thresholds.
11. **Wrangler Validation & Smoke Tests:** Executes `wrangler deploy --dry-run` and synthetic HTTP tests in isolated sandboxes.

---

## Web UI & Streaming Architecture

The web application is built on **Next.js 15 (App Router)** and **Tailwind CSS**, providing a developer-first cockpit:
- **Intake Area:** Supports drag-and-drop of `.zip` files or direct folder uploads.
- **Project Structure Tree:** Interactive hierarchical file tree with file size metrics and type badges.
- **Build Progress Stream:** Real-time visual timeline connected via Server-Sent Events (`/api/build?stream=true`).
- **Code Viewer Modal:** Tabbed source viewer with syntax highlighting and quick copy/download of `worker.js`.
- **Diagnostics & Health Card:** Detailed breakdown of asset count, gzip estimates, and Wrangler dry-run logs.

---

## HTTP API Reference

For CI/CD pipelines and programmatic automation:

### Build Endpoint (SSE Streaming)
```http
POST /api/build?stream=true HTTP/1.1
Content-Type: multipart/form-data

Form Data:
  zipFile: <project.zip binary>
  projectName: "my-service"
  options: {"minify": true, "target": "es2022", "assetStrategy": "inline_bytes"}
```

**Streamed Response (text/event-stream):**
```json
data: {"type":"progress","data":{"step":"building","message":"Compiling JS/TS with esbuild..."}}

data: {"type":"result","data":{"success":true,"workerJsCode":"...","durationMs":1450}}
```

---

## Deploying to Cloudflare Workers

### Method 1: Cloudflare Dashboard (Quickest)
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com/) and navigate to **Workers & Pages**.
2. Click **Create Worker** and click **Deploy**.
3. In the worker management view, click **Edit Code**.
4. Paste the generated `worker.js` contents into the editor and click **Save and Deploy**.

### Method 2: Wrangler CLI
```bash
mkdir deploy && cd deploy
cp /path/to/worker.js ./index.js

cat << 'EOF' > wrangler.jsonc
{
  "name": "my-worker",
  "main": "index.js",
  "compatibility_date": "2024-09-23",
  "compatibility_flags": ["nodejs_compat"]
}
EOF

npx wrangler deploy
```

---

## Troubleshooting & Common Edge Scenarios

### Error 1003: Direct IP access not allowed
* **Cause:** Sending an HTTP request directly to a Cloudflare IP address rather than using a domain hostname.
* **Resolution:** In browser navigation, use the assigned `*.workers.dev` domain or your custom domain. In VPN/proxy client applications (e.g. V2Ray, Nekobox), ensure both the **Host** and **SNI** fields are set to your worker domain.

### Uncaught TypeError: The argument 'path' must be a file URL object
* **Cause:** `createRequire(import.meta.url)` failing in V8 edge environments where `import.meta.url` is `undefined`.
* **Resolution:** Already automatically prevented by AutoForge's built-in Edge Node Banner.

---

## Local Development & Hardening Tests

```bash
# Install dependencies
npm install

# Launch Next.js 15 development server
npm run dev

# Run the 22-scenario comprehensive hardening & security audit
npm run test

# Type-check codebase
npm run typecheck

# Lint project
npm run lint
```

---

## Repository Structure

```
├── app/                        # Next.js 15 App Router
│   ├── api/build/route.ts      # Streaming build pipeline API controller
│   ├── api/preview/route.ts    # In-browser worker preview sandbox
│   └── page.tsx                # Main workbench interface
├── components/                 # Tailwind UI components
│   ├── BuildProgressStream.tsx # Real-time SSE progress visualizer
│   ├── CodeViewerModal.tsx     # Output worker.js viewer & downloader
│   └── ProjectTreePreview.tsx  # Interactive project file explorer
├── server/                     # Core Bundler Engine
│   ├── pipeline.ts             # 11-stage pipeline orchestrator
│   ├── workspace/              # Safe temp workspace & Zip extraction
│   ├── scanner/                # Archetype and entry point detection
│   ├── analyzer/               # Static AST and regex analysis
│   ├── planner/                # Deterministic & Gemini AI planner
│   ├── builder/                # esbuild runner with Cloudflare plugins
│   ├── repair/                 # Deterministic self-healing repair loop
│   ├── assets/                 # Smart asset filtering & embedding
│   ├── worker/                 # Single-file worker.js generator
│   ├── wrangler/               # Isolated Wrangler dry-run validation
│   └── smoke/                  # Runtime smoke testing sub-processes
├── scripts/                    # Audit & benchmark runners
└── types/                      # TypeScript domain definitions
```

---

**Crafted with engineering precision for modern Cloudflare Workers deployments.**
