import path from 'path';
import {
  AstModuleInfo,
  DependencyGraph,
  DependencyGraphNode,
  ProjectWorkspace,
} from '@/types/bundler';

export class DependencyGraphBuilder {
  /**
   * Resolves an import source specifier to a physical file path in the workspace.
   */
  static resolveSpecifier(
    fromFilePath: string,
    specifier: string,
    allFiles: Set<string>
  ): string | null {
    // Ignore non-relative npm or node built-in imports
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) {
      return null;
    }

    const dir = path.dirname(fromFilePath);
    const normalized = path.normalize(path.join(dir, specifier)).replace(/\\/g, '/');
    const cleanPath = normalized.startsWith('./') ? normalized.slice(2) : normalized;

    // Check exact match
    if (allFiles.has(cleanPath)) return cleanPath;

    // Check with extensions
    const candidateExtensions = ['.ts', '.js', '.mts', '.mjs', '.cts', '.cjs', '.json', '.css'];
    for (const ext of candidateExtensions) {
      const withExt = cleanPath + ext;
      if (allFiles.has(withExt)) return withExt;
    }

    // Check directory index
    for (const ext of candidateExtensions) {
      const indexCandidate = path.join(cleanPath, `index${ext}`).replace(/\\/g, '/');
      if (allFiles.has(indexCandidate)) return indexCandidate;
    }

    return null;
  }

  /**
   * Builds the complete dependency graph from parsed AST modules.
   */
  static build(
    workspace: ProjectWorkspace,
    parsedModules: Map<string, AstModuleInfo>,
    entryPaths: string[]
  ): DependencyGraph {
    const allFilePaths = new Set(workspace.files.map(f => f.path));
    const nodes: Record<string, DependencyGraphNode> = {};

    // Initialize all code files as nodes
    for (const file of workspace.files) {
      if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(file.extension)) {
        nodes[file.path] = {
          path: file.path,
          dependencies: [],
          dynamicDependencies: [],
          dependents: [],
          exports: [],
          isEntryCandidate: false,
        };
      }
    }

    // Populate dependencies and exports
    for (const [filePath, modInfo] of parsedModules.entries()) {
      if (!nodes[filePath]) {
        nodes[filePath] = {
          path: filePath,
          dependencies: [],
          dynamicDependencies: [],
          dependents: [],
          exports: [],
          isEntryCandidate: false,
        };
      }

      nodes[filePath].exports = modInfo.exports.map(e => e.name);
      nodes[filePath].isEntryCandidate = modInfo.hasWorkerFetchHandler;

      for (const imp of modInfo.imports) {
        const resolved = this.resolveSpecifier(filePath, imp.source, allFilePaths);
        const target = resolved || imp.source;

        if (imp.isDynamic) {
          if (!nodes[filePath].dynamicDependencies.includes(target)) {
            nodes[filePath].dynamicDependencies.push(target);
          }
        } else {
          if (!nodes[filePath].dependencies.includes(target)) {
            nodes[filePath].dependencies.push(target);
          }
        }

        // Add back-reference to dependent if resolved internal file
        if (resolved && nodes[resolved]) {
          if (!nodes[resolved].dependents.includes(filePath)) {
            nodes[resolved].dependents.push(filePath);
          }
        }
      }
    }

    // Detect Circular Dependencies
    const circularDependencies = this.detectCycles(nodes);

    // Compute Topological Execution Order
    const executionOrder = this.computeTopologicalOrder(nodes, entryPaths);

    // Detect Unused Files
    const reachable = this.computeReachableFiles(nodes, entryPaths);
    const unusedFiles = Object.keys(nodes).filter(p => !reachable.has(p));

    return {
      nodes,
      circularDependencies,
      executionOrder,
      unusedFiles,
    };
  }

  /**
   * Detects all cycles in the dependency graph using DFS.
   */
  private static detectCycles(nodes: Record<string, DependencyGraphNode>): string[][] {
    const cycles: string[][] = [];
    const visited: Record<string, boolean> = {};
    const inStack: Record<string, boolean> = {};

    function dfs(current: string, pathStack: string[]) {
      visited[current] = true;
      inStack[current] = true;
      pathStack.push(current);

      const node = nodes[current];
      if (node) {
        for (const dep of node.dependencies) {
          if (!nodes[dep]) continue; // Skip external packages

          if (!visited[dep]) {
            dfs(dep, pathStack);
          } else if (inStack[dep]) {
            const cycleStartIndex = pathStack.indexOf(dep);
            if (cycleStartIndex !== -1) {
              const cycle = pathStack.slice(cycleStartIndex).concat(dep);
              cycles.push(cycle);
            }
          }
        }
      }

      pathStack.pop();
      inStack[current] = false;
    }

    for (const filePath of Object.keys(nodes)) {
      if (!visited[filePath]) {
        dfs(filePath, []);
      }
    }

    return cycles;
  }

  /**
   * Computes topological execution order of files starting from entries.
   */
  private static computeTopologicalOrder(
    nodes: Record<string, DependencyGraphNode>,
    entryPaths: string[]
  ): string[] {
    const order: string[] = [];
    const visited = new Set<string>();

    function visit(current: string) {
      if (visited.has(current)) return;
      visited.add(current);

      const node = nodes[current];
      if (node) {
        for (const dep of node.dependencies) {
          if (nodes[dep]) {
            visit(dep);
          }
        }
      }

      order.push(current);
    }

    for (const entry of entryPaths) {
      if (nodes[entry]) {
        visit(entry);
      }
    }

    for (const filePath of Object.keys(nodes)) {
      if (!visited.has(filePath)) {
        visit(filePath);
      }
    }

    return order;
  }

  /**
   * Computes all files reachable from entry paths.
   */
  private static computeReachableFiles(
    nodes: Record<string, DependencyGraphNode>,
    entryPaths: string[]
  ): Set<string> {
    const reachable = new Set<string>();

    function traverse(current: string) {
      if (reachable.has(current)) return;
      reachable.add(current);

      const node = nodes[current];
      if (node) {
        for (const dep of [...node.dependencies, ...node.dynamicDependencies]) {
          if (nodes[dep]) {
            traverse(dep);
          }
        }
      }
    }

    for (const entry of entryPaths) {
      if (nodes[entry]) {
        traverse(entry);
      }
    }

    return reachable;
  }
}
