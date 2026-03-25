// Port of crimson/bonuses/pool.py

import { Vec2 } from '@grim/geom.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import type { CreatureDamageApplier } from '@crimson/projectiles/types.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';
import type { BonusPickupEvent, GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { WeaponId, WEAPON_BY_ID, weaponDisplayName } from '@crimson/weapons.ts';
import { BONUS_BY_ID, BonusId, bonusDisplayName } from './ids.ts';
import { bonusPickRandomType } from './selection.ts';

export const BONUS_POOL_SIZE = 16;
export const BONUS_SPAWN_MARGIN = 32.0;
export const BONUS_SPAWN_MIN_DISTANCE = 32.0;
export const BONUS_PICKUP_RADIUS = 26.0;
export const BONUS_PICKUP_DECAY_RATE = 3.0;
export const BONUS_PICKUP_LINGER = 0.5;
export const BONUS_TIME_MAX = 10.0;
export const BONUS_WEAPON_NEAR_RADIUS = 56.0;
export const BONUS_AIM_HOVER_RADIUS = 24.0;
export const BONUS_TELEKINETIC_PICKUP_MS = 650.0;

export class BonusEntry {
  bonusId: BonusId = BonusId.UNUSED;
  picked = false;
  timeLeft = 0.0;
  timeMax = 0.0;
  pos: Vec2 = new Vec2();
  amount = 0;
}

function bonusEntryIsEmpty(entry: BonusEntry): boolean {
  return (
    entry.bonusId === BonusId.UNUSED &&
    !entry.picked &&
    entry.timeLeft <= 0.0 &&
    entry.timeMax <= 0.0 &&
    entry.amount === 0
  );
}

function weaponIdFromNativeAmount(amount: number): WeaponId | null {
  const weaponId = amount | 0;
  if (!WEAPON_BY_ID.has(weaponId as WeaponId)) return null;
  return weaponId as WeaponId;
}

function weaponIdFromWeaponEntry(entry: BonusEntry): WeaponId | null {
  if (entry.bonusId !== BonusId.WEAPON) return null;
  return weaponIdFromNativeAmount(entry.amount);
}

function allCarriedWeaponIds(players: PlayerState[]): Set<WeaponId> {
  const carried = new Set<WeaponId>();
  for (const player of players) {
    const weaponId = player.weapon.weaponId;
    if (weaponId > WeaponId.NONE) carried.add(weaponId);
    if (player.altWeapon === null) continue;
    const alt = player.altWeapon.weaponId;
    if (alt > WeaponId.NONE) carried.add(alt);
  }
  return carried;
}

export class BonusPool {
  private _entries: BonusEntry[];
  private _sentinel: BonusEntry;
  private _creatureDamageApplier: CreatureDamageApplier | null = null;

  constructor(size: number = BONUS_POOL_SIZE) {
    this._entries = Array.from({ length: size | 0 }, () => new BonusEntry());
    this._sentinel = new BonusEntry();
  }

  get entries(): BonusEntry[] {
    return this._entries;
  }

  get creatureDamageApplier(): CreatureDamageApplier | null {
    return this._creatureDamageApplier;
  }

  set creatureDamageApplier(value: CreatureDamageApplier | null) {
    this._creatureDamageApplier = value;
  }

  reset(): void {
    for (const entry of this._entries) {
      entry.bonusId = BonusId.UNUSED;
      entry.picked = false;
      entry.timeLeft = 0.0;
      entry.timeMax = 0.0;
      entry.amount = 0;
    }
  }

  iterActive(): BonusEntry[] {
    return this._entries.filter((entry) => entry.bonusId !== BonusId.UNUSED);
  }

  private allocSlot(): BonusEntry | null {
    for (const entry of this._entries) {
      if (bonusEntryIsEmpty(entry)) return entry;
    }
    return null;
  }

  private allocSlotOrSentinel(): BonusEntry {
    const entry = this.allocSlot();
    if (entry !== null) return entry;
    return this._sentinel;
  }

  private isSentinelEntry(entry: BonusEntry): boolean {
    return entry === this._sentinel;
  }

  private clearEntry(entry: BonusEntry): void {
    entry.bonusId = BonusId.UNUSED;
    entry.picked = false;
    entry.timeLeft = 0.0;
    entry.timeMax = 0.0;
    entry.amount = 0;
  }

  spawnAt(
    pos: Vec2,
    bonusId: BonusId,
    durationOverride: number,
    opts: { state: GameplayState; worldWidth?: number; worldHeight?: number },
  ): BonusEntry | null {
    const worldWidth = opts.worldWidth ?? 1024.0;
    const worldHeight = opts.worldHeight ?? 1024.0;
    if (opts.state.gameMode === GameMode.RUSH) return null;
    if (bonusId === BonusId.UNUSED) return null;
    const entry = this.allocSlot();
    if (entry === null) return null;

    entry.bonusId = bonusId;
    entry.picked = false;
    entry.pos = pos.clampRect(
      BONUS_SPAWN_MARGIN,
      BONUS_SPAWN_MARGIN,
      worldWidth - BONUS_SPAWN_MARGIN,
      worldHeight - BONUS_SPAWN_MARGIN,
    );
    entry.timeLeft = BONUS_TIME_MAX;
    entry.timeMax = BONUS_TIME_MAX;

    let amount = durationOverride;
    if (amount === -1) {
      const meta = BONUS_BY_ID.get(bonusId);
      amount = meta !== undefined ? ((meta.nativeAmount ?? 0) | 0) : 0;
    }
    entry.amount = amount | 0;
    return entry;
  }

  spawnAtPos(
    pos: Vec2,
    opts: { state: GameplayState; players: PlayerState[]; worldWidth?: number; worldHeight?: number },
  ): BonusEntry {
    const worldWidth = opts.worldWidth ?? 1024.0;
    const worldHeight = opts.worldHeight ?? 1024.0;
    if (opts.state.gameMode === GameMode.RUSH) return this._sentinel;
    if (
      pos.x < BONUS_SPAWN_MARGIN ||
      pos.y < BONUS_SPAWN_MARGIN ||
      pos.x > worldWidth - BONUS_SPAWN_MARGIN ||
      pos.y > worldHeight - BONUS_SPAWN_MARGIN
    ) {
      return this._sentinel;
    }

    let entry = this.allocSlotOrSentinel();

    const bonusId = bonusPickRandomType(this, opts.state, opts.players);
    const minDistSq = BONUS_SPAWN_MIN_DISTANCE * BONUS_SPAWN_MIN_DISTANCE;
    for (const activeEntry of this._entries) {
      if (activeEntry.bonusId === BonusId.UNUSED) continue;
      if (Vec2.distanceSq(pos, activeEntry.pos) < minDistSq) {
        entry = this._sentinel;
        break;
      }
    }

    entry.bonusId = bonusId;
    entry.picked = false;
    entry.pos = pos;
    entry.timeLeft = BONUS_TIME_MAX;
    entry.timeMax = BONUS_TIME_MAX;

    const rng = opts.state.rng;
    if (entry.bonusId === BonusId.WEAPON) {
      entry.amount = weaponPickRandomAvailable(opts.state, null) | 0;
    } else if (entry.bonusId === BonusId.POINTS) {
      entry.amount = (rng.rand({ caller: RngCallerStatic.BONUS_SPAWN_AT_POS_POINTS_AMOUNT }) & 7) < 3 ? 1000 : 500;
    } else {
      const meta = BONUS_BY_ID.get(entry.bonusId);
      entry.amount = meta !== undefined ? ((meta.nativeAmount ?? 0) | 0) : 0;
    }
    return entry;
  }

  trySpawnOnKill(
    pos: Vec2,
    opts: { state: GameplayState; players: PlayerState[]; detailPreset?: number; worldWidth?: number; worldHeight?: number },
  ): BonusEntry | null {
    const state = opts.state;
    const players = opts.players;
    const detailPreset = opts.detailPreset ?? 5;
    const worldWidth = opts.worldWidth ?? 1024.0;
    const worldHeight = opts.worldHeight ?? 1024.0;
    const gameMode = state.gameMode;
    if (gameMode === GameMode.TYPO) return null;
    if (state.demoModeActive) return null;
    if (gameMode === GameMode.RUSH) return null;
    if (gameMode === GameMode.TUTORIAL) return null;
    if (state.bonusSpawnGuard) return null;

    const rng = state.rng;
    if (players.length > 0 && players.some((player) => player.weapon.weaponId === WeaponId.PISTOL)) {
      if ((rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_PISTOL_FORCE_WEAPON }) & 3) < 3) {
        const entry = this.spawnAtPos(pos, { state, players, worldWidth, worldHeight });

        entry.bonusId = BonusId.WEAPON;
        let weaponId = weaponPickRandomAvailable(state, null);
        entry.amount = weaponId | 0;
        if (weaponId === WeaponId.PISTOL) {
          weaponId = weaponPickRandomAvailable(state, null);
          entry.amount = weaponId | 0;
        }

        let matches = 0;
        for (const bonus of this._entries) {
          if (bonus.bonusId === entry.bonusId) matches++;
        }
        if (matches > 1) {
          this.clearEntry(entry);
          return null;
        }

        if (entry.amount === (WeaponId.PISTOL as number) || (
          players.length > 0 && perkActive(players[0], PerkId.MY_FAVOURITE_WEAPON)
        )) {
          this.clearEntry(entry);
          return null;
        }

        if (this.isSentinelEntry(entry)) return null;
        this.spawnOnKillBurst(entry, state, detailPreset);
        return entry;
      }
    }

    const baseRoll = rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_BASE_GATE });
    if (baseRoll % 9 !== 1) {
      let allowWithoutMagnet = false;
      if (players.length > 0) {
        let hasPistol = false;
        if (state.preserveBugs) {
          hasPistol = players[0].weapon.weaponId === WeaponId.PISTOL;
        } else {
          hasPistol = players.some((player) => player.weapon.weaponId === WeaponId.PISTOL);
        }
        if (hasPistol) {
          allowWithoutMagnet =
            rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_PISTOL_ALLOW_WITHOUT_MAGNET }) % 5 === 1;
        }
      }

      if (!allowWithoutMagnet) {
        let hasBonusMagnet = false;
        if (players.length > 0) {
          if (state.preserveBugs) {
            hasBonusMagnet = perkActive(players[0], PerkId.BONUS_MAGNET);
          } else {
            hasBonusMagnet = players.some((player) => perkActive(player, PerkId.BONUS_MAGNET));
          }
        }
        if (!hasBonusMagnet) return null;
        if (rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_BONUS_MAGNET }) % 10 !== 2) return null;
      }
    }

    const entry = this.spawnAtPos(pos, { state, players, worldWidth, worldHeight });

    if (entry.bonusId === BonusId.WEAPON) {
      const nearSq = BONUS_WEAPON_NEAR_RADIUS * BONUS_WEAPON_NEAR_RADIUS;
      let nearPlayer = false;
      if (players.length > 0) {
        if (state.preserveBugs) {
          nearPlayer = Vec2.distanceSq(pos, players[0].pos) < nearSq;
        } else {
          nearPlayer = players.some((player) => Vec2.distanceSq(pos, player.pos) < nearSq);
        }
      }
      if (nearPlayer) {
        entry.bonusId = BonusId.POINTS;
        entry.amount = 100;
      }
    }

    if (entry.bonusId !== BonusId.POINTS) {
      let matches = 0;
      for (const bonus of this._entries) {
        if (bonus.bonusId === entry.bonusId) matches++;
      }
      if (matches > 1) {
        this.clearEntry(entry);
        return null;
      }
    }

    if (players.length > 0) {
      if (state.preserveBugs) {
        const wid = players[0].weapon.weaponId;
        const suppressionWeaponId = weaponIdFromNativeAmount(entry.amount);
        if (suppressionWeaponId === wid) {
          this.clearEntry(entry);
          return null;
        }
      } else {
        const carriedWeaponIds = allCarriedWeaponIds(players);
        const bonusWeaponId = weaponIdFromWeaponEntry(entry);
        if (entry.bonusId === BonusId.WEAPON && bonusWeaponId !== null && carriedWeaponIds.has(bonusWeaponId)) {
          this.clearEntry(entry);
          return null;
        }
      }
    }

    if (this.isSentinelEntry(entry)) return null;
    this.spawnOnKillBurst(entry, state, detailPreset);
    return entry;
  }

  private spawnOnKillBurst(entry: BonusEntry, state: GameplayState, detailPreset: number): void {
    const rng = state.rng;
    const effects = state.effects;
    for (let i = 0; i < 16; i++) {
      effects.spawnBurstParticle({
        pos: entry.pos,
        rotationDraw: rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_BURST_ROTATION }),
        velXDraw: rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_BURST_VEL_X }),
        velYDraw: rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_BURST_VEL_Y }),
        scaleStepDraw: rng.rand({ caller: RngCallerStatic.BONUS_TRY_SPAWN_ON_KILL_BURST_SCALE_STEP }),
        scaleStep: null,
        lifetime: 0.5,
        detailPreset,
      });
    }
  }

  update(
    dt: number,
    opts: { state: GameplayState; players: PlayerState[]; creatures: readonly CreatureState[]; detailPreset?: number; deferFreezeCorpseFx?: boolean; freezeCorpseIndices?: Set<number> | null },
  ): BonusPickupEvent[] {
    const state = opts.state;
    const players = opts.players;
    const creatures = opts.creatures;
    const detailPreset = opts.detailPreset ?? 5;
    const deferFreezeCorpseFx = opts.deferFreezeCorpseFx ?? false;
    const freezeCorpseIndices = opts.freezeCorpseIndices ?? null;
    if (dt <= 0.0) return [];

    const pickups: BonusPickupEvent[] = [];
    for (const entry of this._entries) {
      if (bonusEntryIsEmpty(entry)) continue;

      const decay = dt * (entry.picked ? BONUS_PICKUP_DECAY_RATE : 1.0);
      entry.timeLeft -= decay;
      if (!entry.picked && state.gameMode === GameMode.TUTORIAL) {
        entry.timeLeft = 5.0;
      }
      let expiredToUnused = false;
      if (entry.timeLeft < 0.0) {
        if (entry.picked) {
          this.clearEntry(entry);
          continue;
        }
        entry.bonusId = BonusId.UNUSED;
        expiredToUnused = true;
      }

      if (entry.picked) continue;

      let pickedNow = false;
      for (const player of players) {
        if (Vec2.distanceSq(entry.pos, player.pos) < BONUS_PICKUP_RADIUS * BONUS_PICKUP_RADIUS) {
          bonusApply(
            state,
            player,
            entry.bonusId,
            {
              origin: entry.pos,
              creatures,
              players,
              amount: entry.amount,
              detailPreset: detailPreset | 0,
              deferFreezeCorpseFx,
              freezeCorpseIndices,
            },
          );
          entry.picked = true;
          entry.timeLeft = BONUS_PICKUP_LINGER;
          pickups.push({
            playerIndex: player.index,
            bonusId: entry.bonusId,
            amount: entry.amount,
            pos: entry.pos,
          });
          pickedNow = true;
          break;
        }
      }

      if (expiredToUnused && !pickedNow) {
        this.clearEntry(entry);
      }
    }

    return pickups;
  }
}

