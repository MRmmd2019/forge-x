import {
  BuildPlan,
  ProjectWorkspace,
  ScanResult,
  StaticAnalysisResult,
} from '@/types/bundler';
import {
  DetectionResult,
  FrameworkAdapter,
  FrameworkAnalysis,
  FrameworkBuildResult,
  FrameworkValidationResult,
} from './types';

export class VanillaAdapter implements FrameworkAdapter {
  id = 'vanilla' as const;
  name = 'Vanilla Web & Cloudflare Worker';

  async detect(workspace: ProjectWorkspace, scan: ScanResult): Promise<DetectionResult> {
    const hasNext = workspace.files.some(f =>
      f.path.startsWith('next.config') ||
      f.path.startsWith('.next') ||
      (f.path === 'package.json' && f.content?.includes('"next"'))
    );

    if (hasNext) {
      return {
        type: 'vanilla',
        confidence: 0,
        matchedFiles: [],
        rationale: 'Next.js project detected, skipping vanilla adapter.',
      };
    }

    const matchedFiles = workspace.files
      .filter(f => ['javascript', 'typescript', 'web'].includes(f.extension))
      .map(f => f.path);

    return {
      type: 'vanilla',
      confidence: 1.0,
      matchedFiles,
      rationale: 'Project matches standard Vanilla web / Cloudflare Worker architecture.',
    };
  }

  async analyze(
    workspace: ProjectWorkspace,
    scan: ScanResult,
    analysis: StaticAnalysisResult
  ): Promise<FrameworkAnalysis> {
    return {
      framework: 'vanilla',
      isSupported: true,
      unsupportedReasons: [],
      diagnostics: [],
      requiredCompatibilityFlags: analysis.nodeApiUsages.length > 0 ? ['nodejs_compat'] : [],
      requiredExternalModules: [],
    };
  }

  async build(workspace: ProjectWorkspace, plan: BuildPlan): Promise<FrameworkBuildResult> {
    return {
      success: true,
      entryPoint: plan.entry,
      diagnostics: [],
      workerMode: plan.workerMode,
      externalDependencies: plan.externalDependencies,
      compatibilityFlags: plan.compatibilityFlags,
      warnings: plan.warnings,
    };
  }

  async validate(result: FrameworkBuildResult): Promise<FrameworkValidationResult> {
    return {
      isValid: result.success,
      diagnostics: result.diagnostics,
    };
  }
}
