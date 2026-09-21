import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { ProjectWorkspace, StaticAnalysisResult } from '@/types/bundler';
import { CLOUDFLARE_NODE_COMPAT_MODULES } from '@/server/builder/esbuild-builder';

const execFileAsync = promisify(execFile);

export interface DependencyResolutionResult {
  installed: string[];
  skipped: string[];
  failed: string[];
  durationMs: number;
}

export const ALL_NODE_BUILTIN_MODULES = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring', 'readline',
  'repl', 'stream', 'string_decoder', 'timers', 'tls', 'trace_events', 'tty',
  'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
]);

export class DependencyManager {
  /**
   * Determine whether a module specifier is an npm package dependency.
   */
  public static isNpmPackageSpecifier(specifier: string): boolean {
    if (!specifier || typeof specifier !== 'string') return false;
    const trimmed = specifier.trim();
    if (!trimmed) return false;

    // Relative, absolute, or URL imports are not npm packages
    if (
      trimmed.startsWith('.') ||
      trimmed.startsWith('/') ||
      trimmed.startsWith('\\') ||
      trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('data:')
    ) {
      return false;
    }

    // Platform-specific protocols
    if (trimmed.startsWith('node:') || trimmed.startsWith('cloudflare:') || trimmed === 'workerd') {
      return false;
    }

    // Extract base package identifier
    const baseModule = trimmed.startsWith('@')
      ? trimmed.split('/').slice(0, 2).join('/')
      : trimmed.split('/')[0];

    // Filter all Node.js built-in modules
    if (
      ALL_NODE_BUILTIN_MODULES.has(baseModule) ||
      ALL_NODE_BUILTIN_MODULES.has(trimmed) ||
      CLOUDFLARE_NODE_COMPAT_MODULES.includes(baseModule) ||
      CLOUDFLARE_NODE_COMPAT_MODULES.includes(trimmed)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Extract base package name from an import specifier.
   * e.g.:
   *  "jose" -> "jose"
   *  "@scope/pkg/foo" -> "@scope/pkg"
   *  "lodash/merge" -> "lodash"
   */
  public static extractPackageName(specifier: string): string {
    const trimmed = specifier.trim();
    if (trimmed.startsWith('@')) {
      const parts = trimmed.split('/');
      return parts.slice(0, 2).join('/');
    }
    return trimmed.split('/')[0];
  }

  /**
   * Checks if a package is already installed either in workspace node_modules or system node_modules.
   */
  public static isPackageInstalled(workspaceDir: string, packageName: string): boolean {
    try {
      const wsPkgPath = path.join(workspaceDir, 'node_modules', packageName);
      if (fs.existsSync(wsPkgPath)) return true;

      const sysPkgPath = path.join(process.cwd(), 'node_modules', packageName);
      if (fs.existsSync(sysPkgPath)) return true;
    } catch {}
    return false;
  }

  /**
   * Analyze required packages from package.json and source imports, and install any that are missing.
   */
  public static async resolveAndInstall(
    workspace: ProjectWorkspace,
    analysis: StaticAnalysisResult
  ): Promise<DependencyResolutionResult> {
    const startTime = Date.now();
    const neededPackages = new Set<string>();

    // 1. Check package.json dependencies and devDependencies
    const pkgJsonPath = path.join(workspace.dirPath, 'package.json');
    let hasPackageJson = false;

    if (fs.existsSync(pkgJsonPath)) {
      try {
        const raw = await fs.promises.readFile(pkgJsonPath, 'utf8');
        const parsed = JSON.parse(raw);
        hasPackageJson = true;

        if (parsed.dependencies && typeof parsed.dependencies === 'object') {
          for (const pkg of Object.keys(parsed.dependencies)) {
            if (this.isNpmPackageSpecifier(pkg)) {
              neededPackages.add(this.extractPackageName(pkg));
            }
          }
        }
        if (parsed.devDependencies && typeof parsed.devDependencies === 'object') {
          for (const pkg of Object.keys(parsed.devDependencies)) {
            if (this.isNpmPackageSpecifier(pkg)) {
              neededPackages.add(this.extractPackageName(pkg));
            }
          }
        }
      } catch {}
    }

    // 2. Check AST imported specifiers across all modules
    for (const [, graphNode] of Object.entries(analysis.importGraph)) {
      const allImports = [...(graphNode.imports || []), ...(graphNode.dynamicImports || [])];
      for (const imp of allImports) {
        if (this.isNpmPackageSpecifier(imp)) {
          const pkgName = this.extractPackageName(imp);
          // Verify it's not a local file in workspace without leading ./
          const isLocalFile = workspace.files.some(f => {
            const normalized = f.path.replace(/\\/g, '/');
            return (
              normalized === imp ||
              normalized === `${imp}.ts` ||
              normalized === `${imp}.js` ||
              normalized === `${imp}.tsx` ||
              normalized === `${imp}.jsx` ||
              normalized.endsWith(`/${imp}.ts`) ||
              normalized.endsWith(`/${imp}.js`)
            );
          });

          if (!isLocalFile) {
            neededPackages.add(pkgName);
          }
        }
      }
    }

    const missingPackages: string[] = [];
    const skippedPackages: string[] = [];

    for (const pkg of neededPackages) {
      if (this.isPackageInstalled(workspace.dirPath, pkg)) {
        skippedPackages.push(pkg);
      } else {
        missingPackages.push(pkg);
      }
    }

    const installed: string[] = [];
    const failed: string[] = [];

    if (missingPackages.length > 0) {
      try {
        // Ensure workspace dir has a minimal package.json if none exists
        if (!hasPackageJson && !fs.existsSync(pkgJsonPath)) {
          await fs.promises.writeFile(
            pkgJsonPath,
            JSON.stringify({ name: 'workspace-project', private: true }, null, 2),
            'utf8'
          );
        }

        // Limit concurrent install to 30 packages to prevent command line length issues
        const batchToInstall = missingPackages.slice(0, 30);
        const args = [
          'install',
          ...batchToInstall,
          '--no-audit',
          '--no-fund',
          '--prefer-offline',
          '--silent',
        ];

        await execFileAsync('npm', args, {
          cwd: workspace.dirPath,
          timeout: 45000,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            npm_config_yes: 'true',
          },
        });

        installed.push(...batchToInstall);
      } catch (err: any) {
        failed.push(...missingPackages);
      }
    }

    return {
      installed,
      skipped: skippedPackages,
      failed,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Install a single package on demand (e.g., during deterministic repair).
   */
  public static async installSinglePackage(
    workspaceDir: string,
    packageName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!this.isNpmPackageSpecifier(packageName)) {
      return { success: false, error: `${packageName} is not an npm package specifier.` };
    }

    const cleanPkg = this.extractPackageName(packageName);
    if (this.isPackageInstalled(workspaceDir, cleanPkg)) {
      return { success: true };
    }

    try {
      const pkgJsonPath = path.join(workspaceDir, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) {
        await fs.promises.writeFile(
          pkgJsonPath,
          JSON.stringify({ name: 'workspace-project', private: true }, null, 2),
          'utf8'
        );
      }

      await execFileAsync(
        'npm',
        ['install', cleanPkg, '--no-audit', '--no-fund', '--prefer-offline', '--silent'],
        {
          cwd: workspaceDir,
          timeout: 30000,
          env: {
            ...process.env,
            NODE_ENV: 'production',
            npm_config_yes: 'true',
          },
        }
      );

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || `Failed to install ${cleanPkg}` };
    }
  }
}
