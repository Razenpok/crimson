// Port of crimson/world/sim_world_state.py

import { Vec2 } from '../../engine/geom.ts';
import type { CreaturePool } from '../creatures/runtime.ts';
import type { SpawnEnv } from '../creatures/runtime.ts';
import { type GameplayState, PlayerState } from '../sim/state-types.ts';
import { PresentationStepCommands } from '../sim/presentation-step.ts';
import {
  type WorldEvents,
  WorldState,
} from '../sim/world-state.ts';
import { weaponAssignPlayer, initDefaultAltWeapon } from '../weapon-runtime/index.ts';
import { WEAPON_TABLE, WeaponId } from '../weapons.ts';

// ---------------------------------------------------------------------------
// Weapon damage scale map (built once from the weapon table)
// ---------------------------------------------------------------------------

function _weaponDamageScaleMap(): Map<number, number> {
  const table = new Map<number, number>();
  for (const entry of WEAPON_TABLE) {
    const wid = entry.weaponId as number;
    if (wid <= 0) continue;
    table.set(wid, Number(entry.damageScale));
  }
  return table;
}

// ---------------------------------------------------------------------------
// resetWorldPlayers
// ---------------------------------------------------------------------------

export function resetWorldPlayers(
  players: PlayerState[],
  state: GameplayState,
  worldSize: number,
  playerCount: number,
  spawnPos: Vec2 | null = null,
): void {
  players.length = 0;

  const base = spawnPos ?? new Vec2(worldSize * 0.5, worldSize * 0.5);
  const count = Math.max(1, playerCount | 0);
  let offsets: Vec2[];
  if (count <= 1) {
    offsets = [new Vec2()];
  } else {
    const radius = 32.0;
    const step = Math.PI * 2.0 / count;
    offsets = [];
    for (let idx = 0; idx < count; idx++) {
      offsets.push(Vec2.fromAngle(idx * step).mul(radius));
    }
  }

  for (let idx = 0; idx < count; idx++) {
    const pos = base.add(offsets[idx]).clampRect(0.0, 0.0, worldSize, worldSize);
    const player = new PlayerState(idx, pos);
    weaponAssignPlayer(player, WeaponId.PISTOL, state);
    initDefaultAltWeapon(player);
    players.push(player);
  }

  // Reset-time loadout bootstrap should not leak queued reload SFX.
  state.sfxQueue.length = 0;
}

// ---------------------------------------------------------------------------
// SimWorldState
// ---------------------------------------------------------------------------

function _emptyWorldEvents(): WorldEvents {
  return {
    hits: [],
    deaths: [],
    pickups: [],
    sfx: [],
    triggerGameTune: false,
    hitSfx: [],
  };
}

export class SimWorldState {
  worldSize: number;
  demoModeActive: boolean;
  questFailRetryCount: number;
  hardcore: boolean;
  preserveBugs: boolean;

  worldState!: WorldState;
  spawnEnv!: SpawnEnv;
  state!: GameplayState;
  players!: PlayerState[];
  creatures!: CreaturePool;

  damageScaleByType: Map<number, number>;
  presentationElapsedMs = 0.0;
  bonusAnimPhase = 0.0;
  gameTuneStarted = false;
  lastEvents: WorldEvents;
  lastPresentation: PresentationStepCommands;

  constructor(opts?: {
    worldSize?: number;
    demoModeActive?: boolean;
    questFailRetryCount?: number;
    hardcore?: boolean;
    preserveBugs?: boolean;
  }) {
    this.worldSize = opts?.worldSize ?? 1024.0;
    this.demoModeActive = opts?.demoModeActive ?? false;
    this.questFailRetryCount = opts?.questFailRetryCount ?? 0;
    this.hardcore = opts?.hardcore ?? false;
    this.preserveBugs = opts?.preserveBugs ?? false;
    this.damageScaleByType = _weaponDamageScaleMap();
    this.lastEvents = _emptyWorldEvents();
    this.lastPresentation = new PresentationStepCommands();
    this.reset(0xBEEF, 1);
  }

  reset(seed: number = 0xBEEF, playerCount: number = 1, spawnPos: Vec2 | null = null): void {
    this.worldState = WorldState.build({
      worldSize: this.worldSize,
      demoModeActive: Boolean(this.demoModeActive),
      hardcore: Boolean(this.hardcore),
      questFailRetryCount: this.questFailRetryCount | 0,
      preserveBugs: Boolean(this.preserveBugs),
    });
    this.spawnEnv = this.worldState.spawnEnv;
    this.state = this.worldState.state;
    this.players = this.worldState.players;
    this.creatures = this.worldState.creatures;
    this.state.rng.srand(seed | 0);

    this.lastEvents = _emptyWorldEvents();
    this.lastPresentation = new PresentationStepCommands();

    this.presentationElapsedMs = 0.0;
    this.bonusAnimPhase = 0.0;
    this.gameTuneStarted = false;

    resetWorldPlayers(
      this.players,
      this.state,
      this.worldSize,
      playerCount | 0,
      spawnPos,
    );
  }

  loadWorldState(worldState: WorldState): void {
    this.worldState = worldState;
    this.spawnEnv = this.worldState.spawnEnv;
    this.state = this.worldState.state;
    this.players = this.worldState.players;
    this.creatures = this.worldState.creatures;
    this.lastEvents = _emptyWorldEvents();
    this.lastPresentation = new PresentationStepCommands();
  }

  applyStepMetadata(opts: {
    events: WorldEvents;
    presentation: PresentationStepCommands;
    dtSim: number;
    gameTuneStarted: boolean;
  }): void {
    this.lastEvents = opts.events;
    this.lastPresentation = opts.presentation;

    if (opts.dtSim > 0.0) {
      this.presentationElapsedMs += opts.dtSim * 1000.0;
      this.bonusAnimPhase += opts.dtSim * 1.3;
    }

    this.gameTuneStarted = Boolean(opts.gameTuneStarted);
  }

  closeSession(): void {
    this.lastEvents = _emptyWorldEvents();
    this.lastPresentation = new PresentationStepCommands();

    this.gameTuneStarted = false;
  }
}
