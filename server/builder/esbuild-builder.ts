import path from 'path';
import fs from 'fs';
import * as esbuild from 'esbuild';
import { BuildPlan, ProjectWorkspace } from '@/types/bundler';

export interface EsbuildCompileResult {
  code: string;
  css?: string;
  sourceMap?: string;
  warnings: esbuild.Message[];
  errors: esbuild.Message[];
}

export const CLOUDFLARE_NODE_COMPAT_MODULES = [
  'assert',
  'assert/strict',
  'async_hooks',
  'buffer',
  'crypto',
  'diagnostics_channel',
  'dns',
  'dns/promises',
  'events',
  'net',
  'path',
  'path/posix',
  'path/win32',
  'process',
  'querystring',
  'stream',
  'stream/promises',
  'stream/consumers',
  'stream/web',
  'string_decoder',
  'timers',
  'timers/promises',
  'url',
  'util',
  'util/types',
  'zlib',
  // Common stubs/modules supported in workers
  'os',
  'fs',
  'fs/promises',
  'http',
  'https',
  'tls',
  'v8',
  'vm',
  'worker_threads',
];

function createCloudflareWorkersPlugin(externalDeps: string[] = []): esbuild.Plugin {
  const nodeBuiltinRegex = new RegExp(
    `^(${CLOUDFLARE_NODE_COMPAT_MODULES.map(m => m.replace('/', '\\/')).join('|')})(\\/.*)?$`
  );

  const customExternalsSet = new Set(externalDeps);

  return {
    name: 'cloudflare-worker-externals-resolver',
    setup(build) {
      // 1. Explicit node: or cloudflare: protocol imports
      build.onResolve({ filter: /^(node:|cloudflare:)/ }, args => {
        return { path: args.path, external: true };
      });

      // 2. Bare Node.js built-in module names (e.g. "crypto", "buffer", "stream/web")
      build.onResolve({ filter: nodeBuiltinRegex }, args => {
        return { path: args.path, external: true };
      });

      // 3. Any explicitly declared external dependencies
      if (customExternalsSet.size > 0) {
        build.onResolve({ filter: /.*/ }, args => {
          if (customExternalsSet.has(args.path)) {
            return { path: args.path, external: true };
          }
          // Also match package prefixes like "@scope/pkg" or "pkg/subpath"
          for (const ext of customExternalsSet) {
            if (args.path === ext || args.path.startsWith(`${ext}/`)) {
              return { path: args.path, external: true };
            }
          }
          return null;
        });
      }
    },
  };
}

export class EsbuildBuilder {
  static async compile(
    workspace: ProjectWorkspace,
    plan: BuildPlan
  ): Promise<EsbuildCompileResult> {
    const entryFullPath = path.join(workspace.dirPath, plan.entry);

    // If entry file does not exist on disk (for instance, project is only index.html)
    if (!fs.existsSync(entryFullPath)) {
      return {
        code: '// No JavaScript entry point needed for static asset worker\n',
        warnings: [],
        errors: [],
      };
    }

    try {
      const externalSet = new Set([
        'node:*',
        'cloudflare:*',
        ...CLOUDFLARE_NODE_COMPAT_MODULES,
        ...CLOUDFLARE_NODE_COMPAT_MODULES.map(m => `node:${m}`),
        ...(plan.externalDependencies || []),
      ]);

      const tsconfigPath = path.join(workspace.dirPath, 'tsconfig.json');
      const hasTsconfig = fs.existsSync(tsconfigPath);

      // Prepare compile-time defines
      let detectedVersion = '5.0.0';
      const pkgJsonPath = path.join(workspace.dirPath, 'package.json');
      if (fs.existsSync(pkgJsonPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
          if (pkg.version) detectedVersion = String(pkg.version);
        } catch {}
      }

      // Check wrangler.toml for [vars]
      const wranglerTomlPath = path.join(workspace.dirPath, 'wrangler.toml');
      const wranglerVars: Record<string, string> = {};
      if (fs.existsSync(wranglerTomlPath)) {
        try {
          const tomlContent = fs.readFileSync(wranglerTomlPath, 'utf8');
          const varsMatch = tomlContent.match(/\[vars\]([\s\S]*?)(?:\[|$)/);
          if (varsMatch) {
            const lines = varsMatch[1].split('\n');
            for (const line of lines) {
              const kv = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+)$/);
              if (kv) {
                const key = kv[1].trim();
                let val = kv[2].trim();
                if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                  val = val.slice(1, -1);
                }
                wranglerVars[key] = JSON.stringify(val);
              }
            }
          }
        } catch {}
      }

      const buildDefines: Record<string, string> = {
        'process.env.NODE_ENV': JSON.stringify('production'),
        global: 'globalThis',
        ...wranglerVars,
        ...(plan.defines || {}),
      };

      // Ensure VERSION is always defined as a compile-time constant
      if (!buildDefines['VERSION']) {
        buildDefines['VERSION'] = wranglerVars['VERSION'] || JSON.stringify(detectedVersion);
      }
      if (!buildDefines['process.env.VERSION']) {
        buildDefines['process.env.VERSION'] = buildDefines['VERSION'];
      }

