import crypto from 'crypto';
import { AstModuleInfo, AssetRecord, ProjectWorkspace } from '@/types/bundler';

interface CachedFileAnalysis {
  hash: string;
  astModule?: AstModuleInfo;
  assetRecord?: AssetRecord;
}

export class BuildCache {
  private static fileCache = new Map<string, CachedFileAnalysis>();
  private static workspaceHashMap = new Map<string, string>();

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
    const hash = crypto.createHash('sha256');
    const sortedFiles = [...workspace.files].sort((a, b) => a.path.localeCompare(b.path));
    for (const f of sortedFiles) {
      hash.update(f.path);
      hash.update(String(f.size));
      if (f.bufferBase64) hash.update(f.bufferBase64);
      else if (f.content) hash.update(f.content);
    }
    return hash.digest('hex');
  }

  static getAst(filePath: string, fileHash: string): AstModuleInfo | undefined {
    const cached = this.fileCache.get(filePath);
    if (cached && cached.hash === fileHash) {
      return cached.astModule;
    }
    return undefined;
  }

  static setAst(filePath: string, fileHash: string, astModule: AstModuleInfo): void {
    const existing = this.fileCache.get(filePath) || { hash: fileHash };
    existing.hash = fileHash;
    existing.astModule = astModule;
    this.fileCache.set(filePath, existing);
  }

  static getAsset(filePath: string, fileHash: string): AssetRecord | undefined {
    const cached = this.fileCache.get(filePath);
    if (cached && cached.hash === fileHash) {
      return cached.assetRecord;
    }
    return undefined;
  }

  static setAsset(filePath: string, fileHash: string, assetRecord: AssetRecord): void {
    const existing = this.fileCache.get(filePath) || { hash: fileHash };
    existing.hash = fileHash;
    existing.assetRecord = assetRecord;
    this.fileCache.set(filePath, existing);
  }

  static clear(): void {
    this.fileCache.clear();
    this.workspaceHashMap.clear();
  }
}
