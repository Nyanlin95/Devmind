import * as fs from 'fs';
import * as path from 'path';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.devmind',
  'dist',
  'build',
  'coverage',
  '.pnpm-store',
  '.npm-cache',
  'tests',
  'memory',
]);

export interface RouteSignal {
  method: string;
  path: string;
  file: string;
  line: number;
  source: 'express' | 'next' | 'react-router';
}

export interface ApiCallSignal {
  client: string;
  url: string;
  file: string;
  line: number;
  method?: string;
}

export interface WebSocketSignal {
  library: 'WebSocket' | 'socket.io' | 'ws';
  file: string;
  line: number;
  detail: string;
}

export interface SocketEventSignal {
  action: 'emit' | 'on';
  event: string;
  file: string;
  line: number;
}

export interface HookSignal {
  name: string;
  kind: 'react' | 'custom';
  file: string;
  line: number;
}

export interface ArchitectureSignals {
  routes: RouteSignal[];
  apiCalls: ApiCallSignal[];
  websockets: WebSocketSignal[];
  socketEvents: SocketEventSignal[];
  hooks: HookSignal[];
}

function normalizeRelPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function lineFromIndex(content: string, index: number): number {
  if (index <= 0) return 1;
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (content.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function collectSourceFiles(rootPath: string): string[] {
  const files: string[] = [];
  const stack = [rootPath];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.github') {
        if (entry.isDirectory()) continue;
      }

      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      files.push(fullPath);
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

function addUnique<T>(target: T[], seen: Set<string>, key: string, value: T): void {
  if (seen.has(key)) return;
  seen.add(key);
  target.push(value);
}

function cleanNextSegment(segment: string): string {
  if (segment.startsWith('(') && segment.endsWith(')')) return '';
  if (segment.startsWith('[') && segment.endsWith(']')) return `:${segment.slice(1, -1)}`;
  return segment;
}

function toRoutePathFromNextFile(relPath: string): string | null {
  const noExt = relPath.replace(/\.[^.]+$/, '');
  const normalized = normalizeRelPath(noExt);

  if (normalized.startsWith('pages/')) {
    const routePart = normalized.slice('pages'.length);
    const apiAdjusted = routePart.replace(/^\/index$/, '/');
    return apiAdjusted.replace(/\/index$/g, '') || '/';
  }

  if (normalized.startsWith('app/') && /\/route$/.test(normalized)) {
    const withoutPrefix = normalized.slice('app/'.length);
    const dir = withoutPrefix.replace(/\/route$/, '');
    const segments = dir.split('/').map(cleanNextSegment).filter(Boolean);
    return `/${segments.join('/')}`.replace(/\/+/g, '/') || '/';
  }

  return null;
}

function extractRoutes(
  relPath: string,
  content: string,
  routes: RouteSignal[],
  seen: Set<string>,
): void {
  const expressRegex =
    /\b(?:app|router)\.(get|post|put|patch|delete|options|head|all)\(\s*['"`]([^'"`]+)['"`]/g;
  let match: RegExpExecArray | null;
  while ((match = expressRegex.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const line = lineFromIndex(content, match.index);
    addUnique(routes, seen, `${method}|${routePath}|${relPath}|${line}|express`, {
      method,
      path: routePath,
      file: relPath,
      line,
      source: 'express',
    });
  }

  const nextRoutePath = toRoutePathFromNextFile(relPath);
  if (nextRoutePath) {
    if (
      normalizeRelPath(relPath).startsWith('app/') &&
      /\/route\.[^.]+$/.test(normalizeRelPath(relPath))
    ) {
      const methodRegex =
        /\bexport\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/g;
      const methods: Array<{ method: string; index: number }> = [];
      while ((match = methodRegex.exec(content)) !== null) {
        methods.push({ method: match[1], index: match.index });
      }
      if (methods.length === 0) {
        addUnique(routes, seen, `ANY|${nextRoutePath}|${relPath}|1|next`, {
          method: 'ANY',
          path: nextRoutePath,
          file: relPath,
          line: 1,
          source: 'next',
        });
      } else {
        for (const entry of methods) {
          const line = lineFromIndex(content, entry.index);
          addUnique(routes, seen, `${entry.method}|${nextRoutePath}|${relPath}|${line}|next`, {
            method: entry.method,
            path: nextRoutePath,
            file: relPath,
            line,
            source: 'next',
          });
        }
      }
    } else {
      addUnique(routes, seen, `ANY|${nextRoutePath}|${relPath}|1|next`, {
        method: 'ANY',
        path: nextRoutePath,
        file: relPath,
        line: 1,
        source: 'next',
      });
    }
  }

  const jsxRouteRegex = /<Route\b[^>]*\bpath\s*=\s*["'`]([^"'`]+)["'`][^>]*>/g;
  while ((match = jsxRouteRegex.exec(content)) !== null) {
    const line = lineFromIndex(content, match.index);
    addUnique(routes, seen, `ROUTE|${match[1]}|${relPath}|${line}|react-router`, {
      method: 'ROUTE',
      path: match[1],
      file: relPath,
      line,
      source: 'react-router',
    });
  }

  if (content.includes('createBrowserRouter') || content.includes('createRoutesFromElements')) {
    const objPathRegex = /\bpath\s*:\s*['"`]([^'"`]+)['"`]/g;
    while ((match = objPathRegex.exec(content)) !== null) {
      const line = lineFromIndex(content, match.index);
      addUnique(routes, seen, `ROUTE|${match[1]}|${relPath}|${line}|react-router`, {
        method: 'ROUTE',
        path: match[1],
        file: relPath,
        line,
        source: 'react-router',
      });
    }
  }
}

function extractApiCalls(
  relPath: string,
  content: string,
  apiCalls: ApiCallSignal[],
  seen: Set<string>,
): void {
  let match: RegExpExecArray | null;

  const fetchRegex = /\bfetch\(\s*(['"`])([^'"`]+)\1/g;
  while ((match = fetchRegex.exec(content)) !== null) {
    const line = lineFromIndex(content, match.index);
    addUnique(apiCalls, seen, `fetch|${match[2]}|${relPath}|${line}`, {
      client: 'fetch',
      url: match[2],
      file: relPath,
      line,
    });
  }

  const axiosMethodRegex = /\baxios\.(get|post|put|patch|delete|request)\(\s*(['"`])([^'"`]+)\2/g;
  while ((match = axiosMethodRegex.exec(content)) !== null) {
    const line = lineFromIndex(content, match.index);
    addUnique(apiCalls, seen, `axios|${match[3]}|${relPath}|${line}|${match[1]}`, {
      client: 'axios',
      method: match[1].toUpperCase(),
      url: match[3],
      file: relPath,
      line,
    });
  }

  const axiosConfigRegex =
    /\baxios\s*\(\s*\{[\s\S]{0,300}?\burl\s*:\s*(['"`])([^'"`]+)\1[\s\S]{0,300}?\}\s*\)/g;
  while ((match = axiosConfigRegex.exec(content)) !== null) {
    const line = lineFromIndex(content, match.index);
    addUnique(apiCalls, seen, `axios|${match[2]}|${relPath}|${line}|config`, {
      client: 'axios',
      url: match[2],
      file: relPath,
      line,
    });
  }

  const customClientRegex =
    /\b([A-Za-z_$][\w$]*(?:Client|Api|API|http|request|sdk))\.(get|post|put|patch|delete|request)\(\s*(['"`])([^'"`]+)\3/g;
  while ((match = customClientRegex.exec(content)) !== null) {
    const client = match[1];
    const method = match[2].toUpperCase();
    const line = lineFromIndex(content, match.index);
    addUnique(apiCalls, seen, `${client}|${match[4]}|${relPath}|${line}|${method}`, {
      client,
      method,
      url: match[4],
      file: relPath,
      line,
    });
  }
}

function extractWebSockets(
  relPath: string,
  content: string,
  websockets: WebSocketSignal[],
  seen: Set<string>,
): void {
  let match: RegExpExecArray | null;

  const wsCtorRegex = /\bnew\s+WebSocket\s*\(/g;
  while ((match = wsCtorRegex.exec(content)) !== null) {
    const line = lineFromIndex(content, match.index);
    addUnique(websockets, seen, `WebSocket|${relPath}|${line}`, {
      library: 'WebSocket',
      file: relPath,
      line,
      detail: 'new WebSocket(...)',
    });
  }

  if (
    /from\s+['"]socket\.io(?:-client)?['"]/.test(content) ||
    /require\(['"]socket\.io(?:-client)?['"]\)/.test(content)
  ) {
    const ioRegex = /\bio\s*\(/g;
    while ((match = ioRegex.exec(content)) !== null) {
      const line = lineFromIndex(content, match.index);
      addUnique(websockets, seen, `socket.io|${relPath}|${line}`, {
        library: 'socket.io',
        file: relPath,
        line,
        detail: 'io(...)',
      });
    }
  }

  if (/from\s+['"]ws['"]/.test(content) || /require\(['"]ws['"]\)/.test(content)) {
    const wsServerRegex = /\bnew\s+(?:WebSocketServer|Server)\s*\(/g;
    while ((match = wsServerRegex.exec(content)) !== null) {
      const line = lineFromIndex(content, match.index);
      addUnique(websockets, seen, `ws|${relPath}|${line}`, {
        library: 'ws',
        file: relPath,
        line,
        detail: 'ws server initialization',
      });
    }
  }
}

function extractSocketEvents(
  relPath: string,
  content: string,
  socketEvents: SocketEventSignal[],
  seen: Set<string>,
): void {
  const eventRegex = /\.(emit|on)\(\s*(['"`])([^'"`]+)\2/g;
  let match: RegExpExecArray | null;

  while ((match = eventRegex.exec(content)) !== null) {
    const action = match[1] as 'emit' | 'on';
    const event = match[3];
    const line = lineFromIndex(content, match.index);
    addUnique(socketEvents, seen, `${action}|${event}|${relPath}|${line}`, {
      action,
      event,
      file: relPath,
      line,
    });
  }
}

function extractHooks(
  relPath: string,
  content: string,
  hooks: HookSignal[],
  seen: Set<string>,
): void {
  const reactHookRegex =
    /\b(useState|useEffect|useMemo|useCallback|useReducer|useRef|useContext|useLayoutEffect|useImperativeHandle|useDeferredValue|useTransition|useId|useSyncExternalStore|useInsertionEffect)\b/g;
  let match: RegExpExecArray | null;

  while ((match = reactHookRegex.exec(content)) !== null) {
    const line = lineFromIndex(content, match.index);
    addUnique(hooks, seen, `react|${match[1]}|${relPath}|${line}`, {
      name: match[1],
      kind: 'react',
      file: relPath,
      line,
    });
  }

  const customHookRegex =
    /\b(?:export\s+)?function\s+(use[A-Z][A-Za-z0-9_]*)\s*\(|\b(?:export\s+)?const\s+(use[A-Z][A-Za-z0-9_]*)\s*=\s*\(/g;
  while ((match = customHookRegex.exec(content)) !== null) {
    const name = match[1] || match[2];
    if (!name) continue;
    const line = lineFromIndex(content, match.index);
    addUnique(hooks, seen, `custom|${name}|${relPath}|${line}`, {
      name,
      kind: 'custom',
      file: relPath,
      line,
    });
  }
}

function parseFileSignals(rootPath: string, absPath: string, target: ArchitectureSignals): void {
  let content = '';
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return;
  }

  const relPath = normalizeRelPath(path.relative(rootPath, absPath));
  if (/(^|\/)(architecture-extractor|devmind-arch-extractor)\.ts$/.test(relPath)) {
    return;
  }

  extractRoutes(relPath, content, target.routes, (target as any).__routesSeen as Set<string>);
  extractApiCalls(relPath, content, target.apiCalls, (target as any).__apiSeen as Set<string>);
  extractWebSockets(relPath, content, target.websockets, (target as any).__wsSeen as Set<string>);
  extractSocketEvents(
    relPath,
    content,
    target.socketEvents,
    (target as any).__socketSeen as Set<string>,
  );
  extractHooks(relPath, content, target.hooks, (target as any).__hooksSeen as Set<string>);
}

function sorted<T extends { file: string; line: number }>(items: T[]): T[] {
  return items.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function extractArchitectureSignals(rootPath: string): ArchitectureSignals {
  const target = {
    routes: [],
    apiCalls: [],
    websockets: [],
    socketEvents: [],
    hooks: [],
    __routesSeen: new Set<string>(),
    __apiSeen: new Set<string>(),
    __wsSeen: new Set<string>(),
    __socketSeen: new Set<string>(),
    __hooksSeen: new Set<string>(),
  } as ArchitectureSignals & {
    __routesSeen: Set<string>;
    __apiSeen: Set<string>;
    __wsSeen: Set<string>;
    __socketSeen: Set<string>;
    __hooksSeen: Set<string>;
  };

  const files = collectSourceFiles(rootPath);
  for (const file of files) {
    parseFileSignals(rootPath, file, target);
  }

  const result: ArchitectureSignals = {
    routes: sorted(target.routes),
    apiCalls: sorted(target.apiCalls),
    websockets: sorted(target.websockets),
    socketEvents: sorted(target.socketEvents),
    hooks: sorted(target.hooks),
  };
  return result;
}

function tableOrFallback(header: string, columns: string[], rows: string[][]): string {
  if (rows.length === 0) return `${header}\n\n_No items detected._\n`;
  const head = `| ${columns.join(' | ')} |`;
  const sep = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.join(' | ')} |`).join('\n');
  return `${header}\n\n${head}\n${sep}\n${body}\n`;
}

export function renderArchitectureSignalsMarkdown(signals: ArchitectureSignals): string {
  const routeRows = signals.routes.map((route) => [
    route.method,
    route.path,
    `${route.file}:${route.line}`,
    route.source,
  ]);
  const apiRows = signals.apiCalls.map((call) => [
    call.client,
    call.method || 'N/A',
    call.url,
    `${call.file}:${call.line}`,
  ]);
  const wsRows = signals.websockets.map((item) => [
    item.library,
    item.detail,
    `${item.file}:${item.line}`,
  ]);
  const socketRows = signals.socketEvents.map((event) => [
    event.action,
    event.event,
    `${event.file}:${event.line}`,
  ]);
  const hookRows = signals.hooks.map((hook) => [hook.kind, hook.name, `${hook.file}:${hook.line}`]);

  return [
    tableOrFallback('## Routes', ['Method', 'Path', 'File', 'Source'], routeRows),
    tableOrFallback('## API Calls', ['Client', 'Method', 'URL', 'File'], apiRows),
    tableOrFallback('## WebSockets', ['Library', 'Detail', 'File'], wsRows),
    tableOrFallback('## Socket Events', ['Action', 'Event', 'File'], socketRows),
    tableOrFallback('## Hooks', ['Kind', 'Name', 'File'], hookRows),
  ].join('\n');
}
