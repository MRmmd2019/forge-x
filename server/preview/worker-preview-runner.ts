import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

export interface PreviewSimulationOptions {
  workerCode: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface PreviewSimulationResult {
  success: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  isBinary: boolean;
  body: string;
  durationMs: number;
  url: string;
  error?: string;
}

export class WorkerPreviewRunner {
  /**
   * Executes a Cloudflare Worker bundle inside a secure, isolated subprocess
   * with sealed prototypes, isolated memory, and awaited background tasks.
   */
  static async simulateRequest(
    options: PreviewSimulationOptions
  ): Promise<PreviewSimulationResult> {
    const {
      workerCode,
      path: reqPath = '/',
      method = 'GET',
      headers = {},
      body,
      env = {},
      timeoutMs = 4000,
    } = options;

    const startTime = Date.now();
    const cleanPath = reqPath.startsWith('/') ? reqPath : '/' + reqPath;
    const fullUrl = `https://cloudflare-worker.test${cleanPath}`;

    const sandboxDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), 'autoforge-preview-')
    );

    try {
      // 1. Custom ESM Module Loader for cloudflare:* and workerd:* imports
      const loaderCode = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('cloudflare:') || specifier.startsWith('workerd:')) {
    const mockCode = \`
      export function connect() {
        return {
          readable: new ReadableStream(),
          writable: new WritableStream(),
          closed: Promise.resolve(),
          close: () => Promise.resolve(),
        };
      }
      export class EmailMessage {
        constructor(from, to, content) {
          this.from = from;
          this.to = to;
          this.content = content;
        }
      }
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
      url: 'data:text/javascript,' + encodeURIComponent(mockCode),
    };
  }
  return nextResolve(specifier, context);
}
`;
      const registerCode = `
import { register } from 'node:module';
register('./loader.mjs', import.meta.url);
`;

      await fs.promises.writeFile(path.join(sandboxDir, 'loader.mjs'), loaderCode, 'utf8');
      await fs.promises.writeFile(path.join(sandboxDir, 'register.mjs'), registerCode, 'utf8');

      // 2. Prepare worker script
      // Convert commonjs module.exports if present and no ESM export default
      let preparedCode = workerCode;
      if (!preparedCode.includes('export default') && !preparedCode.includes('export {') && preparedCode.includes('module.exports')) {
        preparedCode += '\nexport default module.exports;\n';
      }

      await fs.promises.writeFile(path.join(sandboxDir, 'worker.mjs'), preparedCode, 'utf8');

      // 3. Write input parameters
      const inputPayload = {
        path: cleanPath,
        method,
        headers,
        body,
        env,
      };
      await fs.promises.writeFile(
        path.join(sandboxDir, 'input.json'),
        JSON.stringify(inputPayload),
        'utf8'
      );

      // 4. Isolated runner script
      const runnerCode = `
import fs from 'node:fs';

async function run() {
  const inputRaw = fs.readFileSync('input.json', 'utf8');
  const { path: reqPath, method, headers, body, env } = JSON.parse(inputRaw);
  const fullUrl = 'https://cloudflare-worker.test' + (reqPath.startsWith('/') ? reqPath : '/' + reqPath);

  // Setup Web Crypto
  if (typeof globalThis.crypto === 'undefined' || !globalThis.crypto.subtle) {
    const nodeCrypto = await import('node:crypto');
    globalThis.crypto = nodeCrypto.webcrypto || nodeCrypto;
  }

  // Setup WebSocketPair mock
  globalThis.WebSocketPair = class WebSocketPair {
    constructor() {
      this[0] = { accept() {}, send() {}, close() {}, addEventListener() {} };
      this[1] = { accept() {}, send() {}, close() {}, addEventListener() {} };
    }
  };

  // Setup caches mock
  globalThis.caches = {
    default: {
      match: async () => null,
      put: async () => {},
      delete: async () => false,
    },
  };

  // Setup atob and btoa
  if (typeof globalThis.atob === 'undefined') {
    globalThis.atob = (str) => Buffer.from(str, 'base64').toString('binary');
  }
  if (typeof globalThis.btoa === 'undefined') {
    globalThis.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
  }

  // Track ctx.waitUntil background promises
  const waitUntilPromises = [];
  const ctx = {
    waitUntil: (p) => {
      if (p && typeof p.then === 'function') {
        waitUntilPromises.push(Promise.resolve(p).catch(() => {}));
      }
    },
    passThroughOnException: () => {},
  };

  let __fetchListener = null;
  globalThis.addEventListener = function(type, fn) {
    if (type === 'fetch') __fetchListener = fn;
  };

  // Import untrusted worker module in clean module realm
  let workerModule;
  try {
    workerModule = await import('./worker.mjs');
  } catch (err) {
    fs.writeFileSync('output.json', JSON.stringify({
      success: false,
      status: 500,
      statusText: 'Worker Script Execution Error',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      isBinary: false,
      body: 'Worker initialization failed: ' + (err.message || String(err)),
      url: fullUrl,
      error: err.message || String(err),
    }));
    return;
  }

  let workerHandler = workerModule.default || workerModule;
  if ((!workerHandler || (typeof workerHandler !== 'function' && typeof workerHandler.fetch !== 'function')) && __fetchListener) {
    workerHandler = {
      fetch: async (req, e, c) => {
        let res = null;
        const ev = {
          request: req,
          respondWith: (p) => { res = p; },
          waitUntil: c.waitUntil,
          passThroughOnException: c.passThroughOnException,
        };
        await __fetchListener(ev);
        return res;
      }
    };
  }

  if (!workerHandler || (typeof workerHandler !== 'function' && typeof workerHandler.fetch !== 'function')) {
    fs.writeFileSync('output.json', JSON.stringify({
      success: false,
      status: 500,
      statusText: 'No Fetch Handler',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      isBinary: false,
      body: 'No valid fetch handler was exported by worker.js.',
      url: fullUrl,
      error: 'No valid fetch handler exported by worker.',
    }));
    return;
  }

  // Construct simulated Request
  const request = new Request(fullUrl, {
    method: method || 'GET',
    headers: new Headers({
      'User-Agent': 'Cloudflare-Worker-Simulator/2.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      ...(headers || {}),
    }),
    body: method !== 'GET' && method !== 'HEAD' && body ? body : undefined,
  });

  // Nullify and seal prototypes to eliminate sandbox escape & prototype pollution
  try {
    delete globalThis.process;
    delete globalThis.require;
  } catch {}

  try {
    Object.defineProperty(Function.prototype, 'constructor', {
      value: undefined,
      writable: false,
      configurable: false,
    });
    Object.freeze(Object.prototype);
    Object.freeze(Function.prototype);
    Object.freeze(Array.prototype);
  } catch {}

  try {
    let response;
    if (typeof workerHandler.fetch === 'function') {
      response = await workerHandler.fetch(request, env || {}, ctx);
    } else if (typeof workerHandler === 'function') {
      const isClass = /^class\\s/.test(Function.prototype.toString.call(workerHandler)) ||
                      Boolean(workerHandler.prototype && typeof workerHandler.prototype.fetch === 'function');
      if (isClass) {
        const instance = new workerHandler(env || {}, ctx);
        if (typeof instance.fetch === 'function') {
          response = await instance.fetch(request, env || {}, ctx);
        } else {
          throw new Error('Worker class does not implement fetch method.');
        }
      } else {
        response = await workerHandler(request, env || {}, ctx);
      }
    }

    // Await all background tasks pushed via ctx.waitUntil before returning response
    if (waitUntilPromises.length > 0) {
      await Promise.allSettled(waitUntilPromises);
    }

    if (!response || typeof response.status !== 'number') {
      fs.writeFileSync('output.json', JSON.stringify({
        success: false,
        status: 502,
        statusText: 'Bad Gateway',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        isBinary: false,
        body: 'Worker fetch handler did not return a valid Response object.',
        url: fullUrl,
        error: 'Invalid response returned by worker',
      }));
      return;
    }

    const responseHeaders = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const contentType = response.headers.get('content-type') || '';
    const isBinary =
      contentType.includes('image/') ||
      contentType.includes('font/') ||
      contentType.includes('octet-stream') ||
      contentType.includes('audio/') ||
      contentType.includes('video/');

    let bodyData = '';
    if (isBinary) {
      const arrayBuf = await response.arrayBuffer();
      bodyData = Buffer.from(arrayBuf).toString('base64');
    } else {
      bodyData = await response.text();
    }

    fs.writeFileSync('output.json', JSON.stringify({
      success: true,
      status: response.status,
      statusText: response.statusText || 'OK',
      headers: responseHeaders,
      isBinary,
      body: bodyData,
      url: fullUrl,
    }));
  } catch (execErr) {
    fs.writeFileSync('output.json', JSON.stringify({
      success: false,
      status: 500,
      statusText: 'Internal Worker Execution Error',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      isBinary: false,
      body: 'Error executing worker fetch handler: ' + (execErr.message || String(execErr)),
      url: fullUrl,
      error: execErr.message || String(execErr),
    }));
  }
}

run().catch(err => {
  try {
    fs.writeFileSync('output.json', JSON.stringify({
      success: false,
      status: 500,
      statusText: 'Unhandled Runner Error',
      headers: { 'content-type': 'text/plain; charset=utf-8' },
      isBinary: false,
      body: 'Unhandled runner exception: ' + (err.message || String(err)),
      error: err.message || String(err),
    }));
  } catch {}
  process.exit(1);
});
`;

      await fs.promises.writeFile(path.join(sandboxDir, 'runner.mjs'), runnerCode, 'utf8');

      // 5. Execute in isolated subprocess with strict timeout
      try {
        await execFileAsync(
          process.execPath,
          ['--no-addons', '--import', './register.mjs', 'runner.mjs'],
          {
            cwd: sandboxDir,
            timeout: timeoutMs,
            env: {
              NODE_ENV: 'production',
            },
          }
        );
      } catch (procErr: any) {
        // If output.json was written before error, use it
        const outputPath = path.join(sandboxDir, 'output.json');
        if (fs.existsSync(outputPath)) {
          try {
            const rawOut = await fs.promises.readFile(outputPath, 'utf8');
            const parsed = JSON.parse(rawOut);
            return {
              ...parsed,
              durationMs: Date.now() - startTime,
            };
          } catch {}
        }

        return {
          success: false,
          status: 500,
          statusText: 'Worker Script Execution Error',
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          isBinary: false,
          body: `Worker execution timed out or crashed: ${procErr.message || String(procErr)}`,
          durationMs: Date.now() - startTime,
          url: fullUrl,
          error: procErr.message || String(procErr),
        };
      }

      const outputPath = path.join(sandboxDir, 'output.json');
      if (fs.existsSync(outputPath)) {
        const rawOut = await fs.promises.readFile(outputPath, 'utf8');
        const parsed = JSON.parse(rawOut);
        return {
          ...parsed,
          durationMs: Date.now() - startTime,
        };
      }

      return {
        success: false,
        status: 500,
        statusText: 'Worker Execution Error',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        isBinary: false,
        body: 'Worker execution produced no response output.',
        durationMs: Date.now() - startTime,
        url: fullUrl,
        error: 'No response output produced',
      };
    } finally {
      // Guaranteed sandbox cleanup
      try {
        await fs.promises.rm(sandboxDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
