import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import ts from 'typescript-classic';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(SCRIPT_DIR, '..');
const CONFIG_FILE_NAME = 'trpc-procedure-usage.config.json';
const UTF8 = 'utf8';
const MAX_RESOLUTION_DEPTH = 30;
const CONFIGURED_IGNORE = 'Configured ignore.';

type ProcedureKind = 'query' | 'mutation' | 'subscription';

type UsageStatus = 'used' | 'ignored' | 'unused';

interface PatternEntry {
  path?: string;
  reason?: string;
}

interface UsageConfig {
  backendRouterEntry: string;
  backendRouterRootExport: string;
  routerFactoryNames: string[];
  callerFactoryNames: string[];
  pathAliases: Record<string, string>;
  ignoreProcedures: Array<string | PatternEntry>;
  manualUsages: PatternEntry[];
  ignoreUsagePaths: string[];
  usageRoots: string[];
  openApiBasePath: string;
  openApiTextUsageRoots: string[];
  reportJsonPath: string;
  reportMarkdownPath: string;
}

interface SourceLocation {
  file: string;
  line: number;
  column: number;
}

interface OpenApiMeta {
  method: string;
  path: string;
}

interface ProcedureInfo {
  path: string;
  kind: ProcedureKind;
  openapi: OpenApiMeta | null;
  definedAt: SourceLocation;
}

interface ProcedureUsage {
  kind: string;
  location: SourceLocation;
  reason?: string;
}

interface Diagnostic {
  level: 'warning';
  message: string;
  location: SourceLocation;
}

interface ReportRow extends ProcedureInfo {
  status: UsageStatus;
  ignoreReason: string | null;
  usageCount: number;
  usages: ProcedureUsage[];
}

interface ImportBinding {
  file: string;
  exportName: string;
}

type ExportBinding =
  { kind: 'local'; localName: string } | { kind: 'reexport'; file: string; exportName: string };

interface ModuleInfo {
  sourceFile: ts.SourceFile;
  imports: Map<string, ImportBinding>;
  declarations: Map<string, ts.Expression>;
  exports: Map<string, ExportBinding>;
}

interface ResolvedExpression {
  file: string;
  expression: ts.Expression;
}

interface ModuleResolver {
  getModule: (file: string) => ModuleInfo;
  resolveBinding: (file: string, name: string, depth: number) => ResolvedExpression | null;
  resolveExport: (file: string, exportName: string, depth: number) => ResolvedExpression | null;
}

interface RouterAnalysis {
  procedures: Map<string, ProcedureInfo>;
  routerPrefixes: Map<ts.Node, string[]>;
  diagnostics: Diagnostic[];
}

interface OpenApiMatcher {
  procedurePath: string;
  bare: RegExp;
  prefixed: RegExp;
}

type UsageMap = Map<string, ProcedureUsage[]>;

const DEFAULT_CONFIG: UsageConfig = {
  backendRouterEntry: 'src/server/routers/index.ts',
  backendRouterRootExport: 'appRouter',
  routerFactoryNames: ['createTRPCRouter', 'router'],
  callerFactoryNames: ['createCallerFactory'],
  pathAliases: { '@/': 'src/' },
  ignoreProcedures: [],
  manualUsages: [],
  ignoreUsagePaths: [],
  usageRoots: ['src'],
  openApiBasePath: '/api/external',
  openApiTextUsageRoots: [],
  reportJsonPath: 'reports/trpc-procedure-usage.json',
  reportMarkdownPath: 'reports/trpc-procedure-usage.md',
};

const PROCEDURE_KINDS: ReadonlySet<string> = new Set(['query', 'mutation', 'subscription']);
const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const TEXT_USAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ...SOURCE_EXTENSIONS,
  '.java',
  '.json',
  '.kt',
  '.kts',
  '.sh',
  '.yaml',
  '.yml',
]);
const MODULE_FILE_SUFFIXES = ['.ts', '.tsx', '.js', '.jsx', '.mjs'];
const MODULE_INDEX_FILES = ['index.ts', 'index.tsx', 'index.js'];
const SKIPPED_DIRS: ReadonlySet<string> = new Set([
  '.git',
  '.gradle',
  '.next',
  '.turbo',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
]);
const OPENAPI_PARAM_PATTERN = '(?:\\{[^}/]*\\}|\\$\\{[^}]*\\}|\\$\\w+|:\\w+)';
const OPENAPI_PATH_END_PATTERN = '(?![\\w-]|/[\\w{$-])';

const normalizeRelativePath = (value: string): string => value.split(path.sep).join('/');

