import { BuildPlan, PlanValidationResult, ProjectWorkspace } from '@/types/bundler';

const VALID_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']);
const VALID_TARGETS = new Set(['es2018', 'es2019', 'es2020', 'es2021', 'es2022', 'es2023', 'esnext']);
const DANGEROUS_KEYS = new Set([
  'runcommand',
  'run_command',
  'command',
  'cmd',
  'exec',
  'eval',
  'shell',
  'script',
  'spawn',
  'postinstall',
  'preinstall',
]);

const ALLOWED_COMPATIBILITY_FLAGS = new Set([
  'nodejs_compat',
  'nodejs_als',
  'streams_enable_constructors',
  'transformstream_enable_standard_constructor',
  'export_commonjs_default',
  'web_socket_compression',
  'global_navigator',
]);

export class BuildPlanValidator {
  static validate(rawPlan: any, workspace: ProjectWorkspace): PlanValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!rawPlan || typeof rawPlan !== 'object') {
      return {
        isValid: false,
        errors: ['Build plan must be a non-null JSON object.'],
        warnings: [],
      };
    }

    // 1. Check for dangerous injected fields (Prompt Injection / Command Execution attempt)
    for (const key of Object.keys(rawPlan)) {
      const lowerKey = key.toLowerCase();
      if (DANGEROUS_KEYS.has(lowerKey)) {
        errors.push(`Security violation: Rejected unauthorized command field "${key}" in BuildPlan.`);
      }
    }

    const plan = rawPlan as BuildPlan;

    // 2. Check entry path existence
    if (!plan.entry || typeof plan.entry !== 'string') {
      errors.push('Build plan must define a non-empty string entry point.');
      return { isValid: false, errors, warnings };
    }

    // 3. Path traversal security check
    if (plan.entry.includes('..') || plan.entry.startsWith('/') || plan.entry.includes('\\')) {
      errors.push(`Security violation: Entry path "${plan.entry}" contains illegal path traversal characters.`);
    }

    // 4. Extension validity
    const dotIdx = plan.entry.lastIndexOf('.');
    const ext = dotIdx !== -1 ? plan.entry.slice(dotIdx).toLowerCase() : '';
    if (!VALID_EXTENSIONS.has(ext)) {
      if (ext === '.html') {
        warnings.push(`Entry "${plan.entry}" is an HTML file. Bundler will generate an asset-serving worker.`);
      } else {
        errors.push(`Invalid entry extension "${ext}". Must be one of: ${Array.from(VALID_EXTENSIONS).join(', ')}`);
      }
    }

    // 5. File existence in workspace
    const exists = workspace.files.some(f => f.path === plan.entry);
    if (!exists) {
      const alternative = workspace.files.find(f => 
        f.path.replace(/\.[^.]+$/, '') === plan.entry.replace(/\.[^.]+$/, '')
      );
      if (alternative) {
        warnings.push(`Specified entry "${plan.entry}" was redirected to "${alternative.path}".`);
        plan.entry = alternative.path;
      } else if (plan.htmlEntry && workspace.files.some(f => f.path === plan.htmlEntry)) {
        warnings.push(`Entry "${plan.entry}" not found, but HTML entry "${plan.htmlEntry}" is present.`);
      } else {
        errors.push(`Entry file "${plan.entry}" does not exist in the project workspace.`);
      }
    }

    // 6. Format validation
    if (plan.format !== 'esm') {
      errors.push(`Cloudflare Workers modern runtime requires ESM format ("esm"). Received: "${plan.format}"`);
    }

    // 7. Target validation
    if (!plan.target || !VALID_TARGETS.has(plan.target.toLowerCase())) {
      warnings.push(`Target "${plan.target}" is uncommon for Workers. Normalizing to "es2022".`);
      plan.target = 'es2022';
    }

    // 8. Mode validation
    const validModes = ['static_with_assets', 'native_worker', 'hybrid_api_and_assets'];
    if (!plan.workerMode || !validModes.includes(plan.workerMode)) {
      warnings.push(`Unknown workerMode "${plan.workerMode}". Defaulting to "static_with_assets".`);
      plan.workerMode = 'static_with_assets';
    }

    // 9. External dependencies validation (no shell injection characters)
    if (plan.externalDependencies && Array.isArray(plan.externalDependencies)) {
      for (const dep of plan.externalDependencies) {
        if (typeof dep !== 'string' || /[;&|`$<>]/.test(dep)) {
          errors.push(`Security violation: Invalid characters detected in external dependency name "${dep}".`);
        }
      }
    } else {
      plan.externalDependencies = [];
    }

    // 10. Compatibility flags validation
    if (plan.compatibilityFlags && Array.isArray(plan.compatibilityFlags)) {
      for (const flag of plan.compatibilityFlags) {
        if (typeof flag !== 'string' || !ALLOWED_COMPATIBILITY_FLAGS.has(flag)) {
          warnings.push(`Unrecognized or non-standard compatibility flag "${flag}".`);
        }
      }
    } else {
      plan.compatibilityFlags = ['nodejs_compat'];
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
