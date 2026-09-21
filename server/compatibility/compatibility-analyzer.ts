import {
  AstModuleInfo,
  CompatibilityIssue,
  CompatibilityReport,
  NodeApiCompatibility,
  ProjectWorkspace,
} from '@/types/bundler';

const NODE_BUILTIN_RULES: Record<
  string,
  { status: NodeApiCompatibility; severity: 'INFO' | 'WARNING' | 'CRITICAL'; desc: string; alt: string }
> = {
  fs: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Direct file system access is blocked by Cloudflare Workers runtime.',
    alt: 'Use embedded virtual assets, Cloudflare KV, or R2.',
  },
  'fs/promises': {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'File system promises are not available in Cloudflare Workers.',
    alt: 'Use embedded virtual assets map or Worker KV.',
  },
  child_process: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Process spawning is forbidden in edge worker isolates.',
    alt: 'Refactor logic into pure functions or external webhook calls.',
  },
  net: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Raw TCP sockets are not directly supported without Cloudflare connect() API.',
    alt: 'Use cloudflare:sockets connect() or standard fetch().',
  },
  tls: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Raw TLS socket wrapping is unsupported.',
    alt: 'Use standard global fetch() with HTTPS.',
  },
  http: {
    status: 'UNSUPPORTED',
    severity: 'WARNING',
    desc: 'Node.js http.createServer() cannot bind local network ports in Workers.',
    alt: 'Use the standard Worker fetch(request, env, ctx) handler.',
  },
  https: {
    status: 'UNSUPPORTED',
    severity: 'WARNING',
    desc: 'Node.js https.createServer() cannot bind network ports in Workers.',
    alt: 'Use standard Worker fetch() handler and global fetch for outbound requests.',
  },
  cluster: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Node cluster multi-process management is unsupported.',
    alt: 'Workers are automatically distributed across Cloudflare global edge.',
  },
  dgram: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'UDP sockets are unsupported.',
    alt: 'Use WebSockets or standard HTTP/2.',
  },
  v8: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'V8 internals access is restricted in worker isolates.',
    alt: 'Use standard JavaScript APIs.',
  },
  vm: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Dynamic code evaluation via Node vm module is restricted.',
    alt: 'Use WebAssembly or pure function dispatch.',
  },
  worker_threads: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Worker threads are unsupported inside an isolate.',
    alt: 'Workers run concurrently per request across the edge.',
  },
  dns: {
    status: 'WARNING',
    severity: 'WARNING',
    desc: 'Custom DNS resolution is restricted.',
    alt: 'Use standard fetch() with public domain names.',
  },
  os: {
    status: 'WARNING',
    severity: 'WARNING',
    desc: 'Node OS APIs do not reflect the physical host at the edge.',
    alt: 'Use request.cf metadata (colo, country, city, asn, etc.).',
  },
  path: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'Path manipulation is fully supported via nodejs_compat or esbuild polyfill.',
    alt: 'node:path is polyfilled seamlessly.',
  },
  crypto: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'Node crypto and global Web Crypto API (crypto.subtle) are supported.',
    alt: 'Use node:crypto or global crypto.subtle.',
  },
  buffer: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'Node Buffer and Uint8Array are fully supported.',
    alt: 'Use Uint8Array or Buffer with nodejs_compat.',
  },
  events: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'EventEmitter is fully supported via nodejs_compat.',
    alt: 'Use EventEmitter or EventTarget.',
  },
  util: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'Node util functions (promisify, types, format) are supported.',
    alt: 'node:util is supported via nodejs_compat.',
  },
  stream: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'Node streams and Web Streams (ReadableStream/WritableStream) are supported.',
    alt: 'Use Web Streams API or node:stream with nodejs_compat.',
  },
  async_hooks: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'AsyncLocalStorage is supported in modern Workers.',
    alt: 'AsyncLocalStorage is supported with nodejs_compat.',
  },
  assert: {
    status: 'SAFE',
    severity: 'INFO',
    desc: 'Node assert is supported with nodejs_compat.',
    alt: 'node:assert is supported.',
  },
};

const KNOWN_NPM_PACKAGES: Record<
  string,
  { status: NodeApiCompatibility; severity: 'INFO' | 'WARNING' | 'CRITICAL'; desc: string; alt: string }
