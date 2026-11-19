// Import extraction with Tree-sitter (WASM, from @vscode/tree-sitter-wasm; ADR 0012). Each
// language yields raw imports, still unresolved: resolve.ts maps them to workspace files.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import TreeSitter from '@vscode/tree-sitter-wasm';
import type { Language, Node, Parser, Query } from '@vscode/tree-sitter-wasm';
import type { ProjectLanguage } from './schema.ts';

export type RawImport =
  /** TS/JS module specifier, as written. */
  | { kind: 'js'; spec: string }
  /** Python `import a.b` (level 0, no names) or `from ..a import b, c`. */
  | { kind: 'py'; level: number; module: string; names: string[] }
  /** Go import path. */
  | { kind: 'go'; path: string }
  /** Rust `mod name;` declaration without a body. */
  | { kind: 'rs-mod'; name: string }
  /** Rust `use` path, split on `::`, braces expanded. */
  | { kind: 'rs-use'; path: string[] }
  /** Rust `extern crate name;`. */
  | { kind: 'rs-crate'; name: string };

const EXTENSIONS: Record<string, ProjectLanguage> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyi: 'python',
  go: 'go',
  rs: 'rust',
};

export function languageOf(path: string): ProjectLanguage | null {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? (EXTENSIONS[name.slice(dot + 1).toLowerCase()] ?? null) : null;
}

const JS_QUERY = `
(import_statement source: (string (string_fragment) @spec))
(export_statement source: (string (string_fragment) @spec))
(call_expression
  function: (import)
  arguments: (arguments . (string (string_fragment) @spec)))
(call_expression
  function: (identifier) @fn
  arguments: (arguments . (string (string_fragment) @spec))
  (#eq? @fn "require"))
`;
const TS_QUERY = `${JS_QUERY}
(import_require_clause source: (string (string_fragment) @spec))
`;

const QUERIES: Record<ProjectLanguage, string> = {
  typescript: TS_QUERY,
  tsx: TS_QUERY,
  javascript: JS_QUERY,
  python: `
(import_statement) @import
(import_from_statement) @from
`,
  go: `(import_spec path: (_) @path)`,
  rust: `
(mod_item) @mod
(use_declaration argument: (_) @use)
(extern_crate_declaration name: (identifier) @crate)
`,
};

const GRAMMARS: Record<ProjectLanguage, string> = {
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
};

interface Loaded {
  parser: Parser;
  query: Query;
}

/** Parsers and queries, created on first use and kept for the life of the extractor. */
export class ImportExtractor {
  private readonly loaded = new Map<ProjectLanguage, Promise<Loaded>>();
  private ready?: Promise<void>;

  private readonly wasmDir: string;

  constructor(wasmDir: string) {
    this.wasmDir = wasmDir;
  }

  private load(language: ProjectLanguage): Promise<Loaded> {
    let entry = this.loaded.get(language);
    if (!entry) {
      this.ready ??= TreeSitter.Parser.init({ locateFile: (file) => join(this.wasmDir, file) });
      entry = this.ready.then(async () => {
        const grammar: Language = await TreeSitter.Language.load(
          await readFile(join(this.wasmDir, GRAMMARS[language])),
        );
        const parser = new TreeSitter.Parser();
        parser.setLanguage(grammar);
        return { parser, query: new TreeSitter.Query(grammar, QUERIES[language]) };
      });
      this.loaded.set(language, entry);
    }
    return entry;
  }

  async extract(language: ProjectLanguage, source: string): Promise<RawImport[]> {
    const { parser, query } = await this.load(language);
    const tree = parser.parse(source);
    if (!tree) return [];
    try {
      const captures = query.captures(tree.rootNode);
      switch (language) {
        case 'python':
          return captures.flatMap(({ node }) => pythonImports(node));
        case 'go':
          return captures.map(({ node }) => ({ kind: 'go', path: unquote(node.text) }));
        case 'rust':
          return captures.flatMap(({ name, node }) => rustImports(name, node));
        default:
          return captures
            .filter((capture) => capture.name === 'spec')
            .map(({ node }) => ({ kind: 'js', spec: node.text }));
      }
    } finally {
      tree.delete();
    }
  }

  dispose(): void {
    for (const entry of this.loaded.values()) {
      void entry.then(({ parser, query }) => {
        query.delete();
        parser.delete();
      });
    }
    this.loaded.clear();
  }
}

const unquote = (text: string) => text.replace(/^[`"']|[`"']$/g, '');

function dottedName(node: Node | null): string | null {
  if (!node) return null;
  if (node.type === 'aliased_import') return dottedName(node.childForFieldName('name'));
  return node.type === 'dotted_name' ? node.text.replace(/\s+/g, '') : null;
}

function pythonImports(node: Node): RawImport[] {
  if (node.type === 'import_statement') {
    return node.childrenForFieldName('name').flatMap((name) => {
      const module = dottedName(name);
      return module ? [{ kind: 'py', level: 0, module, names: [] } as const] : [];
    });
  }
  const source = node.childForFieldName('module_name');
  if (!source) return [];
  let level = 0;
  let module = '';
  if (source.type === 'relative_import') {
    for (const child of source.namedChildren) {
      if (child?.type === 'import_prefix') level = child.text.length;
      else if (child?.type === 'dotted_name') module = dottedName(child) ?? '';
    }
  } else {
    module = dottedName(source) ?? '';
  }
  const names = node.childrenForFieldName('name').flatMap((name) => dottedName(name) ?? []);
  return level || module ? [{ kind: 'py', level, module, names }] : [];
}

function rustImports(capture: string, node: Node): RawImport[] {
  if (capture === 'crate') return [{ kind: 'rs-crate', name: node.text }];
  if (capture === 'mod') {
    const name = node.childForFieldName('name');
    return name && !node.childForFieldName('body') ? [{ kind: 'rs-mod', name: name.text }] : [];
  }
  const text = node.text.replace(/\s+as\s+\w+/g, '').replace(/\s+/g, '');
  return expandUse(text).map((path) => ({ kind: 'rs-use', path }));
}

/**
 * `a::{b,c::{d,e}}` → [[a,b],[a,c,d],[a,c,e]], without whitespace or `as` aliases. `self` in a
 * group stands for the prefix.
 */
export function expandUse(text: string, prefix: string[] = []): string[][] {
  const open = text.indexOf('{');
  if (open < 0) {
    const path = [...prefix, ...text.split('::')].filter((part) => part && part !== '*');
    if (path.at(-1) === 'self') path.pop();
    return path.length ? [path] : [];
  }
  const head = text
    .slice(0, open)
    .split('::')
    .filter((part) => part);
  const body = text.slice(open + 1, text.lastIndexOf('}'));
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === '{') depth += 1;
    else if (body[i] === '}') depth -= 1;
    else if (body[i] === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.flatMap((part) => (part ? expandUse(part, [...prefix, ...head]) : []));
}