export function bonusFindAimHoverEntry(
  player: PlayerState,
  bonusPool: BonusPool,
): [number, BonusEntry] | null {
  const aimPos = player.aim;
  const radiusSq = BONUS_AIM_HOVER_RADIUS * BONUS_AIM_HOVER_RADIUS;
  const entries = bonusPool.entries;
  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    if (entry.bonusId === BonusId.UNUSED) continue;
    if (Vec2.distanceSq(aimPos, entry.pos) < radiusSq) {
      return [idx, entry];
    }
  }
  return null;
}

export function bonusLabelForEntry(entry: BonusEntry, opts: { preserveBugs?: boolean } = {}): string {
  const preserveBugs = opts.preserveBugs ?? false;
  const bonusId = entry.bonusId;
  if (bonusId === BonusId.WEAPON) {
    const weaponId = weaponIdFromWeaponEntry(entry);
    if (weaponId === null) return 'Weapon';
    return weaponDisplayName(weaponId, { preserveBugs });
  }
  if (bonusId === BonusId.POINTS) {
    const points = entry.amount | 0;
    const pointsLabel = bonusDisplayName(BonusId.POINTS, { preserveBugs });
    return `${pointsLabel}: ${points}`;
  }
  const meta = BONUS_BY_ID.get(bonusId);
  if (meta !== undefined) {
    return bonusDisplayName(meta.bonusId, { preserveBugs });
  }
  return 'Bonus';
}

// Wired-up imports
import { weaponPickRandomAvailable } from '@crimson/weapon-runtime/availability.ts';
import { bonusApply } from './apply.ts';
import { CreatureState } from "@crimson/creatures/runtime.js";