const toRelativePath = (file: string): string =>
  normalizeRelativePath(path.relative(WEB_DIR, file));

const isFile = (candidate: string): boolean =>
  fs.existsSync(candidate) && fs.statSync(candidate).isFile();

const resolveConfigPath = (args: string[]): string => {
  const configIndex = args.indexOf('--config');
  if (configIndex === -1) {
    return path.join(WEB_DIR, CONFIG_FILE_NAME);
  }
  const configValue = args.at(configIndex + 1);
  if (configValue === undefined || configValue.startsWith('--')) {
    throw new Error('--config requires a JSON config path.');
  }
  return path.resolve(WEB_DIR, configValue);
};

const loadConfig = (configPath: string): UsageConfig => {
  const overrides = isFile(configPath)
    ? (JSON.parse(fs.readFileSync(configPath, UTF8)) as Partial<UsageConfig>)
    : {};
  return { ...DEFAULT_CONFIG, ...overrides };
};

const matchesPattern = (value: string, pattern: string): boolean => {
  const parts = pattern.split('*');
  if (parts.length === 1) {
    return value === pattern;
  }
  const first = parts[0];
  const last = parts[parts.length - 1];
  if (!value.startsWith(first) || !value.endsWith(last)) {
    return false;
  }
  let cursor = first.length;
  for (const middle of parts.slice(1, -1)) {
    const found = value.indexOf(middle, cursor);
    if (found === -1) {
      return false;
    }
    cursor = found + middle.length;
  }
  return cursor <= value.length - last.length;
};

const walkFiles = (directory: string): string[] => {
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRS.has(entry.name) ? [] : walkFiles(entryPath);
      }
      return entry.isFile() && TEXT_USAGE_EXTENSIONS.has(path.extname(entry.name))
        ? [entryPath]
        : [];
    });
};

const getNodeLocation = (sourceFile: ts.SourceFile, node: ts.Node): SourceLocation => {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    file: toRelativePath(sourceFile.fileName),
    line: position.line + 1,
    column: position.character + 1,
  };
};

const getTextLocation = (file: string, text: string, index: number): SourceLocation => {
  const prefix = text.slice(0, index);
  return {
    file: toRelativePath(file),
    line: prefix.split('\n').length,
    column: index - prefix.lastIndexOf('\n'),
  };
};

const formatLocation = (location: SourceLocation): string =>
  `${location.file}:${location.line}:${location.column}`;

const unwrapExpression = (expression: ts.Expression): ts.Expression => {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isAwaitExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
};

const getPropertyName = (name: ts.PropertyName): string | null =>
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;

const getCalleeName = (call: ts.CallExpression): string | null => {
  const callee = unwrapExpression(call.expression);
  if (ts.isIdentifier(callee)) {
    return callee.text;
  }
  return ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
};

const getExpressionChain = (expression: ts.Expression): string[] | null => {
  if (ts.isIdentifier(expression)) {
    return [expression.text];
  }
  if (ts.isPropertyAccessExpression(expression)) {
    const parent = getExpressionChain(expression.expression);
    return parent === null ? null : [...parent, expression.name.text];
  }
  if (
    ts.isCallExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression)
  ) {
    return getExpressionChain(expression.expression);
  }
  return null;
};

const isProcedureKind = (value: string): value is ProcedureKind => PROCEDURE_KINDS.has(value);

const getProcedureKind = (expression: ts.Expression): ProcedureKind | null => {
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const { name, expression: receiver } = expression.expression;
    return isProcedureKind(name.text) ? name.text : getProcedureKind(receiver);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return getProcedureKind(expression.expression);
  }
  return null;
};

const getProperty = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.Expression | null => {
  const match = objectLiteral.properties.find(
    (property): property is ts.PropertyAssignment =>
      ts.isPropertyAssignment(property) && getPropertyName(property.name) === propertyName,
  );
  return match === undefined ? null : match.initializer;
};

const getStringProperty = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): string | null => {
  const value = getProperty(objectLiteral, propertyName);
  return value !== null && ts.isStringLiteralLike(value) ? value.text : null;
};

const getObjectProperty = (
  objectLiteral: ts.ObjectLiteralExpression,
  propertyName: string,
): ts.ObjectLiteralExpression | null => {
  const value = getProperty(objectLiteral, propertyName);
  return value !== null && ts.isObjectLiteralExpression(value) ? value : null;
};

