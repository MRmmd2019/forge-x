import { AssetRecord, BuildPlan, StaticAnalysisResult } from '@/types/bundler';

function transformWorkerCodeForHybrid(code: string): string {
  let transformed = code;
  let handled = false;

  // 1. esbuild ESM export default style: export { ... as default ... };
  const namedDefaultRegex = /export\s*\{\s*([\s\S]*?)\bas\s+default\b([\s\S]*?)\};?/g;
  if (namedDefaultRegex.test(transformed)) {
    transformed = transformed.replace(namedDefaultRegex, (_match, before, after) => {
      const parts = before.split(',');
      const defaultIdentifier = parts[parts.length - 1].trim();
      const otherBefore = parts.slice(0, -1).join(',').trim();
      const remainingExports = [otherBefore, after.replace(/^,/, '').trim()].filter(Boolean).join(', ');
      const exportOther = remainingExports ? `export { ${remainingExports} };` : '';
      return `const __userWorkerHandler__ = ${defaultIdentifier};\n${exportOther}`;
    });
    handled = true;
  }

  // 2. export default function name(...) or export default function(...)
  if (!handled) {
    const defaultFnRegex = /export\s+default\s+function(?:\s+([a-zA-Z0-9_$]+))?\s*\(/g;
    if (defaultFnRegex.test(transformed)) {
      transformed = transformed.replace(defaultFnRegex, (_match, fnName) => {
        return fnName ? `function ${fnName}(` : 'const __userWorkerHandler__ = function(';
      });
      handled = true;
    }
  }

  // 3. export default identifier;
  if (!handled) {
    const defaultIdRegex = /export\s+default\s+([a-zA-Z0-9_$]+)\s*;/g;
    if (defaultIdRegex.test(transformed)) {
      transformed = transformed.replace(defaultIdRegex, 'const __userWorkerHandler__ = $1;');
      handled = true;
    }
  }

  // 4. export default { ... }
  if (!handled) {
    transformed = transformed.replace(/export\s+default\s+/, 'const __userWorkerHandler__ = ');
  }

  return transformed;
}

export class WorkerGenerator {
  static generate(params: {
    plan: BuildPlan;
    analysis: StaticAnalysisResult;
    assets: AssetRecord[];
    compiledJsCode: string;
    compiledCss?: string;
  }): string {
    const { plan, analysis, assets, compiledJsCode, compiledCss } = params;

    // Check if the compiled code has a worker fetch handler
    const hasWorkerExport =
      analysis.hasWorkerFetchHandler ||
      /export\s+default\s*\{[\s\S]*?\bfetch\b/i.test(compiledJsCode) ||
      /export\s*\{\s*[^}]*\bas\s+default\b/i.test(compiledJsCode) ||
      /export\s+default\s+function/i.test(compiledJsCode) ||
      plan.workerMode === 'native_worker';

    // Build the serialized asset map
    // We add the compiled JS bundle as a served asset under its entry path & common script aliases!
    const serializedAssets: Record<
      string,
      {
        type: string;
        encoding: 'utf8' | 'base64';
        data: string;
        hash: string;
        size: number;
      }
    > = {};

    for (const asset of assets) {
      serializedAssets[asset.route] = {
        type: asset.mimeType,
        encoding: asset.encoding,
        data: asset.data,
        hash: asset.hash,
        size: asset.size,
      };

      // Also without leading slash for flexible lookups
      const noSlash = asset.route.replace(/^\/+/, '');
      if (noSlash && !serializedAssets[noSlash]) {
        serializedAssets[noSlash] = serializedAssets[asset.route];
      }
    }

    // Register compiled bundle as asset if this is a web application
    if (compiledJsCode && (!hasWorkerExport || plan.workerMode !== 'native_worker')) {
      const bundleHash = 'b' + Math.abs(hashCode(compiledJsCode)).toString(16);
      const cleanEntry = plan.entry.replace(/^\/+/, '');
      const jsAssetObj = {
        type: 'application/javascript; charset=utf-8',
        encoding: 'utf8' as const,
        data: compiledJsCode,
        hash: bundleHash,
        size: Buffer.byteLength(compiledJsCode, 'utf8'),
      };

      serializedAssets[`/${cleanEntry}`] = jsAssetObj;
      serializedAssets[cleanEntry] = jsAssetObj;

      // Also register JS extension if entry was .ts
      if (cleanEntry.endsWith('.ts')) {
        const jsVersion = cleanEntry.replace(/\.ts$/, '.js');
        serializedAssets[`/${jsVersion}`] = jsAssetObj;
        serializedAssets[jsVersion] = jsAssetObj;
      }
      if (cleanEntry.includes('/')) {
        const basename = cleanEntry.split('/').pop()!;
        serializedAssets[`/${basename}`] = jsAssetObj;
        serializedAssets[basename] = jsAssetObj;
        if (basename.endsWith('.ts')) {
          const jsBase = basename.replace(/\.ts$/, '.js');
          serializedAssets[`/${jsBase}`] = jsAssetObj;
          serializedAssets[jsBase] = jsAssetObj;
        }
      }
    }

    // Register compiled CSS if separate
    if (compiledCss) {
      const cssHash = 'c' + Math.abs(hashCode(compiledCss)).toString(16);
      const cssAssetObj = {
        type: 'text/css; charset=utf-8',
        encoding: 'utf8' as const,
        data: compiledCss,
        hash: cssHash,
        size: Buffer.byteLength(compiledCss, 'utf8'),
      };
      serializedAssets['/bundle.css'] = cssAssetObj;
      serializedAssets['/styles.css'] = cssAssetObj;
      serializedAssets['/style.css'] = cssAssetObj;
    }

    const jsonAssets = JSON.stringify(serializedAssets);

    // If native worker with NO assets
    if (hasWorkerExport && plan.workerMode === 'native_worker' && assets.length === 0) {
      return `/**
 * Standalone Cloudflare Worker
 * Generated by Auto Bundler
 * Mode: Native Worker
 */

${compiledJsCode}
`;
    }

    // If native worker or hybrid worker with assets
    if (hasWorkerExport) {
      // Wrap user code in a scoped module or delegate
      return `/**
 * Standalone Cloudflare Worker
 * Generated by Auto Bundler
 * Mode: Hybrid API + Embedded Static Assets
 */

// Embedded Static Assets
const __ASSETS__ = ${jsonAssets};

// Binary Base64 Decoder
function __b64ToUint8(b64) {
  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const cleanB64 = (b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(cleanB64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new TextEncoder().encode(b64 || '');
  }
}

function __lookupAsset(rawPathname) {
  let pathname = rawPathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {}

  if (pathname.endsWith('/') && pathname.length > 1) {
    pathname = pathname.slice(0, -1);
  }

  // Prototype-pollution safe lookup
  if (Object.prototype.hasOwnProperty.call(__ASSETS__, pathname)) {
    return __ASSETS__[pathname];
  }
  if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ASSETS__, '/index.html')) {
    return __ASSETS__['/index.html'];
  }
  if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ASSETS__, 'index.html')) {
    return __ASSETS__['index.html'];
  }
  if (Object.prototype.hasOwnProperty.call(__ASSETS__, pathname + '/index.html')) {
    return __ASSETS__[pathname + '/index.html'];
  }
  if (pathname.startsWith('/') && Object.prototype.hasOwnProperty.call(__ASSETS__, pathname.slice(1))) {
    return __ASSETS__[pathname.slice(1)];
  }
  return null;
}

function __createAssetResponse(asset, request) {
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === '"' + asset.hash + '"') {
    return new Response(null, { status: 304 });
  }

  const headers = new Headers({
    'Content-Type': asset.type,
    'Content-Length': String(asset.size),
    'ETag': '"' + asset.hash + '"',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  const body = asset.encoding === 'base64' ? __b64ToUint8(asset.data) : asset.data;
  return new Response(body, { status: 200, headers });
}

// User Worker Implementation
${transformWorkerCodeForHybrid(compiledJsCode)}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const asset = __lookupAsset(url.pathname);
    if (asset) {
      return __createAssetResponse(asset, request);
    }

    // Delegate to user worker handler
    if (typeof __userWorkerHandler__ !== 'undefined') {
      if (typeof __userWorkerHandler__.fetch === 'function') {
        return __userWorkerHandler__.fetch(request, env, ctx);
      } else if (typeof __userWorkerHandler__ === 'function') {
        return __userWorkerHandler__(request, env, ctx);
      }
    }

    return new Response('Not Found', { status: 404 });
  }
};
`;
    }

    // Standard Vanilla Web / SPA worker
    return `/**
 * Standalone Cloudflare Worker
 * Generated by Auto Bundler
 * Mode: Single-File Vanilla Web Runtime
 */

// Embedded Asset Store
const __ASSETS__ = ${jsonAssets};

// Binary Base64 Decoder
function __b64ToUint8(b64) {
  try {
    if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const cleanB64 = (b64 || '').replace(/[^A-Za-z0-9+/=]/g, '');
    const bin = atob(cleanB64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  } catch {
    return new TextEncoder().encode(b64 || '');
  }
}

function __lookupAsset(rawPathname) {
  let pathname = rawPathname;
  try {
    pathname = decodeURIComponent(rawPathname);
  } catch {}

  if (pathname.endsWith('/') && pathname.length > 1) {
    pathname = pathname.slice(0, -1);
  }

  // Prototype-pollution safe lookup
  if (Object.prototype.hasOwnProperty.call(__ASSETS__, pathname)) {
    return __ASSETS__[pathname];
  }
  if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ASSETS__, '/index.html')) {
    return __ASSETS__['/index.html'];
  }
  if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ASSETS__, 'index.html')) {
    return __ASSETS__['index.html'];
  }
  if (Object.prototype.hasOwnProperty.call(__ASSETS__, pathname + '/index.html')) {
    return __ASSETS__[pathname + '/index.html'];
  }
  if (pathname.startsWith('/') && Object.prototype.hasOwnProperty.call(__ASSETS__, pathname.slice(1))) {
    return __ASSETS__[pathname.slice(1)];
  }

  // SPA fallback to index.html for text/html requests
  if (!pathname.includes('.')) {
    if (Object.prototype.hasOwnProperty.call(__ASSETS__, '/index.html')) return __ASSETS__['/index.html'];
    if (Object.prototype.hasOwnProperty.call(__ASSETS__, 'index.html')) return __ASSETS__['index.html'];
    if (Object.prototype.hasOwnProperty.call(__ASSETS__, '/')) return __ASSETS__['/'];
  }

  return null;
}

function __createAssetResponse(asset, request) {
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch === '"' + asset.hash + '"') {
    return new Response(null, { status: 304 });
  }

  const headers = new Headers({
    'Content-Type': asset.type,
    'Content-Length': String(asset.size),
    'ETag': '"' + asset.hash + '"',
    'Cache-Control': 'public, max-age=3600',
    'Access-Control-Allow-Origin': '*',
  });

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers });
  }

  const body = asset.encoding === 'base64' ? __b64ToUint8(asset.data) : asset.data;
  return new Response(body, { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const asset = __lookupAsset(url.pathname);

    if (!asset) {
      return new Response('404 Not Found: ' + url.pathname, {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }

    return __createAssetResponse(asset, request);
  }
};
`;
  }
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}
