import path from 'path';
import fs from 'fs';
import {
  BuildPlan,
  NormalizedDiagnostic,
  ProjectWorkspace,
  ScanResult,
  StaticAnalysisResult,
} from '@/types/bundler';
import { DependencyManager, ALL_NODE_BUILTIN_MODULES } from '@/server/dependencies/dependency-manager';
import { CLOUDFLARE_NODE_COMPAT_MODULES } from '@/server/builder/esbuild-builder';
import { isDisallowedEntry } from '@/server/analyzer/entry-detector';

export interface DeterministicRepairResult {
  repairedPlan: BuildPlan;
  explanation: string;
  canRetry: boolean;
}

/**
 * DeterministicRepairEngine (AutoForge)
 * 
 * Rule-based deterministic compiler repairs per Section 47:
 * - Relative import path resolution & auto-healing
 * - Extension resolution (.ts/.js/.tsx)
 * - Known platform module externalization (node:*, cloudflare:*)
 * - NPM dependency auto-installation & externalization fallback
 * - Compatibility flag normalization (nodejs_compat)
 * - Safe fallback to alternative entry candidates ONLY when appropriate
 */
export class DeterministicRepairEngine {
  static async repair(params: {
    workspace: ProjectWorkspace;
    scan: ScanResult;
    analysis: StaticAnalysisResult;
    currentPlan: BuildPlan;
    diagnostics: NormalizedDiagnostic[];
    attemptNumber: number;
  }): Promise<DeterministicRepairResult> {
    const { workspace, scan, analysis, currentPlan, diagnostics, attemptNumber } = params;

    const repairedPlan: BuildPlan = {
      ...currentPlan,
      externalDependencies: [...(currentPlan.externalDependencies || [])],
      compatibilityFlags: [...(currentPlan.compatibilityFlags || [])],
      warnings: [...(currentPlan.warnings || [])],
    };

    const repairActions: string[] = [];
    let canRetry = false;

    // 1. Check for unresolved imports
    const unresolvedEntries: { mod: string; file?: string }[] = [];
    for (const d of diagnostics) {
      const match = d.message.match(/(?:Could not resolve|failed to resolve|import)\s+"([^"]+)"/i);
      if (match) {
        unresolvedEntries.push({ mod: match[1], file: d.file });
      }
    }

    if (unresolvedEntries.length > 0) {
      for (const { mod, file } of unresolvedEntries) {
        // A. Relative path resolution & auto-healing (e.g. "./router.ts" -> "./core/router")
        if (mod.startsWith('./') || mod.startsWith('../')) {
          const importingRel = (file || currentPlan.entry).replace(/\\/g, '/');
          const importingDir = path.posix.dirname(importingRel);
          const targetBase = path.posix.basename(mod).replace(/\.(ts|js|tsx|jsx|mjs|cjs)$/i, '');

          // Find candidate files matching targetBase in workspace
          const candidateFiles = workspace.files.filter(f => {
            const cleanPath = f.path.replace(/\\/g, '/');
            if (isDisallowedEntry(cleanPath)) return false;
            const fileBase = path.posix.basename(cleanPath).replace(/\.(ts|js|tsx|jsx|mjs|cjs)$/i, '');
            return fileBase.toLowerCase() === targetBase.toLowerCase();
          });

          if (candidateFiles.length > 0) {
            // Find closest matching file
            const bestMatch = candidateFiles[0];
            let newRel = path.posix.relative(importingDir, bestMatch.path.replace(/\\/g, '/'));
            if (!newRel.startsWith('.')) {
              newRel = './' + newRel;
            }
            const cleanImport = newRel.replace(/\.(ts|js|tsx|jsx|mjs|cjs)$/i, '');

            // Attempt to update the import in the source file on disk
            const diskPath = path.join(workspace.dirPath, importingRel);
            if (fs.existsSync(diskPath)) {
              try {
                let fileContent = fs.readFileSync(diskPath, 'utf8');
                const escapedMod = mod.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const importRegex = new RegExp(`(['"])${escapedMod}(['"])`, 'g');
                if (importRegex.test(fileContent)) {
                  fileContent = fileContent.replace(importRegex, `$1${cleanImport}$2`);
                  fs.writeFileSync(diskPath, fileContent, 'utf8');
                  const wf = workspace.files.find(f => f.path === importingRel);
                  if (wf) wf.content = fileContent;

                  repairActions.push(
                    `Auto-healed relative import in "${importingRel}": "${mod}" -> "${cleanImport}" (located at "${bestMatch.path}")`
                  );
                  canRetry = true;
                  continue;
                }
              } catch {}
            }

            repairActions.push(
              `Identified target file for "${mod}" at "${bestMatch.path}". Suggested fix: import from "${cleanImport}"`
            );
          }
          continue;
        }

        // B. Node.js built-ins or Cloudflare runtime modules
        const isNode =
          mod.startsWith('node:') ||
          ALL_NODE_BUILTIN_MODULES.has(mod) ||
          CLOUDFLARE_NODE_COMPAT_MODULES.includes(mod);
        
        const isCf = mod.startsWith('cloudflare:') || mod === 'workerd';

        if (isNode || isCf) {
          if (!repairedPlan.externalDependencies.includes(mod)) {
            repairedPlan.externalDependencies.push(mod);
          }
          if (isNode && !repairedPlan.compatibilityFlags.includes('nodejs_compat')) {
            repairedPlan.compatibilityFlags.push('nodejs_compat');
          }
          repairActions.push(`Externalized platform module "${mod}"`);
          canRetry = true;
        } else if (DependencyManager.isNpmPackageSpecifier(mod)) {
          // Check if package can be installed into workspace
          const installRes = await DependencyManager.installSinglePackage(workspace.dirPath, mod);
          if (installRes.success) {
            repairActions.push(`Installed missing npm package "${mod}" into workspace`);
            canRetry = true;
          } else {
            // Fallback: mark as external dependency
            if (!repairedPlan.externalDependencies.includes(mod)) {
              repairedPlan.externalDependencies.push(mod);
              repairActions.push(`Marked unresolved module "${mod}" as external`);
              canRetry = true;
            }
          }
        } else {
          // Check for extension resolution in workspace (e.g. "utils" -> "utils.ts" or "utils.js")
          const candidates = [
            `${mod}.ts`, `${mod}.js`, `${mod}.tsx`, `${mod}.jsx`,
            `${mod}/index.ts`, `${mod}/index.js`,
          ];
          const found = workspace.files.find(f => candidates.some(c => f.path.endsWith(c) || f.path === c));
          if (found) {
            repairActions.push(`Found local file match "${found.path}" for import "${mod}"`);
            canRetry = true;
          }
        }
      }
    }

