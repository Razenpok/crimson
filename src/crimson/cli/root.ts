// Port of crimson/cli/root.py

import { Vec2 } from '@grim/geom.ts';
import { Crand } from '@grim/rand.ts';
import { RunViewHooks } from '@grim/app.ts';
import { SPAWN_ID_TO_TEMPLATE, SpawnEnv, SpawnId, buildSpawnPlan, spawnIdLabel } from '@crimson/creatures/spawn.ts';
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

interface ViewRunHooksSource {
  shouldClose?: () => boolean;
  closeRequested?: boolean;
  consumeScreenshotRequest?: () => boolean;
}

export function safeRelpath(name: string): string {
  const parts = String(name).split(SEP_RE).filter((part) => part.length > 0);
  if (parts.length === 0) {
    throw new Error('empty entry name');
  }
  for (const part of parts) {
    if (part === '.' || part === '..') {
      throw new Error(`unsafe path part: ${pythonAsciiRepr(part)}`);
    }
  }
  return parts.join('/');
}

export function viewRunHooks(view: ViewRunHooksSource): RunViewHooks {
  return new RunViewHooks({
    shouldClose(): boolean {
      const shouldCloseFn = view.shouldClose;
      if (shouldCloseFn !== undefined) {
        return Boolean(shouldCloseFn.call(view));
      }
      const closeRequested = view.closeRequested;
      if (typeof closeRequested === 'boolean') {
        return closeRequested;
      }
      return false;
    },
    consumeScreenshotRequest(): boolean {
      const consumeFn = view.consumeScreenshotRequest;
      if (consumeFn !== undefined) {
        return Boolean(consumeFn.call(view));
      }
      return false;
    },
  });
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
    throw new Error(`unknown level ${pythonAsciiRepr(opts.level)}. Available: ${available}`);
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

function pythonStr(value: number | boolean | null): string {
  if (value === null) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  return String(value);
}

function hexLower(value: number, width: number): string {
  return int(value).toString(16).padStart(width, '0');
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortJsonValue(value[key]);
    }
    return out;
  }
  return value;
}

function spawnPlanJsonValue(plan: ReturnType<typeof buildSpawnPlan>): JsonValue {
  return {
    creatures: plan.creatures.map((c) => ({
      ai_link_parent: c.aiLinkParent,
      ai_mode: c.aiMode,
      ai_timer: c.aiTimer,
      bonus_duration_override: c.bonusDurationOverride,
      bonus_id: c.bonusId,
      contact_damage: c.contactDamage,
      flags: c.flags,
      heading: c.heading,
      health: c.health,
      max_health: c.maxHealth,
      move_speed: c.moveSpeed,
      orbit_angle: c.orbitAngle,
      orbit_radius: c.orbitRadius,
      origin_template_id: c.originTemplateId,
      phase_seed: c.phaseSeed,
      pos: { x: c.pos.x, y: c.pos.y },
      ranged_projectile_type: c.rangedProjectileType,
      reward_value: c.rewardValue,
      size: c.size,
      spawn_slot: c.spawnSlot,
      target_offset: c.targetOffset === null ? null : { x: c.targetOffset.x, y: c.targetOffset.y },
      tint: c.tint === null ? null : [...c.tint],
      type_id: c.typeId,
    })),
    spawn_slots: plan.spawnSlots.map((slot) => ({
      child_template_id: slot.childTemplateId,
      count: slot.count,
      interval: slot.interval,
      limit: slot.limit,
      owner_creature: slot.ownerCreature,
      timer: slot.timer,
    })),
    effects: plan.effects.map((fx) => ({
      count: fx.count,
      pos: { x: fx.pos.x, y: fx.pos.y },
    })),
    primary: plan.primary,
  };
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
  const normalizedDigits = digits.replaceAll('_', '');
  const digitPattern = radix === 16
    ? /^[0-9a-fA-F]+$/
    : radix === 10
      ? /^[0-9]+$/
      : radix === 8
        ? /^[0-7]+$/
        : /^[01]+$/;
  const underscorePattern = radix === 16
    ? /^_?[0-9a-fA-F]+(?:_[0-9a-fA-F]+)*$/
    : radix === 10
      ? /^[0-9]+(?:_[0-9]+)*$/
      : radix === 8
        ? /^_?[0-7]+(?:_[0-7]+)*$/
        : /^_?[01]+(?:_[01]+)*$/;
  const validUnderscores = underscorePattern.test(digits);
  const decimalWithInvalidLeadingZero = (
    radix === 10 &&
    normalizedDigits.length > 1 &&
    normalizedDigits.startsWith('0') &&
    /[1-9]/.test(normalizedDigits)
  );
  if (
    normalizedDigits.length === 0 ||
    !digitPattern.test(normalizedDigits) ||
    !validUnderscores ||
    decimalWithInvalidLeadingZero
  ) {
    throw new Error(`invalid integer: ${pythonAsciiRepr(text)}`);
  }
  const value = Number.parseInt(sign + normalizedDigits, radix);
  if (Number.isNaN(value)) {
    throw new Error(`invalid integer: ${pythonAsciiRepr(text)}`);
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
      throw new Error(`invalid vec2: ${pythonAsciiRepr(text)} (expected 'x,y' or 'x y')`);
    }
    [left, right] = parts;
  }
  const leftText = left.trim();
  const rightText = right.trim();
  const x = Number(leftText);
  const y = Number(rightText);
  if (leftText.length === 0 || rightText.length === 0 || Number.isNaN(x) || Number.isNaN(y)) {
    throw new Error(`invalid vec2: ${pythonAsciiRepr(text)}`);
  }
  return new Vec2(x, y);
}

