import vm from 'vm';

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
   * Executes a Cloudflare Worker bundle inside a secure, locked-down isolate sandbox.
   */
  static async simulateRequest(
    options: PreviewSimulationOptions
  ): Promise<PreviewSimulationResult> {
    const {
      workerCode,
      path = '/',
      method = 'GET',
      headers = {},
      body,
      env = {},
      timeoutMs = 3000,
    } = options;

    const startTime = Date.now();
    const fullUrl = `https://cloudflare-worker.test${path.startsWith('/') ? path : '/' + path}`;

    // Clean, sandboxed global scope mimicking Cloudflare Workers runtime
    const logs: string[] = [];
    const sandbox: Record<string, any> = {
      Response,
      Request,
      Headers,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      Uint8Array,
      Uint16Array,
      Uint32Array,
      Int8Array,
      Int16Array,
      Int32Array,
      Float32Array,
      Float64Array,
      ArrayBuffer,
      DataView,
      atob: (str: string) => Buffer.from(str, 'base64').toString('binary'),
      btoa: (str: string) => Buffer.from(str, 'binary').toString('base64'),
      crypto: globalThis.crypto,
      console: {
        log: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
        error: (...args: any[]) => logs.push('[ERROR] ' + args.map(a => String(a)).join(' ')),
        warn: (...args: any[]) => logs.push('[WARN] ' + args.map(a => String(a)).join(' ')),
        info: (...args: any[]) => logs.push(args.map(a => String(a)).join(' ')),
      },
      setTimeout: (fn: any, ms: number) => setTimeout(fn, Math.min(ms, 1000)),
      clearTimeout,
      ReadableStream,
      WritableStream,
      TransformStream,
      WebSocketPair: class {
        0 = { accept: () => {}, send: () => {}, close: () => {}, addEventListener: () => {} };
        1 = { accept: () => {}, send: () => {}, close: () => {}, addEventListener: () => {} };
      },
      caches: {
        default: {
          match: async () => null,
          put: async () => {},
          delete: async () => false,
        },
      },
      // Block unsafe Node.js globals explicitly
      process: undefined,
      require: undefined,
      global: undefined,
      Buffer: undefined,
    };

    // Transform ESM exports into script-compatible assignments
    let executableCode = workerCode;

    // Transform external ESM imports (e.g. cloudflare:*, node:*) so vm.Script doesn't throw SyntaxError
    executableCode = executableCode.replace(
      /import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g,
      (_match, named) => {
        const statements = named.split(',').map((spec: string) => {
          const trimmed = spec.trim();
          if (!trimmed) return '';
          const parts = trimmed.split(/\s+as\s+/);
          const varName = (parts[1] || parts[0]).trim();
          if (varName === 'connect') {
            return `var ${varName} = function() { return { readable: new ReadableStream(), writable: new WritableStream(), closed: Promise.resolve(), close: function() {} }; };`;
          }
          return `var ${varName} = function() {};`;
        }).filter(Boolean);
        return statements.join('\n');
      }
    );
    executableCode = executableCode.replace(
      /import\s*\*\s*as\s+([a-zA-Z0-9_$]+)\s*from\s*['"][^'"]+['"];?/g,
      (_match, id) => `var ${id} = { connect: function() {} };`
    );
    executableCode = executableCode.replace(
      /import\s+([a-zA-Z0-9_$]+)\s+from\s*['"][^'"]+['"];?/g,
      (_match, id) => `var ${id} = { connect: function() {} };`
    );
    executableCode = executableCode.replace(
      /import\s+['"][^'"]+['"];?/g,
      ''
    );

    // 1. esbuild ESM export default style: export { ... as default ... };
    const namedDefaultRegex = /export\s*\{\s*([\s\S]*?)\bas\s+default\b([\s\S]*?)\};?/g;
    if (namedDefaultRegex.test(executableCode)) {
      executableCode = executableCode.replace(namedDefaultRegex, (_match, before, after) => {
        const parts = before.split(',');
        const defaultIdentifier = parts[parts.length - 1].trim();
        const otherBefore = parts.slice(0, -1).join(',').trim();
        const remainingExports = [otherBefore, after.replace(/^,/, '').trim()].filter(Boolean).join(', ');
        return `var __worker_export_default__ = ${defaultIdentifier};\n/* exports: ${remainingExports} */`;
      });
    }

    // 2. export default function name(...) or export default function(...)
    const defaultFnRegex = /export\s+default\s+function(?:\s+([a-zA-Z0-9_$]+))?\s*\(/g;
    if (defaultFnRegex.test(executableCode)) {
      executableCode = executableCode.replace(defaultFnRegex, (_match, fnName) => {
        return fnName ? `function ${fnName}(` : 'var __worker_export_default__ = function(';
      });
    }

    // 3. export default identifier;
    const defaultIdRegex = /export\s+default\s+([a-zA-Z0-9_$]+)\s*;/g;
    if (defaultIdRegex.test(executableCode)) {
      executableCode = executableCode.replace(defaultIdRegex, 'var __worker_export_default__ = $1;');
    }

    // 4. export default { ... }
    const exportDefaultRegex = /export\s+default\s+/;
    if (exportDefaultRegex.test(executableCode)) {
      executableCode = executableCode.replace(exportDefaultRegex, 'var __worker_export_default__ = ');
    } else if (!executableCode.includes('__worker_export_default__')) {
      executableCode = `var __worker_export_default__ = null;\n` + executableCode;
    }

    // 5. Strip any remaining export declarations so vm.Script doesn't throw SyntaxError: Unexpected token 'export'
    executableCode = executableCode.replace(/export\s*\{[^}]*\};?/g, '');
    executableCode = executableCode.replace(/export\s+(?:const|let|var)\s+/g, 'var ');
    executableCode = executableCode.replace(/export\s+function\s+/g, 'function ');
    executableCode = executableCode.replace(/export\s+class\s+/g, 'class ');

    // Add fetch event listener compatibility trap
    const runnerCode = `
      var __fetch_listener__ = null;
      function addEventListener(type, fn) {
        if (type === 'fetch') __fetch_listener__ = fn;
      }

      ${executableCode}

      if (typeof __worker_export_default__ !== 'undefined' && __worker_export_default__) {
        __active_handler__ = __worker_export_default__;
      } else if (typeof __fetch_listener__ === 'function') {
        __active_handler__ = {
          fetch: async (req, env, ctx) => {
            let res = null;
            const event = {
              request: req,
              respondWith: (p) => { res = p; },
              waitUntil: ctx.waitUntil,
              passThroughOnException: ctx.passThroughOnException,
            };
            await __fetch_listener__(event);
            return res;
          }
        };
      }
    `;

    const context = vm.createContext(sandbox);

    try {
      const script = new vm.Script(runnerCode, {
        filename: 'worker.js',
      });

      script.runInContext(context, {
        timeout: timeoutMs,
        displayErrors: true,
      });
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        statusText: 'Worker Script Execution Error',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        isBinary: false,
        body: `Worker initialization failed: ${err.message}`,
        durationMs: Date.now() - startTime,
        url: fullUrl,
        error: err.message,
      };
    }

    const workerHandler = context.__active_handler__;
    if (
      !workerHandler ||
      (typeof workerHandler !== 'function' && typeof workerHandler.fetch !== 'function')
    ) {
      return {
        success: false,
        status: 500,
        statusText: 'No Fetch Handler',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        isBinary: false,
        body: 'No valid fetch handler was exported by worker.js.',
        durationMs: Date.now() - startTime,
        url: fullUrl,
        error: 'No valid fetch handler exported by worker.',
      };
    }

    // Construct simulated Request
    const request = new Request(fullUrl, {
      method,
      headers: new Headers({
        'User-Agent': 'Cloudflare-Worker-Simulator/2.0',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        ...headers,
      }),
      body: method !== 'GET' && method !== 'HEAD' && body ? body : undefined,
    });

    const waitUntilPromises: Promise<any>[] = [];
    const ctx = {
      waitUntil: (p: Promise<any>) => waitUntilPromises.push(Promise.resolve(p)),
      passThroughOnException: () => {},
    };

    try {
      let response: Response;
      if (typeof workerHandler.fetch === 'function') {
        response = await workerHandler.fetch(request, env, ctx);
      } else {
        response = await workerHandler(request, env, ctx);
      }

      if (!response || typeof response.status !== 'number') {
        return {
          success: false,
          status: 502,
          statusText: 'Bad Gateway',
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          isBinary: false,
          body: 'Worker fetch handler did not return a valid Response object.',
          durationMs: Date.now() - startTime,
          url: fullUrl,
          error: 'Invalid response returned by worker',
        };
      }

      const durationMs = Date.now() - startTime;
      const responseHeaders: Record<string, string> = {};
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

      return {
        success: true,
        status: response.status,
        statusText: response.statusText || 'OK',
        headers: responseHeaders,
        isBinary,
        body: bodyData,
        durationMs,
        url: fullUrl,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 500,
        statusText: 'Internal Worker Execution Error',
        headers: { 'content-type': 'text/plain; charset=utf-8' },
        isBinary: false,
        body: `Error executing worker fetch handler: ${err.message}`,
        durationMs: Date.now() - startTime,
        url: fullUrl,
        error: err.message,
      };
    }
  }
}
