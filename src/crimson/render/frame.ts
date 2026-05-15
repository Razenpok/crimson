// Port of crimson/render/frame.py

import { RuntimeResources } from '@grim/assets.ts';
import { CrimsonConfig } from '@grim/config.ts';
import { Vec2 } from '@grim/geom.ts';
import { GroundRenderer } from '@grim/terrain-render.ts';
import { CreaturePool } from '@crimson/creatures/runtime.ts';
import type { GameplayState } from '@crimson/gameplay.ts';
import { PlayerState } from '@crimson/sim/state-types.ts';
import { RtxRenderMode } from './rtx/mode.ts';

export class RenderFrame {
  // Typed world snapshot consumed by render code.
  // This intentionally carries references (not deep copies) so render can be
  // deterministic per frame boundary while remaining allocation-light.
  readonly worldSize: number;
  readonly demoModeActive: boolean;
  readonly config: CrimsonConfig | null;
  readonly camera: Vec2;
  readonly ground: GroundRenderer | null;

  readonly state: GameplayState;
  readonly players: readonly PlayerState[];
  readonly creatures: CreaturePool;
  readonly resources: RuntimeResources;

  readonly elapsedMs: number;
  readonly bonusAnimPhase: number;
  readonly lanPlayerRingsEnabled: boolean;
  readonly lanLocalAimIndicatorsOnly: boolean;
  readonly lanLocalPlayerSlotIndex: number;
  readonly rtxMode: RtxRenderMode;

  constructor(opts: {
    worldSize: number;
    demoModeActive: boolean;
    config: CrimsonConfig | null;
    camera: Vec2;
    ground: GroundRenderer | null;
    state: GameplayState;
    players: readonly PlayerState[];
    creatures: CreaturePool;
    resources: RuntimeResources;
    elapsedMs: number;
    bonusAnimPhase: number;
    lanPlayerRingsEnabled: boolean;
    lanLocalAimIndicatorsOnly: boolean;
    lanLocalPlayerSlotIndex: number;
    rtxMode: RtxRenderMode;
  }) {
    this.worldSize = opts.worldSize;
    this.demoModeActive = opts.demoModeActive;
    this.config = opts.config;
    this.camera = opts.camera;
    this.ground = opts.ground;
    this.state = opts.state;
    this.players = opts.players;
    this.creatures = opts.creatures;
    this.resources = opts.resources;
    this.elapsedMs = opts.elapsedMs;
    this.bonusAnimPhase = opts.bonusAnimPhase;
    this.lanPlayerRingsEnabled = opts.lanPlayerRingsEnabled;
    this.lanLocalAimIndicatorsOnly = opts.lanLocalAimIndicatorsOnly;
    this.lanLocalPlayerSlotIndex = opts.lanLocalPlayerSlotIndex;
    this.rtxMode = opts.rtxMode;
  }
}
