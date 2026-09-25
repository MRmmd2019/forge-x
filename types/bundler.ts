export interface WorkspaceFile {
  path: string; // relative path e.g. "src/main.ts" or "index.html"
  size: number;
  extension: string;
  isBinary: boolean;
  content?: string; // for text files
  bufferBase64?: string; // for binary files
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  createdAt: number;
  dirPath: string; // temporary directory on disk
  files: WorkspaceFile[];
  totalSize: number;
}

export type FileCategory =
  | 'javascript'
  | 'typescript'
  | 'web'
  | 'data'
  | 'binary_image'
  | 'binary_font'
  | 'config'
  | 'unsupported';

export interface ScannedFileInfo {
  path: string;
  size: number;
  extension: string;
  category: FileCategory;
  isBinary: boolean;
}

export interface ScanResult {
  fileCount: number;
  totalSizeBytes: number;
  totalSizeFormatted: string;
  hasPackageJson: boolean;
  hasTsConfig: boolean;
  hasLockfile: boolean;
  hasHtml: boolean;
  hasCss: boolean;
  sourceFilesCount: number;
  assetFilesCount: number;
  unsupportedFilesCount: number;
  files: ScannedFileInfo[];
  tree: DirectoryTreeNode;
  detectedProjectType: 'static_site' | 'worker_native' | 'hybrid' | 'vanilla_spa';
}

export interface DirectoryTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  children?: DirectoryTreeNode[];
  extension?: string;
}

export type NodeApiCompatibility = 'SAFE' | 'WARNING' | 'UNSUPPORTED';

export interface NodeApiUsage {
  moduleName: string;
  status: NodeApiCompatibility;
  files: string[];
  description: string;
  workerAlternative?: string;
}

export interface AstImportInfo {
  source: string; // e.g. './utils' or 'node:crypto'
  isDynamic: boolean;
  isTypeOnly?: boolean;
  defaultImport?: string;
  namedImports?: string[];
  namespaceImport?: string;
  line?: number;
}

export interface AstExportInfo {
  name: string;
  isDefault: boolean;
  isTypeOnly?: boolean;
  reExportSource?: string;
}

export interface AstModuleInfo {
  path: string;
  imports: AstImportInfo[];
  exports: AstExportInfo[];
  hasWorkerFetchHandler: boolean;
  isCommonJs: boolean;
  hasAsyncHandler: boolean;
  nodeBuiltinsUsed: string[];
}

export interface DependencyGraphNode {
  path: string;
  dependencies: string[]; // resolved relative paths or module names
  dynamicDependencies: string[];
  dependents: string[];
  exports: string[];
  isEntryCandidate: boolean;
}

export interface DependencyGraph {
  nodes: Record<string, DependencyGraphNode>;
  circularDependencies: string[][];
  executionOrder: string[];
  unusedFiles: string[];
}

export interface EntryFactorScore {
  factor: string;
  score: number;
  weight: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  details: string;
}

export interface EntryCandidate {
  path: string;
  type: 'worker_entry' | 'html_entry' | 'script_entry' | 'wrangler_entry';
  score: number;
  reason: string;
  factors?: EntryFactorScore[];
}

export interface CompatibilityIssue {
  packageOrModule: string;
  status: NodeApiCompatibility;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  files: string[];
  description: string;
  workerAlternative?: string;
}

export interface CompatibilityReport {
  overallStatus: 'COMPATIBLE' | 'COMPATIBLE_WITH_WARNINGS' | 'INCOMPATIBLE';
  summary: string;
  issues: CompatibilityIssue[];
  nodeCompatRequired: boolean;
  unsupportedNodeCount: number;
  unsupportedPackagesCount: number;
}

export interface AssetSizePrediction {
  sourceAssetSizeBytes: number;
  estimatedWorkerSizeBytes: number;
  estimatedJsBundleSizeBytes: number;
  status: 'SAFE' | 'WARNING' | 'HIGH_WARNING' | 'NEAR_LIMIT' | 'REJECT';
  headroomBytes: number;
  maxAllowedBytes: number;
}

export interface ImportGraphNode {
  path: string;
  imports: string[];
  dynamicImports: string[];
  exports: string[];
}

