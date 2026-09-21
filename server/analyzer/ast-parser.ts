import ts from 'typescript';
import { AstExportInfo, AstImportInfo, AstModuleInfo } from '@/types/bundler';

const NODE_BUILTINS = new Set([
  'fs',
  'fs/promises',
  'child_process',
  'net',
  'tls',
  'http',
  'https',
  'cluster',
  'dgram',
  'v8',
  'vm',
  'worker_threads',
  'os',
  'path',
  'crypto',
  'buffer',
  'events',
  'util',
  'stream',
  'async_hooks',
  'assert',
  'url',
  'querystring',
  'zlib',
  'dns',
  'process',
  'timers',
  'readline',
  'perf_hooks',
]);

export class AstParser {
  /**
   * Parses JavaScript or TypeScript source code using TypeScript compiler AST.
   */
  static parseModule(filePath: string, sourceCode: string): AstModuleInfo {
    const isTs = filePath.endsWith('.ts') || filePath.endsWith('.mts') || filePath.endsWith('.cts');
    const scriptKind = filePath.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : filePath.endsWith('.jsx')
      ? ts.ScriptKind.JSX
      : isTs
      ? ts.ScriptKind.TS
      : ts.ScriptKind.JS;

    const sourceFile = ts.createSourceFile(
      filePath,
      sourceCode,
      ts.ScriptTarget.Latest,
      true,
      scriptKind
    );

    const imports: AstImportInfo[] = [];
    const exports: AstExportInfo[] = [];
    let hasWorkerFetchHandler = false;
    let isCommonJs = false;
    let hasAsyncHandler = false;
    const nodeBuiltinsUsed = new Set<string>();

    function checkNodeBuiltin(moduleSpecifier: string) {
      const clean = moduleSpecifier.replace(/^node:/, '');
      if (NODE_BUILTINS.has(clean) || NODE_BUILTINS.has(moduleSpecifier)) {
        nodeBuiltinsUsed.add(clean);
      }
    }

    function checkFetchMethodInObject(objLiteral: ts.ObjectLiteralExpression) {
      for (const prop of objLiteral.properties) {
        if (ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) {
          const propName = prop.name && ts.isIdentifier(prop.name) ? prop.name.text : '';
          if (propName === 'fetch') {
            hasWorkerFetchHandler = true;
            if (ts.isMethodDeclaration(prop)) {
              if (prop.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
                hasAsyncHandler = true;
              }
            } else if (ts.isPropertyAssignment(prop)) {
              if (
                ts.isArrowFunction(prop.initializer) ||
                ts.isFunctionExpression(prop.initializer)
              ) {
                if (prop.initializer.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
                  hasAsyncHandler = true;
                }
              }
            }
          }
        }
      }
    }

    function visit(node: ts.Node) {
      // 1. Static Import Declarations
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : '';
        if (moduleSpecifier) {
          checkNodeBuiltin(moduleSpecifier);

          const isTypeOnly = node.importClause?.isTypeOnly ?? false;
          let defaultImport: string | undefined;
          let namespaceImport: string | undefined;
          const namedImports: string[] = [];

          if (node.importClause) {
            if (node.importClause.name) {
              defaultImport = node.importClause.name.text;
            }
            if (node.importClause.namedBindings) {
              if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                namespaceImport = node.importClause.namedBindings.name.text;
              } else if (ts.isNamedImports(node.importClause.namedBindings)) {
                for (const el of node.importClause.namedBindings.elements) {
                  namedImports.push(el.name.text);
                }
              }
            }
          }

          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          imports.push({
            source: moduleSpecifier,
            isDynamic: false,
            isTypeOnly,
            defaultImport,
            namedImports: namedImports.length > 0 ? namedImports : undefined,
            namespaceImport,
            line,
          });
        }
      }

