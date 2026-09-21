import { GoogleGenAI, Type } from '@google/genai';
import {
  BuildOptions,
  BuildPlan,
  ProjectWorkspace,
  ScanResult,
  StaticAnalysisResult,
} from '@/types/bundler';

export class GeminiPlanner {
  public static getDeterministicFallbackPlan(
    scan: ScanResult,
    analysis: StaticAnalysisResult,
    options?: BuildOptions
  ): BuildPlan {
    // Choose best entry point candidate
    let chosenEntry = analysis.entryCandidates[0]?.path;
    if (!chosenEntry) {
      // Look for any JS/TS file
      const jsTsFile = scan.files.find(
        f => f.category === 'javascript' || f.category === 'typescript'
      );
      chosenEntry = jsTsFile ? jsTsFile.path : 'index.js';
    }

    let workerMode: BuildPlan['workerMode'] = 'static_with_assets';
    if (analysis.hasWorkerFetchHandler) {
      workerMode = analysis.htmlEntry ? 'hybrid_api_and_assets' : 'native_worker';
    } else if (analysis.htmlEntry || scan.assetFilesCount > 0) {
      workerMode = 'static_with_assets';
    }

    const warnings: string[] = [];
    const unsupportedNode = analysis.nodeApiUsages.filter(u => u.status === 'UNSUPPORTED');
    if (unsupportedNode.length > 0) {
      warnings.push(
        `Project references Node.js APIs not natively supported on Workers: ${unsupportedNode.map(u => u.moduleName).join(', ')}.`
      );
    }

    return {
      entry: chosenEntry,
      format: 'esm',
      target: options?.target || 'es2022',
      minify: options?.minify !== undefined ? options.minify : true,
      sourceMap: options?.sourceMap !== undefined ? options.sourceMap : false,
      htmlEntry: analysis.htmlEntry,
      embedAssets: true,
      assetStrategy: options?.assetStrategy || 'inline_bytes',
      workerMode,
      externalDependencies: [],
      compatibilityFlags: ['nodejs_compat'],
      warnings,
      rationale:
        'Generated via deterministic static analysis planner (unambiguous project architecture).',
    };
  }