const readOpenApiMeta = (metaArgument: ts.Expression | undefined): OpenApiMeta | null => {
  if (metaArgument === undefined || !ts.isObjectLiteralExpression(metaArgument)) {
    return null;
  }
  const openapi = getObjectProperty(metaArgument, 'openapi');
  if (openapi === null) {
    return null;
  }
  const method = getStringProperty(openapi, 'method');
  const openapiPath = getStringProperty(openapi, 'path');
  return method === null || openapiPath === null ? null : { method, path: openapiPath };
};

const getProcedureOpenApiMeta = (expression: ts.Expression): OpenApiMeta | null => {
  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    const { name, expression: receiver } = expression.expression;
    const meta = name.text === 'meta' ? readOpenApiMeta(expression.arguments.at(0)) : null;
    return meta ?? getProcedureOpenApiMeta(receiver);
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return getProcedureOpenApiMeta(expression.expression);
  }
  return null;
};

const resolveModuleBase = (
  config: UsageConfig,
  fromFile: string,
  specifier: string,
): string | null => {
  if (specifier.startsWith('.')) {
    return path.resolve(path.dirname(fromFile), specifier);
  }
  const alias = Object.entries(config.pathAliases).find(([prefix]) => specifier.startsWith(prefix));
  if (alias === undefined) {
    return null;
  }
  const [prefix, target] = alias;
  return path.resolve(WEB_DIR, target, specifier.slice(prefix.length));
};

const resolveModuleFile = (
  config: UsageConfig,
  fromFile: string,
  specifier: string,
): string | null => {
  const base = resolveModuleBase(config, fromFile, specifier);
  if (base === null) {
    return null;
  }
  const candidates = [
    ...(SOURCE_EXTENSIONS.has(path.extname(base)) ? [base] : []),
    ...MODULE_FILE_SUFFIXES.map((suffix) => `${base}${suffix}`),
    ...MODULE_INDEX_FILES.map((indexFile) => path.join(base, indexFile)),
  ];
  return candidates.find(isFile) ?? null;
};

const hasExportModifier = (statement: ts.VariableStatement): boolean =>
  ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ===
  true;

const parseSourceFile = (file: string): ts.SourceFile =>
  ts.createSourceFile(file, fs.readFileSync(file, UTF8), ts.ScriptTarget.Latest, true);

const collectImport = (
  config: UsageConfig,
  file: string,
  statement: ts.ImportDeclaration,
  imports: Map<string, ImportBinding>,
): void => {
  const { importClause, moduleSpecifier } = statement;
  if (
    importClause === undefined ||
    importClause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
    !ts.isStringLiteral(moduleSpecifier)
  ) {
    return;
  }
  const importedFile = resolveModuleFile(config, file, moduleSpecifier.text);
  if (importedFile === null) {
    return;
  }
  if (importClause.name !== undefined) {
    imports.set(importClause.name.text, { file: importedFile, exportName: 'default' });
  }
  const { namedBindings } = importClause;
  if (namedBindings === undefined || !ts.isNamedImports(namedBindings)) {
    return;
  }
  for (const element of namedBindings.elements) {
    if (!element.isTypeOnly) {
      imports.set(element.name.text, {
        file: importedFile,
        exportName: element.propertyName?.text ?? element.name.text,
      });
    }
  }
};

const collectExportDeclaration = (
  config: UsageConfig,
  file: string,
  statement: ts.ExportDeclaration,
  exports: Map<string, ExportBinding>,
): void => {
  const { exportClause, moduleSpecifier } = statement;
  if (statement.isTypeOnly || exportClause === undefined || !ts.isNamedExports(exportClause)) {
    return;
  }
  const sourceFile =
    moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier)
      ? resolveModuleFile(config, file, moduleSpecifier.text)
      : null;
  for (const element of exportClause.elements) {
    const exportedName = element.name.text;
    const localName = element.propertyName?.text ?? exportedName;
    if (moduleSpecifier === undefined) {
      exports.set(exportedName, { kind: 'local', localName });
    } else if (sourceFile !== null) {
      exports.set(exportedName, { kind: 'reexport', file: sourceFile, exportName: localName });
    }
  }
};

const buildModuleInfo = (config: UsageConfig, file: string): ModuleInfo => {
  const sourceFile = parseSourceFile(file);
  const info: ModuleInfo = {
    sourceFile,
    imports: new Map(),
    declarations: new Map(),
    exports: new Map(),
  };
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      collectImport(config, file, statement, info.imports);
    } else if (ts.isExportDeclaration(statement)) {
      collectExportDeclaration(config, file, statement, info.exports);
    } else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      info.exports.set('default', { kind: 'local', localName: statement.expression.text });
    } else if (ts.isVariableStatement(statement)) {
      const exported = hasExportModifier(statement);
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
          info.declarations.set(declaration.name.text, declaration.initializer);
          if (exported) {
            info.exports.set(declaration.name.text, {
              kind: 'local',
              localName: declaration.name.text,
            });
          }
        }
      }
    }
  }
  return info;
};