      // 2. Dynamic import(...) & require(...) CallExpressions
      if (ts.isCallExpression(node)) {
        // Dynamic import
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            checkNodeBuiltin(arg.text);
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            imports.push({
              source: arg.text,
              isDynamic: true,
              line,
            });
          }
        }

        // CommonJS require('...')
        if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
          isCommonJs = true;
          const arg = node.arguments[0];
          if (arg && ts.isStringLiteral(arg)) {
            checkNodeBuiltin(arg.text);
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            imports.push({
              source: arg.text,
              isDynamic: false,
              line,
            });
          }
        }

        // addEventListener('fetch', ...)
        if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === 'addEventListener' &&
          node.arguments.length > 0
        ) {
          const firstArg = node.arguments[0];
          if (ts.isStringLiteral(firstArg) && firstArg.text === 'fetch') {
            hasWorkerFetchHandler = true;
          }
        }
      }

      // 3. Export Declarations (export { a, b } from '...')
      if (ts.isExportDeclaration(node)) {
        const isTypeOnly = node.isTypeOnly;
        let reExportSource: string | undefined;
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          reExportSource = node.moduleSpecifier.text;
          checkNodeBuiltin(reExportSource);
          imports.push({
            source: reExportSource,
            isDynamic: false,
            isTypeOnly,
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          });
        }

        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            exports.push({
              name: el.name.text,
              isDefault: el.name.text === 'default',
              isTypeOnly: isTypeOnly || el.isTypeOnly,
              reExportSource,
            });
          }
        }
      }

      // 4. Export Default Assignment (export default { ... })
      if (ts.isExportAssignment(node)) {
        exports.push({
          name: 'default',
          isDefault: true,
        });

        if (ts.isObjectLiteralExpression(node.expression)) {
          checkFetchMethodInObject(node.expression);
        } else if (
          ts.isFunctionExpression(node.expression) ||
          ts.isArrowFunction(node.expression)
        ) {
          hasWorkerFetchHandler = true;
          if (node.expression.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) {
            hasAsyncHandler = true;
          }
        }
      }

      // 5. Export Function or Class or Variable
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isClassDeclaration(node) ||
          ts.isVariableStatement(node)) &&
        node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
      ) {
        const isDefault = node.modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword);
        if (ts.isFunctionDeclaration(node)) {
          const name = node.name ? node.name.text : isDefault ? 'default' : '';
          if (name) {
            exports.push({ name, isDefault });
            if (name === 'fetch' || (isDefault && node.parameters.length >= 1)) {
              hasWorkerFetchHandler = true;
            }
          }
        } else if (ts.isClassDeclaration(node)) {
          const name = node.name ? node.name.text : isDefault ? 'default' : '';
          if (name) {
            exports.push({ name, isDefault });
            for (const member of node.members) {
              if (ts.isMethodDeclaration(member) && member.name && ts.isIdentifier(member.name)) {
                if (member.name.text === 'fetch') {
                  hasWorkerFetchHandler = true;
                }
              }
            }
          }
        } else if (ts.isVariableStatement(node)) {
          for (const decl of node.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              exports.push({ name: decl.name.text, isDefault: false });
            }
          }
        }
      }

      // 6. CommonJS module.exports or exports.xxx
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isPropertyAccessExpression(node.left)) {
          const expr = node.left.expression;
          const propName = node.left.name.text;
          if (ts.isIdentifier(expr) && expr.text === 'module' && propName === 'exports') {
            isCommonJs = true;
            exports.push({ name: 'default', isDefault: true });
            if (ts.isObjectLiteralExpression(node.right)) {
              checkFetchMethodInObject(node.right);
            }
          } else if (ts.isIdentifier(expr) && expr.text === 'exports') {
            isCommonJs = true;
            exports.push({ name: propName, isDefault: propName === 'default' });
          }
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);

    return {
      path: filePath,
      imports,
      exports,
      hasWorkerFetchHandler,
      isCommonJs,
      hasAsyncHandler,
      nodeBuiltinsUsed: Array.from(nodeBuiltinsUsed),
    };
  }
}
