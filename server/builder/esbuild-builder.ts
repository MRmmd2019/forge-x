import path from 'path';
import fs from 'fs';
import * as esbuild from 'esbuild';
import { BuildPlan, ProjectWorkspace } from '@/types/bundler';

import { getVirtualShim, isVirtualShimModule } from './virtual-shims';

export interface EsbuildCompileResult {
  code: string;
  css?: string;
  sourceMap?: string;
  warnings: esbuild.Message[];
  errors: esbuild.Message[];
  detectedMocks: string[];
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
  'os',
  'fs',
  'fs/promises',
  'http',
  'https',
  'tls',
];

function createCloudflareWorkersPlugin(
  workspace: ProjectWorkspace,
  externalDeps: string[] = [],
  detectedMocks: Set<string>
): esbuild.Plugin {
  const nodeBuiltinRegex = new RegExp(
    `^(${CLOUDFLARE_NODE_COMPAT_MODULES.map(m => m.replace('/', '\\/')).join('|')})(\\/.*)?$`
  );

  const customExternalsSet = new Set(externalDeps);

  return {
    name: 'cloudflare-worker-virtual-resolver',
    setup(build) {
      // 1. Virtual mock shims (next/server, child_process, tty, inspector, clsx, etc.)
      build.onResolve({ filter: /.*/ }, args => {
        const cleanMod = args.path.replace(/^node:/, '');
        if (isVirtualShimModule(args.path) || isVirtualShimModule(cleanMod)) {
          const modKey = isVirtualShimModule(args.path) ? args.path : cleanMod;
          detectedMocks.add(modKey);
          return { path: modKey, namespace: 'virtual-shim' };
        }

        // 2. Resolve tsconfig @/* path aliases against workspace root
        if (args.path.startsWith('@/')) {
          const rel = args.path.slice(2);
          const extensions = [
            '',
            '.ts',
            '.tsx',
            '.js',
            '.jsx',
            '.json',
            '/index.ts',
            '/index.js',
            '/index.tsx',
            '/index.jsx',
          ];
          for (const ext of extensions) {
            const candidate = path.join(workspace.dirPath, `${rel}${ext}`);
            if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
              return { path: candidate };
            }
          }
        }

        // 3. Explicit node: or cloudflare: protocol imports
        if (args.path.startsWith('node:') || args.path.startsWith('cloudflare:')) {
          return { path: args.path, external: true };
        }

        // 4. Bare Node.js built-in module names (e.g. "crypto", "buffer", "stream/web")
        if (nodeBuiltinRegex.test(args.path)) {
          return { path: args.path, external: true };
        }

        // 5. Host node_modules fallback for missing workspace dependencies (safe fs lookup, avoiding Webpack require.resolve)
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          const searchRoots = [
            path.join(workspace.dirPath, 'node_modules'),
            path.resolve(process.cwd(), 'node_modules'),
          ];
          for (const baseRoot of searchRoots) {
            const candidateDir = path.join(baseRoot, args.path);
            const candidatePkg = path.join(candidateDir, 'package.json');
            if (fs.existsSync(candidatePkg)) {
              try {
                const pkgData = JSON.parse(fs.readFileSync(candidatePkg, 'utf8'));
                const mainField = pkgData.module || pkgData.main || 'index.js';
                const mainTarget = path.resolve(candidateDir, mainField);
                if (fs.existsSync(mainTarget)) {
                  return { path: mainTarget };
                }
                if (fs.existsSync(mainTarget + '.js')) {
                  return { path: mainTarget + '.js' };
                }
              } catch {}
            }
            for (const ext of ['', '.js', '.mjs', '.cjs', '.ts']) {
              const directFile = candidateDir + ext;
              if (fs.existsSync(directFile) && fs.statSync(directFile).isFile()) {
                return { path: directFile };
              }
            }
          }

          // Check if custom externals requested it (unless it is a virtual shim)
          if (customExternalsSet.has(args.path)) {
            return { path: args.path, external: true };
          }
          for (const ext of customExternalsSet) {
            if (args.path === ext || args.path.startsWith(`${ext}/`)) {
              return { path: args.path, external: true };
            }
          }
        }

        return null;
      });

      // Load contents for virtual shims
      build.onLoad({ filter: /.*/, namespace: 'virtual-shim' }, args => {
        const shimCode = getVirtualShim(args.path);
        return {
          contents: shimCode || 'export default {};',
          loader: 'js',
        };
      });
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
        detectedMocks: [],
      };
    }

    try {
      const detectedMocks = new Set<string>();

      const externalSet = new Set(
        [
          'node:*',
          'cloudflare:*',
          ...CLOUDFLARE_NODE_COMPAT_MODULES,
          ...CLOUDFLARE_NODE_COMPAT_MODULES.map(m => `node:${m}`),
          ...(plan.externalDependencies || []),
        ].filter(m => !isVirtualShimModule(m) && !isVirtualShimModule(m.replace(/^node:/, '')))
      );

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

      const reqIdent = 'require';
      const nodeRequireBanner = [
        `import { createRequire as __createRequire__ } from 'node:module';`,
        `var ${reqIdent};`,
        `try {`,
        `  var __cf_meta_url__ = (typeof import.meta !== 'undefined' && import.meta && typeof import.meta.url === 'string' && import.meta.url) || 'file:///worker.js';`,
        `  ${reqIdent} = __createRequire__(__cf_meta_url__);`,
        `} catch {`,
        `  ${reqIdent} = function(mod) { throw new Error('Dynamic ' + '${reqIdent}' + ' of "' + mod + '" is not supported in this runtime isolate.'); };`,
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
        plugins: [
          createCloudflareWorkersPlugin(
            workspace,
            plan.externalDependencies || [],
            detectedMocks
          ),
        ],
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
        detectedMocks: Array.from(detectedMocks),
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
