// Port of crimson/perks/runtime/player_tick_context.py

import type { Vec2 } from '@grim/geom.ts';
import type { OwnerRef } from '@crimson/owner-ref.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';
import { ProjectileTemplateId } from "@crimson/projectiles/types.js";

export type ProjectileSpawnFn = (
  state: GameplayState,
  opts: { players: readonly PlayerState[] | null; pos: Vec2; angle: number; typeId: ProjectileTemplateId; owner: OwnerRef; ownerPlayerIndex?: number | null; hitsPlayers?: boolean },
) => number;

export type OwnerRefForPlayerFn = (playerIndex: number) => OwnerRef;
export type OwnerRefForPlayerProjectilesFn = (state: GameplayState, playerIndex: number) => OwnerRef;

export interface PlayerPerkTickCtx {
    state: GameplayState;
    player: PlayerState;
    playerPosBeforeMove: Vec2;
    players: PlayerState[] | null;
    dt: number;
    stationary: boolean;
    ownerRefForPlayer: OwnerRefForPlayerFn;
    ownerRefForPlayerProjectiles: OwnerRefForPlayerProjectilesFn;
    projectileSpawn: ProjectileSpawnFn;
}
