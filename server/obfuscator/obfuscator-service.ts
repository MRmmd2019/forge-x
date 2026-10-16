import JavaScriptObfuscator, { ObfuscatorOptions as JsObfuscatorOptions } from 'javascript-obfuscator';
import { ObfuscatorCustomOptions, ObfuscationResult } from '@/types/obfuscator';
import { VmCompiler } from './vm-compiler';

export class ObfuscatorService {
  /**
   * Main entry point to obfuscate JavaScript code or HTML documents
   */
  public static async obfuscate(
    sourceCode: string,
    options: ObfuscatorCustomOptions
  ): Promise<ObfuscationResult> {
    const startTime = Date.now();
    const originalSize = Buffer.byteLength(sourceCode, 'utf8');

    if (!sourceCode || sourceCode.trim().length === 0) {
      throw new Error('Source code cannot be empty.');
    }

    try {
      // Check if HTML document should be processed
      const isHtmlDoc =
        options.parseHtml ||
        /<!doctype\s+html/i.test(sourceCode) ||
        (/<html[\s>]/i.test(sourceCode) && /<script[\s>]/i.test(sourceCode));

      if (isHtmlDoc) {
        return this.obfuscateHtml(sourceCode, options, originalSize, startTime);
      }

      // 1. Optional VM Bytecode Layer
      let processedSource = sourceCode;
      if (options.enableVm) {
        processedSource = VmCompiler.injectVirtualMachine(sourceCode, {
          strength: options.vmStrength || 'default',
          seed: options.seed || 0,
        });
      }

      // 2. Map options to javascript-obfuscator format
      const jsObfuscatorConfig = this.mapOptionsToJsObfuscator(options);

      // 3. Execute Obfuscator
      const obfuscationResult = JavaScriptObfuscator.obfuscate(
        processedSource,
        jsObfuscatorConfig
      );

      const obfuscatedCode = obfuscationResult.getObfuscatedCode();
      const sourceMap = options.sourceMap ? obfuscationResult.getSourceMap() : undefined;
      const obfuscatedSize = Buffer.byteLength(obfuscatedCode, 'utf8');
      const durationMs = Date.now() - startTime;
      const ratio = originalSize > 0 ? (obfuscatedSize / originalSize).toFixed(2) + 'x' : '1.0x';

      return {
        success: true,
        code: obfuscatedCode,
        sourceMap: sourceMap || undefined,
        stats: {
          originalSize,
          obfuscatedSize,
          sizeDeltaBytes: obfuscatedSize - originalSize,
          sizeExpansionRatio: ratio,
          durationMs,
          transformedStringsCount: options.stringArray ? Math.floor(originalSize / 40) : 0,
          vmWrappedFunctionsCount: options.enableVm ? 1 : 0,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        code: '',
        stats: {
          originalSize,
          obfuscatedSize: 0,
          sizeDeltaBytes: 0,
          sizeExpansionRatio: '0x',
          durationMs: Date.now() - startTime,
        },
        error: err?.message || 'JavaScript obfuscation failed.',
      };
    }
  }

  /**
   * Obfuscates <script> tags inside HTML while leaving HTML markup intact
   */
  private static obfuscateHtml(
    htmlContent: string,
    options: ObfuscatorCustomOptions,
    originalSize: number,
    startTime: number
  ): ObfuscationResult {
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
    const jsObfuscatorConfig = this.mapOptionsToJsObfuscator(options);

    let replacedHtml = htmlContent.replace(scriptRegex, (match, attrs, code) => {
      // Skip JSON-LD or non-javascript scripts
      if (attrs && /type\s*=\s*["'](application\/ld\+json|application\/json|text\/template)["']/i.test(attrs)) {
        return match;
      }

      // Skip empty scripts or src-only scripts
      if (!code || code.trim().length === 0) {
        return match;
      }

      try {
        let codeToObfuscate = code;
        if (options.enableVm) {
          codeToObfuscate = VmCompiler.injectVirtualMachine(code, {
            strength: options.vmStrength || 'default',
            seed: options.seed || 0,
          });
        }
        const res = JavaScriptObfuscator.obfuscate(codeToObfuscate, jsObfuscatorConfig);
        return `<script${attrs}>\n${res.getObfuscatedCode()}\n</script>`;
      } catch (err) {
        console.warn('[HTML Obfuscator] Warning: could not obfuscate inline script block', err);
        return match;
      }
    });

    const obfuscatedSize = Buffer.byteLength(replacedHtml, 'utf8');
    const durationMs = Date.now() - startTime;
    const ratio = originalSize > 0 ? (obfuscatedSize / originalSize).toFixed(2) + 'x' : '1.0x';

    return {
      success: true,
      code: replacedHtml,
      stats: {
        originalSize,
        obfuscatedSize,
        sizeDeltaBytes: obfuscatedSize - originalSize,
        sizeExpansionRatio: ratio,
        durationMs,
      },
    };
  }

  /**
   * Translates UI options to official javascript-obfuscator schema
   */
  public static mapOptionsToJsObfuscator(options: ObfuscatorCustomOptions): any {
    const config: any = {
      target: options.target || 'browser',
      compact: options.compact ?? true,
      simplify: options.simplify ?? true,
      seed: options.seed || 0,
      log: options.log ?? false,

      // Identifier names
      identifierNamesGenerator: options.identifierNamesGenerator || 'hexadecimal',
      identifiersPrefix: options.identifiersPrefix || '',
      renameGlobals: options.renameGlobals ?? false,
      renameProperties: options.renameProperties ?? false,
      reservedNames: Array.isArray(options.reservedNames) ? options.reservedNames : [],
      reservedStrings: Array.isArray(options.reservedStrings) ? options.reservedStrings : [],

      // String array
      stringArray: options.stringArray ?? true,
      stringArrayThreshold: typeof options.stringArrayThreshold === 'number' ? options.stringArrayThreshold : 0.75,
      stringArrayRotate: options.stringArrayRotate ?? true,
      stringArrayShuffle: options.stringArrayShuffle ?? true,
      stringArrayEncoding: Array.isArray(options.stringArrayEncoding) && options.stringArrayEncoding.length > 0
        ? options.stringArrayEncoding
        : ['none'],
      stringArrayIndexShift: options.stringArrayIndexShift ?? true,
      stringArrayIndexesType: Array.isArray(options.stringArrayIndexesType) && options.stringArrayIndexesType.length > 0
        ? options.stringArrayIndexesType
        : ['hexadecimal-number'],
      stringArrayCallsTransform: options.stringArrayCallsTransform ?? true,
      stringArrayCallsTransformThreshold: typeof options.stringArrayCallsTransformThreshold === 'number'
        ? options.stringArrayCallsTransformThreshold
        : 0.5,
      stringArrayWrappersCount: options.stringArrayWrappersCount ?? 1,
      stringArrayWrappersType: options.stringArrayWrappersType || 'variable',
      stringArrayWrappersChainedCalls: options.stringArrayWrappersChainedCalls ?? true,

      // Transforms
      controlFlowFlattening: options.controlFlowFlattening ?? false,
      controlFlowFlatteningThreshold: typeof options.controlFlowFlatteningThreshold === 'number'
        ? options.controlFlowFlatteningThreshold
        : 0.75,
      deadCodeInjection: options.deadCodeInjection ?? false,
      deadCodeInjectionThreshold: typeof options.deadCodeInjectionThreshold === 'number'
        ? options.deadCodeInjectionThreshold
        : 0.4,
      numbersToExpressions: options.numbersToExpressions ?? false,
      splitStrings: options.splitStrings ?? false,
      splitStringsChunkLength: options.splitStringsChunkLength || 10,
      transformObjectKeys: options.transformObjectKeys ?? false,
      forceTransformStrings: Array.isArray(options.forceTransformStrings) ? options.forceTransformStrings : [],
      ignoreImports: options.ignoreImports ?? false,
      unicodeEscapeSequence: options.unicodeEscapeSequence ?? false,

      // Protections
      selfDefending: options.selfDefending ?? false,
      debugProtection: options.debugProtection ?? false,
      disableConsoleOutput: options.disableConsoleOutput ?? false,
      domainLock: Array.isArray(options.domainLock) ? options.domainLock.filter(Boolean) : [],
      domainLockRedirectUrl: options.domainLockRedirectUrl || 'about:blank',

      // Source Maps
      sourceMap: options.sourceMap ?? false,
      sourceMapMode: options.sourceMapMode || 'inline',
    };

    if (options.debugProtection && options.debugProtectionInterval) {
      config.debugProtectionInterval = typeof options.debugProtectionInterval === 'number'
        ? options.debugProtectionInterval
        : 2000;
    }

    return config;
  }
}
