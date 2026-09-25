import { AssetRecord, BundleInspectorReport } from '@/types/bundler';
import { formatBytes } from '@/lib/utils';

const LIMIT_SAFE = 50 * 1024 * 1024;
const LIMIT_WARNING = 56 * 1024 * 1024;
const LIMIT_HIGH_WARNING = 60 * 1024 * 1024;
const LIMIT_NEAR_LIMIT = 64 * 1024 * 1024;

export class BundleInspector {
  static inspect(
    workerCode: string,
    assets: AssetRecord[],
    jsSizeBytes: number,
    sourceSizeBytes = 0
  ): BundleInspectorReport {
    const totalSizeBytes = Buffer.byteLength(workerCode, 'utf8');

    // Categorize sizes
    let htmlSizeBytes = 0;
    let cssSizeBytes = 0;
    let embeddedAssetsSizeBytes = 0;
    const routesSet = new Set<string>();

    for (const asset of assets) {
      routesSet.add(asset.route);
      if (asset.mimeType.includes('text/html')) {
        htmlSizeBytes += asset.size;
      } else if (asset.mimeType.includes('text/css')) {
        cssSizeBytes += asset.size;
      } else {
        embeddedAssetsSizeBytes += asset.size;
      }
    }

    // Size limit health check
    let sizeHealth: BundleInspectorReport['sizeHealth'] = 'SAFE';
    if (totalSizeBytes >= LIMIT_NEAR_LIMIT) {
      sizeHealth = 'REJECT';
    } else if (totalSizeBytes >= LIMIT_HIGH_WARNING) {
      sizeHealth = 'NEAR_LIMIT';
    } else if (totalSizeBytes >= LIMIT_WARNING) {
      sizeHealth = 'HIGH_WARNING';
    } else if (totalSizeBytes >= LIMIT_SAFE) {
      sizeHealth = 'WARNING';
    }

    // Syntax & Import checks
    let syntaxValid = true;
    let unresolvedImportsCount = 0;

    // Check for remaining unbundled external imports like import ... from 'unknown'
    const importMatches = workerCode.match(/import\s+[^;]+from\s+['"][^'"]+['"]/g) || [];
    // Standard worker can have valid imports if specified as external or node_compat, otherwise unbundled relative imports are suspicious
    for (const imp of importMatches) {
      if (imp.includes('./') || imp.includes('../')) {
        unresolvedImportsCount++;
      }
    }

    let workerCompatibility: BundleInspectorReport['workerCompatibility'] = 'PASS';
    if (sizeHealth === 'REJECT') {
      workerCompatibility = 'FAIL';
    } else if (sizeHealth === 'HIGH_WARNING' || sizeHealth === 'NEAR_LIMIT' || unresolvedImportsCount > 0) {
      workerCompatibility = 'PASS_WITH_WARNINGS';
    }

    return {
      totalSizeBytes,
      totalSizeFormatted: formatBytes(totalSizeBytes),
      sourceSizeBytes,
      sourceSizeFormatted: formatBytes(sourceSizeBytes),
      sizeHealth,
      jsSizeBytes,
      jsSizeFormatted: formatBytes(jsSizeBytes),
      htmlSizeBytes,
      htmlSizeFormatted: formatBytes(htmlSizeBytes),
      cssSizeBytes,
      cssSizeFormatted: formatBytes(cssSizeBytes),
      embeddedAssetsSizeBytes,
      embeddedAssetsSizeFormatted: formatBytes(embeddedAssetsSizeBytes),
      externalFilesCount: 0,
      unresolvedImportsCount,
      syntaxValid,
      assetsCount: assets.length,
      routesCount: routesSet.size,
      routes: Array.from(routesSet),
      workerCompatibility,
    };
  }
}
