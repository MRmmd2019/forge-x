import {
  BuildPlan,
  NormalizedDiagnostic,
  ProjectWorkspace,
  ScanResult,
  StaticAnalysisResult,
} from '@/types/bundler';

export type FrameworkType = 'vanilla' | 'node' | 'nextjs' | 'unsupported';

export interface DetectionResult {
  type: FrameworkType;
  confidence: number;
  matchedFiles: string[];
  rationale: string;
}

export interface FrameworkAnalysis {
  framework: FrameworkType;
  version?: string;
  isSupported: boolean;
  unsupportedReasons: string[];
  diagnostics: NormalizedDiagnostic[];
  requiredCompatibilityFlags: string[];
  requiredExternalModules: string[];
}

export interface FrameworkBuildResult {
  success: boolean;
  entryPoint: string;
  diagnostics: NormalizedDiagnostic[];
  workerMode: BuildPlan['workerMode'];
  externalDependencies: string[];
  compatibilityFlags: string[];
  warnings: string[];
}

export interface FrameworkValidationResult {
  isValid: boolean;
  diagnostics: NormalizedDiagnostic[];
}

export interface FrameworkAdapter {
  id: FrameworkType;
  name: string;
  detect(workspace: ProjectWorkspace, scan: ScanResult): Promise<DetectionResult>;
  analyze(workspace: ProjectWorkspace, scan: ScanResult, analysis: StaticAnalysisResult): Promise<FrameworkAnalysis>;
  build(workspace: ProjectWorkspace, plan: BuildPlan): Promise<FrameworkBuildResult>;
  validate(result: FrameworkBuildResult): Promise<FrameworkValidationResult>;
}
