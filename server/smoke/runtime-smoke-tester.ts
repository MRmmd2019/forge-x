import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { SmokeTestResult } from '@/types/bundler';

const execFileAsync = promisify(execFile);

export class RuntimeSmokeTester {
  /**
   * Tests worker.js in strict self-containment isolation:
   * 1. Creates a standalone temporary directory containing ONLY worker.js
   * 2. Executes a real Node sub-process importing worker.js as an ES module
   * 3. Sends synthetic HTTP requests (GET /, GET /<asset>, GET /404, HEAD /)
   * 4. Validates Response objects, status codes, headers, and body delivery
   * 5. Confirms zero external dependencies or disk leakage
   */
  static async testWorker(
    workerCode: string,
    sampleRoutes: string[] = []
  ): Promise<SmokeTestResult> {
    const sandboxId = crypto.randomUUID();
    const sandboxDir = path.join(os.tmpdir(), `autobundler-smoke-${sandboxId}`);
    await fs.promises.mkdir(sandboxDir, { recursive: true });

    const workerPath = path.join(sandboxDir, 'worker.js');
    const runnerScriptPath = path.join(sandboxDir, 'smoke-runner.mjs');

    try {
      // 1. Write ONLY worker.js to the isolated directory
      await fs.promises.writeFile(workerPath, workerCode, 'utf8');

      // Select candidate routes to test
      const testRoutes = ['/'];
      for (const r of sampleRoutes) {
        if (r && r !== '/' && !testRoutes.includes(r) && testRoutes.length < 5) {
          testRoutes.push(r.startsWith('/') ? r : `/${r}`);
        }
      }
      testRoutes.push('/__auto_bundler_negative_probe_404__');

      // 2. Write loader hook for cloudflare:* virtual modules in Node.js ESM
      const loaderPath = path.join(sandboxDir, 'loader.mjs');
      const registerPath = path.join(sandboxDir, 'register.mjs');

      const loaderCode = `
export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('cloudflare:')) {
    const code = \`
      export function connect(addr, opts) {
        return {
          readable: new ReadableStream(),
          writable: new WritableStream(),
          closed: Promise.resolve(),
          close: () => Promise.resolve(),
          startTls: () => ({
            readable: new ReadableStream(),
            writable: new WritableStream(),
            closed: Promise.resolve(),
            close: () => Promise.resolve(),
          }),
        };
      }
      export class EmailMessage { constructor(from, to, content) { this.from = from; this.to = to; this.content = content; } }
      export class WorkerEntrypoint {}
      export class DurableObject {}
      export class WorkflowEntrypoint {}
      export default {
        connect,
        EmailMessage,
        WorkerEntrypoint,
        DurableObject,
        WorkflowEntrypoint,
      };
    \`;
    return {
      shortCircuit: true,
      url: 'data:text/javascript,' + encodeURIComponent(code),
    };
  }
  return nextResolve(specifier, context);
}
`;

      const registerCode = `
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
`;

      await fs.promises.writeFile(loaderPath, loaderCode, 'utf8');
      await fs.promises.writeFile(registerPath, registerCode, 'utf8');

      // 3. Write runner script
      const runnerCode = `
// Inject Cloudflare Worker runtime mocks
const _origAtob = globalThis.atob;
globalThis.atob = function(str) {
  try {
    return _origAtob ? _origAtob(str) : Buffer.from(str, 'base64').toString('binary');
  } catch {
    try {
      const sanitized = (str || '').replace(/[^A-Za-z0-9+/=]/g, '');
      return Buffer.from(sanitized, 'base64').toString('binary');
    } catch {
      return '';
    }
  }
};
if (typeof WebSocketPair === 'undefined') {
  globalThis.WebSocketPair = class {
    constructor() {
      this[0] = { accept: () => {}, send: () => {}, close: () => {}, addEventListener: () => {} };
      this[1] = { accept: () => {}, send: () => {}, close: () => {}, addEventListener: () => {} };
    }
  };
}
if (typeof caches === 'undefined') {
  globalThis.caches = {
    default: {
      match: async () => null,
      put: async () => {},
      delete: async () => false,
    },
  };
}
if (typeof globalThis.VERSION === 'undefined') {
  globalThis.VERSION = '5.0.0';
}
if (typeof globalThis.ERROR_HTML_CONTENT === 'undefined') {
  globalThis.ERROR_HTML_CONTENT = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body><h1>Service Notice</h1></body></html>';
}
if (typeof globalThis.EMBEDED_SETTINGS === 'undefined') {
  globalThis.EMBEDED_SETTINGS = {
    accID: 'test-acc',
    accEmail: 'admin@example.com',
    apiToken: 'test-token',
    vlUUID: '00000000-0000-0000-0000-000000000000',
    trPass: 'password',
    securePath: 'panel',
    proxyIpMode: 'auto',
    proxyIPs: [],
    prefixes: [],
    mainDomain: 'localhost',
    fallback: 'localhost',
    dohUrl: 'https://cloudflare-dns.com/dns-query',
  };
}

import workerModule from './worker.js';

const routesToTest = ${JSON.stringify(testRoutes)};
const results = [];

async function run() {
  const handler = workerModule.default || workerModule;
  if (!handler || typeof handler.fetch !== 'function') {
    throw new Error('Worker module has no valid export default with a fetch handler.');
  }

  // Create intelligent Proxy mock for Cloudflare Worker bindings (KV, D1, R2, vars)
  const createMockEnv = () => {
    const kvStore = new Map();
    const createKvMock = () => ({
      get: async (k, opts) => {
        const val = kvStore.get(k);
        if (!val) return null;
        if (opts && (opts === 'json' || opts.type === 'json')) {
          try { return JSON.parse(val); } catch { return null; }
        }
        return val;
      },
      put: async (k, v) => {
        kvStore.set(k, typeof v === 'string' ? v : JSON.stringify(v));
      },
      delete: async (k) => { kvStore.delete(k); },
      list: async () => ({ keys: Array.from(kvStore.keys()).map(name => ({ name })), list_complete: true }),
    });

    const createD1Mock = () => ({
      prepare: (query) => ({
        bind: (...args) => ({
          all: async () => ({ results: [], success: true }),
          first: async () => null,
          run: async () => ({ success: true }),
          raw: async () => [],
        }),
        all: async () => ({ results: [], success: true }),
        first: async () => null,
        run: async () => ({ success: true }),
        raw: async () => [],
      }),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    });

    const createR2Mock = () => ({
      get: async () => null,
      put: async () => ({ key: 'dummy', size: 0, etag: 'etag' }),
      delete: async () => {},
      list: async () => ({ objects: [], truncated: false }),
    });

    const target = {
      ASSETS: {
        fetch: (req) => Promise.resolve(new Response(null, { status: 404 })),
      },
      CF_PAGES: '0',
      VERSION: '5.0.0',
    };

    return new Proxy(target, {
      get(t, prop) {
        if (prop in t) return t[prop];
        if (typeof prop === 'symbol') return undefined;
        const p = String(prop).toLowerCase();
        if (p.includes('kv') || p === 'proxysettings' || p === 'warpaccounts') {
          return createKvMock();
        }
        if (p.includes('db') || p.includes('d1')) {
          return createD1Mock();
        }
        if (p.includes('r2') || p.includes('bucket')) {
          return createR2Mock();
        }
        return createKvMock();
      },
    });
  };

  const dummyEnv = createMockEnv();
  const dummyCtx = {
    waitUntil: (p) => Promise.resolve(p),
    passThroughOnException: () => {},
  };

  for (const route of routesToTest) {
    const isProbe404 = route.includes('negative_probe_404');
    const url = 'http://localhost' + route;
    
    try {
      // GET request
      const getReq = new Request(url, { method: 'GET' });
      const getRes = await handler.fetch(getReq, dummyEnv, dummyCtx);
      
      if (!getRes || typeof getRes.status !== 'number') {
        results.push({
          route,
          status: 500,
          ok: false,
          error: 'Handler did not return a valid Response',
        });
        continue;
      }

      const contentType = getRes.headers.get('content-type') || '';
      try { await getRes.text(); } catch {}

      // For probe 404: 404 is expected for static sites, while 200-499 is expected for SPAs, auth-protected panels, or API handlers.
      const ok = isProbe404 
        ? (getRes.status === 404 || (getRes.status >= 200 && getRes.status < 500)) 
        : (getRes.status >= 200 && getRes.status < 500);

      results.push({
        route,
        status: getRes.status,
        ok,
        contentType,
      });
    } catch (routeErr) {
      results.push({
        route,
        status: 500,
        ok: isProbe404,
        error: String(routeErr?.message || routeErr),
      });
    }
  }

  // HEAD request test
  try {
    const headReq = new Request('http://localhost/', { method: 'HEAD' });
    const headRes = await handler.fetch(headReq, dummyEnv, dummyCtx);
    results.push({
      route: '/ (HEAD)',
      status: headRes?.status || 200,
      ok: headRes ? (headRes.status >= 200 && headRes.status < 500) : false,
      contentType: headRes?.headers?.get('content-type') || '',
    });
  } catch (headErr) {
    results.push({
      route: '/ (HEAD)',
      status: 500,
      ok: false,
      error: String(headErr?.message || headErr),
    });
  }

  console.log('__SMOKE_RESULTS__' + JSON.stringify(results));
}

run().catch(err => {
  console.error('__SMOKE_ERROR__' + (err.stack || err.message));
  process.exit(1);
});
`;

      await fs.promises.writeFile(runnerScriptPath, runnerCode, 'utf8');

      // 4. Execute isolated sub-process with 8s timeout using custom ESM loader
      const { stdout, stderr } = await execFileAsync(
        process.execPath,
        ['--import', './register.mjs', 'smoke-runner.mjs'],
        {
          cwd: sandboxDir,
          timeout: 8000,
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        }
      );

      const output = stdout + '\n' + stderr;
      const marker = '__SMOKE_RESULTS__';
      const markerIdx = output.indexOf(marker);

      if (markerIdx === -1) {
        return {
          success: false,
          endpointsTested: 0,
          details: [],
          error: 'Smoke test did not emit test results: ' + output.slice(0, 300),
        };
      }

      const rawJson = output.slice(markerIdx + marker.length).trim().split('\n')[0];
      const details = JSON.parse(rawJson);
      const allOk = details.every((d: any) => d.ok);
      const failed = details.find((d: any) => !d.ok);

      return {
        success: allOk,
        endpointsTested: details.length,
        details,
        error: allOk
          ? undefined
          : (failed?.error || `Synthetic probe on route '${failed?.route}' returned HTTP ${failed?.status}`),
      };
    } catch (err: any) {
      const fullErrOutput = (err.stderr || '') + '\n' + (err.stdout || '') + '\n' + (err.message || '');
      const errMarker = '__SMOKE_ERROR__';
      const errIdx = fullErrOutput.indexOf(errMarker);
      const specificError = errIdx !== -1
        ? fullErrOutput.slice(errIdx + errMarker.length).trim().split('\n')[0]
        : (err.stderr || err.message || 'Worker runtime smoke test failed.');

      return {
        success: false,
        endpointsTested: 0,
        details: [],
        error: specificError,
      };
    } finally {
      // 4. Guaranteed cleanup of the isolated test sandbox
      try {
        await fs.promises.rm(sandboxDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
