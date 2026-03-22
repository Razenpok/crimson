// Port of crimson/quests/runtime.py

import type { CrandLike } from '@grim/rand.ts';
import { Crand } from '@grim/rand.ts';
import { SpawnId } from '@crimson/creatures/spawn-ids.ts';
import type { QuestContext, QuestDefinition, SpawnEntry } from './types.ts';

const QUEST_COMPLETION_HIT_SFX_START_MS = 800.0;
const QUEST_COMPLETION_HIT_SFX_END_MS = 0x353;
const QUEST_COMPLETION_MUSIC_START_MS = 2000.0;
const QUEST_COMPLETION_MUSIC_END_MS = 0x803;
const QUEST_COMPLETION_TRANSITION_MS = 0x9C4;

export function applyHardcoreSpawnTableAdjustment(entries: SpawnEntry[]): SpawnEntry[] {
  // Apply quest hardcore spawn-table count adjustment.
  // Modeled after the quest start logic in the classic game, which bumps `SpawnEntry.count`
  // for most multi-spawn entries in hardcore mode.
  const adjusted: SpawnEntry[] = [];
  for (const entry of entries) {
    const spawnId = entry.spawnId;
    let count = entry.count;
    if (count > 1 && spawnId !== SpawnId.SPIDER_SP1_CONST_RANGED_VARIANT_3C) {
      if (spawnId === SpawnId.ALIEN_CONST_RED_FAST_2B) {
        count += 2;
      } else {
        count += 8;
      }
    }
    adjusted.push(count === entry.count ? entry : { ...entry, count });
  }
  return adjusted;
}

export function buildQuestSpawnTable(
  quest: QuestDefinition,
  ctx: QuestContext,
  opts?: {
    rng?: CrandLike | null;
    hardcore?: boolean;
    fullVersion?: boolean;
  },
): readonly SpawnEntry[] {
  const builderRng = opts?.rng ?? new Crand();
  const fullVersion = opts?.fullVersion ?? true;
  let entries = quest.builder(ctx, { rng: builderRng, fullVersion });
  if (opts?.hardcore) {
    entries = applyHardcoreSpawnTableAdjustment([...entries]);
  }
  return entries;
}

export function tickQuestCompletionTransition(
  completionTransitionMs: number,
  frameDtMs: number,
  opts: {
    creaturesNoneActive: boolean;
    spawnTableEmpty: boolean;
  },
): {
  completionTransitionMs: number;
  completed: boolean;
  playHitSfx: boolean;
  playCompletionMusic: boolean;
} {
  // Advance quest completion transition timer.
  // The quest-mode update loop waits for a short delay after the quest is "idle complete"
  // (no active creatures + no remaining spawn table entries) before transitioning to the
  // results screen.

  const dtMs = frameDtMs;
  let timerMs = completionTransitionMs;

  if (opts.creaturesNoneActive && opts.spawnTableEmpty) {
    if (timerMs < 0.0) {
      // Native quest_mode_update seeds the timer with the frame delta.
      return { completionTransitionMs: dtMs, completed: false, playHitSfx: false, playCompletionMusic: false };
    }
    if (QUEST_COMPLETION_HIT_SFX_START_MS < timerMs && timerMs < QUEST_COMPLETION_HIT_SFX_END_MS) {
      // Match the native snap-forward after the quest-hit stinger.
      return { completionTransitionMs: QUEST_COMPLETION_HIT_SFX_END_MS + dtMs, completed: false, playHitSfx: true, playCompletionMusic: false };
    }
    if (QUEST_COMPLETION_MUSIC_START_MS < timerMs && timerMs < QUEST_COMPLETION_MUSIC_END_MS) {
      // Match the native snap-forward before the completion music fade-in.
      return { completionTransitionMs: QUEST_COMPLETION_MUSIC_END_MS + dtMs, completed: false, playHitSfx: false, playCompletionMusic: true };
    }
    const completed = timerMs > QUEST_COMPLETION_TRANSITION_MS;
    return { completionTransitionMs: timerMs + dtMs, completed, playHitSfx: false, playCompletionMusic: false };
  }

  return { completionTransitionMs: -1.0, completed: false, playHitSfx: false, playCompletionMusic: false };
}
