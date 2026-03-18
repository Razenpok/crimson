// Port of crimson/demo_trial.py

import { GameMode } from './game-modes.ts';

export const DEMO_TOTAL_PLAY_TIME_MS = 2_400_000;
export const DEMO_QUEST_GRACE_TIME_MS = 300_000;

export interface QuestLevel {
  readonly major: number;
  readonly minor: number;
}

export function formatDemoTrialTime(ms: number): string {
  let value = ms | 0;
  if (value < 0) value = 0;
  const minutes = (value / 60_000) | 0;
  const seconds = ((value / 1_000) | 0) % 60;
  const centiseconds = ((value % 1_000) / 10) | 0;
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
    return [opts.globalPlaytimeMs | 0, opts.questGraceElapsedMs | 0];
  }

  if (gameModeId === GameMode.TUTORIAL) {
    return [opts.globalPlaytimeMs | 0, opts.questGraceElapsedMs | 0];
  }

  let usedMs = Math.max(0, opts.globalPlaytimeMs | 0);
  let graceMs = Math.max(0, opts.questGraceElapsedMs | 0);
  if (usedMs >= DEMO_TOTAL_PLAY_TIME_MS && graceMs < 1) {
    graceMs = 1;
  }
  usedMs = Math.min(DEMO_TOTAL_PLAY_TIME_MS, usedMs);

  if (overlayVisible) {
    return [usedMs | 0, graceMs | 0];
  }

  const deltaMs = dtMs | 0;
  if (deltaMs <= 0) {
    return [usedMs | 0, graceMs | 0];
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

  return [usedMs | 0, graceMs | 0];
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

  const usedMs = Math.max(0, opts.globalPlaytimeMs | 0);
  const graceMs = Math.max(0, opts.questGraceElapsedMs | 0);

  const globalRemainingMs = Math.max(0, DEMO_TOTAL_PLAY_TIME_MS - usedMs);
  const graceRemainingMs = Math.max(0, DEMO_QUEST_GRACE_TIME_MS - graceMs);

  const tierLocked =
    gameModeId === GameMode.QUESTS &&
    questLevel !== null &&
    ((questLevel.major | 0) > 1 || (questLevel.minor | 0) > 10);

  if (graceMs > 0) {
    if (graceRemainingMs <= 0) {
      return new DemoTrialOverlayInfo(true, 'time_up', 0, formatDemoTrialTime(0), false);
    }
    if (tierLocked) {
      return new DemoTrialOverlayInfo(
        true,
        'quest_tier_limit',
        graceRemainingMs | 0,
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
        graceRemainingMs | 0,
        formatDemoTrialTime(graceRemainingMs),
        false,
      );
    }
    return new DemoTrialOverlayInfo(
      false,
      'none',
      graceRemainingMs | 0,
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
      globalRemainingMs | 0,
      formatDemoTrialTime(globalRemainingMs),
      true,
    );
  }

  return new DemoTrialOverlayInfo(
    false,
    'none',
    globalRemainingMs | 0,
    formatDemoTrialTime(globalRemainingMs),
    false,
  );
}
