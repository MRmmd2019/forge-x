import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import JSZip from 'jszip';
import { ProjectWorkspace, WorkspaceFile } from '@/types/bundler';
import { isBinaryExtension } from '@/server/assets/mime';

const MAX_TOTAL_SIZE_BYTES = 80 * 1024 * 1024; // 80 MB
const MAX_SINGLE_FILE_SIZE = 30 * 1024 * 1024; // 30 MB
const MAX_FILE_COUNT = 500;
const MAX_DIR_DEPTH = 20;
const IGNORED_PATHS = new Set([
  '.git',
  '.github',
  '.gitlab',
  '.vscode',
  '.idea',
  '.husky',
  'node_modules',
  '.DS_Store',
  '__MACOSX',
  'Thumbs.db',
  '.cache',
  '.turbo',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
]);

const STANDARD_SOURCE_DIRS = new Set([
  'src',
  'lib',
  'app',
  'pages',
  'components',
  'public',
  'assets',
  'static',
  'dist',
  'build',
  'server',
  'client',
  'routes',
  'test',
  'tests',
  'docs',
  'config',
  'utils',
  'styles',
  'types',
  'functions',
  'api',
]);

export class WorkspaceManager {
  public static calculateCommonRootPrefix(paths: string[]): string {
    const cleanPaths = paths
      .map(p => p.replace(/\\/g, '/').replace(/^\/+/, ''))
      .filter(p => {
        if (!p) return false;
        const segs = p.split('/').filter(Boolean);
        return !segs.some(s => IGNORED_PATHS.has(s));
      });

    if (cleanPaths.length === 0) return '';

    // If every clean path has > 1 segment and shares the same top segment
    const multiSegmentPaths = cleanPaths.filter(p => p.includes('/'));
    if (multiSegmentPaths.length === 0 || multiSegmentPaths.length !== cleanPaths.length) {
      return '';
    }

    const firstSegment = multiSegmentPaths[0].split('/')[0];
    // Do not strip standard project subdirectories like src/, public/, lib/, etc.
    if (STANDARD_SOURCE_DIRS.has(firstSegment.toLowerCase())) {
      return '';
    }

    const prefix = `${firstSegment}/`;
    const allSharePrefix = cleanPaths.every(p => p.startsWith(prefix));

    return allSharePrefix ? prefix : '';
  }

  public static sanitizeRelativePath(rawPath: string): string | null {
    if (!rawPath || typeof rawPath !== 'string') return null;

    // Reject null byte injection
    if (rawPath.includes('\0')) return null;

    // Reject Windows absolute drive paths (e.g. C:\... or C:/...)
    if (/^[a-zA-Z]:[\\/]/.test(rawPath) || /^[a-zA-Z]:$/.test(rawPath)) return null;

    // Reject UNC network paths (e.g. \\server\share)
    if (rawPath.startsWith('\\\\') || rawPath.startsWith('//')) return null;

    // Normalize slashes
    const unified = rawPath.replace(/\\/g, '/');

    // Use posix normalize to resolve redundant slashes and ./
    const normalized = path.posix.normalize(unified).replace(/^\/+/, '').replace(/\/+$/, '');

    // If normalization points to root or empty
    if (!normalized || normalized === '.') return null;

    // Traversal check: posix normalize will keep ../ if it escapes
    if (normalized.startsWith('..') || normalized.includes('/../')) {
      return null;
    }

    const segments = normalized.split('/');
    if (segments.length > MAX_DIR_DEPTH) {
      return null;
    }

    for (const seg of segments) {
      if (seg === '..' || seg === '.' || seg === '') {
        return null;
      }
      if (IGNORED_PATHS.has(seg)) {
        return null;
      }
    }

    return segments.join('/');
  }

