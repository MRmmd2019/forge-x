export type ObfuscatorTarget = 'browser' | 'browser-no-eval' | 'node';
export type IdentifierGenerator = 'hexadecimal' | 'mangled' | 'mangled-shuffled';
export type StringArrayEncoding = 'none' | 'base64' | 'rc4';
export type StringArrayWrappersType = 'variable' | 'function';
export type StringArrayIndexType = 'hexadecimal-numeric-string' | 'hexadecimal-number';
export type SourceMapMode = 'inline' | 'separate';
export type PresetName =
  | 'default'
  | 'low'
  | 'medium'
  | 'high'
  | 'paranoid'
  | 'vm-low'
  | 'vm-high'
  | 'custom';

export interface ObfuscatorCustomOptions {
  // Basic Options
  target: ObfuscatorTarget;
  strictMode: boolean;
  seed: number;
  compact: boolean;
  simplify: boolean;
  log: boolean;
  parseHtml: boolean;

  // Identifier Naming
  identifierNamesGenerator: IdentifierGenerator;
  identifiersPrefix: string;
  randomIdentifiersPrefix: boolean;
  renameGlobals: boolean;
  renameProperties: boolean;
  reservedNames: string[];
  reservedStrings: string[];

  // VM Obfuscation
  enableVm: boolean;
  vmStrength: 'low' | 'default' | 'high' | 'ultra';

  // String Array
  stringArray: boolean;
  stringArrayThreshold: number;
  stringArrayRotate: boolean;
  stringArrayShuffle: boolean;
  stringArrayEncoding: StringArrayEncoding[];
  stringArrayIndexShift: boolean;
  stringArrayIndexesType: StringArrayIndexType[];
  stringArrayCallsTransform: boolean;
  stringArrayCallsTransformThreshold: number;
  stringArrayWrappersCount: number;
  stringArrayWrappersType: StringArrayWrappersType;
  stringArrayWrappersChainedCalls: boolean;

  // Transforms & Flattening
  controlFlowFlattening: boolean;
  controlFlowFlatteningThreshold: number;
  deadCodeInjection: boolean;
  deadCodeInjectionThreshold: number;
  numbersToExpressions: boolean;
  splitStrings: boolean;
  splitStringsChunkLength: number;
  transformObjectKeys: boolean;
  forceTransformStrings: string[];
  ignoreImports: boolean;
  unicodeEscapeSequence: boolean;

  // Protection & Defense
  selfDefending: boolean;
  debugProtection: boolean;
  debugProtectionInterval: number | boolean;
  disableConsoleOutput: boolean;
  domainLock: string[];
  domainLockRedirectUrl: string;

  // Source Maps
  sourceMap: boolean;
  sourceMapMode: SourceMapMode;
  sourceMapFileName?: string;
  sourceMapBaseUrl?: string;
}

export interface ObfuscationResult {
  success: boolean;
  code: string;
  sourceMap?: string;
  stats: {
    originalSize: number;
    obfuscatedSize: number;
    sizeDeltaBytes: number;
    sizeExpansionRatio: string;
    durationMs: number;
    transformedStringsCount?: number;
    vmWrappedFunctionsCount?: number;
  };
  error?: string;
}

export interface ObfuscationHistoryItem {
  id: string;
  timestamp: number;
  name: string;
  originalSize: number;
  obfuscatedSize: number;
  preset: PresetName;
  snippet: string;
  fullCode: string;
}