const createModuleResolver = (config: UsageConfig): ModuleResolver => {
  const modules = new Map<string, ModuleInfo>();

  const getModule = (file: string): ModuleInfo => {
    const resolvedFile = path.resolve(file);
    const cached = modules.get(resolvedFile);
    if (cached !== undefined) {
      return cached;
    }
    const info = buildModuleInfo(config, resolvedFile);
    modules.set(resolvedFile, info);
    return info;
  };

  const resolveBinding = (file: string, name: string, depth: number): ResolvedExpression | null => {
    if (depth > MAX_RESOLUTION_DEPTH) {
      return null;
    }
    const info = getModule(file);
    const expression = info.declarations.get(name);
    if (expression !== undefined) {
      return { file: path.resolve(file), expression };
    }
    const imported = info.imports.get(name);
    return imported === undefined
      ? null
      : resolveExport(imported.file, imported.exportName, depth + 1);
  };

  const resolveExport = (
    file: string,
    exportName: string,
    depth: number,
  ): ResolvedExpression | null => {
    if (depth > MAX_RESOLUTION_DEPTH) {
      return null;
    }
    const binding = getModule(file).exports.get(exportName);
    if (binding === undefined) {
      return null;
    }
    if (binding.kind === 'local') {
      return resolveBinding(file, binding.localName, depth + 1);
    }
    return resolveExport(binding.file, binding.exportName, depth + 1);
  };

  return { getModule, resolveBinding, resolveExport };
};

const resolveThroughIdentifiers = (
  resolver: ModuleResolver,
  file: string,
  expression: ts.Expression,
  localDeclarations: ReadonlyMap<string, ts.Expression>,
  depth = 0,
): ResolvedExpression => {
  const target = unwrapExpression(expression);
  if (!ts.isIdentifier(target) || depth > MAX_RESOLUTION_DEPTH) {
    return { file, expression: target };
  }
  const resolved = resolver.resolveBinding(file, target.text, 0);
  if (resolved !== null) {
    return resolveThroughIdentifiers(
      resolver,
      resolved.file,
      resolved.expression,
      new Map(),
      depth + 1,
    );
  }
  const local = localDeclarations.get(target.text);
  return local === undefined
    ? { file, expression: target }
    : resolveThroughIdentifiers(resolver, file, local, localDeclarations, depth + 1);
};