    // 2. Check for missing compatibility flag
    const hasNodeError = diagnostics.some(
      d =>
        d.code === 'UNSUPPORTED_RUNTIME_API' ||
        d.message.includes('node:') ||
        d.message.includes('nodejs_compat') ||
        d.message.includes('Dynamic require') ||
        d.message.includes('require is not defined')
    );
    if (hasNodeError && !repairedPlan.compatibilityFlags.includes('nodejs_compat')) {
      repairedPlan.compatibilityFlags.push('nodejs_compat');
      repairActions.push('Injected required "nodejs_compat" flag for Workers Node runtime');
      canRetry = true;
    }

    // 3. Safe Alternative Entry Point Fallback
    // CRITICAL: NEVER switch away from a confirmed Worker entry point (has worker_fetch_export or high confidence)
    // if the failure is just an internal unresolved import/syntax error inside that file!
    const isConfirmedWorkerEntry = analysis.entryCandidates.some(
      c => c.path === currentPlan.entry && (c.type === 'worker_entry' || c.score >= 90)
    );

    const hasUnresolvedDependencyError = diagnostics.some(
      d => d.code === 'UNRESOLVED_DEPENDENCY' || /(?:Could not resolve|failed to resolve|import)/i.test(d.message)
    );

    if (!isConfirmedWorkerEntry && !hasUnresolvedDependencyError) {
      if (diagnostics.some(d => d.stage === 'builder' && d.file === currentPlan.entry)) {
        const remainingCandidates = analysis.entryCandidates.filter(
          c =>
            c.path !== currentPlan.entry &&
            !isDisallowedEntry(c.path) &&
            (c.type === 'worker_entry' || c.type === 'wrangler_entry') &&
            c.score >= 70 &&
            workspace.files.some(f => f.path === c.path)
        );
        if (remainingCandidates.length > 0) {
          const nextEntry = remainingCandidates[0].path;
          repairedPlan.entry = nextEntry;
          repairActions.push(`Switched failing entry "${currentPlan.entry}" to candidate "${nextEntry}"`);
          canRetry = true;
        }
      }
    }

    // 4. Target version relaxation
    if (diagnostics.some(d => d.message.includes('transform') && d.message.includes('target'))) {
      if (repairedPlan.target !== 'es2022') {
        repairedPlan.target = 'es2022';
        repairActions.push('Normalized target ECMAScript version to es2022');
        canRetry = true;
      }
    }

    // 5. Undefined runtime globals (e.g. ReferenceError: VERSION is not defined)
    for (const d of diagnostics) {
      const refMatch = d.message.match(/ReferenceError:\s*([a-zA-Z0-9_$]+)\s*is not defined/i);
      if (refMatch) {
        const missingId = refMatch[1];
        if (!repairedPlan.defines) {
          repairedPlan.defines = {};
        }
        if (missingId === 'VERSION') {
          repairedPlan.defines['VERSION'] = JSON.stringify('5.0.0');
          repairedPlan.defines['process.env.VERSION'] = JSON.stringify('5.0.0');
          repairActions.push(`Injected global define for missing compile-time constant "${missingId}"`);
          canRetry = true;
        } else {
          repairedPlan.defines[missingId] = `globalThis.${missingId}`;
          repairActions.push(`Injected fallback define for "${missingId}"`);
          canRetry = true;
        }
      }
    }

    const explanation = repairActions.length > 0
      ? `Deterministic Repair (Attempt ${attemptNumber}): ${repairActions.join('; ')}.`
      : `No deterministic automatic fix available for diagnostics on attempt ${attemptNumber}.`;

    return {
      repairedPlan,
      explanation,
      canRetry,
    };
  }
}
