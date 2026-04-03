// Port of crimson/render/world/bonuses.py

import * as wgl from '@wgl';
import { TextureId, getTexture } from '@grim/assets.ts';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import { drawSmallText, measureSmallTextWidth } from '@grim/fonts/small.ts';
import { BONUS_BY_ID, BonusId } from '@crimson/bonuses/ids.ts';
import { bonusFindAimHoverEntry, bonusLabelForEntry } from '@crimson/bonuses/pool.ts';
import { WEAPON_BY_ID, WeaponId } from '@crimson/weapons.ts';
import { RAD_TO_DEG } from './constants.ts';
import { WorldRenderCtx } from './context.ts';

function bonusIconSrc(texture: wgl.Texture, iconId: number): wgl.Rectangle {
  const grid = 4;
  const cellW = texture.width / grid;
  const cellH = texture.height / grid;
  const col = int(iconId) % grid;
  const row = Math.floor(int(iconId) / grid);
  return wgl.makeRectangle(col * cellW, row * cellH, cellW, cellH);
}

function weaponIconSrc(texture: wgl.Texture, iconIndex: number): wgl.Rectangle {
  const grid = 8;
  const cellW = texture.width / grid;
  const cellH = texture.height / grid;
  const frame = int(iconIndex) * 2;
  const col = frame % grid;
  const row = Math.floor(frame / grid);
  return wgl.makeRectangle(col * cellW, row * cellH, cellW * 2, cellH);
}

function bonusFade(timeLeft: number, timeMax: number): number {
  if (timeLeft <= 0.0 || timeMax <= 0.0) return 0.0;
  if (timeLeft < 0.5) return clamp(timeLeft * 2.0, 0.0, 1.0);
  const age = timeMax - timeLeft;
  if (age < 0.5) return clamp(age * 2.0, 0.0, 1.0);
  return 1.0;
}

export function drawBonusPickups(
  renderCtx: WorldRenderCtx,
  opts: { camera: Vec2; viewScale: Vec2; scale: number; alpha?: number },
): void {
  const { camera, viewScale, scale } = opts;
  let alpha = clamp(opts.alpha ?? 1.0, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const frame = renderCtx.frame;
  const resources = frame.resources;
  const bonusesTexture = getTexture(resources, TextureId.BONUSES);
  const wiconsTexture = getTexture(resources, TextureId.UI_WICONS);

  const bubbleSrc = bonusIconSrc(bonusesTexture, 0);
  const bubbleSize = 32.0 * scale;

  const bonusPool = frame.state.bonusPool;
  for (let idx = 0; idx < bonusPool.entries.length; idx++) {
    const bonus = bonusPool.entries[idx];
    if (bonus.bonusId === BonusId.UNUSED) continue;

    const fade = bonusFade(bonus.timeLeft, bonus.timeMax);
    const bubbleAlpha = clamp(fade * 0.9, 0.0, 1.0) * alpha;

    const screen = WorldRenderCtx.worldToScreenWith(bonus.pos, camera, viewScale);
    const bubbleDst = wgl.makeRectangle(screen.x, screen.y, bubbleSize, bubbleSize);
    const bubbleOrigin = wgl.makeVector2(bubbleSize * 0.5, bubbleSize * 0.5);
    const tint = wgl.makeColor(1, 1, 1, bubbleAlpha);
    wgl.drawTexturePro(bonusesTexture, bubbleSrc, bubbleDst, bubbleOrigin, 0.0, tint);

    const bonusId = bonus.bonusId;
    if (bonusId === BonusId.WEAPON) {
      if (!WEAPON_BY_ID.has(bonus.amount as WeaponId)) continue;
      const weaponId = bonus.amount as WeaponId;
      const weapon = WEAPON_BY_ID.get(weaponId);
      if (!weapon) continue;
      const iconIndex = weapon.iconIndex;
      if (!(iconIndex >= 0 && iconIndex <= 31)) continue;

      const pulse = Math.sin(frame.bonusAnimPhase) ** 4 * 0.25 + 0.75;
      const iconScale = fade * pulse;
      if (iconScale <= 1e-3) continue;

      const src = weaponIconSrc(wiconsTexture, iconIndex);
      const w = 60.0 * iconScale * scale;
      const h = 30.0 * iconScale * scale;
      const dst = wgl.makeRectangle(screen.x, screen.y, w, h);
      const origin = wgl.makeVector2(w * 0.5, h * 0.5);
      wgl.drawTexturePro(wiconsTexture, src, dst, origin, 0.0, tint);
      continue;
    }

    const meta = BONUS_BY_ID.get(bonusId);
    let iconId = (meta !== undefined && meta.iconId !== null) ? meta.iconId : null;
    if (iconId === null || iconId < 0) continue;
    if (bonusId === BonusId.POINTS && bonus.amount === 1000) {
      iconId += 1;
    }

    const pulse = Math.sin(idx + frame.bonusAnimPhase) ** 4 * 0.25 + 0.75;
    const iconScale = fade * pulse;
    if (iconScale <= 1e-3) continue;

    const src = bonusIconSrc(bonusesTexture, iconId);
    const size = 32.0 * iconScale * scale;
    const rotationRad = Math.sin(idx - frame.elapsedMs * 0.003) * 0.2;
    const dst = wgl.makeRectangle(screen.x, screen.y, size, size);
    const origin = wgl.makeVector2(size * 0.5, size * 0.5);
    wgl.drawTexturePro(bonusesTexture, src, dst, origin, rotationRad * RAD_TO_DEG, tint);
  }
}

export function drawBonusHoverLabels(
  renderCtx: WorldRenderCtx,
  opts: { camera: Vec2; viewScale: Vec2; alpha?: number },
): void {
  const { camera, viewScale } = opts;
  let alpha = clamp(opts.alpha ?? 1.0, 0.0, 1.0);
  if (alpha <= 1e-3) return;

  const frame = renderCtx.frame;
  const font = frame.resources.smallFont;
  const textScale = 1.0;
  const screenW = wgl.getScreenWidth();

  const shadow = wgl.makeColor(0, 0, 0, (180 / 255) * alpha);
  const color = wgl.makeColor(230 / 255, 230 / 255, 230 / 255, alpha);

  const bonusPool = frame.state.bonusPool;
  for (const player of frame.players) {
    if (player.health <= 0.0) continue;
    const hovered = bonusFindAimHoverEntry(player, bonusPool);
    if (hovered === null) continue;
    const [_idx, entry] = hovered;
    const label = bonusLabelForEntry(entry, { preserveBugs: frame.state.preserveBugs });
    if (!label) continue;

    const aim = player.aim;
    const aimScreen = WorldRenderCtx.worldToScreenWith(aim, camera, viewScale);
    let x = aimScreen.x + 16.0;
    const y = aimScreen.y - 7.0;

    if (font !== null && font !== undefined) {
      const textW = measureSmallTextWidth(font, label);
      if (x + textW > screenW) {
        x = Math.max(0.0, screenW - textW);
      }
      drawSmallText(font, label, new Vec2(x + 1.0, y + 1.0), shadow);
      drawSmallText(font, label, new Vec2(x, y), color);
    } else {
      const fontSize = int(18 * textScale);
      const textW = wgl.measureText(label, fontSize);
      if (x + textW > screenW) {
        x = Math.max(0.0, screenW - textW);
      }
      wgl.drawText(label, int(x) + 1, int(y) + 1, fontSize, shadow);
      wgl.drawText(label, int(x), int(y), fontSize, color);
    }
  }
}
