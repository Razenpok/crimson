// Port of crimson/logging.py

const _LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

let _structlogLoggerFactoryConfigured = false;

type StructlogConfig = {
  processors: readonly string[];
  wrapperLevel: number;
  cacheLoggerOnFirstUse: boolean;
};

let _structlogConfig: StructlogConfig | null = null;

export class ValueError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValueError';
  }
}

export function resolveLogLevel(value: string | number): number {
  if (typeof value === 'number') {
    return int(value);
  }
  const levelName = String(value).trim().toLowerCase();
  const resolved = _LEVELS[levelName];
  if (resolved === undefined) {
    const supported = Object.keys(_LEVELS).sort().join(', ');
    throw new ValueError(`unsupported log level ${_repr(value)}; expected one of: ${supported}`);
  }
  return int(resolved);
}

function _repr(value: string | number): string {
  if (typeof value === 'string') {
    let escaped = '';
    for (const ch of value) {
      const code = ch.charCodeAt(0);
      if (ch === '\\') {
        escaped += '\\\\';
      } else if (ch === "'") {
        escaped += "\\'";
      } else if (ch === '\n') {
        escaped += '\\n';
      } else if (ch === '\r') {
        escaped += '\\r';
      } else if (ch === '\t') {
        escaped += '\\t';
      } else if (code < 0x20 || code === 0x7F) {
        escaped += `\\x${code.toString(16).padStart(2, '0')}`;
      } else {
        escaped += ch;
      }
    }
    return `'${escaped}'`;
  }
  return String(value);
}

function _strftimeUtcNow(): string {
  const now = new Date();
  const year = String(now.getUTCFullYear()).padStart(4, '0');
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hour = String(now.getUTCHours()).padStart(2, '0');
  const minute = String(now.getUTCMinutes()).padStart(2, '0');
  const second = String(now.getUTCSeconds()).padStart(2, '0');
  const microsecond = `${String(now.getUTCMilliseconds()).padStart(3, '0')}000`;
  return `${year}${month}${day}T${hour}${minute}${second}.${microsecond}Z`;
}

function _processPid(): number {
  return globalThis.process?.pid ?? 0;
}

function _pathJoin(...parts: string[]): string {
  const cleaned = parts.map((part, idx) => {
    const text = String(part);
    if (idx === 0) {
      const stripped = text.replace(/\/+$/g, '');
      if (stripped === '.') {
        return '';
      }
      return text === '/' ? '/' : stripped;
    }
    return text.replace(/^\/+|\/+$/g, '');
  }).filter((part) => part.length > 0);
  if (cleaned.length === 0) {
    return '';
  }
  if (cleaned[0] === '/') {
    return `/${cleaned.slice(1).join('/')}`;
  }
  return cleaned.join('/');
}

function _expandUserPath(path: string): string {
  if (path === '~' || path.startsWith('~/')) {
    const home = globalThis.process?.env?.HOME;
    if (home !== undefined && home.length > 0) {
      return _pathJoin(home, path.slice(2));
    }
  }
  return path;
}

function _dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  if (idx < 0) {
    return '.';
  }
  if (idx === 0) {
    return '/';
  }
  return path.slice(0, idx);
}

function _mkdirParents(_path: string): void {
  // Browser/WebGL runtime has no filesystem-backed log handlers; path creation is a no-op.
}

export function defaultComponentLogPath(opts: { baseDir: string; component: string }): string {
  const componentName = String(opts.component).trim().toLowerCase() || 'app';
  const timestamp = _strftimeUtcNow();
  return _pathJoin(
    String(opts.baseDir),
    'logs',
    componentName,
    `${componentName}-pid${_processPid()}-${timestamp}.log`,
  );
}

function _configureStructlog(opts: { level: number }): string[] {
  const processors = [
    'structlog.stdlib.add_logger_name',
    'structlog.stdlib.add_log_level',
    'structlog.processors.TimeStamper(fmt="iso", utc=True)',
  ];
  _structlogConfig = {
    processors: [
      'structlog.contextvars.merge_contextvars',
      ...processors,
      'structlog.processors.StackInfoRenderer()',
      'structlog.processors.format_exc_info',
      'structlog.stdlib.ProcessorFormatter.wrap_for_formatter',
    ],
    wrapperLevel: int(opts.level),
    cacheLoggerOnFirstUse: true,
  };
  _structlogLoggerFactoryConfigured = true;
  return processors;
}

export function ensureStructlogStdlibDefaults(): void {
  if (_structlogLoggerFactoryConfigured && _structlogConfig !== null) {
    return;
  }
  _configureStructlog({ level: _LEVELS.info });
}

export function configureComponentLogging(opts: {
  loggerName: string;
  component: string;
  logFile: string;
  level?: string | number;
}): string {
  const levelNo = resolveLogLevel(opts.level ?? 'info');
  const processors = _configureStructlog({ level: int(levelNo) });

  const resolvedLogFile = _expandUserPath(String(opts.logFile));
  _mkdirParents(_dirname(resolvedLogFile));

  const consoleFormatter = {
    foreignPreChain: processors.slice(),
    processor: 'structlog.dev.ConsoleRenderer',
    colors: false,
  };
  const fileFormatter = {
    foreignPreChain: processors.slice(),
    processor: 'structlog.processors.JSONRenderer(sort_keys=True)',
  };
  void consoleFormatter;
  void fileFormatter;
  console.info('logging_configured', {
    component: String(opts.component),
    logger_name: String(opts.loggerName),
    log_file: resolvedLogFile,
    level: Object.entries(_LEVELS).find(([, value]) => value === levelNo)?.[0] ?? String(levelNo),
  });
  return resolvedLogFile;
}
