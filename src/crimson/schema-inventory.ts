// Port of crimson/schema_inventory.py

export class StructClass {
  readonly className: string;
  readonly fullName: string;
  readonly module: string;
  readonly path: string;
  readonly lineno: number;

  constructor(opts: {
    className: string;
    fullName: string;
    module: string;
    path: string;
    lineno: number;
  }) {
    this.className = opts.className;
    this.fullName = opts.fullName;
    this.module = opts.module;
    this.path = opts.path;
    this.lineno = opts.lineno;
  }
}

export class InventorySummary {
  readonly totalStructs: number;
  readonly countsByBucket: Record<string, number>;
  readonly duplicateNames: Record<string, StructClass[]>;

  constructor(opts: {
    totalStructs: number;
    countsByBucket: Record<string, number>;
    duplicateNames: Record<string, StructClass[]>;
  }) {
    this.totalStructs = opts.totalStructs;
    this.countsByBucket = opts.countsByBucket;
    this.duplicateNames = opts.duplicateNames;
  }
}

function _moduleNameForPath(opts: { sourceRoot: string; pyPath: string }): string {
  const sourceRoot = opts.sourceRoot.replace(/\/+$/g, '');
  if (!(opts.pyPath === sourceRoot || opts.pyPath.startsWith(`${sourceRoot}/`))) {
    throw new Error(`${opts.pyPath} is not in the subpath of ${opts.sourceRoot}`);
  }
  const rel = opts.pyPath.slice(sourceRoot.length).replace(/^\/+/, '');
  const parts = rel.split('/').filter((part) => part.length > 0);
  if (parts.length > 0 && parts[parts.length - 1].endsWith('.py')) {
    parts[parts.length - 1] = parts[parts.length - 1].slice(0, -3);
  }
  if (parts.length > 0 && parts[parts.length - 1] === '__init__') {
    parts.pop();
  }
  return parts.filter((part) => part.length > 0).join('.');
}

function _resolveImportModule(opts: {
  currentModule: string;
  importedModule: string | null;
  level: number;
}): string {
  if (opts.level <= 0) {
    return String(opts.importedModule ?? '');
  }

  const parts = opts.currentModule.split('.').filter((part) => part.length > 0);
  const baseParts = opts.level <= parts.length ? parts.slice(0, parts.length - opts.level) : [];
  if (opts.importedModule !== null) {
    baseParts.push(...opts.importedModule.split('.').filter((part) => part.length > 0));
  }
  return baseParts.join('.');
}

function _resolveSymbol(symbol: string, opts: { imports: Record<string, string> }): string {
  if (symbol in opts.imports) {
    return opts.imports[symbol];
  }
  if (!symbol.includes('.')) {
    return symbol;
  }
  const [root, ...rest] = symbol.split('.');
  if (root in opts.imports) {
    return `${opts.imports[root]}.${rest.join('.')}`;
  }
  return symbol;
}

function _bucketForPath(path: string): string {
  const parts = path.split('/');
  if (parts.length >= 3 && parts[0] === 'src' && parts[1] === 'crimson') {
    return parts[2];
  }
  if (parts.length >= 2 && parts[0] === 'src') {
    return parts[1];
  }
  return 'other';
}

export function listStructClasses(_opts: { sourceRoot: string }): StructClass[] {
  // Python ast parsing and filesystem traversal are not available in the WebGL runtime.
  throw new Error('schema inventory requires Python ast parsing and filesystem traversal');
}

export function summarizeInventory(opts: { structs: StructClass[] }): InventorySummary {
  const counts = new Map<string, number>();
  const byName = new Map<string, StructClass[]>();
  for (const item of opts.structs) {
    const bucket = _bucketForPath(item.path);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    const existing = byName.get(item.className) ?? [];
    existing.push(item);
    byName.set(item.className, existing);
  }
  const countsByBucket = Object.fromEntries(
    Array.from(counts.entries()).sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0])),
  );
  const duplicateNames: Record<string, StructClass[]> = {};
  for (const [name, items] of Array.from(byName.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (items.length > 1) {
      duplicateNames[name] = [...items].sort((a, b) => {
        const pathCmp = a.path.localeCompare(b.path);
        if (pathCmp !== 0) return pathCmp;
        return a.lineno - b.lineno;
      });
    }
  }
  return new InventorySummary({
    totalStructs: opts.structs.length,
    countsByBucket,
    duplicateNames,
  });
}

function _sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => _sortJsonKeys(item));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    return Object.fromEntries(entries.map(([key, item]) => [key, _sortJsonKeys(item)]));
  }
  return value;
}

function _ensureAsciiJson(text: string): string {
  let out = '';
  for (let idx = 0; idx < text.length; idx++) {
    const code = text.charCodeAt(idx);
    if (code <= 0x7F) {
      out += text[idx];
    } else {
      out += `\\u${code.toString(16).padStart(4, '0')}`;
    }
  }
  return out;
}

export function inventoryAsJson(opts: { summary: InventorySummary; structs: StructClass[] }): string {
  const payload = {
    total_structs: int(opts.summary.totalStructs),
    counts_by_bucket: Object.fromEntries(
      Object.entries(opts.summary.countsByBucket).map(([k, v]) => [String(k), int(v)]),
    ),
    duplicate_names: Object.fromEntries(
      Object.entries(opts.summary.duplicateNames).map(([name, items]) => [
        String(name),
        items.map((item) => ({
          path: item.path,
          lineno: int(item.lineno),
          module: item.module,
          full_name: item.fullName,
        })),
      ]),
    ),
    structs: opts.structs.map((item) => ({
      class_name: item.className,
      full_name: item.fullName,
      module: item.module,
      path: item.path,
      lineno: int(item.lineno),
    })),
  };
  return _ensureAsciiJson(JSON.stringify(_sortJsonKeys(payload), null, 2));
}

export const __schemaInventoryInternals = {
  moduleNameForPath: _moduleNameForPath,
  resolveImportModule: _resolveImportModule,
  resolveSymbol: _resolveSymbol,
  bucketForPath: _bucketForPath,
};