  static async plan(
    workspace: ProjectWorkspace,
    scan: ScanResult,
    analysis: StaticAnalysisResult,
    options?: BuildOptions
  ): Promise<BuildPlan> {
    const fallbackPlan = this.getDeterministicFallbackPlan(scan, analysis, options);

    // If AI planning is disabled or no Gemini API key, return deterministic plan
    if (options?.enableAiPlanning === false || !process.env.GEMINI_API_KEY) {
      return fallbackPlan;
    }

    // Phase 25: Cost/Latency optimization - only call Gemini when reasoning or disambiguation is genuinely needed
    const isAmbiguous =
      Boolean((options as any)?.forceAiPlanning) ||
      analysis.entryCandidates.length === 0 ||
      (analysis.entryCandidates.length > 1 &&
        !analysis.hasWorkerFetchHandler &&
        analysis.entryCandidates[0].score - analysis.entryCandidates[1].score < 15) ||
      analysis.nodeApiUsages.some(u => u.status === 'UNSUPPORTED');

    if (!isAmbiguous) {
      return fallbackPlan;
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const promptPayload = {
        projectSummary: {
          fileCount: scan.fileCount,
          totalSizeBytes: scan.totalSizeBytes,
          detectedType: scan.detectedProjectType,
          hasHtml: scan.hasHtml,
          hasCss: scan.hasCss,
          hasPackageJson: scan.hasPackageJson,
          hasTsConfig: scan.hasTsConfig,
        },
        filesList: scan.files.map(f => ({ path: f.path, category: f.category, size: f.size })),
        analysis: {
          entryCandidates: analysis.entryCandidates,
          htmlEntry: analysis.htmlEntry,
          htmlScriptReferences: analysis.htmlScriptReferences,
          htmlStyleReferences: analysis.htmlStyleReferences,
          cssAssetReferences: analysis.cssAssetReferences,
          moduleFormat: analysis.moduleFormat,
          nodeApiUsages: analysis.nodeApiUsages,
          compatibilityReport: analysis.compatibilityReport,
          circularDependencies: analysis.dependencyGraph?.circularDependencies || [],
          unusedFiles: analysis.dependencyGraph?.unusedFiles || [],
          hasWorkerFetchHandler: analysis.hasWorkerFetchHandler,
          workerHandlerFile: analysis.workerHandlerFile,
          packageDependencies: Object.keys(analysis.packageDependencies.dependencies),
        },
        userOptions: {
          minify: options?.minify,
          target: options?.target,
          assetStrategy: options?.assetStrategy,
        },
      };

      const systemInstruction = `You are a Senior Cloudflare Workers and Build Systems Compiler Engineer.
Your task is to analyze the provided static inventory of a Vanilla JS / Vanilla TS project and produce a precise, reliable JSON Build Plan to compile it into a single self-contained "worker.js" for Cloudflare Workers.

Rules:
1. "entry" must be the main application JavaScript or TypeScript entry point path (e.g. "src/main.ts", "worker/index.ts", or "script.js") that was detected in the project files.
2. "workerMode" must be:
   - "native_worker" if the project is primarily a Cloudflare Worker API (has an existing fetch handler and no HTML to serve).
   - "static_with_assets" if it's a Vanilla web application with index.html, styles, and client scripts.
   - "hybrid_api_and_assets" if it has both an API worker fetch handler and static web assets/HTML.
3. "format" MUST be "esm".
4. "target" should typically be "es2022".
5. "embedAssets" should be true to embed all images, fonts, html, css, and data into the single worker.js.
6. "compatibilityFlags" should include "nodejs_compat" if node APIs were flagged.
7. Return ONLY valid JSON matching the specified schema.`;

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini planning timed out after 8s')), 8000)
      );

      const aiCallPromise = ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            text: `Analyze this Vanilla project and generate the optimal BuildPlan JSON:\n${JSON.stringify(
              promptPayload,
              null,
              2
            )}`,
          },
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              entry: { type: Type.STRING, description: 'Relative path to main JS/TS entry file' },
              format: { type: Type.STRING, description: 'Must be "esm"' },
              target: { type: Type.STRING, description: 'ECMAScript target version, e.g. "es2022"' },
              minify: { type: Type.BOOLEAN, description: 'Whether to minify worker output' },
              sourceMap: { type: Type.BOOLEAN, description: 'Whether to generate source map' },
              htmlEntry: { type: Type.STRING, description: 'Relative path to main HTML file if any' },
              embedAssets: { type: Type.BOOLEAN, description: 'Whether to embed assets inside worker.js' },
              assetStrategy: {
                type: Type.STRING,
                description: 'Strategy for assets: "inline_bytes" or "data_url"',
              },
              workerMode: {
                type: Type.STRING,
                description: '"static_with_assets" | "native_worker" | "hybrid_api_and_assets"',
              },
              externalDependencies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'List of external dependencies not to bundle',
              },
              compatibilityFlags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Wrangler compatibility flags like "nodejs_compat"',
              },
              warnings: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Any warnings or risks noticed for Cloudflare Worker runtime',
              },
              rationale: {
                type: Type.STRING,
                description: 'Explanation of why this entry and strategy were chosen',
              },
            },
            required: [
              'entry',
              'format',
              'target',
              'embedAssets',
              'workerMode',
              'rationale',
            ],
          },
        },
      });

      const response = (await Promise.race([aiCallPromise, timeoutPromise])) as any;

      const responseText = response.text?.trim();
      if (!responseText) {
        return fallbackPlan;
      }

      const parsedPlan = JSON.parse(responseText) as Partial<BuildPlan>;

      // Merge and sanitize with defaults
      return {
        entry: parsedPlan.entry || fallbackPlan.entry,
        format: 'esm',
        target: parsedPlan.target || fallbackPlan.target,
        minify: options?.minify !== undefined ? options.minify : (parsedPlan.minify ?? fallbackPlan.minify),
        sourceMap: options?.sourceMap !== undefined ? options.sourceMap : (parsedPlan.sourceMap ?? fallbackPlan.sourceMap),
        htmlEntry: parsedPlan.htmlEntry || fallbackPlan.htmlEntry,
        embedAssets: parsedPlan.embedAssets ?? true,
        assetStrategy: (parsedPlan.assetStrategy as any) || fallbackPlan.assetStrategy,
        workerMode: (parsedPlan.workerMode as any) || fallbackPlan.workerMode,
        externalDependencies: parsedPlan.externalDependencies || [],
        compatibilityFlags: parsedPlan.compatibilityFlags || fallbackPlan.compatibilityFlags,
        warnings: [...(parsedPlan.warnings || []), ...fallbackPlan.warnings],
        rationale: parsedPlan.rationale || 'Planned via Gemini AI optimization.',
      };
    } catch (err) {
      console.warn('Gemini planning encountered an error, falling back to deterministic plan:', err);
      return fallbackPlan;
    }
  }
}
