import {
  AstModuleInfo,
  ImportGraphNode,
  NodeApiUsage,
  ProjectWorkspace,
  StaticAnalysisResult,
} from '@/types/bundler';
import { AstParser } from '@/server/analyzer/ast-parser';
import { DependencyGraphBuilder } from '@/server/analyzer/dependency-graph';
import { EntryDetector } from '@/server/analyzer/entry-detector';
import { CompatibilityAnalyzer } from '@/server/compatibility/compatibility-analyzer';
import { BuildCache } from '@/server/cache/build-cache';

export class StaticAnalyzer {
  static analyze(workspace: ProjectWorkspace): StaticAnalysisResult {
    const importGraph: Record<string, ImportGraphNode> = {};
    const parsedModules = new Map<string, AstModuleInfo>();
    let esmCount = 0;
    let cjsCount = 0;
    let hasWorkerFetchHandler = false;
    let workerHandlerFile: string | undefined;

    const htmlScriptReferences: { htmlFile: string; scriptSrc: string }[] = [];
    const htmlStyleReferences: { htmlFile: string; href: string }[] = [];
    const cssAssetReferences: { cssFile: string; assetUrl: string }[] = [];

    // 1. Find main HTML entry if any
    let htmlEntry: string | undefined;
    const htmlFiles = workspace.files.filter(f => f.extension === '.html' || f.extension === '.htm');
    if (htmlFiles.length > 0) {
      const rootIndex = htmlFiles.find(f => f.path.toLowerCase() === 'index.html');
      htmlEntry = rootIndex ? rootIndex.path : htmlFiles[0].path;
    }

    // 2. Parse package.json if present
    let packageDependencies = {
      dependencies: {} as Record<string, string>,
      devDependencies: {} as Record<string, string>,
    };

    const pkgFile = workspace.files.find(f => f.path.toLowerCase() === 'package.json');
    if (pkgFile && pkgFile.content) {
      try {
        const parsed = JSON.parse(pkgFile.content);
        packageDependencies = {
          dependencies: parsed.dependencies || {},
          devDependencies: parsed.devDependencies || {},
        };
      } catch {}
    }

    // 3. Process each text file in workspace
    for (const f of workspace.files) {
      if (f.isBinary || !f.content) continue;

      const ext = f.extension.toLowerCase();
      const content = f.content;
      const fileHash = BuildCache.hashFile(content);

      // HTML references analysis
      if (ext === '.html' || ext === '.htm') {
        const scriptRegex = /<script\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi;
        let match;
        while ((match = scriptRegex.exec(content)) !== null) {
          const src = match[1];
          if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('//')) {
            htmlScriptReferences.push({ htmlFile: f.path, scriptSrc: src });
          }
        }

        const linkRegex = /<link\b[^>]*?\bhref=["']([^"']+)["'][^>]*>/gi;
        while ((match = linkRegex.exec(content)) !== null) {
          const href = match[1];
          if (!href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('//')) {
            htmlStyleReferences.push({ htmlFile: f.path, href });
          }
        }
      }

      // CSS references analysis
      if (ext === '.css') {
        const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
        let match;
        while ((match = urlRegex.exec(content)) !== null) {
          const assetUrl = match[1];
          if (
            !assetUrl.startsWith('data:') &&
            !assetUrl.startsWith('http://') &&
            !assetUrl.startsWith('https://')
          ) {
            cssAssetReferences.push({ cssFile: f.path, assetUrl });
          }
        }
      }

      // JS / TS AST Analysis
      if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(ext)) {
        let astModule = BuildCache.getAst(f.path, fileHash);
        if (!astModule) {
          astModule = AstParser.parseModule(f.path, content);
          BuildCache.setAst(f.path, fileHash, astModule);
        }

        parsedModules.set(f.path, astModule);

        if (astModule.hasWorkerFetchHandler) {
          hasWorkerFetchHandler = true;
          workerHandlerFile = f.path;
        }

        if (astModule.isCommonJs) {
          cjsCount++;
        }
        if (astModule.imports.length > 0 || astModule.exports.length > 0) {
          esmCount++;
        }

        const staticImports = astModule.imports.filter(i => !i.isDynamic).map(i => i.source);
        const dynamicImports = astModule.imports.filter(i => i.isDynamic).map(i => i.source);
        const exportsList = astModule.exports.map(e => e.name);

        importGraph[f.path] = {
          path: f.path,
          imports: staticImports,
          dynamicImports,
          exports: exportsList,
        };
      }
    }

    // 4. Module format classification
    let moduleFormat: 'esm' | 'cjs' | 'mixed' = 'esm';
    if (esmCount > 0 && cjsCount > 0) moduleFormat = 'mixed';
    else if (cjsCount > 0 && esmCount === 0) moduleFormat = 'cjs';

    // 5. Dependency Graph Construction
    const entryInitialCandidates = Array.from(parsedModules.keys());
    const dependencyGraph = DependencyGraphBuilder.build(
      workspace,
      parsedModules,
      entryInitialCandidates
    );

    // 6. Multi-Factor Entry Detection
    const entryCandidates = EntryDetector.detect(
      workspace,
      parsedModules,
      htmlScriptReferences,
      dependencyGraph
    );

    // 7. Compatibility Analysis
    const compatibilityReport = CompatibilityAnalyzer.analyze(
      workspace,
      parsedModules,
      packageDependencies
    );

    // Format legacy nodeApiUsages for backwards compatibility with any remaining consumers
    const nodeApiUsages: NodeApiUsage[] = compatibilityReport.issues.map(issue => ({
      moduleName: issue.packageOrModule,
      status: issue.status,
      files: issue.files,
      description: issue.description,
      workerAlternative: issue.workerAlternative,
    }));

    return {
      entryCandidates,
      htmlEntry,
      htmlScriptReferences,
      htmlStyleReferences,
      cssAssetReferences,
      importGraph,
      dependencyGraph,
      compatibilityReport,
      moduleFormat,
      nodeApiUsages,
      packageDependencies,
      hasWorkerFetchHandler,
      workerHandlerFile,
    };
  }
}