const analyzeRouters = (config: UsageConfig, resolver: ModuleResolver): RouterAnalysis => {
  const procedures = new Map<string, ProcedureInfo>();
  const routerPrefixes = new Map<ts.Node, string[]>();
  const diagnostics: Diagnostic[] = [];

  const warn = (file: string, node: ts.Node, message: string): void => {
    diagnostics.push({
      level: 'warning',
      message,
      location: getNodeLocation(resolver.getModule(file).sourceFile, node),
    });
  };

  const describePrefix = (prefix: string[]): string =>
    prefix.length === 0 ? config.backendRouterRootExport : prefix.join('.');

  const isRouterCall = (expression: ts.Expression): expression is ts.CallExpression =>
    ts.isCallExpression(expression) &&
    config.routerFactoryNames.includes(getCalleeName(expression) ?? '');

  const collectValue = (
    file: string,
    expression: ts.Expression,
    prefix: string[],
    definedAt: SourceLocation,
    depth: number,
  ): void => {
    const target = unwrapExpression(expression);
    const kind = getProcedureKind(target);
    if (kind !== null) {
      const procedurePath = prefix.join('.');
      procedures.set(procedurePath, {
        path: procedurePath,
        kind,
        openapi: getProcedureOpenApiMeta(target),
        definedAt,
      });
      return;
    }
    if (isRouterCall(target)) {
      collectRouterCall(file, target, prefix, depth);
      return;
    }
    if (ts.isCallExpression(target) && getCalleeName(target) === 'mergeRouters') {
      for (const argument of target.arguments) {
        collectValue(file, argument, prefix, definedAt, depth + 1);
      }
      return;
    }
    if (ts.isIdentifier(target) && depth < MAX_RESOLUTION_DEPTH) {
      const resolved = resolver.resolveBinding(file, target.text, 0);
      if (resolved !== null) {
        collectValue(resolved.file, resolved.expression, prefix, definedAt, depth + 1);
        return;
      }
    }
    warn(file, target, `Could not statically resolve router member "${describePrefix(prefix)}".`);
  };

  const collectRouterProperty = (
    file: string,
    property: ts.ObjectLiteralElementLike,
    prefix: string[],
    depth: number,
  ): void => {
    const { sourceFile } = resolver.getModule(file);
    if (ts.isShorthandPropertyAssignment(property)) {
      collectValue(
        file,
        property.name,
        [...prefix, property.name.text],
        getNodeLocation(sourceFile, property.name),
        depth + 1,
      );
      return;
    }
    if (!ts.isPropertyAssignment(property)) {
      warn(file, property, `Router ${describePrefix(prefix)} has a non-property member; skipped.`);
      return;
    }
    const key = getPropertyName(property.name);
    if (key === null) {
      warn(file, property.name, `Router ${describePrefix(prefix)} has a dynamic key; skipped.`);
      return;
    }
    collectValue(
      file,
      property.initializer,
      [...prefix, key],
      getNodeLocation(sourceFile, property.name),
      depth + 1,
    );
  };

  const collectRouterCall = (
    file: string,
    call: ts.CallExpression,
    prefix: string[],
    depth: number,
  ): void => {
    routerPrefixes.set(call, prefix);
    const shape = call.arguments.at(0);
    if (shape === undefined || !ts.isObjectLiteralExpression(shape)) {
      warn(file, call, `Router ${describePrefix(prefix)} has no static object shape.`);
      return;
    }
    for (const property of shape.properties) {
      collectRouterProperty(file, property, prefix, depth);
    }
  };

  const entryFile = path.resolve(WEB_DIR, config.backendRouterEntry);
  const root = resolver.resolveExport(entryFile, config.backendRouterRootExport, 0);
  if (root === null) {
    throw new Error(
      `Could not find exported router "${config.backendRouterRootExport}" in ${config.backendRouterEntry}.`,
    );
  }
  collectValue(
    root.file,
    root.expression,
    [],
    getNodeLocation(resolver.getModule(root.file).sourceFile, root.expression),
    0,
  );

  return { procedures, routerPrefixes, diagnostics };
};

const recordUsage = (usages: UsageMap, procedurePath: string, usage: ProcedureUsage): void => {
  usages.get(procedurePath)?.push(usage);
};

const collectLocalDeclarations = (sourceFile: ts.SourceFile): Map<string, ts.Expression> => {
  const declarations = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      !declarations.has(node.name.text)
    ) {
      declarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return declarations;
};

const collectCallerPrefixes = (
  config: UsageConfig,
  resolver: ModuleResolver,
  routerPrefixes: ReadonlyMap<ts.Node, string[]>,
  file: string,
  sourceFile: ts.SourceFile,
): Map<string, string[]> => {
  const localDeclarations = collectLocalDeclarations(sourceFile);

  const factoryPrefix = (resolved: ResolvedExpression): string[] | null => {
    const { expression } = resolved;
    if (
      !ts.isCallExpression(expression) ||
      !config.callerFactoryNames.includes(getCalleeName(expression) ?? '')
    ) {
      return null;
    }
    const routerArgument = expression.arguments.at(0);
    if (routerArgument === undefined) {
      return null;
    }
    const localScope = resolved.file === path.resolve(file) ? localDeclarations : new Map();
    const router = resolveThroughIdentifiers(resolver, resolved.file, routerArgument, localScope);
    return routerPrefixes.get(router.expression) ?? null;
  };

  const callers = new Map<string, string[]>();
  for (const [name, initializer] of localDeclarations) {
    const call = unwrapExpression(initializer);
    if (ts.isCallExpression(call)) {
      const factory = resolveThroughIdentifiers(resolver, file, call.expression, localDeclarations);
      const prefix = factoryPrefix(factory);
      if (prefix !== null) {
        callers.set(name, prefix);
      }
    }
  }
  return callers;
};

const findProcedurePath = (
  chain: string[],
  callers: ReadonlyMap<string, string[]>,
  procedures: ReadonlyMap<string, ProcedureInfo>,
): string | null => {
  const [root, ...rest] = chain;
  const callerPrefix = callers.get(root);
  if (callerPrefix !== undefined) {
    const candidate = [...callerPrefix, ...rest].join('.');
    if (procedures.has(candidate)) {
      return candidate;
    }
  }
  for (let start = 1; start < chain.length; start += 1) {
    const candidate = chain.slice(start).join('.');
    if (procedures.has(candidate)) {
      return candidate;
    }
  }
  return null;
};

