// Port of crimson/render/frame.py

import { RuntimeResources } from '../../engine/assets.ts';
import { CrimsonConfig } from '../../engine/config.ts';
import { Vec2 } from '../../engine/geom.ts';
import { GroundRenderer } from '../../engine/terrain-render.ts';
import { GameplayState, PlayerState } from '../sim/state-types.ts';
import { CreaturePool } from '../creatures/runtime.ts';
import { RtxRenderMode } from './rtx/mode.ts';

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