      // If EMBEDED_SETTINGS is referenced in code (e.g. BPB Worker Panel), inject fallback structure
      const hasEmbededSettings = workspace.files.some(f => f.content && f.content.includes('EMBEDED_SETTINGS'));
      if (hasEmbededSettings && !buildDefines['EMBEDED_SETTINGS']) {
        buildDefines['EMBEDED_SETTINGS'] = JSON.stringify({
          accID: 'default',
          accEmail: 'admin@example.com',
          apiToken: '',
          vlUUID: '00000000-0000-0000-0000-000000000000',
          trPass: 'password',
          securePath: 'panel',
          proxyIpMode: 'auto',
          proxyIPs: [],
          prefixes: [],
          mainDomain: 'localhost',
          fallback: 'localhost',
          dohUrl: 'https://cloudflare-dns.com/dns-query',
        });
      }

      // Check for ERROR_HTML_CONTENT or __ICON__
      const hasErrorHtml = workspace.files.some(f => f.content && f.content.includes('ERROR_HTML_CONTENT'));
      if (hasErrorHtml && !buildDefines['ERROR_HTML_CONTENT']) {
        buildDefines['ERROR_HTML_CONTENT'] = JSON.stringify('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title></head><body><h1>Service Error</h1></body></html>');
      }

      const hasIconToken = workspace.files.some(f => f.content && f.content.includes('__ICON__'));
      if (hasIconToken && !buildDefines['__ICON__']) {
        buildDefines['__ICON__'] = JSON.stringify('AAABAAEAAQEAAAEAIAAwAAAAFgAAACgAAAABAAAAAgAAAAEAIAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//AAAAAA==');
      }

      const bannerDefinitions = [
        `if (typeof globalThis.VERSION === 'undefined') { globalThis.VERSION = ${buildDefines['VERSION']}; }`,
        `var VERSION = globalThis.VERSION;`,
        buildDefines['ERROR_HTML_CONTENT'] ? `if (typeof globalThis.ERROR_HTML_CONTENT === 'undefined') { globalThis.ERROR_HTML_CONTENT = ${buildDefines['ERROR_HTML_CONTENT']}; }\nvar ERROR_HTML_CONTENT = globalThis.ERROR_HTML_CONTENT;` : '',
        buildDefines['EMBEDED_SETTINGS'] ? `if (typeof globalThis.EMBEDED_SETTINGS === 'undefined') { globalThis.EMBEDED_SETTINGS = ${buildDefines['EMBEDED_SETTINGS']}; }\nvar EMBEDED_SETTINGS = globalThis.EMBEDED_SETTINGS;` : '',
      ].filter(Boolean).join('\n');

      const nodeRequireBanner = [
        `import { createRequire as __createRequire__ } from 'node:module';`,
        `var require;`,
        `try {`,
        `  var __cf_meta_url__ = (typeof import.meta !== 'undefined' && import.meta && typeof import.meta.url === 'string' && import.meta.url) || 'file:///worker.js';`,
        `  require = __createRequire__(__cf_meta_url__);`,
        `} catch {`,
        `  require = function(mod) { throw new Error('Dynamic require of "' + mod + '" is not supported in this runtime isolate.'); };`,
        `}`,
      ].join('\n');

      const buildResult = await esbuild.build({
        entryPoints: [entryFullPath],
        outfile: path.join(workspace.dirPath, '__bundled__.js'),
        bundle: true,
        write: false,
        platform: 'neutral',
        format: 'esm',
        target: plan.target || 'es2022',
        mainFields: ['module', 'main', 'browser'],
        conditions: ['workerd', 'worker', 'browser', 'import', 'require', 'default'],
        banner: plan.compatibilityFlags?.includes('nodejs_compat')
          ? {
              js: `${nodeRequireBanner}\n${bannerDefinitions}`,
            }
          : {
              js: bannerDefinitions,
            },
        minify: plan.minify,
        sourcemap: plan.sourceMap ? 'inline' : false,
        tsconfig: hasTsconfig ? tsconfigPath : undefined,
        nodePaths: [
          path.join(workspace.dirPath, 'node_modules'),
          path.resolve(process.cwd(), 'node_modules'),
        ],
        loader: {
          '.ts': 'ts',
          '.mts': 'ts',
          '.cts': 'ts',
          '.js': 'js',
          '.mjs': 'js',
          '.cjs': 'js',
          '.css': 'css',
          '.json': 'json',
          '.txt': 'text',
          '.csv': 'text',
          '.html': 'text',
          '.png': 'dataurl',
          '.jpg': 'dataurl',
          '.jpeg': 'dataurl',
          '.svg': 'text',
        },
        plugins: [createCloudflareWorkersPlugin(plan.externalDependencies || [])],
        external: Array.from(externalSet),
        absWorkingDir: workspace.dirPath,
        define: buildDefines,
        logLevel: 'silent',
      });

      let jsOutput = '';
      let cssOutput = '';

      for (const file of buildResult.outputFiles || []) {
        if (file.path.endsWith('.css')) {
          cssOutput += file.text;
        } else if (file.path.endsWith('.js') || file.path === '<stdout>' || !jsOutput) {
          jsOutput += file.text;
        }
      }

      return {
        code: jsOutput,
        css: cssOutput,
        warnings: buildResult.warnings,
        errors: buildResult.errors,
      };
    } catch (err: any) {
      const esbuildErrors = err.errors || [];
      const esbuildWarnings = err.warnings || [];
      throw {
        message: err.message || 'esbuild compilation failed',
        errors: esbuildErrors,
        warnings: esbuildWarnings,
      };
    }
  }
}
