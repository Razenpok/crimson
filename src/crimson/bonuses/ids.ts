// Port of crimson/bonuses/ids.py

export enum BonusId {
  UNUSED = 0,
  POINTS = 1,
  ENERGIZER = 2,
  WEAPON = 3,
  WEAPON_POWER_UP = 4,
  NUKE = 5,
  DOUBLE_EXPERIENCE = 6,
  SHOCK_CHAIN = 7,
  FIREBLAST = 8,
  REFLEX_BOOST = 9,
  SHIELD = 10,
  FREEZE = 11,
  MEDIKIT = 12,
  SPEED = 13,
  FIRE_BULLETS = 14,
}

export interface BonusMeta {
  readonly bonusId: BonusId;
  readonly name: string;
  readonly description: string | null;
  readonly iconId: number | null;
  readonly nativeAmount: number | null;
  readonly applySeconds: number | null;
  readonly notes?: string | null;
}

function bm(
  bonusId: BonusId,
  name: string,
  description: string | null,
  iconId: number | null,
  nativeAmount: number | null,
  applySeconds: number | null = null,
): BonusMeta {
  return { bonusId, name, description, iconId, nativeAmount, applySeconds };
}

export const BONUS_TABLE: readonly BonusMeta[] = [
  bm(BonusId.UNUSED, '(unused)', null, null, null),
  bm(BonusId.POINTS, 'Points', 'You gain some experience points.', 12, 500),
  bm(BonusId.ENERGIZER, 'Energizer', 'Suddenly monsters run away from you and you can eat them.', 10, 8, 8.0),
  bm(BonusId.WEAPON, 'Weapon', 'You get a new weapon.', -1, 3),
  bm(BonusId.WEAPON_POWER_UP, 'Weapon Power Up', 'Your firerate and load time increase for a short period.', 7, 10),
  bm(BonusId.NUKE, 'Nuke', 'An amazing explosion of ATOMIC power.', 1, 0),
  bm(BonusId.DOUBLE_EXPERIENCE, 'Double Experience', 'Every experience point you get is doubled when this bonus is active.', 4, 0, 6.0),
  bm(BonusId.SHOCK_CHAIN, 'Shock Chain', 'Chain of shocks shock the crowd.', 3, 0),
  bm(BonusId.FIREBLAST, 'Fireblast', 'Fireballs all over the place.', 2, 0),
  bm(BonusId.REFLEX_BOOST, 'Reflex Boost', 'You get more time to react as the game slows down.', 5, 3),
  bm(BonusId.SHIELD, 'Shield', 'Force field protects you for a while.', 6, 7),
  bm(BonusId.FREEZE, 'Freeze', 'Monsters are frozen.', 8, 5),
  bm(BonusId.MEDIKIT, 'MediKit', 'You regain some of your health.', 14, 10),
  bm(BonusId.SPEED, 'Speed', 'Your movement speed increases for a while.', 9, 8),
  bm(BonusId.FIRE_BULLETS, 'Fire Bullets', 'For few seconds -- make them count.', 11, 4, 5.0),
];

export const BONUS_BY_ID: Map<BonusId, BonusMeta> = new Map(
  BONUS_TABLE.map((e) => [e.bonusId, e]),
);

const _BONUS_FIXED_NAMES: Map<BonusId, string> = new Map();

const _BONUS_FIXED_DESCRIPTIONS: Map<BonusId, string> = new Map([
  [BonusId.WEAPON_POWER_UP, 'Your fire rate and load time increase for a short period.'],
  [BonusId.FIRE_BULLETS, 'For a few seconds -- make them count.'],
]);

export function bonusDisplayName(bonusId: BonusId, opts: { preserveBugs?: boolean } = {}): string {
  const preserveBugs = opts.preserveBugs ?? false;
  const entry = BONUS_BY_ID.get(bonusId);
  if (entry === undefined) return 'unknown';
  if (!preserveBugs) {
    const fixed = _BONUS_FIXED_NAMES.get(bonusId);
    if (fixed !== undefined) return fixed;
  }
  return entry.name;
}

export function bonusDisplayDescription(bonusId: BonusId, opts: { preserveBugs?: boolean } = {}): string | null {
  const preserveBugs = opts.preserveBugs ?? false;
  const entry = BONUS_BY_ID.get(bonusId);
  if (entry === undefined) return null;
  if (!preserveBugs) {
    const fixed = _BONUS_FIXED_DESCRIPTIONS.get(bonusId);
    if (fixed !== undefined) return fixed;
  }
  return entry.description;
}

export function bonusLabel(bonusId: BonusId, opts: { preserveBugs?: boolean } = {}): string {
  const preserveBugs = opts.preserveBugs ?? false;
  const entry = BONUS_BY_ID.get(bonusId);
  if (entry === undefined) return 'unknown';
  return bonusDisplayName(entry.bonusId, { preserveBugs });
}