export interface StaticAnalysisResult {
  entryCandidates: EntryCandidate[];
  htmlEntry?: string;
  htmlScriptReferences: { htmlFile: string; scriptSrc: string }[];
  htmlStyleReferences: { htmlFile: string; href: string }[];
  cssAssetReferences: { cssFile: string; assetUrl: string }[];
  importGraph: Record<string, ImportGraphNode>;
  dependencyGraph?: DependencyGraph;
  compatibilityReport?: CompatibilityReport;
  moduleFormat: 'esm' | 'cjs' | 'mixed';
  nodeApiUsages: NodeApiUsage[];
  packageDependencies: {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  hasWorkerFetchHandler: boolean;
  workerHandlerFile?: string;
}

export interface BuildPlan {
  entry: string; // primary JS/TS entry (e.g. "src/main.ts" or generated wrapper)
  format: 'esm';
  target: string; // e.g. "es2022"
  minify: boolean;
  sourceMap: boolean;
  htmlEntry?: string;
  embedAssets: boolean;
  assetStrategy: 'inline_bytes' | 'data_url' | 'none';
  workerMode: 'static_with_assets' | 'native_worker' | 'hybrid_api_and_assets';
  externalDependencies: string[];
  compatibilityFlags: string[];
  defines?: Record<string, string>;
  warnings: string[];
  rationale: string;
}

export interface PlanValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface AssetRecord {
  route: string; // e.g. "/assets/logo.png" or "/style.css"
  filePath: string;
  mimeType: string;
  size: number;
  isBinary: boolean;
  hash: string;
  encoding: 'utf8' | 'base64';
  data: string; // base64 string or utf8 content
}

export type ErrorClassification =
  | 'USER_ERROR'
  | 'PROJECT_ERROR'
  | 'DEPENDENCY_ERROR'
  | 'BUILD_ERROR'
  | 'RUNTIME_COMPATIBILITY_ERROR'
  | 'CLOUDFLARE_ERROR'
  | 'AI_ERROR'
  | 'SYSTEM_ERROR'
  | 'SECURITY_ERROR'
  | 'RESOURCE_LIMIT_ERROR';

export interface NormalizedDiagnostic {
  stage: 'scanner' | 'analyzer' | 'planner' | 'dependencies' | 'validator' | 'builder' | 'wrangler' | 'smoke_test' | 'system';
  classification?: ErrorClassification;
  code: string;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
  retryable?: boolean;
}

export interface BuildAttempt {
  attemptNumber: number;
  timestamp: number;
  plan: BuildPlan;
  status: 'building' | 'success' | 'failed';
  diagnostics: NormalizedDiagnostic[];
  aiRepairExplanation?: string;
  durationMs: number;
}

export interface BundleInspectorReport {
  totalSizeBytes: number;
  totalSizeFormatted: string;
  sourceSizeBytes?: number;
  sourceSizeFormatted?: string;
  sizeHealth: 'SAFE' | 'WARNING' | 'HIGH_WARNING' | 'NEAR_LIMIT' | 'REJECT';
  jsSizeBytes: number;
  jsSizeFormatted: string;
  htmlSizeBytes: number;
  htmlSizeFormatted: string;
  cssSizeBytes: number;
  cssSizeFormatted: string;
  embeddedAssetsSizeBytes: number;
  embeddedAssetsSizeFormatted: string;
  externalFilesCount: number;
  unresolvedImportsCount: number;
  syntaxValid: boolean;
  assetsCount: number;
  routesCount: number;
  routes: string[];
  workerCompatibility: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL';
}

export interface WranglerValidationResult {
  success: boolean;
  dryRunOutput: string;
  diagnostics: NormalizedDiagnostic[];
  workerType: string;
  compatibilityDate: string;
}

export interface BuildMetadata {
  esbuildVersion: string;
  wranglerVersion: string;
  nodeVersion: string;
  plannerVersion: string;
  buildTimestamp: number;
}

export interface SmokeTestResult {
  success: boolean;
  endpointsTested: number;
  details: { route: string; status: number; ok: boolean; contentType?: string; note?: string; advisory?: boolean }[];
  error?: string;
  advisory?: boolean;
}

export interface PipelineProgressEvent {
  step:
    | 'workspace_ready'
    | 'scanned'
    | 'analyzed'
    | 'dependencies'
    | 'planned'
    | 'validated'
    | 'building'
    | 'assets_embedded'
    | 'inspected'
    | 'wrangler_validated'
    | 'smoke_tested'
    | 'repairing'
    | 'completed'
    | 'failed';
  message: string;
  timestamp: number;
  detail?: string;
}

export interface BuildLogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'warn' | 'error' | 'success' | 'stdout' | 'stderr';
  message: string;
  stage?: string;
}

export interface BuildResult {
  success: boolean;
  workspaceId: string;
  workerJsCode?: string;
  inspectorReport?: BundleInspectorReport;
  scanResult?: ScanResult;
  analysisResult?: StaticAnalysisResult;
  buildPlan?: BuildPlan;
  wranglerResult?: WranglerValidationResult;
  smokeTestResult?: SmokeTestResult;
  metadata?: BuildMetadata;
  attempts: BuildAttempt[];
  totalAttempts: number;
  durationMs: number;
  timeline: PipelineProgressEvent[];
  diagnostics: NormalizedDiagnostic[];
  errorSummary?: {
    what: string;
    why: string;
    where?: string;
    howToFix?: string;
    classification?: ErrorClassification;
    canFixAutomatically: boolean;
  };
}

export interface BuildOptions {
  minify?: boolean;
  sourceMap?: boolean;
  target?: string;
  maxAttempts?: number;
  enableAiPlanning?: boolean;
  assetStrategy?: 'inline_bytes' | 'data_url';
  abortSignal?: AbortSignal;
  skipSmokeTest?: boolean;
}

export interface SampleProject {
  id: string;
  name: string;
  description: string;
  category: 'simple' | 'typescript' | 'worker_api' | 'assets' | 'npm_vanilla';
  files: { path: string; content: string }[];
}

export interface TestCaseResult {
  id: number;
  name: string;
  category: 'functional' | 'security' | 'resource_limit' | 'runtime_verification';
  passed: boolean;
  expectedOutcome: string;
  actualOutcome: string;
  durationMs: number;
  error?: string;
}

export interface HardeningSuiteReport {
  timestamp: number;
  totalTests: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  results: TestCaseResult[];
}

