export const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.ts': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

export function getMimeType(filePath: string): string {
  const dotIndex = filePath.lastIndexOf('.');
  if (dotIndex === -1) return 'application/octet-stream';
  const ext = filePath.slice(dotIndex).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

export function isBinaryExtension(ext: string): boolean {
  const binaryExtensions = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif',
    '.woff', '.woff2', '.ttf', '.otf', '.eot',
    '.wasm', '.pdf', '.zip', '.mp3', '.mp4'
  ]);
  return binaryExtensions.has(ext.toLowerCase());
}

export function isTextExtension(ext: string): boolean {
  const textExtensions = new Set([
    '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts',
    '.html', '.htm', '.css', '.json', '.txt', '.csv',
    '.svg', '.xml', '.md', '.webmanifest'
  ]);
  return textExtensions.has(ext.toLowerCase());
}
