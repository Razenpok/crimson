// Port of crimson/tutorial/runtime.py

import { SfxId } from '../../grim/sfx-map.ts';
import { CreatureFlags, SpawnId } from '../creatures/spawn-ids.ts';
import { survivalCheckLevelUp } from '../gameplay.ts';
import type { PlayerInput } from '../sim/input.ts';
import type { GameplayState, PlayerState } from '../sim/state-types.ts';
import { TutorialOverlayState, TutorialState } from "./state.ts";
import { type TutorialFrameActions, tickTutorialTimeline } from './timeline.ts';
import { Vec2 } from "../../grim/geom.js";
import { BonusId } from "../bonuses/ids.js";
import { CrandLike } from "../../grim/rand.js";


/**
 * Minimal interface for the world object used by tutorial runtime hooks.
 * Avoids a hard dependency on the full WorldState class.
 */
export interface TutorialWorldState {
  state: GameplayState & {
    tutorial: TutorialState;
    tutorialOverlay: TutorialOverlayState;
    preserveBugs: boolean;
    bonusPool: {
      iterActive(): { pos: Vec2 }[];
      spawnAt(opts: {
        pos: Vec2;
        bonusId: BonusId;
        durationOverride: number;
        state: GameplayState;
        worldWidth: number;
        worldHeight: number;
      }): { pos: Vec2 } | null;
    };
    sfxQueue: SfxId[];
    rng: CrandLike;
    effects: {
      spawnBurst(opts: {
        pos: Vec2;
        count: number;
        rng: CrandLike;
        detailPreset: number;
      }): void;
    };
  };
  players: PlayerState[];
  creatures: {
    entries: {
      active: boolean;
      hp: number;
      flags: number;
      bonusId: BonusId;
      bonusDurationOverride: number;
    }[];
    iterActive(): { pos: Vec2 }[];
    spawnTemplate(
      templateId: number,
      pos: Vec2,
      heading: number,
      rng: CrandLike,
    ): [number[], number | null];
  };
}


export interface TutorialStepContext {
  world: TutorialWorldState;
  dtSimMs: number;
  worldSize: number;
  detailPreset: number;
}


export function tutorialBeforeStep(world: TutorialWorldState): void {
  const tutorial = world.state.tutorial;
  tutorial.preserveBugs = world.state.preserveBugs;
  const hintRef = tutorial.hintBonusCreatureRef;
  tutorial.hintBonusAliveBeforeTick = false;
  if (hintRef === null || !(hintRef >= 0 && hintRef < world.creatures.entries.length)) {
    return;
  }
  const entry = world.creatures.entries[hintRef | 0];
  tutorial.hintBonusAliveBeforeTick = entry.active && entry.hp > 0.0;
}


export function tutorialInputTransform(
  world: TutorialWorldState,
  inputs: PlayerInput[],
): PlayerInput[] {
  const tutorial = world.state.tutorial;
  if (inputs.length > 0) {
    const primary = inputs[0];
    tutorial.moveActiveThisTick = primary.move.lengthSq() > 0.0;
    tutorial.fireActiveThisTick = primary.firePressed || primary.fireDown;
  } else {
    tutorial.moveActiveThisTick = false;
    tutorial.fireActiveThisTick = false;
  }
  return [...inputs];
}


function tutorialOverlayFromActions(actions: TutorialFrameActions): TutorialOverlayState {
  const overlay = new TutorialOverlayState();
  overlay.promptText = String(actions.promptText);
  overlay.promptAlpha = +actions.promptAlpha;
  overlay.hintText = String(actions.hintText);
  overlay.hintAlpha = +actions.hintAlpha;
  return overlay;
}


export function tutorialPostStep(ctx: TutorialStepContext): void {
  const state = ctx.world.state;
  const tutorial = state.tutorial;
  const hintRef = tutorial.hintBonusCreatureRef;
  let hintAliveAfter = false;
  if (hintRef !== null && hintRef >= 0 && hintRef < ctx.world.creatures.entries.length) {
    const entry = ctx.world.creatures.entries[hintRef | 0];
    hintAliveAfter = entry.active && entry.hp > 0.0;
  }
  const hintBonusDied = tutorial.hintBonusAliveBeforeTick && !hintAliveAfter;

  const [updatedTutorial, actions] = tickTutorialTimeline(
    tutorial,
    ctx.dtSimMs,
    tutorial.moveActiveThisTick,
    tutorial.fireActiveThisTick,
    !ctx.world.creatures.iterActive().length,
    !state.bonusPool.iterActive().length,
    state.perkSelection.pendingCount | 0,
    hintBonusDied,
  );
  updatedTutorial.moveActiveThisTick = false;
  updatedTutorial.fireActiveThisTick = false;
  updatedTutorial.hintBonusAliveBeforeTick = false;
  state.tutorial = updatedTutorial;
  state.tutorialOverlay = tutorialOverlayFromActions(actions);

  const players = ctx.world.players;
  if (players.length > 0) {
    players[0].health = +actions.forcePlayerHealth;
    if (actions.forcePlayerExperience !== null) {
      players[0].experience = actions.forcePlayerExperience | 0;
      survivalCheckLevelUp(players[0], state.perkSelection);
    }
  }

  if (actions.playLevelupSfx) {
    state.sfxQueue.push(SfxId.UI_LEVELUP);
  }

  for (const call of actions.spawnBonuses) {
    const spawned = state.bonusPool.spawnAt({
      pos: call.pos,
      bonusId: call.bonusId,
      durationOverride: call.amount | 0,
      state: state,
      worldWidth: +ctx.worldSize,
      worldHeight: +ctx.worldSize,
    });
    if (spawned !== null) {
      state.effects.spawnBurst({
        pos: spawned.pos,
        count: 12,
        rng: state.rng,
        detailPreset: ctx.detailPreset | 0,
      });
    }
  }

  for (const call of actions.spawnTemplates) {
    const [mapping, primary] = ctx.world.creatures.spawnTemplate(
      call.templateId,
      call.pos,
      +call.heading,
      state.rng,
    );
    void mapping;
    if (primary === null || actions.stage5BonusCarrierDrop === null) {
      continue;
    }
    if ((call.templateId | 0) !== (SpawnId.ALIEN_CONST_WEAPON_BONUS_27 | 0)) {
      continue;
    }
    const [dropId, dropAmount] = actions.stage5BonusCarrierDrop;
    updatedTutorial.hintBonusCreatureRef = primary | 0;
    if (primary >= 0 && primary < ctx.world.creatures.entries.length) {
      const creature = ctx.world.creatures.entries[primary | 0];
      creature.flags |= CreatureFlags.BONUS_ON_DEATH;
      creature.bonusId = dropId;
      creature.bonusDurationOverride = dropAmount | 0;
    }
  }

  state.tutorial = updatedTutorial;
}
