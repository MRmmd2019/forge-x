import crypto from 'crypto';
import {
  AssetRecord,
  AssetSizePrediction,
  ProjectWorkspace,
} from '@/types/bundler';
import { getMimeType } from '@/server/assets/mime';
import { BuildCache } from '@/server/cache/build-cache';

const MAX_WORKER_BYTES = 64 * 1024 * 1024; // 64 MiB Cloudflare hard limit

const NON_EMBEDDABLE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.map',
  '.env',
  '.pem',
  '.key',
  '.crt',
  '.cert',
  '.pfx',
  '.p12',
  '.db',
  '.sqlite',
  '.sqlite3',
  '.prisma',
]);

const NON_EMBEDDABLE_FILENAMES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'tsconfig.base.json',
  'jsconfig.json',
  'wrangler.toml',
  'wrangler.json',
  'wrangler.jsonc',
  '.gitignore',
  '.gitattributes',
  '.gitmodules',
  '.editorconfig',
  '.dockerignore',
  'dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.prettierrc',
  '.prettierignore',
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'vite.config.js',
  'vite.config.ts',
  'webpack.config.js',
  'rollup.config.js',
  'postcss.config.js',
  'postcss.config.mjs',
  'tailwind.config.js',
  'tailwind.config.ts',
  'readme.md',
  'readme.txt',
  'license',
  'license.md',
  'license.txt',
  'changelog.md',
  'contributing.md',
  'code_of_conduct.md',
  'security.md',
  'database.json',
  'ormconfig.json',
  'knexfile.js',
  'credentials.json',
  'service-account.json',
]);

const NON_EMBEDDABLE_DIRS = new Set([
  '.github',
  '.git',
  '.vscode',
  '.idea',
  '.husky',
  'node_modules',
  'coverage',
  'tests',
  'test',
  '__tests__',
  'scripts',
  'server',
  'backend',
  'api',
  'prisma',
  'migrations',
  'secrets',
]);

const CLIENT_FACING_DIRS = new Set([
  'public',
  'dist',
  'build',
  'out',
  'static',
  'assets',
  'client',
]);

export function isEmbeddableAsset(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalized.split('/');
  const basename = segments[segments.length - 1]?.toLowerCase() || '';

  // Exclude ignored/private directories
  if (segments.slice(0, -1).some(seg => NON_EMBEDDABLE_DIRS.has(seg.toLowerCase()))) {
    return false;
  }

  // Strictly disallow all environment files (.env, .env.local, .env.production, etc.)
  if (basename === '.env' || basename.startsWith('.env.') || basename.startsWith('.env')) {
    return false;
  }

  // Exclude test files
  if (basename.includes('.test.') || basename.includes('.spec.')) {
    return false;
  }

  // Exclude sensitive database, credentials, and secret files
  if (
    basename.includes('secret') ||
    basename.includes('credential') ||
    basename.includes('service-account') ||
    basename.includes('private-key') ||
    basename.startsWith('.npmrc')
  ) {
    return false;
  }

  // Exclude exact metadata & config files
  if (
    NON_EMBEDDABLE_FILENAMES.has(basename) ||
    basename.startsWith('readme') ||
    basename.startsWith('.eslintrc') ||
    basename.startsWith('.prettierrc')
  ) {
    return false;
  }

  const dotIdx = basename.lastIndexOf('.');
  const ext = dotIdx !== -1 ? basename.slice(dotIdx) : '';

  // Exclude non-embeddable extensions (.ts, .tsx, keys, certs, DBs, etc.)
  if (NON_EMBEDDABLE_EXTENSIONS.has(ext)) {
    return false;
  }

  // Strictly disallow server-side JavaScript source files (.js, .mjs, .cjs)
  // Only permit JS files if they reside in explicit client-facing distribution folders
  // (e.g. public/, dist/, build/, out/, static/, assets/)
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    const parentDirs = segments.slice(0, -1).map(s => s.toLowerCase());
    const isClientFacing = parentDirs.some(dir => CLIENT_FACING_DIRS.has(dir));
    if (!isClientFacing) {
      return false;
    }
  }

  return true;
}

