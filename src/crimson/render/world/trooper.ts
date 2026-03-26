// Port of crimson/render/world/trooper.py

import * as wgl from '@wgl';
import { TextureId, getTexture } from '@grim/assets.ts';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import { EFFECT_ID_ATLAS_TABLE_BY_ID, SIZE_CODE_GRID, EffectId } from '@crimson/effects-atlas.ts';
import { PerkId } from '@crimson/perks/ids.ts';
import { perkActive } from '@crimson/perks/helpers.ts';
import { WEAPON_BY_ID } from '@crimson/weapons.ts';
import type { PlayerState } from '@crimson/sim/state-types.ts';
import { RAD_TO_DEG } from './constants.ts';
import { WorldRenderCtx } from './context.ts';

const LAN_PLAYER_RING_RGB: [number, number, number][] = [
  [77, 77, 255],
  [255, 140, 89],
  [90, 240, 255],
  [255, 120, 230],
];

export function lanPlayerRingRgb(playerIndex: number): [number, number, number] {
  const idx = Math.max(0, Math.min(LAN_PLAYER_RING_RGB.length - 1, int(playerIndex)));
  return LAN_PLAYER_RING_RGB[idx];
}

export function drawLanPlayerRing(
  renderCtx: WorldRenderCtx,
  opts: { player: PlayerState; screenPos: Vec2; baseSize: number; scale: number; alpha: number },
): void {
  const player = opts.player;
  const screenPos = opts.screenPos;
  const baseSize = opts.baseSize;
  const scale = opts.scale;
  let alpha = opts.alpha;
  const frame = renderCtx.frame;
  if (!frame.lanPlayerRingsEnabled) return;
  if (frame.players.length <= 1) return;
  if (player.health <= 0.0) return;
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const [red, green, blue] = lanPlayerRingRgb(player.index);
  const outer = Math.max(8.0 * scale, baseSize * 0.58);
  const thickness = Math.max(2.5 * scale, baseSize * 0.11);
  const inner = Math.max(0.0, outer - thickness);
  const glowOuter = outer + Math.max(2.0 * scale, baseSize * 0.08);

  // Approximate ring with a color quad since WebGLContext doesn't have drawRing.
  // Use additive blend with the white texture as a filled circle approximation.
  const coreAlpha = clamp(alpha * 0.9, 0.0, 1.0);
  const glowAlpha = clamp(alpha * 0.35, 0.0, 1.0);

  wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);

  // Core ring approximation: draw a color quad at the ring location.
  // A proper ring shader would be better, but this is a reasonable approximation.
  const whTex = wgl.getWhiteTexture();
  const ringSize = outer * 2.0;
  const src = wgl.makeRectangle(0, 0, 1, 1);
  const dst = wgl.makeRectangle(
    screenPos.x - outer, screenPos.y - outer, ringSize, ringSize,
  );
  const origin = wgl.makeVector2(0, 0);
  const coreTint = wgl.makeColor(
    red / 255, green / 255, blue / 255, coreAlpha * 0.3,
  );
  wgl.drawTexturePro(whTex, src, dst, origin, 0, coreTint);

  // Glow ring
  const glowSize = glowOuter * 2.0;
  const glowDst = wgl.makeRectangle(
    screenPos.x - glowOuter, screenPos.y - glowOuter, glowSize, glowSize,
  );
  const glowTint = wgl.makeColor(
    red / 255, green / 255, blue / 255, glowAlpha * 0.2,
  );
  wgl.drawTexturePro(whTex, src, glowDst, origin, 0, glowTint);

  wgl.endBlendMode();
}

