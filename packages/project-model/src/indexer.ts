// The project model of one workspace: scan, parse, resolve, and keep it current from watcher
// notifications. It publishes a snapshot once the file list is known (the "open" budget of
// phase 5a: under 2 s for 5,000 files), then deltas as imports are parsed and files change.
import { readFile } from 'node:fs/promises';
import {
  addCrate,
  configKind,
  emptyConfig,
  parseGoMod,
  parsePackageJson,
  parseTsconfig,
  type ProjectConfig,
} from './config.ts';
import { IgnoreRules, isIgnoreFile } from './ignore-rules.ts';
import { ImportExtractor, languageOf, type RawImport } from './languages.ts';
import { Resolver, type Resolved } from './resolve.ts';
import { ROLE_PLUGINS, rolesFor, type RolePlugin } from './roles.ts';
import { absolutePath, realDirectory, scanTree, statFile, type ScannedFile } from './scan.ts';
import {
  compareProjectPaths,
  isProjectPath,
  MAX_EXTERNALS_PER_FILE,
  MAX_IMPORTS_PER_FILE,
  MAX_PARSED_FILE_BYTES,
  MAX_PROJECT_FILES,
  PROJECT_MODEL_VERSION,
  type ProjectDelta,
  type ProjectFile,
  type ProjectLanguage,
  type ProjectSnapshot,
  type ProjectStatus,
} from './schema.ts';

export interface IndexerOptions {
  root: string;
  /** Folder with the Tree-sitter runtime and grammar .wasm files. */
  wasmDir: string;
  maxFiles?: number;
  plugins?: readonly RolePlugin[];
  /** Called (synchronously, possibly often) when there are changes to flush. */
  onChange?: () => void;
  /** A refresh failed even after a full rescan (the workspace folder is gone, say). */
  onError?: (error: unknown) => void;
}

interface Entry extends ScannedFile {
  language: ProjectLanguage | null;
  /** Raw imports from the last parse; null until parsed or when not parseable. */
  raw: RawImport[] | null;
  file: ProjectFile;
}

/** Parsing yields to the event loop this often, so watcher notifications are not starved. */
const SLICE_MS = 25;
const MAX_CONFIG_BYTES = 256 * 1024;

const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

function sameFile(a: ProjectFile, b: ProjectFile): boolean {
  return (
    a.language === b.language &&
    a.size === b.size &&
    a.indexed === b.indexed &&
    sameList(a.roles, b.roles) &&
    sameList(a.imports, b.imports) &&
    sameList(a.importDirs, b.importDirs) &&
    sameList(a.externals, b.externals)
  );
}

const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

export class ProjectIndexer {
  private readonly root: string;
  private readonly maxFiles: number;
  private readonly allPlugins: readonly RolePlugin[];
  private readonly extractor: ImportExtractor;
  private readonly onChange: () => void;
  private readonly onError: (error: unknown) => void;
  private readonly entries = new Map<string, Entry>();
  private rules?: IgnoreRules;
  private config: ProjectConfig = emptyConfig();
  private plugins: readonly RolePlugin[] = [];
  private resolver = new Resolver(new Set(), emptyConfig());
  /** Paths waiting to be parsed. */
  private readonly queue = new Set<string>();
  /** Paths whose published entry changed, and paths removed, since the last flush. */
  private readonly dirty = new Set<string>();
  private readonly removed = new Set<string>();
  private revision = 0;
  private status: ProjectStatus = 'scanning';
  private truncated = false;
  private published = { status: this.status, truncated: false, indexed: 0, parseable: 0 };
  private indexing: Promise<void> | null = null;
  /** Refreshes run one at a time, in order. */
  private refreshing: Promise<void> = Promise.resolve();
  private disposed = false;
  /** A configuration file (tsconfig, package.json, go.mod, Cargo.toml) appeared, changed or went. */
  private configTouched = false;

  constructor(options: IndexerOptions) {
    this.root = options.root;
    this.maxFiles = options.maxFiles ?? MAX_PROJECT_FILES;
    this.allPlugins = options.plugins ?? ROLE_PLUGINS;
    this.extractor = new ImportExtractor(options.wasmDir);
    this.onChange = options.onChange ?? (() => undefined);
    this.onError = options.onError ?? (() => undefined);
  }

  /** Scans the workspace and returns the first snapshot. Parsing continues in the background. */
  async start(): Promise<ProjectSnapshot> {
    await this.rescan();
    this.dirty.clear();
    this.removed.clear();
    this.publishedState();
    return this.snapshot();
  }

  /** The current model. Call `flush` first so it matches the deltas sent so far. */
  snapshot(): ProjectSnapshot {
    return {
      version: PROJECT_MODEL_VERSION,
      revision: this.revision,
      status: this.status,
      truncated: this.truncated,
      progress: this.progress(),
      files: [...this.entries.values()]
        .map((entry) => entry.file)
        .sort((a, b) => compareProjectPaths(a.path, b.path)),
    };
  }

