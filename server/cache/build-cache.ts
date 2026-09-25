import crypto from 'crypto';
import { AstModuleInfo, AssetRecord, ProjectWorkspace } from '@/types/bundler';

const MAX_CACHE_ENTRIES = 1000;

interface CachedFileAnalysis {
  hash: string;
  astModule?: AstModuleInfo;
  assetRecord?: AssetRecord;
}

export class BuildCache {
  private static fileCache = new Map<string, CachedFileAnalysis>();
  private static workspaceHashMap = new Map<string, string>();

  private static evictLru<K, V>(map: Map<K, V>): void {
    if (map.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = map.keys().next().value;
      if (oldestKey !== undefined) {
        map.delete(oldestKey);
      }
    }
  }

  /**
   * Generates a deterministic SHA-256 hash of a file's content or binary buffer.
   */
  static hashFile(content?: string, bufferBase64?: string): string {
    const hash = crypto.createHash('sha256');
    if (bufferBase64) {
      hash.update(Buffer.from(bufferBase64, 'base64'));
    } else if (content) {
      hash.update(Buffer.from(content, 'utf8'));
    } else {
      hash.update('');
    }
    return hash.digest('hex');
  }

  /**
   * Generates a composite hash for the entire workspace.
   */
  static hashWorkspace(workspace: ProjectWorkspace): string {
    const cachedHash = this.workspaceHashMap.get(workspace.id);
    const hash = crypto.createHash('sha256');
    const sortedFiles = [...workspace.files].sort((a, b) => a.path.localeCompare(b.path));
    for (const f of sortedFiles) {
      hash.update(f.path);
      hash.update(String(f.size));
      if (f.bufferBase64) hash.update(f.bufferBase64);
      else if (f.content) hash.update(f.content);
    }
    const finalHash = hash.digest('hex');

    // LRU set
    if (this.workspaceHashMap.has(workspace.id)) {
      this.workspaceHashMap.delete(workspace.id);
    } else {
      this.evictLru(this.workspaceHashMap);
    }
    this.workspaceHashMap.set(workspace.id, finalHash);

    return finalHash;
  }

  static getAst(filePath: string, fileHash: string): AstModuleInfo | undefined {
    const cached = this.fileCache.get(filePath);
    if (cached && cached.hash === fileHash) {
      // Refresh LRU order
      this.fileCache.delete(filePath);
      this.fileCache.set(filePath, cached);
      return cached.astModule;
    }
    return undefined;
  }

  static setAst(filePath: string, fileHash: string, astModule: AstModuleInfo): void {
    const existing = this.fileCache.get(filePath) || { hash: fileHash };
    existing.hash = fileHash;
    existing.astModule = astModule;

    if (this.fileCache.has(filePath)) {
      this.fileCache.delete(filePath);
    } else {
      this.evictLru(this.fileCache);
    }
    this.fileCache.set(filePath, existing);
  }

  static getAsset(filePath: string, fileHash: string): AssetRecord | undefined {
    const cached = this.fileCache.get(filePath);
    if (cached && cached.hash === fileHash) {
      // Refresh LRU order
      this.fileCache.delete(filePath);
      this.fileCache.set(filePath, cached);
      return cached.assetRecord;
    }
    return undefined;
  }

  static setAsset(filePath: string, fileHash: string, assetRecord: AssetRecord): void {
    const existing = this.fileCache.get(filePath) || { hash: fileHash };
    existing.hash = fileHash;
    existing.assetRecord = assetRecord;

    if (this.fileCache.has(filePath)) {
      this.fileCache.delete(filePath);
    } else {
      this.evictLru(this.fileCache);
    }
    this.fileCache.set(filePath, existing);
  }

  static clear(): void {
    this.fileCache.clear();
    this.workspaceHashMap.clear();
  }
}
