// Port of crimson/perks/runtime/player_tick_context.py

import type { Vec2 } from '@grim/geom.ts';
import type { OwnerRef } from '@crimson/owner-ref.ts';
import type { ProjectileTemplateId } from '@crimson/projectiles/types.ts';
import type { GameplayState, PlayerState } from '@crimson/sim/state-types.ts';

export type ProjectileSpawnFn = (
  state: GameplayState,
  opts: { players: readonly PlayerState[] | null; pos: Vec2; angle: number; typeId: ProjectileTemplateId; owner: OwnerRef; ownerPlayerIndex?: number | null; hitsPlayers?: boolean },
) => number;

export type OwnerRefForPlayerFn = (playerIndex: number) => OwnerRef;
export type OwnerRefForPlayerProjectilesFn = (state: GameplayState, playerIndex: number) => OwnerRef;

export class PlayerPerkTickCtx {
  constructor(
    public state: GameplayState,
    public player: PlayerState,
    public playerPosBeforeMove: Vec2,
    public players: PlayerState[] | null,
    public dt: number,
    public stationary: boolean,
    public ownerRefForPlayer: OwnerRefForPlayerFn,
    public ownerRefForPlayerProjectiles: OwnerRefForPlayerProjectilesFn,
    public projectileSpawn: ProjectileSpawnFn,
  ) {
  }
}