export function drawPlayerTrooperSprite(
  renderCtx: WorldRenderCtx,
  texture: wgl.Texture,
  player: PlayerState,
  opts: { camera: Vec2; viewScale: Vec2; scale: number; alpha?: number },
): void {
  const camera = opts.camera;
  const viewScale = opts.viewScale;
  const scale = opts.scale;
  let alpha = opts.alpha ?? 1.0;
  alpha = clamp(alpha, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const renderFrame = renderCtx.frame;
  const resources = renderFrame.resources;
  const particlesTexture = getTexture(resources, TextureId.PARTICLES);
  const muzzleFlashTexture = getTexture(resources, TextureId.MUZZLE_FLASH);
  const spriteGrid = 8;
  const cell = spriteGrid > 0 ? texture.width / spriteGrid : texture.width;
  if (cell <= 0.0) return;

  const screenPos = WorldRenderCtx.worldToScreenWith(player.pos, camera, viewScale);
  const baseSize = player.size * scale;
  const baseScale = baseSize / cell;

  drawLanPlayerRing(renderCtx, { player, screenPos, baseSize, scale, alpha });

  // Radioactive aura
  if (perkActive(player, PerkId.RADIOACTIVE) && alpha > 1e-3) {
    const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(EffectId.AURA);
    if (atlas !== undefined) {
      const auraGrid = SIZE_CODE_GRID[atlas.sizeCode];
      if (auraGrid) {
        const atlasFrame = atlas.frame;
        const col = atlasFrame % auraGrid;
        const row = Math.floor(atlasFrame / auraGrid);
        const cellW = particlesTexture.width / auraGrid;
        const cellH = particlesTexture.height / auraGrid;
        const src = wgl.makeRectangle(
          cellW * col, cellH * row,
          Math.max(0.0, cellW - 2.0), Math.max(0.0, cellH - 2.0),
        );
        const t = renderFrame.elapsedMs * 0.001;
        const auraAlpha = ((Math.sin(t) + 1.0) * 0.1875 + 0.25) * alpha;
        if (auraAlpha > 1e-3) {
          const size = 100.0 * scale;
          const dst = wgl.makeRectangle(screenPos.x, screenPos.y, size, size);
          const origin = wgl.makeVector2(size * 0.5, size * 0.5);
          const tint = wgl.makeColor(
            77 / 255, 153 / 255, 77 / 255, clamp(auraAlpha, 0.0, 1.0),
          );
          wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);
          wgl.drawTexturePro(particlesTexture, src, dst, origin, 0.0, tint);
          wgl.endBlendMode();
        }
      }
    }
  }

  const tint = wgl.makeColor(240 / 255, 240 / 255, 255 / 255, alpha);
  const shadowTint = wgl.makeColor(0, 0, 0, (90 / 255) * alpha);
  let overlayTint = tint;
  if (renderFrame.players.length > 1) {
    const index = player.index;
    if (index === 0) {
      overlayTint = wgl.makeColor(77 / 255, 77 / 255, 255 / 255, tint[3]);
    } else {
      overlayTint = wgl.makeColor(255 / 255, 140 / 255, 89 / 255, tint[3]);
    }
  }

  function draw(frameIdx: number, opts: { pos: Vec2; scaleMul: number; rotation: number; color: wgl.Color }): void {
    renderCtx.drawAtlasSprite(
      texture,
      spriteGrid,
      Math.max(0, Math.min(63, int(frameIdx))),
      opts.pos,
      baseScale * opts.scaleMul,
      opts.rotation,
      opts.color,
    );
  }

  if (player.health > 0.0) {
    const legFrame = Math.max(0, Math.min(14, int(player.movePhase + 0.5)));
    const torsoFrame = legFrame + 16;

    const recoilDir = player.aimHeading + Math.PI / 2.0;
    const recoil = player.muzzleFlashAlpha * 12.0 * scale;
    const recoilOffset = Vec2.fromPolar(recoilDir, recoil);

    const legShadowScale = 1.02;
    const torsoShadowScale = 1.03;
    const legShadowOff = 3.0 * scale + baseSize * (legShadowScale - 1.0) * 0.5;
    const torsoShadowOff = 1.0 * scale + baseSize * (torsoShadowScale - 1.0) * 0.5;

    draw(
      legFrame,
      { pos: screenPos.offset({ dx: legShadowOff, dy: legShadowOff }),
      scaleMul: legShadowScale,
      rotation: player.heading,
      color: shadowTint },
    );
    draw(
      torsoFrame,
      { pos: screenPos.offset({ dx: recoilOffset.x + torsoShadowOff, dy: recoilOffset.y + torsoShadowOff }),
      scaleMul: torsoShadowScale,
      rotation: player.aimHeading,
      color: shadowTint },
    );

    draw(legFrame, { pos: screenPos, scaleMul: 1.0, rotation: player.heading, color: tint });
    draw(torsoFrame, { pos: screenPos.add(recoilOffset), scaleMul: 1.0, rotation: player.aimHeading, color: overlayTint });

    // Shield ring
    if (player.shieldTimer > 1e-3 && alpha > 1e-3) {
      const atlas = EFFECT_ID_ATLAS_TABLE_BY_ID.get(EffectId.SHIELD_RING);
      if (atlas !== undefined) {
        const shieldGrid = SIZE_CODE_GRID[atlas.sizeCode];
        if (shieldGrid) {
          const atlasFrame = atlas.frame;
          const col = atlasFrame % shieldGrid;
          const row = Math.floor(atlasFrame / shieldGrid);
          const cellW = particlesTexture.width / shieldGrid;
          const cellH = particlesTexture.height / shieldGrid;
          const src = wgl.makeRectangle(
            cellW * col, cellH * row,
            Math.max(0.0, cellW - 2.0), Math.max(0.0, cellH - 2.0),
          );
          const t = renderFrame.elapsedMs * 0.001;
          const timer = player.shieldTimer;
          let strength = (Math.sin(t) + 1.0) * 0.25 + timer;
          if (timer < 1.0) strength *= timer;
          strength = Math.min(1.0, strength) * alpha;
          if (strength > 1e-3) {
            const offsetDir = player.aimHeading - Math.PI / 2.0;
            const center = screenPos.add(Vec2.fromPolar(offsetDir, 3.0 * scale));

            let halfVal = Math.sin(t * 3.0) + 17.5;
            const size = halfVal * 2.0 * scale;
            const a = clamp(strength * 0.4, 0.0, 1.0);
            const shieldTint = wgl.makeColor(91 / 255, 180 / 255, 255 / 255, a);
            const dst = wgl.makeRectangle(center.x, center.y, size, size);
            const origin = wgl.makeVector2(size * 0.5, size * 0.5);
            const rotationDeg = (t + t) * RAD_TO_DEG;

            halfVal = Math.sin(t * 3.0) * 4.0 + 24.0;
            const size2 = halfVal * 2.0 * scale;
            const a2 = clamp(strength * 0.3, 0.0, 1.0);
            const shieldTint2 = wgl.makeColor(91 / 255, 180 / 255, 255 / 255, a2);
            const dst2 = wgl.makeRectangle(center.x, center.y, size2, size2);
            const origin2 = wgl.makeVector2(size2 * 0.5, size2 * 0.5);
            const rotation2Deg = (t * -2.0) * RAD_TO_DEG;

            wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);
            wgl.drawTexturePro(particlesTexture, src, dst, origin, rotationDeg, shieldTint);
            wgl.drawTexturePro(particlesTexture, src, dst2, origin2, rotation2Deg, shieldTint2);
            wgl.endBlendMode();
          }
        }
      }
    }

    // Muzzle flash
    if (player.muzzleFlashAlpha > 1e-3 && alpha > 1e-3) {
      const weapon = WEAPON_BY_ID.get(player.weapon.weaponId);
      if (weapon) {
        const flags = weapon.flags ?? 0;
        if ((flags & 0x8) === 0) {
          const flashAlpha = clamp(player.muzzleFlashAlpha * 0.8, 0.0, 1.0) * alpha;
          if (flashAlpha > 1e-3) {
            const size = baseSize * ((flags & 0x4) ? 0.5 : 1.0);
            const heading = player.aimHeading + Math.PI / 2.0;
            const offset = (player.muzzleFlashAlpha * 12.0 - 21.0) * scale;
            const flashPos = screenPos.add(Vec2.fromAngle(heading).mul(offset));
            const src = wgl.makeRectangle(
              0.0, 0.0, muzzleFlashTexture.width, muzzleFlashTexture.height,
            );
            const dst = wgl.makeRectangle(flashPos.x, flashPos.y, size, size);
            const origin = wgl.makeVector2(size * 0.5, size * 0.5);
            const tintFlash = wgl.makeColor(1, 1, 1, flashAlpha);
            wgl.beginBlendMode(wgl.BlendMode.ADDITIVE);
            wgl.drawTexturePro(
              muzzleFlashTexture, src, dst, origin,
              player.aimHeading * RAD_TO_DEG, tintFlash,
            );
            wgl.endBlendMode();
          }
        }
      }
    }
    return;
  }

  // Dead player
  let deadFrame: number;
  if (player.deathTimer >= 0.0) {
    deadFrame = 32 + int((16.0 - player.deathTimer) * 1.25);
    if (deadFrame > 52) deadFrame = 52;
    if (deadFrame < 32) deadFrame = 32;
  } else {
    deadFrame = 52;
  }

  const deadShadowScale = 1.03;
  const deadShadowOff = 1.0 * scale + baseSize * (deadShadowScale - 1.0) * 0.5;
  draw(
    deadFrame,
    { pos: screenPos.offset({ dx: deadShadowOff, dy: deadShadowOff }),
    scaleMul: deadShadowScale,
    rotation: player.aimHeading,
    color: shadowTint },
  );
  draw(deadFrame, { pos: screenPos, scaleMul: 1.0, rotation: player.aimHeading, color: overlayTint });
}