export function cmdSpawnPlan(opts: {
  template: string;
  seed?: string;
  pos?: string;
  heading?: number;
  terrainW?: number;
  terrainH?: number;
  demoModeActive?: boolean;
  hardcore?: boolean;
  questFailRetryCount?: number;
  asJson?: boolean;
}): string[] {
  const templateText = opts.template;
  const seedText = opts.seed ?? '0xBEEF';
  const posText = opts.pos ?? '512,512';
  const heading = opts.heading ?? 0.0;
  const terrainW = opts.terrainW ?? 1024.0;
  const terrainH = opts.terrainH ?? 1024.0;
  const demoModeActive = opts.demoModeActive ?? true;
  const hardcore = opts.hardcore ?? false;
  const questFailRetryCount = opts.questFailRetryCount ?? 0;
  const templateIdRaw = parseIntAuto(templateText);
  const templateId = int(templateIdRaw) as SpawnId;
  if (!SPAWN_ID_TO_TEMPLATE.has(templateId)) {
    throw new Error(`invalid spawn template id: ${pythonAsciiRepr(templateText)}`);
  }
  const seed = parseIntAuto(seedText);
  const rng = new Crand(seed);
  const spawnPos = parseVec2(posText);
  const env = new SpawnEnv({
    terrainWidth: terrainW,
    terrainHeight: terrainH,
    demoModeActive,
    hardcore,
    questFailRetryCount,
  });
  const plan = buildSpawnPlan(templateId, spawnPos, heading, rng, env);
  if (opts.asJson ?? false) {
    const planJson = spawnPlanJsonValue(plan) as { [key: string]: JsonValue };
    const payload: JsonValue = {
      template_id: int(templateId),
      pos: [spawnPos.x, spawnPos.y],
      heading,
      seed,
      env: {
        terrain_width: terrainW,
        terrain_height: terrainH,
        demo_mode_active: demoModeActive,
        hardcore,
        quest_fail_retry_count: questFailRetryCount,
      },
      primary: planJson.primary,
      creatures: planJson.creatures,
      spawn_slots: planJson.spawn_slots,
      effects: planJson.effects,
      rng_state: rng.state,
    };
    return [JSON.stringify(sortJsonValue(payload), null, 2)];
  }

  const lines = [
    `template_id=0x${hexLower(templateId, 2)} (${int(templateId)}) creature=${spawnIdLabel(templateId)}`,
    `pos=(${spawnPos.x.toFixed(1)},${spawnPos.y.toFixed(1)}) ` +
      `heading=${heading.toFixed(6)} seed=0x${hexLower(seed, 8)} rng_state=0x${hexLower(rng.state, 8)}`,
    'env=' +
      `demo_mode_active=${pythonStr(demoModeActive)} ` +
      `hardcore=${pythonStr(hardcore)} ` +
      `quest_fail_retry_count=${questFailRetryCount} ` +
      `terrain=${terrainW.toFixed(0)}x${terrainH.toFixed(0)}`,
    `primary=${plan.primary} creatures=${plan.creatures.length} slots=${plan.spawnSlots.length} effects=${plan.effects.length}`,
    '',
    'creatures:',
  ];
  plan.creatures.forEach((c, idx) => {
    const primary = idx === plan.primary ? '*' : ' ';
    lines.push(
      `${primary}${String(idx).padStart(2, '0')} type=${pythonStr(c.typeId).padEnd(14)} ` +
      `ai=${String(c.aiMode).padStart(2)} flags=0x${hexLower(c.flags, 3)} ` +
      `pos=(${c.pos.x.toFixed(1).padStart(7)},${c.pos.y.toFixed(1).padStart(7)}) ` +
      `health=${pythonStr(c.health).padStart(6)} size=${pythonStr(c.size).padStart(6)} ` +
      `link=${pythonStr(c.aiLinkParent).padStart(3)} slot=${pythonStr(c.spawnSlot).padStart(3)}`,
    );
  });
  if (plan.spawnSlots.length > 0) {
    lines.push('', 'spawn_slots:');
    plan.spawnSlots.forEach((slot, idx) => {
      lines.push(
        `${String(idx).padStart(2, '0')} owner=${String(slot.ownerCreature).padStart(2, '0')} ` +
        `timer=${slot.timer.toFixed(2)} count=${String(slot.count).padStart(3)} ` +
        `limit=${String(slot.limit).padStart(3)} interval=${slot.interval.toFixed(3)} ` +
        `child=0x${hexLower(slot.childTemplateId, 2)}`,
      );
    });
  }
  if (plan.effects.length > 0) {
    lines.push('', 'effects:');
    for (const fx of plan.effects) {
      lines.push(`burst x=${fx.pos.x.toFixed(1)} y=${fx.pos.y.toFixed(1)} count=${fx.count}`);
    }
  }
  return lines;
}
