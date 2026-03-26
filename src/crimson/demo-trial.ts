// Port of crimson/demo_trial.py

import { GameMode } from './game-modes.ts';
import type { QuestLevel } from './quests/level.ts';

export const DEMO_TOTAL_PLAY_TIME_MS = 2_400_000;
export const DEMO_QUEST_GRACE_TIME_MS = 300_000;

export function formatDemoTrialTime(ms: number): string {
  let value = int(ms);
  if (value < 0) value = 0;
  const minutes = Math.floor(value / 60_000);
  const seconds = Math.floor(value / 1_000) % 60;
  const centiseconds = Math.floor((value % 1_000) / 10);
  const secStr = seconds < 10 ? `0${seconds}` : `${seconds}`;
  const csStr = centiseconds < 10 ? `0${centiseconds}` : `${centiseconds}`;
  return `${minutes}:${secStr}.${csStr}`;
}

export type DemoTrialOverlayKind =
  | 'none'
  | 'quest_tier_limit'
  | 'quest_grace_left'
  | 'time_up';

export class DemoTrialOverlayInfo {
  readonly visible: boolean;
  readonly kind: DemoTrialOverlayKind;
  readonly remainingMs: number;
  readonly remainingLabel: string;
  readonly showRemainingLine: boolean;

  constructor(
    visible: boolean,
    kind: DemoTrialOverlayKind,
    remainingMs: number,
    remainingLabel: string,
    showRemainingLine: boolean,
  ) {
    this.visible = visible;
    this.kind = kind;
    this.remainingMs = remainingMs;
    this.remainingLabel = remainingLabel;
    this.showRemainingLine = showRemainingLine;
  }
}

/**
 * Advance demo timers by `dtMs` (ms), returning updated values.
 *
 * This mirrors the classic behavior where:
 *   - global playtime accumulates until it hits `DEMO_TOTAL_PLAY_TIME_MS`, then clamps
 *   - once global time is exhausted, a quest-only grace timer becomes active
 *   - timers do not advance while the demo trial overlay is shown
 */
export function tickDemoTrialTimers(opts: {
  demoBuild: boolean;
  gameModeId: GameMode;
  overlayVisible: boolean;
  globalPlaytimeMs: number;
  questGraceElapsedMs: number;
  dtMs: number;
}): [number, number] {
  const { demoBuild, gameModeId, overlayVisible, dtMs } = opts;

  if (!demoBuild) {
    return [int(opts.globalPlaytimeMs), int(opts.questGraceElapsedMs)];
  }

  if (gameModeId === GameMode.TUTORIAL) {
    return [int(opts.globalPlaytimeMs), int(opts.questGraceElapsedMs)];
  }

  let usedMs = Math.max(0, int(opts.globalPlaytimeMs));
  let graceMs = Math.max(0, int(opts.questGraceElapsedMs));
  if (usedMs >= DEMO_TOTAL_PLAY_TIME_MS && graceMs < 1) {
    graceMs = 1;
  }
  usedMs = Math.min(DEMO_TOTAL_PLAY_TIME_MS, usedMs);

  if (overlayVisible) {
    return [int(usedMs), int(graceMs)];
  }

  const deltaMs = int(dtMs);
  if (deltaMs <= 0) {
    return [int(usedMs), int(graceMs)];
  }

  usedMs = Math.min(DEMO_TOTAL_PLAY_TIME_MS, usedMs + deltaMs);
  if (usedMs >= DEMO_TOTAL_PLAY_TIME_MS && graceMs < 1) {
    graceMs = 1;
  }

  if (graceMs > 0) {
    if (gameModeId === GameMode.QUESTS) {
      graceMs += deltaMs;
    }
  }

  return [int(usedMs), int(graceMs)];
}

/**
 * Compute demo trial overlay status.
 *
 * Modeled after `demo_trial_overlay_render` (0x004047c0) call sites and time formatting.
 *
 * Notes:
 *   - `globalPlaytimeMs` maps to `game_status_blob.game_sequence_id` (ms).
 *   - `questGraceElapsedMs` maps to `demo_trial_elapsed_ms` (ms) once activated.
 */
export function demoTrialOverlayInfo(opts: {
  demoBuild: boolean;
  gameModeId: GameMode;
  globalPlaytimeMs: number;
  questGraceElapsedMs: number;
  questLevel: QuestLevel | null;
}): DemoTrialOverlayInfo {
  const { demoBuild, gameModeId, questLevel } = opts;

  if (!demoBuild) {
    return new DemoTrialOverlayInfo(false, 'none', 0, formatDemoTrialTime(0), false);
  }

  if (gameModeId === GameMode.TUTORIAL) {
    return new DemoTrialOverlayInfo(false, 'none', 0, formatDemoTrialTime(0), false);
  }

  const usedMs = Math.max(0, int(opts.globalPlaytimeMs));
  const graceMs = Math.max(0, int(opts.questGraceElapsedMs));

  const globalRemainingMs = Math.max(0, DEMO_TOTAL_PLAY_TIME_MS - usedMs);
  const graceRemainingMs = Math.max(0, DEMO_QUEST_GRACE_TIME_MS - graceMs);

  const tierLocked =
    gameModeId === GameMode.QUESTS &&
    questLevel !== null &&
    (int(questLevel.major) > 1 || int(questLevel.minor) > 10);

  if (graceMs > 0) {
    if (graceRemainingMs <= 0) {
      return new DemoTrialOverlayInfo(true, 'time_up', 0, formatDemoTrialTime(0), false);
    }
    if (tierLocked) {
      return new DemoTrialOverlayInfo(
        true,
        'quest_tier_limit',
        int(graceRemainingMs),
        formatDemoTrialTime(graceRemainingMs),
        false,
      );
    }
    // During the quest-only grace period, the classic demo blocks other modes
    // and points the player back to Quests.
    if (gameModeId !== GameMode.QUESTS) {
      return new DemoTrialOverlayInfo(
        true,
        'quest_grace_left',
        int(graceRemainingMs),
        formatDemoTrialTime(graceRemainingMs),
        false,
      );
    }
    return new DemoTrialOverlayInfo(
      false,
      'none',
      int(graceRemainingMs),
      formatDemoTrialTime(graceRemainingMs),
      false,
    );
  }

  if (globalRemainingMs <= 0) {
    return new DemoTrialOverlayInfo(true, 'time_up', 0, formatDemoTrialTime(0), false);
  }

  // Demo tier gating: the classic demo lets you play stage 1 quests only; once
  // the player reaches stage > 1, it shows the upsell overlay even if time remains.
  if (tierLocked) {
    return new DemoTrialOverlayInfo(
      true,
      'quest_tier_limit',
      int(globalRemainingMs),
      formatDemoTrialTime(globalRemainingMs),
      true,
    );
  }

  return new DemoTrialOverlayInfo(
    false,
    'none',
    int(globalRemainingMs),
    formatDemoTrialTime(globalRemainingMs),
    false,
  );
}