> = {
  bcrypt: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Native C++ binary binding is incompatible with V8 worker isolates.',
    alt: 'Use bcrypt-ts or Web Crypto with PBKDF2/Argon2-wasm.',
  },
  sharp: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Native libvips binary is incompatible with V8 worker isolates.',
    alt: 'Use Cloudflare Images or WASM-based image processors (e.g. photon).',
  },
  sqlite3: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Native SQLite C bindings require direct filesystem.',
    alt: 'Use Cloudflare D1 or cloud-hosted database.',
  },
  puppeteer: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Browser binary launching is not supported inside worker isolates.',
    alt: 'Use Cloudflare Browser Rendering API.',
  },
  canvas: {
    status: 'UNSUPPORTED',
    severity: 'CRITICAL',
    desc: 'Native Cairo C++ bindings are incompatible.',
    alt: 'Use pure JS / WASM rasterizer or SVG manipulation.',
  },
  express: {
    status: 'WARNING',
    severity: 'WARNING',
    desc: 'Express is designed for Node net.Server and does not run out-of-the-box on Workers.',
    alt: 'Use modern edge-native routers like Hono, itty-router, or native fetch handler.',
  },
  fastify: {
    status: 'WARNING',
    severity: 'WARNING',
    desc: 'Fastify relies on Node net.Server.',
    alt: 'Use Hono or native Worker fetch handler.',
  },
  koa: {
    status: 'WARNING',
    severity: 'WARNING',
    desc: 'Koa relies on Node http server.',
    alt: 'Use Hono or native Worker fetch handler.',
  },
};

export class CompatibilityAnalyzer {
  static analyze(
    workspace: ProjectWorkspace,
    parsedModules: Map<string, AstModuleInfo>,
    packageDependencies: { dependencies: Record<string, string>; devDependencies: Record<string, string> }
  ): CompatibilityReport {
    const issues: CompatibilityIssue[] = [];
    const moduleUsageMap = new Map<string, Set<string>>();

    // Aggregate Node module usage across all parsed AST modules
    for (const [filePath, modInfo] of parsedModules.entries()) {
      for (const builtin of modInfo.nodeBuiltinsUsed) {
        if (!moduleUsageMap.has(builtin)) {
          moduleUsageMap.set(builtin, new Set());
        }
        moduleUsageMap.get(builtin)!.add(filePath);
      }
    }

    let nodeCompatRequired = false;
    let unsupportedNodeCount = 0;
    let unsupportedPackagesCount = 0;

    // Evaluate Node built-ins
    for (const [moduleName, filesSet] of moduleUsageMap.entries()) {
      const rule = NODE_BUILTIN_RULES[moduleName];
      const files = Array.from(filesSet);

      if (rule) {
        if (rule.status === 'SAFE' || rule.status === 'WARNING') {
          nodeCompatRequired = true;
        }
        if (rule.status === 'UNSUPPORTED') {
          unsupportedNodeCount++;
        }

        issues.push({
          packageOrModule: moduleName,
          status: rule.status,
          severity: rule.severity,
          files,
          description: rule.desc,
          workerAlternative: rule.alt,
        });
      } else {
        // Unknown Node built-in
        issues.push({
          packageOrModule: moduleName,
          status: 'WARNING',
          severity: 'WARNING',
          files,
          description: `Node.js module "${moduleName}" detected.`,
          workerAlternative: 'Check Cloudflare Workers nodejs_compat compatibility matrix.',
        });
      }
    }

    // Evaluate npm dependencies from package.json
    const allDeps = {
      ...packageDependencies.dependencies,
      ...packageDependencies.devDependencies,
    };

    for (const pkgName of Object.keys(allDeps)) {
      const rule = KNOWN_NPM_PACKAGES[pkgName];
      if (rule) {
        if (rule.status === 'UNSUPPORTED') {
          unsupportedPackagesCount++;
        }
        issues.push({
          packageOrModule: pkgName,
          status: rule.status,
          severity: rule.severity,
          files: ['package.json'],
          description: rule.desc,
          workerAlternative: rule.alt,
        });
      }
    }

    // Determine Overall Status
    let overallStatus: CompatibilityReport['overallStatus'] = 'COMPATIBLE';
    if (unsupportedNodeCount > 0 || unsupportedPackagesCount > 0) {
      overallStatus = 'INCOMPATIBLE';
    } else if (issues.some(i => i.severity === 'WARNING')) {
      overallStatus = 'COMPATIBLE_WITH_WARNINGS';
    }

    // Generate Summary
    let summary = 'Project is fully compatible with Cloudflare Workers runtime.';
    if (overallStatus === 'INCOMPATIBLE') {
      summary = `Incompatible APIs detected (${unsupportedNodeCount} unsupported Node modules, ${unsupportedPackagesCount} unsupported packages).`;
    } else if (overallStatus === 'COMPATIBLE_WITH_WARNINGS') {
      summary = 'Project is compatible with Cloudflare Workers with compatibility warnings.';
    }

    return {
      overallStatus,
      summary,
      issues,
      nodeCompatRequired,
      unsupportedNodeCount,
      unsupportedPackagesCount,
    };
  }
}
