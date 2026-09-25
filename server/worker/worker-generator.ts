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

  // 2. export default function name(...) or export default async function(...)
  if (!handled) {
    const defaultFnRegex = /export\s+default\s+(?:async\s+)?function(?:\s+([a-zA-Z0-9_$]+))?\s*\(/g;
    if (defaultFnRegex.test(transformed)) {
      transformed = transformed.replace(defaultFnRegex, (match, fnName) => {
        const isAsync = match.includes('async');
        const prefix = isAsync ? 'async function' : 'function';
        return fnName ? `${prefix} ${fnName}(` : `const __userWorkerHandler__ = ${prefix}(`;
      });
      handled = true;
    }
  }

  // 3. export default class
  if (!handled) {
    const defaultClassRegex = /export\s+default\s+class(?:\s+([a-zA-Z0-9_$]+))?\s*(?:extends\s+([a-zA-Z0-9_$.]+))?\s*\{/g;
    if (defaultClassRegex.test(transformed)) {
      let declaredName = '__UserWorkerClass__';
      transformed = transformed.replace(defaultClassRegex, (_match, className, superName) => {
        declaredName = className || '__UserWorkerClass__';
        const extendsClause = superName ? `extends ${superName} ` : '';
        return `class ${declaredName} ${extendsClause}{\n`;
      });
      transformed += `\nconst __userWorkerHandler__ = ${declaredName};\n`;
      handled = true;
    }
  }

  // 4. export default identifier;
  if (!handled) {
    const defaultIdRegex = /export\s+default\s+([a-zA-Z0-9_$]+)\s*;/g;
    if (defaultIdRegex.test(transformed)) {
      transformed = transformed.replace(defaultIdRegex, 'const __userWorkerHandler__ = $1;');
      handled = true;
    }
  }

  // 5. export default { ... }
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
      /export\s+default\s+(?:async\s+)?function/i.test(compiledJsCode) ||
      /export\s+default\s+class/i.test(compiledJsCode) ||
      plan.workerMode === 'native_worker';

    // Deduplicated asset storage: data is stored ONCE by hash, routes map to hashes
    const assetDataMap: Record<
      string,
      {
        type: string;
        encoding: 'utf8' | 'base64';
        data: string;
        hash: string;
        size: number;
      }
    > = {};
    const routeMap: Record<string, string> = {};

    for (const asset of assets) {
      assetDataMap[asset.hash] = {
        type: asset.mimeType,
        encoding: asset.encoding,
        data: asset.data,
        hash: asset.hash,
        size: asset.size,
      };

      routeMap[asset.route] = asset.hash;
      const noSlash = asset.route.replace(/^\/+/, '');
      if (noSlash && !routeMap[noSlash]) {
        routeMap[noSlash] = asset.hash;
      }
    }

    // Register compiled bundle as asset if this is a web application
    // Guarantee that compiledJsCode is stored EXACTLY ONCE in assetDataMap
    if (compiledJsCode && (!hasWorkerExport || plan.workerMode !== 'native_worker')) {
      const bundleHash = 'b' + Math.abs(hashCode(compiledJsCode)).toString(16);
      assetDataMap[bundleHash] = {
        type: 'application/javascript; charset=utf-8',
        encoding: 'utf8' as const,
        data: compiledJsCode,
        hash: bundleHash,
        size: Buffer.byteLength(compiledJsCode, 'utf8'),
      };

      const cleanEntry = plan.entry.replace(/^\/+/, '');
      routeMap[`/${cleanEntry}`] = bundleHash;
      routeMap[cleanEntry] = bundleHash;

      // Also register JS extension if entry was .ts
      if (cleanEntry.endsWith('.ts')) {
        const jsVersion = cleanEntry.replace(/\.ts$/, '.js');
        routeMap[`/${jsVersion}`] = bundleHash;
        routeMap[jsVersion] = bundleHash;
      }
      if (cleanEntry.includes('/')) {
        const basename = cleanEntry.split('/').pop()!;
        routeMap[`/${basename}`] = bundleHash;
        routeMap[basename] = bundleHash;
        if (basename.endsWith('.ts')) {
          const jsBase = basename.replace(/\.ts$/, '.js');
          routeMap[`/${jsBase}`] = bundleHash;
          routeMap[jsBase] = bundleHash;
        }
      }
    }

    // Register compiled CSS if separate - stored ONCE in assetDataMap
    if (compiledCss) {
      const cssHash = 'c' + Math.abs(hashCode(compiledCss)).toString(16);
      assetDataMap[cssHash] = {
        type: 'text/css; charset=utf-8',
        encoding: 'utf8' as const,
        data: compiledCss,
        hash: cssHash,
        size: Buffer.byteLength(compiledCss, 'utf8'),
      };
      routeMap['/bundle.css'] = cssHash;
      routeMap['bundle.css'] = cssHash;
      routeMap['/styles.css'] = cssHash;
      routeMap['styles.css'] = cssHash;
      routeMap['/style.css'] = cssHash;
      routeMap['style.css'] = cssHash;
    }

    const jsonAssetData = JSON.stringify(assetDataMap);
    const jsonRoutes = JSON.stringify(routeMap);

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
      return `/**
 * Standalone Cloudflare Worker
 * Generated by Auto Bundler
 * Mode: Hybrid API + Embedded Static Assets
 */

// Embedded Static Assets (Deduplicated)
const __ASSET_DATA__ = ${jsonAssetData};
const __ROUTES__ = ${jsonRoutes};

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

  let hash = null;
  if (Object.prototype.hasOwnProperty.call(__ROUTES__, pathname)) {
    hash = __ROUTES__[pathname];
  } else if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ROUTES__, '/index.html')) {
    hash = __ROUTES__['/index.html'];
  } else if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ROUTES__, 'index.html')) {
    hash = __ROUTES__['index.html'];
  } else if (Object.prototype.hasOwnProperty.call(__ROUTES__, pathname + '/index.html')) {
    hash = __ROUTES__[pathname + '/index.html'];
  } else if (pathname.startsWith('/') && Object.prototype.hasOwnProperty.call(__ROUTES__, pathname.slice(1))) {
    hash = __ROUTES__[pathname.slice(1)];
  }

  if (hash && Object.prototype.hasOwnProperty.call(__ASSET_DATA__, hash)) {
    return __ASSET_DATA__[hash];
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
    if (typeof __userWorkerHandler__ !== 'undefined' && __userWorkerHandler__) {
      if (typeof __userWorkerHandler__.fetch === 'function') {
        return __userWorkerHandler__.fetch(request, env, ctx);
      } else if (typeof __userWorkerHandler__ === 'function') {
        const isClass = /^class\\s/.test(Function.prototype.toString.call(__userWorkerHandler__)) ||
                        Boolean(__userWorkerHandler__.prototype && typeof __userWorkerHandler__.prototype.fetch === 'function');
        if (isClass) {
          const instance = new __userWorkerHandler__(env, ctx);
          if (typeof instance.fetch === 'function') {
            return instance.fetch(request, env, ctx);
          }
        }
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

// Embedded Asset Store & Route Mapping (Deduplicated)
const __ASSET_DATA__ = ${jsonAssetData};
const __ROUTES__ = ${jsonRoutes};

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

  let hash = null;
  if (Object.prototype.hasOwnProperty.call(__ROUTES__, pathname)) {
    hash = __ROUTES__[pathname];
  } else if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ROUTES__, '/index.html')) {
    hash = __ROUTES__['/index.html'];
  } else if (pathname === '/' && Object.prototype.hasOwnProperty.call(__ROUTES__, 'index.html')) {
    hash = __ROUTES__['index.html'];
  } else if (Object.prototype.hasOwnProperty.call(__ROUTES__, pathname + '/index.html')) {
    hash = __ROUTES__[pathname + '/index.html'];
  } else if (pathname.startsWith('/') && Object.prototype.hasOwnProperty.call(__ROUTES__, pathname.slice(1))) {
    hash = __ROUTES__[pathname.slice(1)];
  }

  // SPA fallback to index.html for text/html requests
  if (!hash && !pathname.includes('.')) {
    if (Object.prototype.hasOwnProperty.call(__ROUTES__, '/index.html')) hash = __ROUTES__['/index.html'];
    else if (Object.prototype.hasOwnProperty.call(__ROUTES__, 'index.html')) hash = __ROUTES__['index.html'];
    else if (Object.prototype.hasOwnProperty.call(__ROUTES__, '/')) hash = __ROUTES__['/'];
  }

  if (hash && Object.prototype.hasOwnProperty.call(__ASSET_DATA__, hash)) {
    return __ASSET_DATA__[hash];
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
