import {
  DirectoryTreeNode,
  FileCategory,
  ProjectWorkspace,
  ScannedFileInfo,
  ScanResult,
} from '@/types/bundler';

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export function categorizeFile(ext: string): FileCategory {
  switch (ext.toLowerCase()) {
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.html':
    case '.htm':
    case '.css':
      return 'web';
    case '.json':
    case '.txt':
    case '.csv':
      return 'data';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.webp':
    case '.gif':
    case '.ico':
    case '.avif':
    case '.svg':
      return 'binary_image';
    case '.woff':
    case '.woff2':
    case '.ttf':
    case '.otf':
    case '.eot':
      return 'binary_font';
    case '.config.js':
    case '.config.ts':
    case '.env':
    case '.gitignore':
      return 'config';
    default:
      return 'unsupported';
  }
}

export function buildDirectoryTree(files: { path: string; size: number; extension: string }[]): DirectoryTreeNode {
  const root: DirectoryTreeNode = {
    name: 'root',
    path: '',
    type: 'directory',
    children: [],
  };

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join('/');

      if (!current.children) {
        current.children = [];
      }

      let existing = current.children.find(child => child.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          size: isFile ? file.size : undefined,
          extension: isFile ? file.extension : undefined,
          children: isFile ? undefined : [],
        };
        current.children.push(existing);
      }

      if (!isFile) {
        current = existing;
      }
    }
  }

  // Sort children: directories first, then files alphabetically
  const sortNode = (node: DirectoryTreeNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const child of node.children) {
        sortNode(child);
      }
    }
  };

  sortNode(root);
  return root;
}

export class ProjectScanner {
  static scan(workspace: ProjectWorkspace): ScanResult {
    const scannedFiles: ScannedFileInfo[] = [];
    let hasPackageJson = false;
    let hasTsConfig = false;
    let hasLockfile = false;
    let hasHtml = false;
    let hasCss = false;
    let hasJsTs = false;
    let sourceFilesCount = 0;
    let assetFilesCount = 0;
    let unsupportedFilesCount = 0;

    for (const f of workspace.files) {
      const category = categorizeFile(f.extension);
      const isSrc = category === 'javascript' || category === 'typescript';
      const isAsset = category === 'binary_image' || category === 'binary_font' || category === 'data';

      if (isSrc) {
        hasJsTs = true;
        sourceFilesCount++;
      } else if (isAsset) {
        assetFilesCount++;
      } else if (category === 'web') {
        if (f.extension === '.html' || f.extension === '.htm') hasHtml = true;
        if (f.extension === '.css') hasCss = true;
        sourceFilesCount++;
      } else if (category === 'unsupported') {
        unsupportedFilesCount++;
      }

      const basename = f.path.split('/').pop()?.toLowerCase() || '';
      if (basename === 'package.json') hasPackageJson = true;
      if (basename === 'tsconfig.json') hasTsConfig = true;
      if (basename.includes('lock')) hasLockfile = true;

      scannedFiles.push({
        path: f.path,
        size: f.size,
        extension: f.extension,
        category,
        isBinary: f.isBinary,
      });
    }

    const tree = buildDirectoryTree(workspace.files);

    // Determine high-level project type
    let detectedProjectType: ScanResult['detectedProjectType'] = 'vanilla_spa';
    const hasWorkerInPath = workspace.files.some(f => 
      f.path.toLowerCase().includes('worker') || 
      f.path.toLowerCase() === 'index.js' || 
      f.path.toLowerCase() === 'index.ts'
    );

    if (hasHtml && hasJsTs && assetFilesCount > 0) {
      detectedProjectType = 'hybrid';
    } else if (hasHtml && hasJsTs) {
      detectedProjectType = 'static_site';
    } else if (hasWorkerInPath && !hasHtml) {
      detectedProjectType = 'worker_native';
    } else {
      detectedProjectType = 'vanilla_spa';
    }

    return {
      fileCount: workspace.files.length,
      totalSizeBytes: workspace.totalSize,
      totalSizeFormatted: formatBytes(workspace.totalSize),
      hasPackageJson,
      hasTsConfig,
      hasLockfile,
      hasHtml,
      hasCss,
      sourceFilesCount,
      assetFilesCount,
      unsupportedFilesCount,
      files: scannedFiles,
      tree,
      detectedProjectType,
    };
  }
}
