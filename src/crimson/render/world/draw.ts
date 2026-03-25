// Port of crimson/render/world/draw.py — main draw orchestrator

import * as wgl from '@wgl';
import { RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { RGBA } from '@grim/color.ts';
import { fxDetailEnabled } from '@grim/config.ts';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import { CreatureFlags, CreatureTypeId } from '@crimson/creatures/spawn.ts';
import type { CreatureState } from '@crimson/creatures/runtime.ts';
import { EffectId, effectSrcRect } from '@crimson/effects-atlas.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import { CREATURE_ANIM, CREATURE_ASSET } from '@crimson/sim/world-defs.ts';
import { drawBonusHoverLabels, drawBonusPickups } from './bonuses.ts';
import { monsterVisionFadeAlpha, RAD_TO_DEG } from './constants.ts';
import { WorldRenderCtx } from './context.ts';
import { drawCreatureSprite } from './creatures.ts';
import { drawEffectPool, drawParticlePool, drawSpriteEffectPool } from './effects.ts';
import { drawAimCircle, drawClockGauge, drawDirectionArrows } from './overlays.ts';
import { beginPass, endPass } from './profile-hooks.ts';
import { drawProjectile, drawSecondaryProjectile, drawSharpshooterLaserSight } from './projectiles.ts';
import { drawPlayerTrooperSprite } from './trooper.ts';
import * as viewport from './viewport.ts';

import { drawAimCursor } from '@crimson/ui/cursor.ts';

const CREATURE_TEXTURE_IDS: Record<string, TextureId> = {
  alien: TextureId.ALIEN,
  lizard: TextureId.LIZARD,
  spider_sp1: TextureId.SPIDER_SP1,
  spider_sp2: TextureId.SPIDER_SP2,
  trooper: TextureId.TROOPER,
  zombie: TextureId.ZOMBIE,
};

const NATIVE_CREATURE_SPRITE_DRAW_ORDER: CreatureTypeId[] = [
  CreatureTypeId.ZOMBIE,
  CreatureTypeId.SPIDER_SP1,
  CreatureTypeId.SPIDER_SP2,
  CreatureTypeId.ALIEN,
  CreatureTypeId.LIZARD,
];

export interface WorldDrawContext {
  readonly camera: Vec2;
  readonly viewScale: Vec2;
  readonly scale: number;
  readonly entityAlpha: number;
  readonly trooperTexture: wgl.Texture | null;
  readonly particlesTexture: wgl.Texture | null;
  readonly monsterVision: boolean;
  readonly monsterVisionSrc: wgl.Rectangle | null;
  readonly poisonSrc: wgl.Rectangle | null;
}

export function drawWorld(
  renderCtx: WorldRenderCtx,
  drawAimIndicatorsEnabled: boolean = true,
  entityAlpha: number = 1.0,
): void {
  entityAlpha = clamp(entityAlpha, 0.0, 1.0);
  const [camera, viewScale, scale, screenSize, outSize] = computeViewTransform(renderCtx);

  const endBg = beginPass('background');
  drawBackground(renderCtx, camera, screenSize, outSize);
  endPass('background');

  if (entityAlpha <= 1e-3) return;

  wgl.setAlphaTest(true);
  const drawCtx = buildDrawContext(renderCtx, camera, viewScale, scale, entityAlpha);

  const endPlayersDead = beginPass('players_dead');
  drawPlayers(renderCtx, drawCtx, false);
  endPass('players_dead');

  const endCreatures = beginPass('creatures');
  drawCreatures(renderCtx, drawCtx);
  endPass('creatures');

  const endFreeze = beginPass('freeze_overlay');
  drawFreezeOverlay(renderCtx, drawCtx);
  endPass('freeze_overlay');

  const endPlayersAlive = beginPass('players_alive');
  drawPlayers(renderCtx, drawCtx, true);
  endPass('players_alive');

  const endProjEffects = beginPass('projectiles_effects');
  drawProjectilesAndEffects(renderCtx, drawCtx);
  endPass('projectiles_effects');

  const endBonusUi = beginPass('bonus_ui');
  drawBonusAndUi(renderCtx, drawCtx, drawAimIndicatorsEnabled);
  endPass('bonus_ui');

  wgl.setAlphaTest(false);
}

export function computeViewTransform(
  renderCtx: WorldRenderCtx,
): [Vec2, Vec2, number, Vec2, Vec2] {
  const frame = renderCtx.frame;
  const outW = wgl.getScreenWidth();
  const outH = wgl.getScreenHeight();
  const outSize = new Vec2(outW, outH);
  const [camera, viewScale, screenSize] = viewport.viewTransform(
    frame.worldSize,
    frame.config,
    frame.camera,
    outSize,
  );
  const scale = viewport.viewScaleAvg(viewScale);
  return [camera, viewScale, scale, screenSize, outSize];
}

function drawBackground(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  screenSize: Vec2,
  outSize: Vec2,
): void {
  wgl.clearBackground(wgl.makeColor(10 / 255, 10 / 255, 12 / 255, 1));
  const ground = renderCtx.frame.ground;
  if (ground !== null) {
    ground.drawView(
      camera,
      screenSize.x,
      screenSize.y,
      outSize.x,
      outSize.y,
    );
  }
}

function effectSrcRectFromTexture(
  texture: wgl.Texture,
  effectId: EffectId,
): wgl.Rectangle | null {
  return effectSrcRect(effectId, texture.width, texture.height) as wgl.Rectangle | null;
}

function buildDrawContext(
  renderCtx: WorldRenderCtx,
  camera: Vec2,
  viewScale: Vec2,
  scale: number,
  entityAlpha: number,
): WorldDrawContext {
  const frame = renderCtx.frame;
  const resources = frame.resources;
  const trooperAsset = CREATURE_ASSET.get(CreatureTypeId.TROOPER) ?? null;
  const trooperTexture = creatureTexture(resources, trooperAsset);
  const particlesTexture = getTexture(resources, TextureId.PARTICLES);

  const monsterVision = frame.players.length > 0 && perkActive(frame.players[0], PerkId.MONSTER_VISION);
  let monsterVisionSrc: wgl.Rectangle | null = null;
  if (monsterVision) {
    monsterVisionSrc = effectSrcRectFromTexture(particlesTexture, EffectId.AURA);
  }
  const poisonSrc = effectSrcRectFromTexture(particlesTexture, EffectId.AURA);

  return {
    camera,
    viewScale,
    scale,
    entityAlpha,
    trooperTexture,
    particlesTexture,
    monsterVision,
    monsterVisionSrc,
    poisonSrc,
  };
}

function drawPlayer(
  renderCtx: WorldRenderCtx,
  player: PlayerState,
  ctx: WorldDrawContext,
): void {
  if (ctx.trooperTexture !== null) {
    drawPlayerTrooperSprite(
      renderCtx,
      ctx.trooperTexture,
      player,
      ctx.camera,
      ctx.viewScale,
      ctx.scale,
      ctx.entityAlpha,
    );
    return;
  }

  // Fallback: colored circle
  const screen = WorldRenderCtx.worldToScreenWith(player.pos, ctx.camera, ctx.viewScale);
  const r = Math.max(1.0, 14.0 * ctx.scale);
  const size = r * 2;
  const whTex = wgl.getWhiteTexture();
  const tint = wgl.makeColor(90 / 255, 190 / 255, 120 / 255, ctx.entityAlpha);
  wgl.drawTexturePro(
    whTex, wgl.makeRectangle(0, 0, 1, 1),
    wgl.makeRectangle(screen.x, screen.y, size, size),
    wgl.makeVector2(size * 0.5, size * 0.5),
    0, tint,
  );
}

function drawPlayers(
  renderCtx: WorldRenderCtx,
  ctx: WorldDrawContext,
  alive: boolean,
): void {
  for (const player of renderCtx.frame.players) {
    if (alive && player.health <= 0.0) continue;
    if (!alive && player.health > 0.0) continue;
    drawPlayer(renderCtx, player, ctx);
  }
}

function iterActiveCreatureOverlayPass(creatures: CreatureState[]): CreatureState[] {
  return creatures.filter((c) => c.active);
}

function iterNativeCreatureSpritePass(creatures: CreatureState[]): CreatureState[] {
  const result: CreatureState[] = [];
  for (const typeId of NATIVE_CREATURE_SPRITE_DRAW_ORDER) {
    for (const creature of creatures) {
      if (creature.active && creature.typeId === typeId) {
        result.push(creature);
      }
    }
  }
  return result;
}

function drawCreatureOverlays(
  renderCtx: WorldRenderCtx,
  creature: CreatureState,
  screen: Vec2,
  lifecycleStage: number,
  ctx: WorldDrawContext,
): void {
  const fade = monsterVisionFadeAlpha(lifecycleStage);

  if (ctx.monsterVision && ctx.particlesTexture !== null && ctx.monsterVisionSrc !== null) {
    const mvAlpha = fade * ctx.entityAlpha;
    if (mvAlpha > 1e-3) {
      const size = 90.0 * ctx.scale;
      const dst = wgl.makeRectangle(screen.x, screen.y, size, size);
      const origin = wgl.makeVector2(size * 0.5, size * 0.5);
      const tint = wgl.makeColor(1, 1, 0, clamp(mvAlpha, 0.0, 1.0));
      wgl.drawTexturePro(ctx.particlesTexture, ctx.monsterVisionSrc, dst, origin, 0.0, tint);
    }
  }

  if (ctx.particlesTexture !== null && ctx.poisonSrc !== null && creature.plagueInfected) {
    const plagueAlpha = fade * ctx.entityAlpha;
    if (plagueAlpha > 1e-3) {
      const size = 80.0 * ctx.scale;
      const dst = wgl.makeRectangle(screen.x, screen.y, size, size);
      const origin = wgl.makeVector2(size * 0.5, size * 0.5);
      const tint = wgl.makeColor(0, 0, 0, clamp(plagueAlpha, 0.0, 1.0));
      wgl.drawTexturePro(ctx.particlesTexture, ctx.poisonSrc, dst, origin, 0.0, tint);
    }
  }

  if (
    ctx.particlesTexture !== null &&
    ctx.poisonSrc !== null &&
    ((creature.flags as number) & CreatureFlags.SELF_DAMAGE_TICK)
  ) {
    const poisonAlpha = fade * ctx.entityAlpha;
    if (poisonAlpha > 1e-3) {
      const size = 60.0 * ctx.scale;
      const dst = wgl.makeRectangle(screen.x, screen.y, size, size);
      const origin = wgl.makeVector2(size * 0.5, size * 0.5);
      const tint = wgl.makeColor(1, 0, 0, clamp(poisonAlpha, 0.0, 1.0));
      wgl.drawTexturePro(ctx.particlesTexture, ctx.poisonSrc, dst, origin, 0.0, tint);
    }
  }
}

function drawCreatures(renderCtx: WorldRenderCtx, ctx: WorldDrawContext): void {
  const frame = renderCtx.frame;
  const creatureEntries = frame.creatures.entries as CreatureState[];

  for (const creature of iterActiveCreatureOverlayPass(creatureEntries)) {
    const screen = WorldRenderCtx.worldToScreenWith(creature.pos, ctx.camera, ctx.viewScale);
    const lifecycleStage = creature.lifecycleStage;
    drawCreatureOverlays(renderCtx, creature, screen, lifecycleStage, ctx);
  }

  const resources = frame.resources;
  for (const creature of iterNativeCreatureSpritePass(creatureEntries)) {
    const screen = WorldRenderCtx.worldToScreenWith(creature.pos, ctx.camera, ctx.viewScale);
    const lifecycleStage = creature.lifecycleStage;

    const typeId = creature.typeId;
    const asset = CREATURE_ASSET.get(typeId) ?? null;
    const texture = creatureTexture(resources, asset);

    if (texture === null) {
      // Fallback circle
      const r = Math.max(1.0, creature.size * 0.5 * ctx.scale);
      const size = r * 2;
      const tint = wgl.makeColor(220 / 255, 90 / 255, 90 / 255, ctx.entityAlpha);
      wgl.drawTexturePro(
        wgl.getWhiteTexture(),
        wgl.makeRectangle(0, 0, 1, 1),
        wgl.makeRectangle(screen.x, screen.y, size, size),
        wgl.makeVector2(size * 0.5, size * 0.5),
        0,
        tint,
      );
      continue;
    }

    const info = CREATURE_ANIM.get(typeId);
    if (!info) continue;

    let tintRgba = creature.tint;

    // Energizer tint
    const energizerTimer = frame.state.bonuses.energizer;
    if (energizerTimer > 0.0 && creature.max_hp < 500.0) {
      let t = energizerTimer;
      if (t >= 1.0) t = 1.0;
      else if (t < 0.0) t = 0.0;
      tintRgba = RGBA.lerp(tintRgba, new RGBA(0.5, 0.5, 1.0, 1.0), t);
    }

    if (lifecycleStage < 0.0) {
      tintRgba = tintRgba.withAlpha(Math.max(0.0, tintRgba.a + lifecycleStage * 0.1));
    }

    const scaledTint = tintRgba.scaledAlpha(ctx.entityAlpha).clamped();
    const tint = wgl.makeColor(scaledTint.r, scaledTint.g, scaledTint.b, scaledTint.a);

    const sizeScale = clamp(creature.size / 64.0, 0.25, 2.0);
    const config = frame.config;
    const fxDetail = config !== null ? fxDetailEnabled(config.display, 0) : true;
    const shadow = fxDetail && (!frame.players.length || !perkActive(frame.players[0], PerkId.MONSTER_VISION));
    const longStrip =
      ((creature.flags as number) & CreatureFlags.ANIM_PING_PONG) === 0 ||
      ((creature.flags as number) & CreatureFlags.ANIM_LONG_STRIP) !== 0;

    let phase = creature.anim_phase;
    if (longStrip) {
      if (lifecycleStage < 0.0) {
        phase = -1.0;
      } else if (lifecycleStage < 16.0) {
        phase = (info.base + 0x0f) - lifecycleStage - 0.5;
      }
    }

    let shadowAlpha: number | null = null;
    if (shadow) {
      let shadowA = creature.tint.a * 0.4;
      if (lifecycleStage < 0.0) {
        shadowA += lifecycleStage * (longStrip ? 0.5 : 0.1);
        shadowA = Math.max(0.0, shadowA);
      }
      shadowAlpha = (clamp(shadowA * ctx.entityAlpha * 255.0, 0.0, 255.0) + 0.5) | 0;
    }

    drawCreatureSprite(
      renderCtx,
      texture,
      typeId || CreatureTypeId.ZOMBIE,
      creature.flags as CreatureFlags,
      phase,
      info.mirror && lifecycleStage >= 16.0,
      shadowAlpha,
      creature.pos,
      screen,
      creature.heading - Math.PI / 2.0,
      ctx.scale,
      sizeScale,
      tint,
      shadow,
    );
  }
}

function drawFreezeOverlay(renderCtx: WorldRenderCtx, ctx: WorldDrawContext): void {
  if (ctx.particlesTexture === null) return;

  const freezeTimer = renderCtx.frame.state.bonuses.freeze;
  if (freezeTimer <= 0.0) return;

  const src = effectSrcRectFromTexture(ctx.particlesTexture, EffectId.FREEZE_SHATTER);
  if (src === null) return;

  const fade = freezeTimer >= 1.0 ? 1.0 : clamp(freezeTimer, 0.0, 1.0);
  const freezeAlpha = clamp(fade * ctx.entityAlpha * 0.7, 0.0, 1.0);
  if (freezeAlpha <= 1e-3) return;

  const tint = wgl.makeColor(1, 1, 1, freezeAlpha);
  wgl.endBlendMode();
  const creatures = renderCtx.frame.creatures.entries as CreatureState[];
  for (let idx = 0; idx < creatures.length; idx++) {
    const creature = creatures[idx];
    if (!creature.active) continue;
    const size = creature.size * ctx.scale;
    if (size <= 1e-3) continue;
    const creatureScreen = WorldRenderCtx.worldToScreenWith(creature.pos, ctx.camera, ctx.viewScale);
    const dst = wgl.makeRectangle(creatureScreen.x, creatureScreen.y, size, size);
    const origin = wgl.makeVector2(size * 0.5, size * 0.5);
    const rotationDeg = (idx * 0.01 + creature.heading) * RAD_TO_DEG;
    wgl.drawTexturePro(ctx.particlesTexture!, src, dst, origin, rotationDeg, tint);
  }
  wgl.endBlendMode();
}

function drawProjectilesAndEffects(renderCtx: WorldRenderCtx, ctx: WorldDrawContext): void {
  const frame = renderCtx.frame;

  beginPass('laser_sight');
  drawSharpshooterLaserSight(renderCtx, ctx.camera, ctx.viewScale, ctx.scale, ctx.entityAlpha);
  endPass('laser_sight');

  beginPass('primary_projectiles');
  const projectiles = frame.state.projectiles.entries;
  for (let projIndex = 0; projIndex < projectiles.length; projIndex++) {
    const proj = projectiles[projIndex];
    if (!proj.active) continue;
    drawProjectile(
      renderCtx, proj, projIndex,
      ctx.camera, ctx.viewScale, ctx.scale, ctx.entityAlpha,
    );
  }
  endPass('primary_projectiles');

  beginPass('particle_pool');
  drawParticlePool(renderCtx, ctx.camera, ctx.viewScale, ctx.entityAlpha);
  endPass('particle_pool');

  beginPass('secondary_projectiles');
  const secondaryProjectiles = frame.state.secondaryProjectiles.entries;
  for (const proj of secondaryProjectiles) {
    if (!proj.active) continue;
    drawSecondaryProjectile(
      renderCtx, proj,
      ctx.camera, ctx.viewScale, ctx.scale, ctx.entityAlpha,
    );
  }
  endPass('secondary_projectiles');

  beginPass('sprite_effect_pool');
  drawSpriteEffectPool(renderCtx, ctx.camera, ctx.viewScale, ctx.entityAlpha);
  endPass('sprite_effect_pool');

  beginPass('effect_pool');
  drawEffectPool(renderCtx, ctx.camera, ctx.viewScale, ctx.entityAlpha);
  endPass('effect_pool');
}

function iterVisibleAimPlayers(renderCtx: WorldRenderCtx): PlayerState[] {
  const frame = renderCtx.frame;
  const players = frame.players;
  if (!frame.lanLocalAimIndicatorsOnly) return [...players];
  const localSlot = frame.lanLocalPlayerSlotIndex;
  return players.filter((player) => player.index === localSlot);
}

export function drawAimIndicators(
  renderCtx: WorldRenderCtx,
  ctx: WorldDrawContext,
  worldToScreenWith?: ((pos: Vec2, camera: Vec2, viewScale: Vec2) => Vec2) | null,
  drawAimCircleFn?: ((center: Vec2, radius: number, alpha: number) => void) | null,
  drawClockGaugeFn?: ((pos: Vec2, ms: number, scale: number, alpha: number) => void) | null,
): void {
  const transform = worldToScreenWith ?? ((pos: Vec2, camera: Vec2, viewScale: Vec2) =>
    WorldRenderCtx.worldToScreenWith(pos, camera, viewScale));

  const drawCircle = drawAimCircleFn ?? ((center: Vec2, radius: number, alpha: number) =>
    drawAimCircle(renderCtx, center, radius, alpha));

  const drawGauge = drawClockGaugeFn ?? ((pos: Vec2, ms: number, scale: number, alpha: number) =>
    drawClockGauge(renderCtx, pos, ms, scale, alpha));

  for (const player of iterVisibleAimPlayers(renderCtx)) {
    if (player.health <= 0.0) continue;

    const aim = player.aim;
    const dist = player.pos.distanceTo(player.aim);
    const radius = Math.max(6.0, dist * player.spreadHeat * 0.5);
    const aimScreen = transform(aim, ctx.camera, ctx.viewScale);
    const screenRadius = Math.max(1.0, radius * ctx.scale);
    drawCircle(aimScreen, screenRadius, ctx.entityAlpha);

    const reloadTimer = player.weapon.reloadTimer;
    const reloadMax = player.weapon.reloadTimerMax;
    if (reloadMax > 1e-6 && reloadTimer > 1e-6) {
      const progress = reloadTimer / reloadMax;
      if (progress > 0.0) {
        const ms = (progress * 60000.0) | 0;
        drawGauge(
          new Vec2(aimScreen.x | 0, aimScreen.y | 0),
          ms, ctx.scale, ctx.entityAlpha,
        );
      }
    }
  }
}

export function drawAimEnhancements(
  renderCtx: WorldRenderCtx,
  ctx: WorldDrawContext,
  worldToScreenWith?: ((pos: Vec2, camera: Vec2, viewScale: Vec2) => Vec2) | null,
): void {
  const transform = worldToScreenWith ?? ((pos: Vec2, camera: Vec2, viewScale: Vec2) =>
    WorldRenderCtx.worldToScreenWith(pos, camera, viewScale));

  for (const player of iterVisibleAimPlayers(renderCtx)) {
    if (player.health <= 0.0) continue;
    const aimScreen = transform(player.aim, ctx.camera, ctx.viewScale);
    drawAimCursor(
      ctx.particlesTexture,
      getTexture(renderCtx.frame.resources, TextureId.UI_AIM),
      aimScreen,
    );
  }
}

function creatureTexture(resources: RuntimeResources, assetName: string | null): wgl.Texture | null {
  if (assetName === null) return null;
  const textureId = CREATURE_TEXTURE_IDS[assetName];
  if (textureId === undefined) return null;
  return getTexture(resources, textureId);
}

function drawBonusAndUi(
  renderCtx: WorldRenderCtx,
  ctx: WorldDrawContext,
  drawAimIndicatorsEnabled: boolean,
): void {
  beginPass('bonus_pickups');
  drawBonusPickups(renderCtx, ctx.camera, ctx.viewScale, ctx.scale, ctx.entityAlpha);
  endPass('bonus_pickups');

  beginPass('bonus_labels');
  drawBonusHoverLabels(renderCtx, ctx.camera, ctx.viewScale, ctx.entityAlpha);
  endPass('bonus_labels');

  const drawWorldAim = drawAimIndicatorsEnabled && !renderCtx.frame.demoModeActive;
  if (drawWorldAim) {
    beginPass('aim_indicators');
    drawAimIndicators(renderCtx, ctx);
    endPass('aim_indicators');
  }

  beginPass('direction_arrows');
  drawDirectionArrows(renderCtx, ctx.camera, ctx.viewScale, ctx.scale, ctx.entityAlpha);
  endPass('direction_arrows');

  if (drawWorldAim) {
    beginPass('aim_enhancements');
    drawAimEnhancements(renderCtx, ctx);
    endPass('aim_enhancements');
  }
}
