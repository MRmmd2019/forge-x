import {
  BuildOptions,
  BuildPlan,
  ProjectWorkspace,
  ScanResult,
  StaticAnalysisResult,
} from '@/types/bundler';

/**
 * DeterministicPlanner (AutoForge Build Engine)
 * 
 * Generates reproducible, typed BuildPlan without external network calls or LLM heuristics.
 * Adheres strictly to Section 2.1 & 2.2 of the AutoForge Master Product Specification.
 */
export class DeterministicPlanner {
  public static plan(
    workspace: ProjectWorkspace,
    scan: ScanResult,
    analysis: StaticAnalysisResult,
    options?: BuildOptions
  ): BuildPlan {
    // 1. Entry Point Resolution
    let chosenEntry = analysis.entryCandidates[0]?.path;
    let entryRationale = '';

    if (chosenEntry) {
      const topCandidate = analysis.entryCandidates[0];
      entryRationale = `Selected top ranked entry point "${chosenEntry}" with confidence score ${topCandidate.score}% (${topCandidate.reason}).`;
    } else {
      // Fallback search in scanned files
      const jsTsFile = scan.files.find(
        f => f.category === 'javascript' || f.category === 'typescript'
      );
      if (jsTsFile) {
        chosenEntry = jsTsFile.path;
        entryRationale = `Selected primary source file "${chosenEntry}" as entry candidate.`;
      } else if (analysis.htmlEntry) {
        chosenEntry = analysis.htmlEntry;
        entryRationale = `Selected HTML entry point "${analysis.htmlEntry}" for static web worker.`;
      } else {
        chosenEntry = 'index.js';
        entryRationale = 'Defaulted to index.js fallback.';
      }
    }

    // 2. Worker Mode Resolution
    let workerMode: BuildPlan['workerMode'] = 'static_with_assets';
    if (analysis.hasWorkerFetchHandler) {
      workerMode = analysis.htmlEntry || scan.assetFilesCount > 0
        ? 'hybrid_api_and_assets'
        : 'native_worker';
    } else if (analysis.htmlEntry || scan.assetFilesCount > 0) {
      workerMode = 'static_with_assets';
    } else {
      workerMode = 'native_worker';
    }

    // 3. Node Compatibility & Flags
    const warnings: string[] = [];
    const compatibilityFlags: string[] = [];
    const externalDependencies: string[] = [];

    const hasNodeBuiltins = analysis.nodeApiUsages.length > 0;
    if (hasNodeBuiltins) {
      compatibilityFlags.push('nodejs_compat');
      
      // Externalize platform-supported Node built-ins
      for (const usage of analysis.nodeApiUsages) {
        if (usage.status === 'SAFE' || usage.status === 'WARNING') {
          const mod = usage.moduleName.startsWith('node:')
            ? usage.moduleName
            : `node:${usage.moduleName}`;
          if (!externalDependencies.includes(mod)) {
            externalDependencies.push(mod);
          }
          if (!externalDependencies.includes(usage.moduleName)) {
            externalDependencies.push(usage.moduleName);
          }
        }
      }

      const unsupportedNode = analysis.nodeApiUsages.filter(u => u.status === 'UNSUPPORTED');
      if (unsupportedNode.length > 0) {
        warnings.push(
          `Project references Node.js APIs not natively supported on Workers: ${unsupportedNode.map(u => u.moduleName).join(', ')}.`
        );
      }
    }

    // 4. Asset Embedding Policy
    const embedAssets = true;
    const assetStrategy = options?.assetStrategy || 'inline_bytes';

    // 5. Target & Minification
    const target = options?.target || 'es2022';
    const minify = options?.minify !== undefined ? options.minify : true;
    const sourceMap = options?.sourceMap !== undefined ? options.sourceMap : false;

    // 6. Final Deterministic Plan
    return {
      entry: chosenEntry,
      format: 'esm',
      target,
      minify,
      sourceMap,
      htmlEntry: analysis.htmlEntry,
      embedAssets,
      assetStrategy,
      workerMode,
      externalDependencies,
      compatibilityFlags,
      warnings,
      rationale: `Deterministic Plan: ${entryRationale} Mode: ${workerMode}. Compatibility: ${compatibilityFlags.join(', ') || 'standard'}.`,
    };
  }
}
