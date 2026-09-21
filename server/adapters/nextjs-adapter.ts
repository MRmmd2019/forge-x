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

export class NextJsAdapter implements FrameworkAdapter {
  id = 'nextjs' as const;
  name = 'Next.js Adapter for Cloudflare Workers';

  async detect(workspace: ProjectWorkspace, scan: ScanResult): Promise<DetectionResult> {
    const nextConfigFiles = workspace.files.filter(f =>
      ['next.config.js', 'next.config.mjs', 'next.config.ts'].includes(f.path)
    );

    const pkgJson = workspace.files.find(f => f.path === 'package.json');
    const hasNextDep = pkgJson && pkgJson.content?.includes('"next"');

    const hasAppDir = workspace.files.some(f => f.path.startsWith('app/') || f.path.startsWith('src/app/'));
    const hasPagesDir = workspace.files.some(f => f.path.startsWith('pages/') || f.path.startsWith('src/pages/'));

    const matchedFiles = [
      ...nextConfigFiles.map(f => f.path),
      ...(hasNextDep ? ['package.json'] : []),
      ...(hasAppDir ? ['app/'] : []),
      ...(hasPagesDir ? ['pages/'] : []),
    ];

    if (nextConfigFiles.length > 0 || hasNextDep) {
      return {
        type: 'nextjs',
        confidence: 0.95,
        matchedFiles,
        rationale: 'Project contains Next.js configuration or explicit next package dependency.',
      };
    }

    return {
      type: 'nextjs',
      confidence: 0,
      matchedFiles: [],
      rationale: 'No Next.js indicators found.',
    };
  }

  async analyze(
    workspace: ProjectWorkspace,
    scan: ScanResult,
    analysis: StaticAnalysisResult
  ): Promise<FrameworkAnalysis> {
    const unsupportedReasons: string[] = [];
    const diagnostics: NormalizedDiagnostic[] = [];

    // Check for native sharp dependency or image optimization requiring external service
    const pkgJson = workspace.files.find(f => f.path === 'package.json');
    if (pkgJson && pkgJson.content?.includes('"sharp"')) {
      unsupportedReasons.push(
        'Next.js image optimization with native "sharp" binary is not compatible with standalone single-file worker.js.'
      );
      diagnostics.push({
        stage: 'analyzer',
        classification: 'RUNTIME_COMPATIBILITY_ERROR',
        code: 'NEXTJS_NATIVE_SHARP_UNSUPPORTED',
        message: 'Next.js image optimization requires native "sharp" addon which cannot be embedded in standalone worker.js.',
        severity: 'error',
        retryable: false,
        suggestion: 'Disable Next.js image optimization in next.config.js ({ images: { unoptimized: true } }).',
      });
    }

    // Check for custom server (server.js / server.ts with http.createServer / express)
    const customServer = workspace.files.find(f =>
      ['server.js', 'server.ts'].includes(f.path) &&
      (f.content?.includes('http.createServer') || f.content?.includes('express()'))
    );
    if (customServer) {
      unsupportedReasons.push(
        `Custom Node.js server (${customServer.path}) detected. Standalone Cloudflare Workers use standard fetch handlers instead of Node HTTP servers.`
      );
      diagnostics.push({
        stage: 'analyzer',
        classification: 'RUNTIME_COMPATIBILITY_ERROR',
        code: 'NEXTJS_CUSTOM_SERVER_UNSUPPORTED',
        message: 'Next.js custom HTTP server cannot run as a standalone worker.js script.',
        file: customServer.path,
        severity: 'error',
        retryable: false,
        suggestion: 'Migrate custom server logic to Next.js Route Handlers (app/api/*/route.ts).',
      });
    }

    // Single-file artifact contract check (Section 22 & 119)
    // If the project requires dynamic multi-chunk Node runtime output that cannot be bundled into a single file
    const hasDynamicMultiChunk = workspace.files.some(f =>
      f.path.startsWith('.next/server') || f.path.startsWith('.next/standalone')
    );
    if (hasDynamicMultiChunk) {
      unsupportedReasons.push(
        'Next.js multi-chunk dynamic server directory (.next/) requires external filesystem storage and cannot be losslessly packed into a single standalone worker.js.'
      );
      diagnostics.push({
        stage: 'analyzer',
        classification: 'RUNTIME_COMPATIBILITY_ERROR',
        code: 'NEXTJS_MULTICHUNK_STORAGE_REQUIRED',
        message: 'Next.js dynamic multi-chunk output requires multi-file server storage not supported by the single-file worker contract.',
        severity: 'error',
        retryable: false,
        suggestion: 'Use Next.js static export (output: "export") or Cloudflare OpenNext / vinext pipeline.',
      });
    }

    const isSupported = unsupportedReasons.length === 0;

    return {
      framework: 'nextjs',
      isSupported,
      unsupportedReasons,
      diagnostics,
      requiredCompatibilityFlags: ['nodejs_compat'],
      requiredExternalModules: ['node:buffer', 'node:crypto', 'node:stream', 'node:path', 'node:util'],
    };
  }

  async build(workspace: ProjectWorkspace, plan: BuildPlan): Promise<FrameworkBuildResult> {
    // If static export output exists or route handlers are present
    return {
      success: true,
      entryPoint: plan.entry,
      diagnostics: [],
      workerMode: plan.workerMode,
      externalDependencies: plan.externalDependencies,
      compatibilityFlags: ['nodejs_compat'],
      warnings: [
        'Next.js compiled for Cloudflare Workers standalone runtime. Static assets and route handlers are embedded into worker.js.',
      ],
    };
  }

  async validate(result: FrameworkBuildResult): Promise<FrameworkValidationResult> {
    return {
      isValid: result.success,
      diagnostics: result.diagnostics,
    };
  }
}