  /** Everything that changed since the last flush, as one delta, or null if nothing did. */
  flush(): ProjectDelta | null {
    const progress = this.progress();
    const unchanged =
      !this.dirty.size &&
      !this.removed.size &&
      this.published.status === this.status &&
      this.published.truncated === this.truncated &&
      this.published.indexed === progress.indexed &&
      this.published.parseable === progress.parseable;
    if (unchanged) return null;
    const upsert = [...this.dirty]
      .flatMap((path) => this.entries.get(path)?.file ?? [])
      .sort((a, b) => compareProjectPaths(a.path, b.path));
    const remove = [...this.removed].filter((path) => !this.entries.has(path)).sort();
    this.dirty.clear();
    this.removed.clear();
    this.revision += 1;
    this.publishedState();
    return {
      revision: this.revision,
      status: this.status,
      truncated: this.truncated,
      progress,
      upsert,
      remove,
    };
  }

  /**
   * Re-reads paths reported by the watcher (relative, `/`-separated), or the whole workspace
   * for 'all'. Safe to call while parsing.
   */
  refresh(paths: readonly string[] | 'all'): Promise<void> {
    this.refreshing = this.refreshing
      .then(() => (this.disposed ? undefined : this.apply(paths)))
      .catch(() => (this.disposed ? undefined : this.rescan()))
      .catch(this.onError);
    return this.refreshing;
  }

  /** Resolves when every queued file is parsed (for tests and the performance check). */
  async idle(): Promise<void> {
    await this.refreshing;
    while (this.indexing) await this.indexing;
  }

