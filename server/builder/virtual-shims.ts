/**
 * Virtual Shims & Mock Stubs for Cloudflare Workers Runtime
 * 
 * Provides safe in-memory polyfills and Web Standard compliant shims for
 * server-only, Next.js, and Node.js exclusive modules that cannot run natively
 * inside Cloudflare Workers isolates (workerd).
 */

export const VIRTUAL_SHIMS: Record<string, string> = {
  'next/server': `
// Next.js Server Web Standards Shim for Cloudflare Workers
export class NextResponse extends Response {
  static json(data, init) {
    const headers = new Headers(init?.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json; charset=utf-8');
    }
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers,
    });
  }

  static redirect(url, init) {
    const status = typeof init === 'number' ? init : (init?.status || 307);
    const headers = new Headers(typeof init === 'object' && init?.headers ? init.headers : {});
    headers.set('Location', String(url));
    return new NextResponse(null, {
      ...((typeof init === 'object' && init !== null) ? init : {}),
      status,
      headers,
    });
  }

  static rewrite(destination, init) {
    const headers = new Headers(init?.headers);
    headers.set('x-middleware-rewrite', String(destination));
    return new NextResponse(null, { ...init, headers });
  }

  static next(init) {
    const headers = new Headers(init?.headers);
    headers.set('x-middleware-next', '1');
    return new NextResponse(null, { ...init, headers });
  }
}

export class NextRequest extends Request {
  constructor(input, init) {
    super(input, init);
    const urlStr = typeof input === 'string' ? input : (input?.url || 'http://localhost');
    this.nextUrl = new URL(urlStr);
    this.geo = {};
    this.ip = '127.0.0.1';
    this.cookies = {
      get: (name) => {
        const cookieHeader = this.headers.get('cookie') || '';
        const match = cookieHeader.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
        return match ? { name, value: decodeURIComponent(match[1]) } : undefined;
      },
      getAll: () => [],
      has: (name) => Boolean(this.headers.get('cookie')?.includes(name + '=')),
      set: () => {},
      delete: () => {},
    };
  }
}

export function userAgent(request) {
  const ua = request?.headers?.get?.('user-agent') || '';
  return {
    isBot: /bot|crawler|spider/i.test(ua),
    browser: { name: 'browser', version: '1.0' },
    device: { model: 'cloud', type: 'server', vendor: 'cloudflare' },
    engine: { name: 'v8', version: '1.0' },
    os: { name: 'workerd', version: '1.0' },
    cpu: { architecture: 'wasm' },
  };
}

export const userAgentFromString = userAgent;

export class ImageResponse extends Response {
  constructor(element, options) {
    super(new Uint8Array([]), {
      status: 200,
      headers: { 'content-type': 'image/png' },
      ...options,
    });
  }
}

export default {
  NextResponse,
  NextRequest,
  userAgent,
  userAgentFromString,
  ImageResponse,
};
`,

  'child_process': `
// Safe Mock Stub for child_process in Cloudflare Workers
const createDummyProcess = () => ({
  pid: 1,
  stdin: null,
  stdout: null,
  stderr: null,
  on: function() { return this; },
  once: function() { return this; },
  off: function() { return this; },
  emit: function() { return false; },
  kill: function() { return true; },
  unref: function() {},
  ref: function() {},
});

export const exec = (cmd, options, cb) => {
  const callback = typeof options === 'function' ? options : cb;
  if (callback) callback(new Error('child_process is unsupported in Cloudflare Workers runtime.'), '', '');
  return createDummyProcess();
};

export const execSync = () => '';
export const execFile = (file, args, options, cb) => {
  const callback = typeof options === 'function' ? options : (typeof args === 'function' ? args : cb);
  if (callback) callback(new Error('child_process is unsupported in Cloudflare Workers runtime.'), '', '');
  return createDummyProcess();
};
export const execFileSync = () => '';
export const spawn = () => createDummyProcess();
export const spawnSync = () => ({ pid: 1, output: ['', ''], stdout: '', stderr: '', status: 0, signal: null, error: null });
export const fork = () => createDummyProcess();

export default {
  exec,
  execSync,
  execFile,
  execFileSync,
  spawn,
  spawnSync,
  fork,
};
`,

  'tty': `
// Safe Mock Stub for tty in Cloudflare Workers
export const isatty = () => false;
export class ReadStream {}
export class WriteStream {}
export default { isatty, ReadStream, WriteStream };
`,

  'inspector': `
// Safe Mock Stub for inspector in Cloudflare Workers
export const open = () => {};
export const close = () => {};
export const url = () => undefined;
export const waitForDebugger = () => {};
export class Session {
  connect() {}
  disconnect() {}
  post(method, params, cb) { if (cb) cb(); }
  on() {}
  once() {}
  off() {}
}
export default { open, close, url, waitForDebugger, Session };
`,

  'cluster': `
// Safe Mock Stub for cluster in Cloudflare Workers
export const isMaster = true;
export const isPrimary = true;
export const isWorker = false;
export const workers = {};
export const fork = () => { throw new Error('cluster.fork() is unsupported in Cloudflare Workers.'); };
export const disconnect = () => {};
export default { isMaster, isPrimary, isWorker, workers, fork, disconnect };
`,

  'v8': `
// Safe Mock Stub for v8 in Cloudflare Workers
export const getHeapStatistics = () => ({
  total_heap_size: 134217728,
  total_heap_size_executable: 16777216,
  total_physical_size: 134217728,
  total_available_size: 134217728,
  used_heap_size: 67108864,
  heap_size_limit: 134217728,
  malloced_memory: 0,
  peak_malloced_memory: 0,
  does_zap_garbage: 0,
});
export const serialize = (val) => new Uint8Array([]);
export const deserialize = (buf) => null;
export default { getHeapStatistics, serialize, deserialize };
`,

  'worker_threads': `
// Safe Mock Stub for worker_threads in Cloudflare Workers
export const isMainThread = true;
export const parentPort = null;
export const threadId = 0;
export const workerData = null;
export class Worker {
  constructor() {
    throw new Error('worker_threads.Worker is unsupported in Cloudflare Workers.');
  }
}
export class MessageChannel {
  constructor() {
    this.port1 = { on: () => {}, postMessage: () => {}, close: () => {} };
    this.port2 = { on: () => {}, postMessage: () => {}, close: () => {} };
  }
}
export default { isMainThread, parentPort, threadId, workerData, Worker, MessageChannel };
`,

  'clsx': `
// Universal clsx shim
export function clsx(...args) {
  let str = '';
  for (let i = 0; i < args.length; i++) {
    const val = args[i];
    if (!val) continue;
    if (typeof val === 'string' || typeof val === 'number') {
      str && (str += ' ');
      str += val;
    } else if (Array.isArray(val)) {
      const res = clsx(...val);
      if (res) {
        str && (str += ' ');
        str += res;
      }
    } else if (typeof val === 'object') {
      for (const key in val) {
        if (val[key]) {
          str && (str += ' ');
          str += key;
        }
      }
    }
  }
  return str;
}
export default clsx;
`,

  'tailwind-merge': `
// Universal tailwind-merge shim
export function twMerge(...args) {
  return args
    .flat(Infinity)
    .filter(Boolean)
    .map(x => String(x).trim())
    .filter(Boolean)
    .join(' ');
}
export default twMerge;
`,

  'jszip': `
// Lightweight jszip fallback stub
export default class JSZip {
  constructor() {
    this.files = {};
  }
  file(name, data) {
    if (data !== undefined) {
      this.files[name] = { name, dir: false, async: async () => data };
      return this;
    }
    return this.files[name];
  }
  folder(name) {
    return this;
  }
  async generateAsync() {
    return new Uint8Array([]);
  }
  async loadAsync() {
    return this;
  }
}
`,
};

// Also support node: prefix
VIRTUAL_SHIMS['node:child_process'] = VIRTUAL_SHIMS['child_process'];
VIRTUAL_SHIMS['node:tty'] = VIRTUAL_SHIMS['tty'];
VIRTUAL_SHIMS['node:inspector'] = VIRTUAL_SHIMS['inspector'];
VIRTUAL_SHIMS['node:cluster'] = VIRTUAL_SHIMS['cluster'];
VIRTUAL_SHIMS['node:v8'] = VIRTUAL_SHIMS['v8'];
VIRTUAL_SHIMS['node:worker_threads'] = VIRTUAL_SHIMS['worker_threads'];

export function getVirtualShim(specifier: string): string | undefined {
  if (VIRTUAL_SHIMS[specifier]) {
    return VIRTUAL_SHIMS[specifier];
  }
  // Strip node: prefix if present
  if (specifier.startsWith('node:')) {
    const bare = specifier.slice(5);
    return VIRTUAL_SHIMS[bare];
  }
  return undefined;
}

export function isVirtualShimModule(specifier: string): boolean {
  return Boolean(getVirtualShim(specifier));
}
