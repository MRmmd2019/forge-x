import {
  BuildPlan,
  NormalizedDiagnostic,
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

export class NodeAdapter implements FrameworkAdapter {
  id = 'node' as const;
  name = 'Node.js Worker-Compatible Adapter';

  // Versioned Cloudflare Node compatibility milestone
  private static readonly NODEJS_COMPAT_DEFAULT_DATE = '2026-08-04';

  async detect(workspace: ProjectWorkspace, scan: ScanResult): Promise<DetectionResult> {
    const pkgJson = workspace.files.find(f => f.path === 'package.json');
    const hasNodeDependencies = pkgJson && (
      pkgJson.content?.includes('"dependencies"') ||
      pkgJson.content?.includes('"devDependencies"')
    );

    const hasNodeBuiltinImports = workspace.files.some(f =>
      f.content && /(?:import|require)\s*\(?['"](?:node:|[a-z0-9_-]+)/.test(f.content)
    );

    if (hasNodeDependencies || hasNodeBuiltinImports) {
      return {
        type: 'node',
        confidence: 0.85,
        matchedFiles: pkgJson ? ['package.json'] : [],
        rationale: 'Project declares Node.js package dependencies or uses Node built-in imports.',
      };
    }

    return {
      type: 'node',
      confidence: 0,
      matchedFiles: [],
      rationale: 'No Node.js package manifests or Node built-ins detected.',
    };
  }

  async analyze(
    workspace: ProjectWorkspace,
    scan: ScanResult,
    analysis: StaticAnalysisResult
  ): Promise<FrameworkAnalysis> {
    const unsupportedReasons: string[] = [];
    const diagnostics: NormalizedDiagnostic[] = [];

    // Check for native binary addons (.node)
    const nativeAddons = workspace.files.filter(f => f.path.endsWith('.node') || f.path.includes('node-gyp'));
    if (nativeAddons.length > 0) {
      unsupportedReasons.push(
        `Project contains native binary addons (${nativeAddons.map(a => a.path).join(', ')}). Native C/C++ addons cannot run in Cloudflare Workers sandboxes.`
      );
      diagnostics.push({
        stage: 'analyzer',
        classification: 'RUNTIME_COMPATIBILITY_ERROR',
        code: 'NATIVE_BINARY_UNSUPPORTED',
        message: 'Native C/C++ Node.js addons cannot be bundled into Cloudflare Workers.',
        file: nativeAddons[0].path,
        severity: 'error',
        retryable: false,
        suggestion: 'Replace native addons with pure JavaScript/TypeScript or WebAssembly equivalents.',
      });
    }

    // Check for definitely unsupported Node APIs (child_process, cluster, v8)
    const criticalUnsupported = analysis.nodeApiUsages.filter(u =>
      ['child_process', 'node:child_process', 'cluster', 'node:cluster', 'v8', 'node:v8'].includes(u.moduleName)
    );

    if (criticalUnsupported.length > 0) {
      unsupportedReasons.push(
        `Project imports unsupported OS/Process Node modules: ${criticalUnsupported.map(u => u.moduleName).join(', ')}.`
      );
      for (const u of criticalUnsupported) {
        diagnostics.push({
          stage: 'analyzer',
          classification: 'RUNTIME_COMPATIBILITY_ERROR',
          code: 'UNSUPPORTED_NODE_API',
          message: `The "${u.moduleName}" module requires OS-level process management unavailable in Cloudflare Workers.`,
          severity: 'error',
          retryable: false,
          suggestion: 'Remove process spawning / clustering code or isolate it behind an external API.',
        });
      }
    }

    const isSupported = unsupportedReasons.length === 0;

    return {
      framework: 'node',
      isSupported,
      unsupportedReasons,
      diagnostics,
      requiredCompatibilityFlags: ['nodejs_compat'],
      requiredExternalModules: analysis.nodeApiUsages
        .filter(u => u.status === 'SAFE' || u.status === 'WARNING')
        .map(u => u.moduleName.startsWith('node:') ? u.moduleName : `node:${u.moduleName}`),
    };
  }

  async build(workspace: ProjectWorkspace, plan: BuildPlan): Promise<FrameworkBuildResult> {
    return {
      success: true,
      entryPoint: plan.entry,
      diagnostics: [],
      workerMode: plan.workerMode,
      externalDependencies: plan.externalDependencies,
      compatibilityFlags: plan.compatibilityFlags.includes('nodejs_compat')
        ? plan.compatibilityFlags
        : [...plan.compatibilityFlags, 'nodejs_compat'],
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
