// Port of crimson/cli/root.py

import { Vec2 } from '@grim/geom.ts';
import { Crand } from '@grim/rand.ts';
import { SpawnEnv, SpawnId, buildSpawnPlan, spawnIdLabel } from '@crimson/creatures/spawn.ts';
import { allQuests } from '@crimson/quests/index.ts';
import { QuestContext, type QuestDefinition, type SpawnEntry } from '@crimson/quests/types.ts';

export class DesktopCliUnavailableError extends Error {
  constructor(command: string) {
    super(`desktop CLI command is unavailable in the browser WebGL build: ${command}`);
    this.name = 'DesktopCliUnavailableError';
  }
}

export const app = {
  addTyper(_child: object, _opts: { name: string }): void {
    throw new DesktopCliUnavailableError('add_typer');
  },
};

const QUEST_DEFS = new Map<string, QuestDefinition>(
  allQuests().map((quest) => [quest.level.text, quest]),
);
const QUEST_BUILDERS = new Map<string, QuestDefinition['builder']>(
  [...QUEST_DEFS].map(([level, quest]) => [level, quest.builder]),
);
const QUEST_TITLES = new Map<string, string>(
  [...QUEST_DEFS].map(([level, quest]) => [level, quest.title]),
);

const SEP_RE = /[\\/]+/;

export function safeRelpath(name: string): string {
  const parts = String(name).split(SEP_RE).filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new Error('empty entry name');
  }
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`unsafe path part: ${JSON.stringify(part)}`);
    }
  }
  return parts.join('/');
}

export function viewRunHooks(view: object): {
  shouldClose: () => boolean;
  consumeScreenshotRequest: () => boolean;
} {
  return {
    shouldClose(): boolean {
      const shouldCloseFn = (view as { shouldClose?: unknown }).shouldClose;
      if (typeof shouldCloseFn === 'function') {
        return Boolean(shouldCloseFn.call(view));
      }
      const closeRequested = (view as { closeRequested?: unknown }).closeRequested;
      if (typeof closeRequested === 'boolean') {
        return closeRequested;
      }
      return false;
    },
    consumeScreenshotRequest(): boolean {
      const consumeFn = (view as { consumeScreenshotRequest?: unknown }).consumeScreenshotRequest;
      if (typeof consumeFn === 'function') {
        return Boolean(consumeFn.call(view));
      }
      return false;
    },
  };
}

export function extractOne(_paqPath: string, _assetsRoot: string): number {
  throw new DesktopCliUnavailableError('extract');
}

export function cmdExtract(_gameDir: string, _assetsDir: string): void {
  throw new DesktopCliUnavailableError('extract');
}

export function formatEntry(
  idx: number,
  entry: SpawnEntry,
  opts: { planInfo: [number, number] | null },
): string {
  const creature = spawnIdLabel(entry.spawnId);
  let planText = '';
  if (opts.planInfo !== null) {
    const [creaturesPerSpawn, spawnSlotsPerSpawn] = opts.planInfo;
    const alloc = entry.count * creaturesPerSpawn;
    planText = `  alloc=${String(alloc).padStart(3)} (x${String(creaturesPerSpawn).padStart(2)})  slots=${spawnSlotsPerSpawn}`;
  }
  return (
    `${String(idx).padStart(2, '0')}  t=${String(entry.triggerMs).padStart(5)}  ` +
    `id=0x${entry.spawnId.toString(16).padStart(2, '0')} (${String(entry.spawnId).padStart(2)})  ` +
    `creature=${creature.padEnd(10)}  ` +
    `count=${String(entry.count).padStart(2)}  ` +
    `x=${entry.pos.x.toFixed(1).padStart(7)}  y=${entry.pos.y.toFixed(1).padStart(7)}  ` +
    `heading=${entry.heading.toFixed(3).padStart(7)}${planText}`
  );
}

export function formatId(value: number | null): string {
  if (value === null) {
    return 'none';
  }
  return `0x${int(value).toString(16).padStart(2, '0')} (${int(value)})`;
}

export function formatIdList(values: readonly number[] | null): string {
  if (values === null || values.length === 0) {
    return 'none';
  }
  return `[${values.map((value) => formatId(value)).join(', ')}]`;
}

export function formatMeta(quest: QuestDefinition): string[] {
  const terrainSlots = formatIdList(quest.terrainSlots);
  return [
    `time_limit_ms=${quest.timeLimitMs}`,
    `start_weapon_id=${quest.startWeaponId}`,
    `unlock_perk_id=${formatId(quest.unlockPerkId)}`,
    `unlock_weapon_id=${formatId(quest.unlockWeaponId)}`,
    `terrain_slots=${terrainSlots}`,
  ];
}

