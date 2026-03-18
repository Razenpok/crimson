// Port of crimson/render/frame.py

import { RuntimeResources } from '@grim/assets.ts';
import { CrimsonConfig } from '@grim/config.ts';
import { Vec2 } from '@grim/geom.ts';
import { GroundRenderer } from '@grim/terrain-render.ts';
import { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { CreaturePool } from '@crimson/creatures/runtime.ts';
import { RtxRenderMode } from './rtx/mode.ts';

// Typed world snapshot consumed by render code.
// This intentionally carries references (not deep copies) so render can be
// deterministic per frame boundary while remaining allocation-light.
export interface RenderFrame {
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
}
