// Port of crimson/logging.py

const LEVELS: Record<string, number> = {
  debug: 10,
  info: 20,
  warning: 30,
  error: 40,
};

export function resolveLogLevel(value: string | number): number {
  if (typeof value === 'number') {
    return int(value);
  }
  const levelName = String(value).trim().toLowerCase();
  const resolved = LEVELS[levelName];
  if (resolved === undefined) {
    const supported = Object.keys(LEVELS).sort().join(', ');
    throw new Error(`unsupported log level ${_repr(value)}; expected one of: ${supported}`);
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
  void int(opts.level);
  return processors;
}

export function ensureStructlogStdlibDefaults(): void {
  _configureStructlog({ level: LEVELS.info });
}

export function configureComponentLogging(opts: {
  loggerName: string;
  component: string;
  logFile: string;
  level?: string | number;
}): string {
  const levelNo = resolveLogLevel(opts.level ?? 'info');
  _configureStructlog({ level: int(levelNo) });

  const resolvedLogFile = String(opts.logFile);
  console.info('logging_configured', {
    component: String(opts.component),
    logger_name: String(opts.loggerName),
    log_file: resolvedLogFile,
    level: Object.entries(LEVELS).find(([, value]) => value === levelNo)?.[0] ?? String(levelNo),
  });
  return resolvedLogFile;
}
