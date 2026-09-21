import {
  AstModuleInfo,
  DependencyGraph,
  EntryCandidate,
  EntryFactorScore,
  ProjectWorkspace,
} from '@/types/bundler';

export const NON_ENTRY_PATTERNS = [
  /(?:^|\/)(?:esbuild|vite|webpack|rollup|postcss|tailwind|next|jest|babel|eslint|prettier|tsconfig|wrangler|drizzle)\.config\.[cm]?[jt]s$/i,
  /(?:^|\/)(?:build|bundle|scripts?|tests?|specs?|coverage)\//i,
  /\.d\.ts$/i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
];

export function isDisallowedEntry(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return NON_ENTRY_PATTERNS.some(p => p.test(normalized));
}

export class EntryDetector {
  static detect(
    workspace: ProjectWorkspace,
    parsedModules: Map<string, AstModuleInfo>,
    htmlScriptReferences: { htmlFile: string; scriptSrc: string }[],
    dependencyGraph?: DependencyGraph
  ): EntryCandidate[] {
    const candidatesMap = new Map<string, { candidate: EntryCandidate; factors: EntryFactorScore[] }>();

    function addScore(
      filePath: string,
      type: EntryCandidate['type'],
      scoreToAdd: number,
      factorName: string,
      weight: EntryFactorScore['weight'],
      details: string
    ) {
      if (isDisallowedEntry(filePath)) {
        return;
      }

      if (!candidatesMap.has(filePath)) {
        candidatesMap.set(filePath, {
          candidate: {
            path: filePath,
            type,
            score: 0,
            reason: '',
            factors: [],
          },
          factors: [],
        });
      }

      const item = candidatesMap.get(filePath)!;
      item.factors.push({
        factor: factorName,
        score: scoreToAdd,
        weight,
        details,
      });

      // Update type priority (worker_entry > wrangler_entry > html_entry > script_entry)
      if (type === 'worker_entry') item.candidate.type = 'worker_entry';
      else if (type === 'wrangler_entry' && item.candidate.type !== 'worker_entry') {
        item.candidate.type = 'wrangler_entry';
      } else if (type === 'html_entry' && item.candidate.type === 'script_entry') {
        item.candidate.type = 'html_entry';
      }
    }

    // 1. Check wrangler.toml / wrangler.json / wrangler.jsonc configuration
    for (const f of workspace.files) {
      const lowerName = f.path.toLowerCase();
      if (
        (lowerName === 'wrangler.toml' ||
          lowerName === 'wrangler.json' ||
          lowerName === 'wrangler.jsonc') &&
        f.content
      ) {
        let mainPath: string | undefined;
        if (lowerName.endsWith('.toml')) {
          const match = /main\s*=\s*["']([^"']+)["']/i.exec(f.content);
          if (match) mainPath = match[1];
        } else {
          try {
            const parsed = JSON.parse(f.content);
            if (parsed.main) mainPath = parsed.main;
          } catch {}
        }

        if (mainPath) {
          const clean = mainPath.replace(/^\.\//, '');
          const exists = workspace.files.some(w => w.path === clean);
          if (exists) {
            addScore(
              clean,
              'wrangler_entry',
              100,
              'wrangler_config_main',
              'CRITICAL',
              `Explicitly specified as main entry in ${f.path}`
            );
          }
        }
      }
    }

    // 2. Check AST-detected Cloudflare Worker fetch handlers
    for (const [filePath, modInfo] of parsedModules.entries()) {
      if (modInfo.hasWorkerFetchHandler) {
        addScore(
          filePath,
          'worker_entry',
          98,
          'worker_fetch_export',
          'CRITICAL',
          'AST confirmed explicit Cloudflare Worker fetch handler (export default { fetch } or addEventListener)'
        );
      }
    }

    // 3. Check package.json (module, main, exports)
    const pkgFile = workspace.files.find(f => f.path.toLowerCase() === 'package.json');
    if (pkgFile && pkgFile.content) {
      try {
        const parsed = JSON.parse(pkgFile.content);
        if (parsed.module) {
          const clean = parsed.module.replace(/^\.\//, '');
          if (workspace.files.some(f => f.path === clean)) {
            addScore(
              clean,
              'script_entry',
              92,
              'package_json_module',
              'HIGH',
              'Specified as package.json "module" field'
            );
          }
        }
        if (parsed.main) {
          const clean = parsed.main.replace(/^\.\//, '');
          if (workspace.files.some(f => f.path === clean)) {
            addScore(
              clean,
              'script_entry',
              88,
              'package_json_main',
              'HIGH',
              'Specified as package.json "main" field'
            );
          }
        }
      } catch {}
    }

    // 4. Check HTML script references
    for (const ref of htmlScriptReferences) {
      const scriptClean = ref.scriptSrc.replace(/^\.\//, '').replace(/^\//, '');
      const foundFile = workspace.files.find(
        f => f.path === scriptClean || f.path.endsWith(scriptClean)
      );
      if (foundFile) {
        addScore(
          foundFile.path,
          'html_entry',
          82,
          'html_script_tag',
          'HIGH',
          `Referenced directly inside ${ref.htmlFile} <script src="...">`
        );
      }
    }

    // 5. Conventional filenames and directory patterns
    const conventionalPatterns = [
      { pattern: /^worker\.(ts|js|mjs)$/i, score: 78, reason: 'Root worker script file' },
      { pattern: /^(src\/)?worker\.(ts|js|mjs)$/i, score: 76, reason: 'Source worker script file' },
      { pattern: /^(src\/)?main\.(ts|js|mjs)$/i, score: 74, reason: 'Standard main entry script' },
      { pattern: /^(src\/)?index\.(ts|js|mjs)$/i, score: 70, reason: 'Standard index entry script' },
      { pattern: /^worker\/index\.(ts|js|mjs)$/i, score: 72, reason: 'Worker folder index script' },
      { pattern: /^(src\/)?app\.(ts|js|mjs)$/i, score: 68, reason: 'Standard application script' },
    ];

    for (const f of workspace.files) {
      if (!['.js', '.ts', '.mjs', '.cjs'].includes(f.extension)) continue;

      for (const conv of conventionalPatterns) {
        if (conv.pattern.test(f.path)) {
          addScore(
            f.path,
            'script_entry',
            conv.score,
            'conventional_naming',
            'MEDIUM',
            conv.reason
          );
          break;
        }
      }
    }

    // 6. Dependency Graph root analysis (Files with dependents = 0 that import others)
    if (dependencyGraph) {
      for (const [nodePath, node] of Object.entries(dependencyGraph.nodes)) {
        if (node.dependents.length === 0 && node.dependencies.length > 0) {
          addScore(
            nodePath,
            'script_entry',
            60,
            'root_dependency_hub',
            'LOW',
            `Topological root file with ${node.dependencies.length} dependencies and 0 dependents`
          );
        }
      }
    }

    // Calculate aggregate score and produce final list
    const candidates: EntryCandidate[] = [];
    for (const [filePath, item] of candidatesMap.entries()) {
      // Aggregate highest single factor or weighted combination
      const maxScore = Math.max(...item.factors.map(f => f.score));
      const bonus = (item.factors.length - 1) * 2;
      const totalScore = Math.min(100, maxScore + bonus);

      const topFactor = item.factors.sort((a, b) => b.score - a.score)[0];

      candidates.push({
        path: filePath,
        type: item.candidate.type,
        score: totalScore,
        reason: topFactor ? `${topFactor.details} (${topFactor.factor})` : 'Candidate file',
        factors: item.factors,
      });
    }

    // Sort descending by score
    candidates.sort((a, b) => b.score - a.score);

    return candidates;
  }
}