export class AssetEmbedder {
  static prepareAssets(
    workspace: ProjectWorkspace,
    htmlEntry?: string
  ): {
    records: AssetRecord[];
    routesMap: Record<string, AssetRecord>;
    totalAssetSizeBytes: number;
  } {
    const records: AssetRecord[] = [];
    const routesMap: Record<string, AssetRecord> = {};
    let totalAssetSizeBytes = 0;

    // Filter out repo metadata, lockfiles, dev configs, and raw TS sources
    const eligibleFiles = workspace.files.filter(f => isEmbeddableAsset(f.path));

    // Sort files deterministically by path
    const sortedFiles = [...eligibleFiles].sort((a, b) => a.path.localeCompare(b.path));

    for (const f of sortedFiles) {
      const fileHash = BuildCache.hashFile(f.content, f.bufferBase64);
      let record = BuildCache.getAsset(f.path, fileHash);

      if (!record) {
        const mime = getMimeType(f.path);
        const isBinary = f.isBinary;

        let data = '';
        let rawLength = f.size;
        let encoding: 'utf8' | 'base64' = 'utf8';

        if (isBinary && f.bufferBase64) {
          data = f.bufferBase64;
          encoding = 'base64';
          rawLength = Buffer.from(f.bufferBase64, 'base64').length;
        } else if (f.content !== undefined) {
          data = f.content;
          encoding = 'utf8';
          rawLength = Buffer.byteLength(f.content, 'utf8');
        }

        const hash = crypto
          .createHash('sha256')
          .update(encoding === 'base64' ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf8'))
          .digest('hex')
          .slice(0, 16);

        // Clean route
        const cleanPath = f.path.replace(/^\/+/, '');
        const primaryRoute = `/${cleanPath}`;

        record = {
          route: primaryRoute,
          filePath: f.path,
          mimeType: mime,
          size: rawLength,
          isBinary,
          hash,
          encoding,
          data,
        };

        BuildCache.setAsset(f.path, fileHash, record);
      }

      totalAssetSizeBytes += record.size;
      records.push(record);

      const cleanPath = f.path.replace(/^\/+/, '');
      routesMap[record.route] = record;
      routesMap[cleanPath] = record;

      // Map root "/" to main htmlEntry or index.html
      if (htmlEntry && (f.path === htmlEntry || cleanPath === 'index.html')) {
        routesMap['/'] = record;
      }
    }

    return {
      records,
      routesMap,
      totalAssetSizeBytes,
    };
  }

  /**
   * Pre-build size prediction to catch size limits before expensive bundling.
   */
  static predictWorkerSize(
    workspace: ProjectWorkspace,
    estimatedJsBundleSizeBytes: number = 250 * 1024
  ): AssetSizePrediction {
    let sourceAssetSizeBytes = 0;
    let base64AssetOverheadBytes = 0;

    for (const f of workspace.files) {
      if (!isEmbeddableAsset(f.path)) continue;

      if (f.isBinary && f.bufferBase64) {
        const rawBytes = Buffer.from(f.bufferBase64, 'base64').length;
        sourceAssetSizeBytes += rawBytes;
        // Base64 string in JSON adds ~33.3% overhead plus quotation/serialization
        base64AssetOverheadBytes += Math.ceil(rawBytes * 1.37);
      } else if (f.content) {
        const textBytes = Buffer.byteLength(f.content, 'utf8');
        sourceAssetSizeBytes += textBytes;
        base64AssetOverheadBytes += textBytes + 20; // JSON string overhead
      }
    }

    const estimatedWorkerSizeBytes =
      estimatedJsBundleSizeBytes + base64AssetOverheadBytes + 15 * 1024; // Runtime wrapper ~15KB

    let status: AssetSizePrediction['status'] = 'SAFE';
    if (estimatedWorkerSizeBytes >= MAX_WORKER_BYTES) {
      status = 'REJECT';
    } else if (estimatedWorkerSizeBytes >= 60 * 1024 * 1024) {
      status = 'NEAR_LIMIT';
    } else if (estimatedWorkerSizeBytes >= 56 * 1024 * 1024) {
      status = 'HIGH_WARNING';
    } else if (estimatedWorkerSizeBytes >= 50 * 1024 * 1024) {
      status = 'WARNING';
    }

    return {
      sourceAssetSizeBytes,
      estimatedWorkerSizeBytes,
      estimatedJsBundleSizeBytes,
      status,
      headroomBytes: Math.max(0, MAX_WORKER_BYTES - estimatedWorkerSizeBytes),
      maxAllowedBytes: MAX_WORKER_BYTES,
    };
  }

  /**
   * Validates that asset links in HTML and CSS actually resolve to existing workspace files.
   */
  static validateAssetReferences(
    workspace: ProjectWorkspace,
    htmlScriptReferences: { htmlFile: string; scriptSrc: string }[],
    htmlStyleReferences: { htmlFile: string; href: string }[],
    cssAssetReferences: { cssFile: string; assetUrl: string }[]
  ): { missingReferences: { file: string; reference: string; type: string }[] } {
    const missingReferences: { file: string; reference: string; type: string }[] = [];
    const allPaths = new Set(workspace.files.map(f => f.path.replace(/^\/+/, '')));

    for (const s of htmlScriptReferences) {
      const clean = s.scriptSrc.replace(/^\.\//, '').replace(/^\//, '');
      if (!allPaths.has(clean) && !workspace.files.some(f => f.path.endsWith(clean))) {
        missingReferences.push({ file: s.htmlFile, reference: s.scriptSrc, type: 'script' });
      }
    }

    for (const h of htmlStyleReferences) {
      const clean = h.href.replace(/^\.\//, '').replace(/^\//, '');
      if (!allPaths.has(clean) && !workspace.files.some(f => f.path.endsWith(clean))) {
        missingReferences.push({ file: h.htmlFile, reference: h.href, type: 'stylesheet' });
      }
    }

    for (const c of cssAssetReferences) {
      const clean = c.assetUrl.replace(/^\.\//, '').replace(/^\//, '').split('?')[0].split('#')[0];
      if (!allPaths.has(clean) && !workspace.files.some(f => f.path.endsWith(clean))) {
        missingReferences.push({ file: c.cssFile, reference: c.assetUrl, type: 'css_url' });
      }
    }

    return { missingReferences };
  }
}
