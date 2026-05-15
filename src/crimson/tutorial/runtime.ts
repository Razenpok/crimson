// Port of crimson/tutorial/runtime.py

import { SfxId } from '@grim/sfx-map.ts';
import { CreatureFlags } from '@crimson/creatures/runtime.ts';
import { SpawnId } from '@crimson/creatures/spawn.ts';
import { survivalCheckLevelUp } from '@crimson/gameplay.ts';
import type { PlayerInput } from '@crimson/sim/input.ts';
import { WorldState } from '@crimson/sim/world-state.ts';
import { TutorialOverlayState } from './state.ts';
import { type TutorialFrameActions, tickTutorialTimeline } from './timeline.ts';
import type { PostStepContext } from '@crimson/sim/sessions.ts';


export function tutorialBeforeStep(world: WorldState): void {
  const tutorial = world.state.tutorial;
  tutorial.preserveBugs = Boolean(world.state.preserveBugs);
  const hintRef = tutorial.hintBonusCreatureRef;
  tutorial.hintBonusAliveBeforeTick = false;
  if (hintRef === null || !(0 <= int(hintRef) && int(hintRef) < world.creatures.entries.length)) {
    return;
  }
  const entry = world.creatures.entries[int(hintRef)];
  tutorial.hintBonusAliveBeforeTick = Boolean(entry.active && entry.hp > 0.0);
}


export function tutorialInputTransform(
  world: WorldState,
  inputs: PlayerInput[],
): PlayerInput[] {
  const tutorial = world.state.tutorial;
  if (inputs.length > 0) {
    const primary = inputs[0];
    tutorial.moveActiveThisTick = primary.move.lengthSq() > 0.0;
    tutorial.fireActiveThisTick = Boolean(primary.firePressed || primary.fireDown);
  } else {
    tutorial.moveActiveThisTick = false;
    tutorial.fireActiveThisTick = false;
  }
  return [...inputs];
}


function _tutorialOverlayFromActions(actions: TutorialFrameActions): TutorialOverlayState {
  return new TutorialOverlayState({
    promptText: String(actions.promptText),
    promptAlpha: actions.promptAlpha,
    hintText: String(actions.hintText),
    hintAlpha: actions.hintAlpha,
  });
}


export function tutorialPostStep(ctx: PostStepContext): void {
  const state = ctx.world.state;
  const tutorial = state.tutorial;
  const hintRef = tutorial.hintBonusCreatureRef;
  let hintAliveAfter = false;
  if (hintRef !== null && 0 <= int(hintRef) && int(hintRef) < ctx.world.creatures.entries.length) {
    const entry = ctx.world.creatures.entries[int(hintRef)];
    hintAliveAfter = Boolean(entry.active && entry.hp > 0.0);
  }
  const hintBonusDied = Boolean(tutorial.hintBonusAliveBeforeTick && !hintAliveAfter);

  const [updatedTutorial, actions] = tickTutorialTimeline(
    tutorial,
    {
      frameDtMs: ctx.dtSimMs,
      anyMoveActive: Boolean(tutorial.moveActiveThisTick),
      anyFireActive: Boolean(tutorial.fireActiveThisTick),
      creaturesNoneActive: !ctx.world.creatures.iterActive().length,
      bonusPoolEmpty: !state.bonusPool.iterActive().length,
      perkPendingCount: int(state.perkSelection.pendingCount),
      hintBonusDied,
    },
  );
  updatedTutorial.moveActiveThisTick = false;
  updatedTutorial.fireActiveThisTick = false;
  updatedTutorial.hintBonusAliveBeforeTick = false;
  state.tutorial = updatedTutorial;
  state.tutorialOverlay = _tutorialOverlayFromActions(actions);

  const players = ctx.world.players;
  if (players.length > 0) {
    players[0].health = actions.forcePlayerHealth;
    if (actions.forcePlayerExperience !== null) {
      players[0].experience = int(actions.forcePlayerExperience);
      survivalCheckLevelUp(players[0], state.perkSelection);
    }
  }

  if (Boolean(actions.playLevelupSfx)) {
    state.sfxQueue.push(SfxId.UI_LEVELUP);
  }

  for (const call of actions.spawnBonuses) {
    const spawned = state.bonusPool.spawnAt(
      call.pos,
      call.bonusId,
      int(call.amount),
      { state, worldWidth: ctx.worldSize, worldHeight: ctx.worldSize },
    );
    if (spawned !== null) {
      state.effects.spawnBurst({
        pos: spawned.pos,
        count: 12,
        rng: state.rng,
        detailPreset: int(ctx.detailPreset),
      });
    }
  }

  for (const call of actions.spawnTemplates) {
    const [mapping, primary] = ctx.world.creatures.spawnTemplate(
      call.templateId,
      call.pos,
      call.heading,
      state.rng,
    );
    void mapping;
    if (primary === null || actions.stage5BonusCarrierDrop === null) {
      continue;
    }
    if (int(call.templateId) !== int(SpawnId.ALIEN_CONST_WEAPON_BONUS_27)) {
      continue;
    }
    const [dropId, dropAmount] = actions.stage5BonusCarrierDrop;
    updatedTutorial.hintBonusCreatureRef = int(primary);
    if (0 <= int(primary) && int(primary) < ctx.world.creatures.entries.length) {
      const creature = ctx.world.creatures.entries[int(primary)];
      creature.flags |= CreatureFlags.BONUS_ON_DEATH;
      creature.bonusId = dropId;
      creature.bonusDurationOverride = int(dropAmount);
    }
  }

  state.tutorial = updatedTutorial;
}