const describeUsage = (node: ts.PropertyAccessExpression): string => {
  const { parent } = node;
  if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
    return parent.name.text;
  }
  if (ts.isCallExpression(parent) && parent.expression === node) {
    return 'call';
  }
  return 'reference';
};

const collectSourceUsages = (
  sourceFile: ts.SourceFile,
  callers: ReadonlyMap<string, string[]>,
  procedures: ReadonlyMap<string, ProcedureInfo>,
  usages: UsageMap,
): void => {
  const procedurePaths = [...procedures.keys()];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      const chain = getExpressionChain(node);
      const procedurePath = chain === null ? null : findProcedurePath(chain, callers, procedures);
      if (procedurePath !== null) {
        recordUsage(usages, procedurePath, {
          kind: describeUsage(node),
          location: getNodeLocation(sourceFile, node),
        });
      }
    }
    if (ts.isStringLiteralLike(node)) {
      const { text } = node;
      for (const procedurePath of procedurePaths) {
        if (text === procedurePath || text.includes(`/trpc/${procedurePath}`)) {
          recordUsage(usages, procedurePath, {
            kind: 'string-literal',
            location: getNodeLocation(sourceFile, node),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitPathParams = (value: string): string[] => {
  const parts: string[] = [];
  let cursor = 0;
  let start = value.indexOf('{');
  while (start !== -1) {
    const end = value.indexOf('}', start + 1);
    if (end === -1) {
      start = -1;
    } else if (end > start + 1) {
      parts.push(value.slice(cursor, start), value.slice(start, end + 1));
      cursor = end + 1;
      start = value.indexOf('{', cursor);
    } else {
      start = value.indexOf('{', start + 1);
    }
  }
  parts.push(value.slice(cursor));
  return parts;
};

const openApiPathPattern = (openapiPath: string): string => {
  const normalized = openapiPath.startsWith('/') ? openapiPath : `/${openapiPath}`;
  return splitPathParams(normalized)
    .map((part) =>
      part.startsWith('{') && part.endsWith('}') ? OPENAPI_PARAM_PATTERN : escapeRegExp(part),
    )
    .join('');
};

const compilePattern = (source: string): RegExp =>
  // eslint-disable-next-line security/detect-non-literal-regexp
  new RegExp(`${source}${OPENAPI_PATH_END_PATTERN}`);

const buildOpenApiMatchers = (
  config: UsageConfig,
  procedures: Iterable<ProcedureInfo>,
): OpenApiMatcher[] =>
  [...procedures].flatMap((procedure) => {
    if (procedure.openapi === null) {
      return [];
    }
    const pattern = openApiPathPattern(procedure.openapi.path);
    return [
      {
        procedurePath: procedure.path,
        bare: compilePattern(pattern),
        prefixed: compilePattern(`${escapeRegExp(config.openApiBasePath)}${pattern}`),
      },
    ];
  });

const isWithin = (file: string, directory: string): boolean =>
  file === directory || file.startsWith(`${directory}${path.sep}`);

const collectOpenApiTextUsages = (
  file: string,
  allowBarePaths: boolean,
  matchers: OpenApiMatcher[],
  usages: UsageMap,
): void => {
  if (matchers.length === 0) {
    return;
  }
  const text = fs.readFileSync(file, UTF8);
  for (const matcher of matchers) {
    const match = (allowBarePaths ? matcher.bare : matcher.prefixed).exec(text);
    if (match !== null) {
      recordUsage(usages, matcher.procedurePath, {
        kind: 'openapi-path',
        location: getTextLocation(file, text, match.index),
      });
    }
  }
};

const collectUsageFiles = (config: UsageConfig): string[] => {
  const reportDirs = [config.reportJsonPath, config.reportMarkdownPath].map((reportPath) =>
    path.dirname(path.resolve(WEB_DIR, reportPath)),
  );
  const roots = [...new Set([...config.usageRoots, ...config.openApiTextUsageRoots])].map((root) =>
    path.resolve(WEB_DIR, root),
  );
  const files = [...new Set(roots.flatMap(walkFiles))];
  return files.filter((file) => {
    const relativePath = toRelativePath(file);
    return (
      !file.endsWith('.d.ts') &&
      !reportDirs.some((reportDir) => isWithin(file, reportDir)) &&
      !config.ignoreUsagePaths.some((pattern) => matchesPattern(relativePath, pattern))
    );
  });
};

const applyManualUsages = (config: UsageConfig, usages: UsageMap): void => {
  for (const manual of config.manualUsages) {
    const pattern = manual.path;
    if (pattern === undefined) {
      continue;
    }
    for (const procedurePath of usages.keys()) {
      if (matchesPattern(procedurePath, pattern)) {
        recordUsage(usages, procedurePath, {
          kind: 'manual',
          location: { file: CONFIG_FILE_NAME, line: 1, column: 1 },
          reason: manual.reason ?? 'Configured manual usage.',
        });
      }
    }
  }
};

const analyzeUsages = (
  config: UsageConfig,
  resolver: ModuleResolver,
  analysis: RouterAnalysis,
): UsageMap => {
  const { procedures, routerPrefixes } = analysis;
  const usages: UsageMap = new Map(
    [...procedures.keys()].map((procedurePath) => [procedurePath, []]),
  );
  const matchers = buildOpenApiMatchers(config, procedures.values());
  const textRoots = config.openApiTextUsageRoots.map((root) => path.resolve(WEB_DIR, root));
  const usageRoots = config.usageRoots.map((root) => path.resolve(WEB_DIR, root));

  for (const file of collectUsageFiles(config)) {
    if (
      SOURCE_EXTENSIONS.has(path.extname(file)) &&
      usageRoots.some((root) => isWithin(file, root))
    ) {
      const { sourceFile } = resolver.getModule(file);
      const callers = collectCallerPrefixes(config, resolver, routerPrefixes, file, sourceFile);
      collectSourceUsages(sourceFile, callers, procedures, usages);
    }
    const allowBarePaths = textRoots.some((root) => isWithin(file, root));
    collectOpenApiTextUsages(file, allowBarePaths, matchers, usages);
  }

  applyManualUsages(config, usages);
  return usages;
};

const getIgnoreReason = (config: UsageConfig, procedurePath: string): string | null => {
  for (const ignored of config.ignoreProcedures) {
    const pattern = typeof ignored === 'string' ? ignored : ignored.path;
    if (pattern !== undefined && matchesPattern(procedurePath, pattern)) {
      return typeof ignored === 'string'
        ? CONFIGURED_IGNORE
        : (ignored.reason ?? CONFIGURED_IGNORE);
    }
  }
  return null;
};

const collectConfigDiagnostics = (
  config: UsageConfig,
  procedures: ReadonlyMap<string, ProcedureInfo>,
): Diagnostic[] => {
  const procedurePaths = [...procedures.keys()];
  const entries = [
    ...config.ignoreProcedures.map((ignored) => ({
      label: 'ignoreProcedures',
      pattern: typeof ignored === 'string' ? ignored : ignored.path,
    })),
    ...config.manualUsages.map((manual) => ({ label: 'manualUsages', pattern: manual.path })),
  ];
  return entries.flatMap(({ label, pattern }) => {
    if (
      pattern !== undefined &&
      procedurePaths.some((procedurePath) => matchesPattern(procedurePath, pattern))
    ) {
      return [];
    }
    return [
      {
        level: 'warning' as const,
        message: `${label} entry "${pattern ?? '(missing path)'}" matches no procedure.`,
        location: { file: CONFIG_FILE_NAME, line: 1, column: 1 },
      },
    ];
  });
};

const resolveStatus = (usageCount: number, ignoreReason: string | null): UsageStatus => {
  if (usageCount > 0) {
    return 'used';
  }
  return ignoreReason === null ? 'unused' : 'ignored';
};

const makeReportRows = (
  config: UsageConfig,
  procedures: ReadonlyMap<string, ProcedureInfo>,
  usages: UsageMap,
): ReportRow[] =>
  [...procedures.values()]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((procedure) => {
      const procedureUsages = [...(usages.get(procedure.path) ?? [])].sort((left, right) =>
        formatLocation(left.location).localeCompare(formatLocation(right.location)),
      );
      const ignoreReason = getIgnoreReason(config, procedure.path);
      return {
        ...procedure,
        status: resolveStatus(procedureUsages.length, ignoreReason),
        ignoreReason,
        usageCount: procedureUsages.length,
        usages: procedureUsages,
      };
    });

const markdownEscape = (value: string): string =>
  value.replaceAll('|', '\\|').replaceAll('\n', '<br>');

const formatOpenApiRoute = (config: UsageConfig, openapi: OpenApiMeta | null): string =>
  openapi === null
    ? ''
    : `${openapi.method.toUpperCase()} ${config.openApiBasePath}${openapi.path}`;

const formatUsage = (usage: ProcedureUsage): string => {
  const detail = usage.reason === undefined ? usage.kind : `${usage.kind}: ${usage.reason}`;
  return `${formatLocation(usage.location)} (${detail})`;
};

const tableRow = (cells: string[]): string =>
  `| ${cells.map((cell) => markdownEscape(cell)).join(' | ')} |`;

const renderMarkdownReport = (
  config: UsageConfig,
  rows: ReportRow[],
  diagnostics: Diagnostic[],
): string => {
  const countByStatus = (status: UsageStatus): number =>
    rows.filter((row) => row.status === status).length;
  const lines = [
    '# tRPC Procedure Usage',
    '',
    `Total procedures: ${rows.length}`,
    `Used procedures: ${countByStatus('used')}`,
    `Ignored procedures: ${countByStatus('ignored')}`,
    `Unused procedures: ${countByStatus('unused')}`,
    '',
  ];

  const unusedRows = rows.filter((row) => row.status === 'unused');
  if (unusedRows.length > 0) {
    lines.push('## Unused Procedures', '');
    for (const row of unusedRows) {
      const route = formatOpenApiRoute(config, row.openapi);
      const routeSuffix = route === '' ? '' : ` [${route}]`;
      lines.push(
        `- \`${row.path}\` (${row.kind})${routeSuffix} at ${formatLocation(row.definedAt)}`,
      );
    }
    lines.push('');
  }

  if (diagnostics.length > 0) {
    lines.push(
      '## Analyzer Diagnostics',
      '',
      '| Level | Location | Message |',
      '| --- | --- | --- |',
    );
    for (const diagnostic of diagnostics) {
      lines.push(
        tableRow([diagnostic.level, formatLocation(diagnostic.location), diagnostic.message]),
      );
    }
    lines.push('');
  }

  lines.push(
    '## Procedures',
    '',
    '| Procedure | Kind | OpenAPI Route | Status | Uses | Defined At | Usage Locations |',
    '| --- | --- | --- | --- | ---: | --- | --- |',
  );
  for (const row of rows) {
    const usageLocations =
      row.usages.length === 0 ? (row.ignoreReason ?? '') : row.usages.map(formatUsage).join('\n');
    lines.push(
      tableRow([
        row.path,
        row.kind,
        formatOpenApiRoute(config, row.openapi),
        row.status,
        String(row.usageCount),
        formatLocation(row.definedAt),
        usageLocations,
      ]),
    );
  }
  lines.push('');
  return lines.join('\n');
};

const writeReports = (config: UsageConfig, rows: ReportRow[], diagnostics: Diagnostic[]): void => {
  const jsonPath = path.resolve(WEB_DIR, config.reportJsonPath);
  const markdownPath = path.resolve(WEB_DIR, config.reportMarkdownPath);
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  const report = {
    diagnostics,
    procedures: rows,
    unusedProcedures: rows.filter((row) => row.status === 'unused'),
  };
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(markdownPath, renderMarkdownReport(config, rows, diagnostics));
};

const main = (): number => {
  const config = loadConfig(resolveConfigPath(process.argv.slice(2)));
  const resolver = createModuleResolver(config);
  const analysis = analyzeRouters(config, resolver);
  const usages = analyzeUsages(config, resolver, analysis);
  const rows = makeReportRows(config, analysis.procedures, usages);
  const diagnostics = [
    ...analysis.diagnostics,
    ...collectConfigDiagnostics(config, analysis.procedures),
  ];
  writeReports(config, rows, diagnostics);

  const reportUrl = pathToFileURL(path.resolve(WEB_DIR, config.reportMarkdownPath)).href;
  for (const diagnostic of diagnostics) {
    process.stderr.write(
      `${diagnostic.level}: ${diagnostic.message} (${formatLocation(diagnostic.location)})\n`,
    );
  }

  const unusedRows = rows.filter((row) => row.status === 'unused');
  if (unusedRows.length === 0) {
    process.stdout.write(
      `tRPC procedure usage clean (${rows.length} procedures). Report: ${reportUrl}\n`,
    );
    return 0;
  }
  process.stderr.write(`Unused tRPC procedures (${unusedRows.length} of ${rows.length}):\n`);
  for (const row of unusedRows) {
    const route = formatOpenApiRoute(config, row.openapi);
    const routeSuffix = route === '' ? '' : `  [${route}]`;
    process.stderr.write(
      `  ${row.path} (${row.kind})${routeSuffix}  ${formatLocation(row.definedAt)}\n`,
    );
  }
  process.stderr.write(`Report: ${reportUrl}\n`);
  return 1;
};

try {
  process.exitCode = main();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
}