  dispose(): void {
    this.disposed = true;
    this.queue.clear();
    this.extractor.dispose();
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private progress() {
    let indexed = 0;
    let parseable = 0;
    for (const entry of this.entries.values()) {
      if (!entry.language) continue;
      parseable += 1;
      if (entry.file.indexed) indexed += 1;
    }
    return { indexed, parseable };
  }

  private publishedState(): void {
    this.published = { status: this.status, truncated: this.truncated, ...this.progress() };
  }

  private changed(path: string): void {
    this.dirty.add(path);
    this.onChange();
  }

  private async apply(paths: readonly string[] | 'all'): Promise<void> {
    if (paths === 'all' || paths.some(isIgnoreFile) || !this.rules) return this.rescan();
    const rules = this.rules;
    let structure = false;
    for (const path of new Set(paths)) {
      if (!isProjectPath(path) || rules.ignored(path, false)) continue;
      // Below a link or junction (even one created after the scan) nothing is part of the model.
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const reachable = await realDirectory(this.root, parent);
      const file = reachable ? await statFile(this.root, path) : null;
      if (file) {
        structure = this.upsertScanned(file) || structure;
        continue;
      }
      // A directory (new or renamed) is scanned; a missing path removes it and all below it.
      const below = [...this.entries.keys()].filter((key) => key.startsWith(`${path}/`));
      const room = this.maxFiles - this.entries.size + below.length;
      const directory =
        reachable && !rules.ignored(path, true) && (await realDirectory(this.root, path));
      const scanned = directory ? await scanTree(this.root, rules, path, room) : null;
      if (scanned) {
        if (scanned.truncated) this.truncated = true;
        for (const found of scanned.files.values())
          structure = this.upsertScanned(found) || structure;
      }
      for (const key of [...below, path]) {
        if (this.entries.has(key) && !scanned?.files.has(key)) {
          this.remove(key);
          structure = true;
        }
      }
    }
    await this.afterChange(structure, this.configTouched);
  }

  private async rescan(): Promise<void> {
    this.rules = await IgnoreRules.load(this.root);
    const { files, truncated } = await scanTree(this.root, this.rules, '', this.maxFiles);
    this.truncated = truncated;
    for (const path of [...this.entries.keys()]) if (!files.has(path)) this.remove(path);
    for (const file of files.values()) this.upsertScanned(file);
    await this.afterChange(true, true);
  }

  /**
   * Adds or updates a listed file. Returns true when the set of files changed. A changed file
   * keeps its previous imports until it is parsed again, so the map does not flicker.
   */
  private upsertScanned(file: ScannedFile): boolean {
    const existing = this.entries.get(file.path);
    if (existing) {
      if (existing.size === file.size && existing.mtimeMs === file.mtimeMs) return false;
      if (configKind(file.path)) this.configTouched = true;
      existing.size = file.size;
      existing.mtimeMs = file.mtimeMs;
      if (existing.language) this.queue.add(file.path);
      this.publish(existing);
      return false;
    }
    if (this.entries.size >= this.maxFiles) {
      this.truncated = true;
      return false;
    }
    const language = languageOf(file.path);
    const entry: Entry = {
      ...file,
      language,
      raw: null,
      file: {
        path: file.path,
        language,
        size: file.size,
        roles: rolesFor(file.path, this.plugins),
        indexed: false,
        imports: [],
        importDirs: [],
        externals: [],
      },
    };
    this.entries.set(file.path, entry);
    this.removed.delete(file.path);
    if (configKind(file.path)) this.configTouched = true;
    if (language) this.queue.add(file.path);
    this.changed(file.path);
    return true;
  }

  private remove(path: string): void {
    if (configKind(path)) this.configTouched = true;
    this.entries.delete(path);
    this.queue.delete(path);
    this.dirty.delete(path);
    this.removed.add(path);
    this.onChange();
  }

  /** Rebuilds what depends on the file set or the configuration, then resumes parsing. */
  private async afterChange(structure: boolean, config: boolean): Promise<void> {
    this.configTouched = false;
    if (config) await this.loadConfig();
    if (config || structure) this.reresolveAll(config);
    if (this.status === 'scanning' || this.queue.size) {
      this.status = this.queue.size ? 'indexing' : 'ready';
    }
    this.onChange();
    this.startIndexing();
  }

  private async loadConfig(): Promise<void> {
    const config = emptyConfig();
    const paths = [...this.entries.keys()].filter((path) => configKind(path) !== null).sort();
    for (const path of paths) {
      const kind = configKind(path);
      const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      if (kind === 'cargo') {
        addCrate(dir, config);
        continue;
      }
      const entry = this.entries.get(path);
      if (!entry || entry.size > MAX_CONFIG_BYTES) continue;
      const text = await readFile(absolutePath(this.root, path), 'utf8').catch(() => null);
      if (text === null) continue;
      if (kind === 'tsconfig') parseTsconfig(text, config);
      else if (kind === 'package') parsePackageJson(text, dir, config);
      else if (kind === 'go-mod') parseGoMod(text, dir, config);
    }
    this.config = config;
    const dependencies = new Set(config.packages.flatMap((pkg) => pkg.dependencies));
    this.plugins = this.allPlugins.filter((plugin) => plugin.applies({ dependencies }));
  }

  private reresolveAll(roles: boolean): void {
    this.resolver = new Resolver(new Set(this.entries.keys()), this.config);
    for (const entry of this.entries.values()) {
      if (entry.raw || roles) this.publish(entry);
    }
  }

  /** Recomputes the published entry from the raw imports and the current resolver and roles. */
  private publish(entry: Entry): void {
    const result: Resolved | null = entry.raw ? this.resolver.resolve(entry.path, entry.raw) : null;
    const next: ProjectFile = {
      path: entry.path,
      language: entry.language,
      size: entry.size,
      roles: rolesFor(entry.path, this.plugins),
      indexed: Boolean(entry.raw),
      imports: result?.imports.slice(0, MAX_IMPORTS_PER_FILE) ?? [],
      importDirs: result?.importDirs.slice(0, MAX_IMPORTS_PER_FILE) ?? [],
      externals: result?.externals.slice(0, MAX_EXTERNALS_PER_FILE) ?? [],
    };
    if (!sameFile(entry.file, next)) {
      entry.file = next;
      this.changed(entry.path);
    }
  }

  private startIndexing(): void {
    if (this.indexing || !this.queue.size || this.disposed) return;
    this.indexing = this.indexQueue().finally(() => {
      this.indexing = null;
      if (this.queue.size && !this.disposed) this.startIndexing();
      else if (!this.disposed && this.status !== 'ready') {
        this.status = 'ready';
        this.onChange();
      }
    });
  }

  private async indexQueue(): Promise<void> {
    this.status = 'indexing';
    let slice = performance.now();
    for (const path of this.queue) {
      if (this.disposed) return;
      this.queue.delete(path);
      const entry = this.entries.get(path);
      if (!entry?.language) continue;
      const raw = await this.parse(entry);
      // The file may have changed or gone while it was read.
      if (this.entries.get(path) !== entry || this.queue.has(path)) continue;
      entry.raw = raw;
      this.publish(entry);
      if (performance.now() - slice > SLICE_MS) {
        await yieldToLoop();
        slice = performance.now();
      }
    }
  }

  private async parse(entry: Entry): Promise<RawImport[]> {
    if (entry.size > MAX_PARSED_FILE_BYTES || !entry.language) return [];
    const text = await readFile(absolutePath(this.root, entry.path), 'utf8').catch(() => null);
    if (text === null || text.length > MAX_PARSED_FILE_BYTES) return [];
    return this.extractor.extract(entry.language, text).catch(() => []);
  }
}