  public static isBinaryBuffer(buffer: Buffer, ext: string): boolean {
    if (isBinaryExtension(ext)) return true;
    // Check for null bytes in initial sample (standard for compiled binaries)
    const sampleSize = Math.min(buffer.length, 8192);
    for (let i = 0; i < sampleSize; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  }

  static async createFromZip(zipBuffer: Buffer, projectName = 'uploaded-project'): Promise<ProjectWorkspace> {
    const id = crypto.randomUUID();
    const tempDir = path.join(os.tmpdir(), `autobundler-${id}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      // Validate input buffer
      if (!zipBuffer || zipBuffer.length === 0) {
        throw new Error('ZIP archive is empty or invalid.');
      }

      let zip: JSZip;
      try {
        zip = await JSZip.loadAsync(zipBuffer);
      } catch (zipErr: any) {
        throw new Error(`Failed to read ZIP archive: ${zipErr.message || 'Invalid ZIP format'}`);
      }

      // Filter out directories and ignored paths (e.g. node_modules, .git, __MACOSX)
      const nonIgnoredEntries = Object.entries(zip.files).filter(([rawPath, entry]) => {
        if (entry.dir) return false;
        const normalized = rawPath.replace(/\\/g, '/');
        const segments = normalized.split('/').filter(Boolean);
        return !segments.some(s => IGNORED_PATHS.has(s));
      });

      if (nonIgnoredEntries.length === 0) {
        throw new Error('ZIP archive contains no valid source files (or all files were ignored like node_modules/.git).');
      }

      if (nonIgnoredEntries.length > MAX_FILE_COUNT) {
        throw new Error(`Project contains too many files (${nonIgnoredEntries.length}). Maximum allowed is ${MAX_FILE_COUNT}.`);
      }

      // Check zip decompression ratio for zip-bomb protection
      let totalUncompressedEstimate = 0;
      for (const [, entry] of nonIgnoredEntries) {
        if ((entry as any)._data?.uncompressedSize) {
          totalUncompressedEstimate += (entry as any)._data.uncompressedSize;
        }
      }
      if (zipBuffer.length > 0 && totalUncompressedEstimate > 10 * 1024 * 1024) {
        const ratio = totalUncompressedEstimate / zipBuffer.length;
        if (ratio > 100) {
          throw new Error(`Archive expansion ratio (${ratio.toFixed(1)}x) exceeds safe decompression limit (Zip Bomb detected).`);
        }
      }

      // Calculate common root prefix while ignoring OS hidden paths like __MACOSX
      const allZipPaths = nonIgnoredEntries.map(([p]) => p);
      const stripPrefix = this.calculateCommonRootPrefix(allZipPaths);

      const fileMap = new Map<string, WorkspaceFile>();
      let totalSize = 0;

      for (const [rawRelPath, zipEntry] of nonIgnoredEntries) {

        let effectivePath = rawRelPath;
        if (stripPrefix && effectivePath.startsWith(stripPrefix)) {
          effectivePath = effectivePath.slice(stripPrefix.length);
        }

        // Strict Zip-Slip detection
        if (effectivePath.includes('..') || effectivePath.startsWith('/') || effectivePath.startsWith('\\') || /^[a-zA-Z]:/.test(effectivePath)) {
          throw new Error(`Security violation: Path traversal (Zip Slip) attempt detected in "${effectivePath}".`);
        }

        const cleanRelPath = this.sanitizeRelativePath(effectivePath);
        if (!cleanRelPath) continue;

        const fileBuffer = await zipEntry.async('nodebuffer');

        if (fileBuffer.length > MAX_SINGLE_FILE_SIZE) {
          throw new Error(`File "${cleanRelPath}" size (${(fileBuffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds single file limit of 30 MB.`);
        }

        totalSize += fileBuffer.length;
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
          throw new Error(`Project uncompressed size exceeds limit of 80MB.`);
        }

        const dotIdx = cleanRelPath.lastIndexOf('.');
        const ext = dotIdx !== -1 ? cleanRelPath.slice(dotIdx).toLowerCase() : '';
        const isBinary = this.isBinaryBuffer(fileBuffer, ext);

        // Write to isolated disk directory
        const destFullPath = path.join(tempDir, cleanRelPath);
        // Canonical check: destFullPath must reside within tempDir
        const resolvedDest = path.resolve(destFullPath);
        if (!resolvedDest.startsWith(path.resolve(tempDir) + path.sep)) {
          throw new Error(`Security violation: Extracted file path "${cleanRelPath}" escapes workspace directory.`);
        }

        await fs.promises.mkdir(path.dirname(resolvedDest), { recursive: true });
        await fs.promises.writeFile(resolvedDest, fileBuffer);

        // Deduplicate: later entry overrides previous with same path
        fileMap.set(cleanRelPath, {
          path: cleanRelPath,
          size: fileBuffer.length,
          extension: ext,
          isBinary,
          content: !isBinary ? fileBuffer.toString('utf-8') : undefined,
          bufferBase64: isBinary ? fileBuffer.toString('base64') : undefined,
        });
      }

      const files = Array.from(fileMap.values());
      if (files.length === 0) {
        throw new Error('No valid files found in the archive after sanitization.');
      }

      return {
        id,
        name: projectName,
        createdAt: Date.now(),
        dirPath: tempDir,
        files,
        totalSize,
      };
    } catch (err) {
      await this.cleanup(tempDir);
      throw err;
    }
  }

  static async createFromFiles(
    uploadedFiles: { path: string; content?: string; bufferBase64?: string; rawBuffer?: Buffer }[],
    projectName = 'uploaded-project'
  ): Promise<ProjectWorkspace> {
    const id = crypto.randomUUID();
    const tempDir = path.join(os.tmpdir(), `autobundler-${id}`);
    await fs.promises.mkdir(tempDir, { recursive: true });

    try {
      if (!uploadedFiles || uploadedFiles.length === 0) {
        throw new Error('No files provided for project workspace.');
      }

      // Filter out ignored paths (e.g. node_modules, .git, .cache)
      const filteredFiles = uploadedFiles.filter(item => {
        const normalized = (item.path || '').replace(/\\/g, '/');
        const segments = normalized.split('/').filter(Boolean);
        return !segments.some(s => IGNORED_PATHS.has(s));
      });

      if (filteredFiles.length === 0) {
        throw new Error('No valid files provided for project workspace (all files were in ignored directories like node_modules/.git).');
      }

      if (filteredFiles.length > MAX_FILE_COUNT) {
        throw new Error(`Project contains too many files (${filteredFiles.length}). Limit is ${MAX_FILE_COUNT}.`);
      }

      // Calculate common root prefix if folder was uploaded
      const allPaths = filteredFiles.map(u => u.path);
      const stripPrefix = this.calculateCommonRootPrefix(allPaths);

      const fileMap = new Map<string, WorkspaceFile>();
      let totalSize = 0;

      for (const item of filteredFiles) {
        let effectivePath = item.path;
        if (stripPrefix && effectivePath.startsWith(stripPrefix)) {
          effectivePath = effectivePath.slice(stripPrefix.length);
        }

        if (effectivePath.includes('..') || effectivePath.startsWith('/') || effectivePath.startsWith('\\') || /^[a-zA-Z]:/.test(effectivePath)) {
          throw new Error(`Security violation: Path traversal attempt detected in "${effectivePath}".`);
        }

        const cleanRelPath = this.sanitizeRelativePath(effectivePath);
        if (!cleanRelPath) continue;

        const dotIdx = cleanRelPath.lastIndexOf('.');
        const ext = dotIdx !== -1 ? cleanRelPath.slice(dotIdx).toLowerCase() : '';

        let buffer: Buffer = Buffer.alloc(0);
        if (item.rawBuffer && Buffer.isBuffer(item.rawBuffer)) {
          buffer = item.rawBuffer;
        } else if (item.bufferBase64) {
          buffer = Buffer.from(item.bufferBase64, 'base64');
        } else if (item.content !== undefined) {
          buffer = Buffer.from(item.content, 'utf-8');
        } else {
          buffer = Buffer.alloc(0);
        }

        if (buffer.length > MAX_SINGLE_FILE_SIZE) {
          throw new Error(`File "${cleanRelPath}" size exceeds single file limit of 30 MB.`);
        }

        totalSize += buffer.length;
        if (totalSize > MAX_TOTAL_SIZE_BYTES) {
          throw new Error(`Project size exceeds limit of 80MB.`);
        }

        const isBinary = this.isBinaryBuffer(buffer, ext);

        const destFullPath = path.join(tempDir, cleanRelPath);
        const resolvedDest = path.resolve(destFullPath);
        if (!resolvedDest.startsWith(path.resolve(tempDir) + path.sep)) {
          throw new Error(`Security violation: File path "${cleanRelPath}" escapes workspace directory.`);
        }

        await fs.promises.mkdir(path.dirname(resolvedDest), { recursive: true });
        await fs.promises.writeFile(resolvedDest, buffer);

        fileMap.set(cleanRelPath, {
          path: cleanRelPath,
          size: buffer.length,
          extension: ext,
          isBinary,
          content: !isBinary ? buffer.toString('utf-8') : undefined,
          bufferBase64: isBinary ? buffer.toString('base64') : undefined,
        });
      }

      const files = Array.from(fileMap.values());
      if (files.length === 0) {
        throw new Error('No valid files provided for project workspace.');
      }

      return {
        id,
        name: projectName,
        createdAt: Date.now(),
        dirPath: tempDir,
        files,
        totalSize,
      };
    } catch (err) {
      await this.cleanup(tempDir);
      throw err;
    }
  }

  static async cleanup(dirPath: string): Promise<void> {
    try {
      if (fs.existsSync(dirPath)) {
        await fs.promises.rm(dirPath, { recursive: true, force: true });
      }
    } catch (e) {
      console.error('Failed to cleanup temp workspace directory:', e);
    }
  }
}
