import { GoogleGenAI, Type } from '@google/genai';
import {
  BuildPlan,
  NormalizedDiagnostic,
  ProjectWorkspace,
  ScanResult,
  StaticAnalysisResult,
} from '@/types/bundler';
import { BuildPlanValidator } from '@/server/validator/plan-validator';

export class RepairLoop {
  static async diagnoseAndRepair(params: {
    workspace: ProjectWorkspace;
    scan: ScanResult;
    analysis: StaticAnalysisResult;
    currentPlan: BuildPlan;
    diagnostics: NormalizedDiagnostic[];
    attemptNumber: number;
  }): Promise<{
    repairedPlan: BuildPlan;
    explanation: string;
  }> {
    const { workspace, scan, analysis, currentPlan, diagnostics, attemptNumber } = params;

    // Fallback heuristic repair if Gemini is unavailable
    const fallbackRepairedPlan: BuildPlan = {
      ...currentPlan,
      externalDependencies: [...(currentPlan.externalDependencies || [])],
      compatibilityFlags: [...(currentPlan.compatibilityFlags || [])],
    };
    let fallbackExplanation = 'Applied heuristic fixes based on error codes.';

    const unresolvedMods: string[] = [];
    for (const d of diagnostics) {
      const match = d.message.match(/(?:Could not resolve|failed to resolve|import)\s+"([^"]+)"/i);
      if (match) {
        unresolvedMods.push(match[1]);
      }
    }

    if (unresolvedMods.length > 0) {
      for (const mod of unresolvedMods) {
        if (!fallbackRepairedPlan.externalDependencies.includes(mod)) {
          fallbackRepairedPlan.externalDependencies.push(mod);
        }
        if (
          mod.startsWith('node:') ||
          ['crypto', 'buffer', 'events', 'stream', 'path', 'util', 'net'].includes(mod)
        ) {
          if (!fallbackRepairedPlan.compatibilityFlags.includes('nodejs_compat')) {
            fallbackRepairedPlan.compatibilityFlags.push('nodejs_compat');
          }
        }
      }
      fallbackExplanation = `Marked unresolved module(s) [${unresolvedMods.join(', ')}] as external dependencies.`;
    }

    const hasNodeError = diagnostics.some(
      d =>
        d.code === 'UNSUPPORTED_RUNTIME_API' ||
        d.message.includes('node:') ||
        d.message.includes('nodejs_compat')
    );
    if (hasNodeError && !fallbackRepairedPlan.compatibilityFlags.includes('nodejs_compat')) {
      fallbackRepairedPlan.compatibilityFlags.push('nodejs_compat');
      fallbackExplanation += ' Enabled nodejs_compat compatibility flag.';
    }

    // Try Gemini-assisted repair
    if (!process.env.GEMINI_API_KEY) {
      return {
        repairedPlan: fallbackRepairedPlan,
        explanation: fallbackExplanation,
      };
    }

    try {
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const repairPrompt = {
        attemptNumber,
        currentPlan,
        errors: diagnostics,
        availableFiles: scan.files.map(f => f.path),
        entryCandidates: analysis.entryCandidates,
      };

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini repair timed out after 8s')), 8000)
      );

      const aiCallPromise = ai.models.generateContent({
        model: 'gemini-flash-latest',
        contents: [
          {
            text: `A build attempt for Cloudflare Workers failed. Diagnose the root cause and provide a modified, working BuildPlan:\n${JSON.stringify(
              repairPrompt,
              null,
              2
            )}`,
          },
        ],
        config: {
          systemInstruction:
            'You are a Cloudflare Workers build repair specialist. Analyze the normalized build diagnostics and repair the BuildPlan so the next compilation attempt succeeds.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              explanation: {
                type: Type.STRING,
                description: 'What caused the failure and how the plan was repaired',
              },
              entry: { type: Type.STRING, description: 'Adjusted entry path' },
              target: { type: Type.STRING, description: 'Target version, e.g. es2022' },
              minify: { type: Type.BOOLEAN },
              externalDependencies: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              compatibilityFlags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              workerMode: {
                type: Type.STRING,
                description: '"static_with_assets" | "native_worker" | "hybrid_api_and_assets"',
              },
            },
            required: ['explanation', 'entry'],
          },
        },
      });

      const response = (await Promise.race([aiCallPromise, timeoutPromise])) as any;
      const text = response?.text?.trim();
      if (!text) {
        return {
          repairedPlan: fallbackRepairedPlan,
          explanation: fallbackExplanation,
        };
      }

      const parsed = JSON.parse(text);
      const repairedPlan: BuildPlan = {
        ...currentPlan,
        entry: parsed.entry || currentPlan.entry,
        target: parsed.target || currentPlan.target,
        minify: parsed.minify !== undefined ? parsed.minify : currentPlan.minify,
        externalDependencies: Array.from(
          new Set([
            ...(currentPlan.externalDependencies || []),
            ...(fallbackRepairedPlan.externalDependencies || []),
            ...(parsed.externalDependencies || []),
          ])
        ),
        compatibilityFlags: Array.from(
          new Set([
            ...(currentPlan.compatibilityFlags || []),
            ...(fallbackRepairedPlan.compatibilityFlags || []),
            ...(parsed.compatibilityFlags || []),
          ])
        ),
        workerMode: parsed.workerMode || currentPlan.workerMode,
      };

      // Validate the repaired plan
      const validation = BuildPlanValidator.validate(repairedPlan, workspace);
      if (!validation.isValid) {
        return {
          repairedPlan: fallbackRepairedPlan,
          explanation: `${fallbackExplanation} (AI plan had validation issues: ${validation.errors.join('; ')})`,
        };
      }

      return {
        repairedPlan,
        explanation: parsed.explanation || 'Repaired plan via Gemini AI diagnosis.',
      };
    } catch (e) {
      console.warn('Gemini repair failed, using heuristic repair:', e);
      return {
        repairedPlan: fallbackRepairedPlan,
        explanation: fallbackExplanation,
      };
    }
  }
}
