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

      // Check wrangler.toml, wrangler.json, or wrangler.jsonc for [vars]
      const wranglerTomlPath = path.join(workspace.dirPath, 'wrangler.toml');
      const wranglerJsonPath = path.join(workspace.dirPath, 'wrangler.json');
      const wranglerJsoncPath = path.join(workspace.dirPath, 'wrangler.jsonc');
      const wranglerVars: Record<string, string> = {};

      if (fs.existsSync(wranglerTomlPath)) {
        try {
          const tomlContent = fs.readFileSync(wranglerTomlPath, 'utf8');
          // Strip comments before parsing vars
          const stripped = tomlContent.replace(/#[^\n\r]*/g, '');
          const varsMatch = stripped.match(/\[vars\]([\s\S]*?)(?:\[|$)/);
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
      } else if (fs.existsSync(wranglerJsonPath) || fs.existsSync(wranglerJsoncPath)) {
        const jPath = fs.existsSync(wranglerJsonPath) ? wranglerJsonPath : wranglerJsoncPath;
        try {
          const jsonRaw = fs.readFileSync(jPath, 'utf8');
          const cleanJson = jsonRaw.replace(/\/\/[^\n\r]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
          const parsed = JSON.parse(cleanJson);
          if (parsed.vars && typeof parsed.vars === 'object') {
            for (const [k, v] of Object.entries(parsed.vars)) {
              wranglerVars[k] = JSON.stringify(v);
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

      const bannerDefinitions = [
        `if (typeof globalThis.VERSION === 'undefined') { globalThis.VERSION = ${buildDefines['VERSION']}; }`,
        `var VERSION = globalThis.VERSION;`,
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
          '.tsx': 'tsx',
          '.mts': 'ts',
          '.cts': 'ts',
          '.js': 'js',
          '.jsx': 'jsx',
          '.mjs': 'js',
          '.cjs': 'js',
          '.css': 'css',
          '.json': 'json',
          // Vector & Text
          '.svg': 'text',
          '.html': 'text',
          '.txt': 'text',
          '.csv': 'text',
          // Images -> dataurl
          '.png': 'dataurl',
          '.jpg': 'dataurl',
          '.jpeg': 'dataurl',
          '.webp': 'dataurl',
          '.gif': 'dataurl',
          '.ico': 'dataurl',
          '.avif': 'dataurl',
          // Fonts -> binary
          '.woff': 'binary',
          '.woff2': 'binary',
          '.ttf': 'binary',
          '.otf': 'binary',
          '.eot': 'binary',
          // WebAssembly -> binary
          '.wasm': 'binary',
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
