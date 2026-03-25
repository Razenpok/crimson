// Port of crimson/modes/components/highscore_record_builder.py

import { GameMode } from '@crimson/game-modes.ts';
import { GameplayState } from '@crimson/gameplay.ts';
import { type PlayerState } from '@crimson/sim/state-types.ts';
import { mostUsedWeaponIdForPlayer } from '@crimson/weapon-runtime/index.ts';
import { type HighScoreRecord } from '@crimson/screens/results/game-over.ts';

export function clampShots(fired: number, hit: number): [number, number] {
  fired = Math.max(0, int(fired));
  hit = Math.max(0, Math.min(int(hit), fired));
  return [fired, hit];
}

export function shotsFromState(state: GameplayState, opts: { playerIndex: number }): [number, number] {
  const index = int(opts.playerIndex);
  if (index < 0 || index >= state.shotsFired.length || index >= state.shotsHit.length) {
    return [0, 0];
  }
  const fired = int(state.shotsFired[index]);
  const hit = int(state.shotsHit[index]);
  return clampShots(fired, hit);
}

export function buildHighscoreRecordForGameOver(opts: {
  state: GameplayState;
  player: PlayerState;
  survivalElapsedMs: number;
  creatureKillCount: number;
  gameModeId: GameMode;
  shotsFired?: number | null;
  shotsHit?: number | null;
  clampShotsHit?: boolean;
}): HighScoreRecord {
  const {
    state,
    player,
    survivalElapsedMs,
    creatureKillCount,
    gameModeId,
    clampShotsHit = true,
  } = opts;

  const weaponId = mostUsedWeaponIdForPlayer(
    state,
    { playerIndex: int(player.index), fallbackWeaponId: player.weapon.weaponId },
  );

  let fired: number;
  let hit: number;

  if (opts.shotsFired == null || opts.shotsHit == null) {
    [fired, hit] = shotsFromState(state, { playerIndex: int(player.index) });
  } else {
    fired = int(opts.shotsFired);
    hit = int(opts.shotsHit);
    if (clampShotsHit) {
      [fired, hit] = clampShots(fired, hit);
    }
  }

  return {
    gameModeId,
    scoreXp: int(player.experience),
    survivalElapsedMs: int(survivalElapsedMs),
    creatureKillCount: int(creatureKillCount),
    mostUsedWeaponId: weaponId,
    shotsFired: fired,
    shotsHit: hit,
    name: '',
  };
}
