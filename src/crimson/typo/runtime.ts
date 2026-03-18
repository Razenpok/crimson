// Port of crimson/typo/runtime.py — Typ'o'Shooter runtime hooks

import { Vec2 } from '../../grim/geom.ts';
import { SfxId } from '../../grim/sfx-map.ts';
import { CreatureTypeId, CreatureAiMode, CreatureFlags } from '../creatures/spawn-ids.ts';
import type { CreatureInit } from '../creatures/runtime.ts';
import { RngCallerStatic } from '../rng-caller-static.ts';
import { PlayerInput } from '../sim/input.ts';
import {
  TypoCharCommand,
  TypoBackspaceCommand,
  TypoSubmitCommand,
} from '../sim/input-providers.ts';
import type { WorldState, MidStepContext, PostStepContext } from '../sim/sessions.ts';
import { enforceTypoPlayerFrame } from './player.ts';
import { tickTypoSpawns } from './spawns.ts';

function _requireSinglePlayerTypo(command: { playerIndex: number }): void {
  if ((command.playerIndex | 0) !== 0) {
    throw new Error('Typ-o Shooter commands are single-player only');
  }
}

function _typeclickSfx(world: WorldState, caller: RngCallerStatic): SfxId {
  if ((world.state.rng.rand(caller) & 1) === 0) {
    return SfxId.UI_TYPECLICK_01;
  }
  return SfxId.UI_TYPECLICK_02;
}

export function applyTypoCommand(
  world: WorldState,
  command: TypoCharCommand | TypoBackspaceCommand | TypoSubmitCommand,
): void {
  _requireSinglePlayerTypo(command);
  const typo = world.state.typo;
  const typing = typo.typing;

  if (command instanceof TypoCharCommand) {
    if (command.ch) {
      typing.pushChar(command.ch);
      world.state.sfxQueue.push(
        _typeclickSfx(world, RngCallerStatic.TYPO_GAMEPLAY_TYPECLICK_CHAR),
      );
    }
  } else if (command instanceof TypoBackspaceCommand) {
    typing.backspace();
    world.state.sfxQueue.push(
      _typeclickSfx(world, RngCallerStatic.TYPO_GAMEPLAY_TYPECLICK_BACKSPACE),
    );
  } else if (command instanceof TypoSubmitCommand) {
    if (!typing.text) return;
    world.state.sfxQueue.push(SfxId.UI_TYPEENTER);

    const activeMask = world.creatures.entries.map((entry) => entry.active);
    const targetIdx = typo.names.findByName(typing.text, activeMask);
    const entered = typing.submit(targetIdx !== null);

    typo.pendingFireTarget = null;
    typo.pendingReload = false;

    if (entered === null) return;

    if (targetIdx !== null) {
      const creature = world.creatures.entries[targetIdx];
      if (creature.active) {
        typo.pendingFireTarget = new Vec2(
          creature.pos.x,
          creature.pos.y,
        );
      }
      return;
    }

    if (entered === 'reload') {
      typo.pendingReload = true;
    }
  } else {
    throw new Error(`unhandled Typ-o command: ${(command as { tag: string }).tag}`);
  }
}

export function typoBeforeStep(world: WorldState): void {
  for (const player of world.players) {
    enforceTypoPlayerFrame(player, world.state);
  }
}

export function typoMidStep(ctx: MidStepContext): void {
  const typo = ctx.world.state.typo;

  const [cooldown, spawns] = tickTypoSpawns(
    ctx.elapsedBeforeMs | 0,
    typo.spawnCooldownMs | 0,
    ctx.dtSimMs | 0,
    ctx.world.players.length,
    ctx.worldSize,
    ctx.worldSize,
  );
  typo.spawnCooldownMs = cooldown | 0;

  for (const call of spawns) {
    const heading =
      (ctx.world.state.rng.rand(RngCallerStatic.CREATURE_SPAWN_TINTED_HEADING) % 314) * 0.01;
    let size =
      (ctx.world.state.rng.rand(RngCallerStatic.CREATURE_SPAWN_TINTED_SIZE) % 20) + 47;
    let flags = 0;
    let moveSpeed = 1.7;

    if (call.typeId === CreatureTypeId.SPIDER_SP1 || call.typeId === CreatureTypeId.SPIDER_SP2) {
      flags |= CreatureFlags.AI7_LINK_TIMER;
      moveSpeed *= 1.2;
      size *= 0.8;
    }

    const init: CreatureInit = {
      originTemplateId: 0,
      pos: call.pos,
      heading,
      phaseSeed: 0.0,
      typeId: call.typeId,
      flags,
      aiMode: CreatureAiMode.CHASE_PLAYER,
      health: 1.0,
      maxHealth: 1.0,
      moveSpeed,
      rewardValue: 1.0,
      size,
      contactDamage: 100.0,
      tint: call.tintRgba.toTuple(),
      orbitAngle: null,
      orbitRadius: null,
      rangedProjectileType: null,
      aiLinkParent: null,
      aiTimer: null,
      targetOffset: null,
      spawnSlot: null,
      bonusId: null,
      bonusDurationOverride: null,
    };

    const creatureIdx = ctx.world.creatures.spawnInit(init);
    if (creatureIdx === null || creatureIdx === undefined) continue;

    const activeMask = ctx.world.creatures.entries.map((entry) => entry.active);
    typo.names.assignRandom(
      creatureIdx | 0,
      ctx.world.state.rng,
      ctx.world.players.length > 0 ? ctx.world.players[0].experience | 0 : 0,
      activeMask,
      typo.dictionaryWords.length > 0 ? typo.dictionaryWords : null,
      typo.highscoreNames,
    );
  }
}

export function typoPostStep(ctx: PostStepContext): void {
  const state = ctx.world.state;
  state.bonuses.weaponPowerUp = 0.0;
  state.bonuses.reflexBoost = 0.0;
  state.timeScaleActive = false;
  state.bonusPool.reset();
}

export function typoInputTransform(world: WorldState, inputs: PlayerInput[]): PlayerInput[] {
  if (inputs.length === 0) {
    world.state.typo.pendingFireTarget = null;
    world.state.typo.pendingReload = false;
    return [];
  }

  const typo = world.state.typo;
  const primary = inputs[0];
  let aim = primary.aim;
  let fireDown = primary.fireDown;
  let firePressed = primary.firePressed;
  let reloadPressed = primary.reloadPressed;

  if (typo.pendingFireTarget !== null) {
    aim = typo.pendingFireTarget;
    fireDown = true;
    firePressed = true;
  }
  if (typo.pendingReload) {
    reloadPressed = true;
  }

  typo.pendingFireTarget = null;
  typo.pendingReload = false;

  const transformedPrimary = primary.replace({
    move: new Vec2(),
    aim: new Vec2(aim.x, aim.y),
    fireDown,
    firePressed,
    reloadPressed,
    reloadDown: false,
  });

  return [transformedPrimary];
}
