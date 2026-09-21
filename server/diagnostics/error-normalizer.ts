import { ErrorClassification, NormalizedDiagnostic } from '@/types/bundler';

export class ErrorNormalizer {
  static classify(code: string, message: string, stage: NormalizedDiagnostic['stage']): {
    classification: ErrorClassification;
    retryable: boolean;
  } {
    const lower = message.toLowerCase();

    // 1. Security errors (Never retry)
    if (
      code.includes('SECURITY') ||
      lower.includes('security violation') ||
      lower.includes('traversal') ||
      lower.includes('zip bomb') ||
      lower.includes('expansion ratio')
    ) {
      return { classification: 'SECURITY_ERROR', retryable: false };
    }

    // 2. Resource limit errors (Never retry)
    if (
      code.includes('RESOURCE_LIMIT') ||
      lower.includes('exceeds single file limit') ||
      lower.includes('exceeds limit of 60mb') ||
      lower.includes('too many files') ||
      lower.includes('timed out')
    ) {
      return { classification: 'RESOURCE_LIMIT_ERROR', retryable: false };
    }

    // 3. User / Input errors (No valid files or bad zip)
    if (
      lower.includes('zip archive is empty') ||
      lower.includes('failed to read zip') ||
      lower.includes('no valid files') ||
      lower.includes('no files provided')
    ) {
      return { classification: 'USER_ERROR', retryable: false };
    }

    // 4. Runtime compatibility (Node.js API unsupported)
    if (
      code === 'UNSUPPORTED_RUNTIME_API' ||
      lower.includes('is not available in worker runtime') ||
      lower.includes('node:') ||
      lower.includes('nodejs_compat')
    ) {
      return { classification: 'RUNTIME_COMPATIBILITY_ERROR', retryable: true };
    }

    // 5. Dependency errors (can be repaired via external list or flags)
    if (
      code === 'UNRESOLVED_DEPENDENCY' ||
      lower.includes('could not resolve') ||
      lower.includes('failed to resolve')
    ) {
      return { classification: 'DEPENDENCY_ERROR', retryable: true };
    }

    // 6. Cloudflare Workers errors
    if (
      stage === 'wrangler' ||
      lower.includes('wrangler') ||
      lower.includes('export default') ||
      lower.includes('total upload:')
    ) {
      return { classification: 'CLOUDFLARE_ERROR', retryable: !lower.includes('exceeds max') };
    }

    // 7. AI errors
    if (stage === 'planner' && (lower.includes('gemini') || lower.includes('json parse'))) {
      return { classification: 'AI_ERROR', retryable: true };
    }

    // 8. General Build / Project errors
    if (stage === 'builder' || code.includes('ESBUILD')) {
      return { classification: 'BUILD_ERROR', retryable: true };
    }

    return { classification: 'SYSTEM_ERROR', retryable: false };
  }

  static normalize(err: any, stage: NormalizedDiagnostic['stage']): NormalizedDiagnostic[] {
    const diagnostics: NormalizedDiagnostic[] = [];

    if (!err) {
      return diagnostics;
    }

    // Handle esbuild errors array
    if (err.errors && Array.isArray(err.errors)) {
      for (const esbErr of err.errors) {
        const text = esbErr.text || 'esbuild compilation error';
        let code = 'ESBUILD_ERROR';
        let suggestion = esbErr.notes?.[0]?.text;

        const resolveMatch = text.match(/(?:Could not resolve|failed to resolve)\s+"([^"]+)"/i);
        if (resolveMatch) {
          code = 'UNRESOLVED_DEPENDENCY';
          const mod = resolveMatch[1];
          if (mod.startsWith('node:') || mod.startsWith('cloudflare:')) {
            suggestion = `Mark "${mod}" as an external dependency and enable "nodejs_compat".`;
          } else {
            suggestion = `Mark module "${mod}" as external or verify it is installed.`;
          }
        }

        const { classification, retryable } = this.classify(code, text, stage);

        diagnostics.push({
          stage: 'builder',
          classification,
          code,
          message: text,
          file: esbErr.location?.file,
          line: esbErr.location?.line,
          column: esbErr.location?.column,
          severity: 'error',
          suggestion,
          retryable,
        });
      }
      return diagnostics;
    }

    const message = typeof err === 'string' ? err : err.message || JSON.stringify(err);

    // Detect common patterns
    if (message.includes('Could not resolve') || message.includes('failed to resolve')) {
      const match = message.match(/Could not resolve\s+"([^"]+)"/);
      const mod = match ? match[1] : '';
      const { classification, retryable } = this.classify('UNRESOLVED_DEPENDENCY', message, stage);

      diagnostics.push({
        stage: 'builder',
        classification,
        code: 'UNRESOLVED_DEPENDENCY',
        message: `Could not resolve import "${mod}". Ensure dependency is bundled or marked external.`,
        severity: 'error',
        suggestion: `Check package.json or adjust build plan externalDependencies.`,
        retryable,
      });
      return diagnostics;
    }

    if (message.includes('Node "') || message.includes('node:') || message.includes('is not available in Worker runtime')) {
      const { classification, retryable } = this.classify('UNSUPPORTED_RUNTIME_API', message, stage);

      diagnostics.push({
        stage: 'wrangler',
        classification,
        code: 'UNSUPPORTED_RUNTIME_API',
        message: message,
        severity: 'error',
        suggestion: 'Enable "nodejs_compat" compatibility flag or replace with Worker standard APIs.',
        retryable,
      });
      return diagnostics;
    }

    const defaultCode = `${stage.toUpperCase()}_ERROR`;
    const { classification, retryable } = this.classify(defaultCode, message, stage);

    diagnostics.push({
      stage,
      classification,
      code: defaultCode,
      message,
      severity: 'error',
      retryable,
    });

    return diagnostics;
  }
}
