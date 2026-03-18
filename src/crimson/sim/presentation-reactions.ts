// Port of crimson/sim/presentation_reactions.py

import { SfxId } from '@grim/sfx-map.ts';
import type { TickResult } from './hooks.ts';
import type { QuestSpawnState } from './sessions.ts';

export interface QuestPresentationReaction {
  readonly playHitSfx: boolean;
  readonly playCompletionMusic: boolean;
}

export interface PostApplyReaction {
  readonly sfx: readonly SfxId[];
  readonly quest: QuestPresentationReaction | null;
}

export function buildPostApplyReaction(opts: {
  tickResult: TickResult;
  questState?: QuestSpawnState | null;
}): PostApplyReaction {
  const { tickResult, questState } = opts;
  if (questState == null) {
    return {
      sfx: Array.from(tickResult.payload.step.postApplySfx),
      quest: null,
    };
  }
  return {
    sfx: Array.from(tickResult.payload.step.postApplySfx),
    quest: {
      playHitSfx: questState.playHitSfx,
      playCompletionMusic: questState.playCompletionMusic,
    },
  };
}

export function applyPostApplyReaction(opts: {
  reaction: PostApplyReaction;
  playSfx: ((sfx: SfxId) => void) | null;
  playCompletionMusic?: (() => void) | null;
}): void {
  const { reaction, playSfx, playCompletionMusic } = opts;
  const quest = reaction.quest;

  if (playSfx) {
    for (const sfx of reaction.sfx) {
      playSfx(sfx);
    }
    if (quest?.playHitSfx) {
      playSfx(SfxId.QUESTHIT);
    }
  }

  if (quest?.playCompletionMusic) {
    playCompletionMusic?.();
  }
}