export function cmdQuests(opts: {
  level: string;
  width?: number;
  height?: number;
  playerCount?: number;
  seed?: number | null;
  sort?: boolean;
  showPlan?: boolean;
}): string[] {
  const width = opts.width ?? 1024;
  const height = opts.height ?? 1024;
  const playerCount = opts.playerCount ?? 1;
  const quest = QUEST_DEFS.get(opts.level);
  if (quest === undefined) {
    const available = [...QUEST_BUILDERS.keys()].sort().join(', ');
    throw new Error(`unknown level ${JSON.stringify(opts.level)}. Available: ${available}`);
  }
  let entries = quest.builder(
    new QuestContext({ width, height, playerCount }),
    { rng: opts.seed !== null && opts.seed !== undefined ? new Crand(opts.seed) : new Crand(), fullVersion: true },
  );
  if (opts.sort ?? false) {
    entries = [...entries].sort((a, b) => (
      a.triggerMs - b.triggerMs ||
      a.spawnId - b.spawnId ||
      a.pos.x - b.pos.x ||
      a.pos.y - b.pos.y
    ));
  }
  const lines = [
    `Quest ${opts.level} ${QUEST_TITLES.get(opts.level) ?? quest.title} (${entries.length} entries)`,
    `Meta: ${formatMeta(quest).join('; ')}`,
  ];
  const planCache = new Map<SpawnId, [number, number]>();
  if (opts.showPlan ?? false) {
    const env = new SpawnEnv({
      terrainWidth: width,
      terrainHeight: height,
      demoModeActive: true,
      hardcore: false,
      questFailRetryCount: 0,
    });
    for (const entry of entries) {
      if (planCache.has(entry.spawnId)) continue;
      const plan = buildSpawnPlan(entry.spawnId, new Vec2(512.0, 512.0), 0.0, new Crand(0), env);
      planCache.set(entry.spawnId, [plan.creatures.length, plan.spawnSlots.length]);
    }
    const totalAlloc = entries.reduce((sum, entry) => sum + entry.count * (planCache.get(entry.spawnId)?.[0] ?? 0), 0);
    const totalSlots = entries.reduce((sum, entry) => sum + entry.count * (planCache.get(entry.spawnId)?.[1] ?? 0), 0);
    lines.push(`Plan: total_alloc=${totalAlloc} total_spawn_slots=${totalSlots}`);
  }
  entries.forEach((entry, index) => {
    lines.push(formatEntry(index + 1, entry, { planInfo: planCache.get(entry.spawnId) ?? null }));
  });
  return lines;
}

export function cmdView(_opts: object): void {
  throw new DesktopCliUnavailableError('view');
}

export function cmdGame(_opts: object): void {
  throw new DesktopCliUnavailableError('game');
}

export function cmdConfig(_opts: object): void {
  throw new DesktopCliUnavailableError('config');
}

export function formatCfgValue(value: object): string {
  if (value instanceof Uint8Array) {
    const length = value.length;
    let nul = value.indexOf(0);
    if (nul < 0) nul = value.length;
    const prefix = value.slice(0, nul);
    const ascii = prefix.length > 0 && [...prefix].every((byte) => 32 <= byte && byte < 127);
    if (ascii) {
      const text = String.fromCharCode(...prefix);
      return `${pythonAsciiRepr(text)} (len=${length})`;
    }
    return `0x${[...value].map((byte) => byte.toString(16).padStart(2, '0')).join('')} (len=${length})`;
  }
  return String(value);
}

function pythonAsciiRepr(text: string): string {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of text) {
    if (ch === '\\' || ch === quote) {
      out += '\\' + ch;
    } else {
      out += ch;
    }
  }
  return out + quote;
}

export function parseIntAuto(text: string): number {
  const raw = String(text).trim();
  const sign = raw.startsWith('-') || raw.startsWith('+') ? raw[0] : '';
  const unsigned = sign ? raw.slice(1) : raw;
  let radix = 10;
  let digits = unsigned;
  const lower = unsigned.toLowerCase();
  if (lower.startsWith('0x')) {
    radix = 16;
    digits = unsigned.slice(2);
  } else if (lower.startsWith('0b')) {
    radix = 2;
    digits = unsigned.slice(2);
  } else if (lower.startsWith('0o')) {
    radix = 8;
    digits = unsigned.slice(2);
  }
  const value = Number.parseInt(sign + digits, radix);
  if (Number.isNaN(value)) {
    throw new Error(`invalid integer: ${JSON.stringify(text)}`);
  }
  return value;
}

export function parseVec2(text: string): Vec2 {
  const raw = String(text).trim();
  let left: string;
  let right: string;
  if (raw.includes(',')) {
    const comma = raw.indexOf(',');
    left = raw.slice(0, comma);
    right = raw.slice(comma + 1);
  } else {
    const parts = raw.split(/\s+/);
    if (parts.length !== 2) {
      throw new Error(`invalid vec2: ${JSON.stringify(text)} (expected 'x,y' or 'x y')`);
    }
    [left, right] = parts;
  }
  const x = Number(left.trim());
  const y = Number(right.trim());
  if (Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error(`invalid vec2: ${JSON.stringify(text)}`);
  }
  return new Vec2(x, y);
}

export function cmdSpawnPlan(_opts: object): void {
  throw new DesktopCliUnavailableError('spawn-plan');
}
