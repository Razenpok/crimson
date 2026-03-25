// Port of crimson/screens/panels/databases_weapons.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth, SmallFontData } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { type GameState } from '@crimson/game/types.ts';
import { type Weapon, WeaponId, WEAPON_TABLE, WEAPON_BY_ID, weaponDisplayName } from '@crimson/weapons.ts';
import { buildWeaponAvailability, type WeaponAvailabilityStatus } from '@crimson/weapon-runtime/availability.ts';
import { weaponsDbRightDetailXShift } from '@crimson/screens/high-scores-layout.ts';
import { DatabaseBaseView } from './databases-base.ts';

const WHITE = wgl.makeColor(1, 1, 1, 1);
const DIM_COLOR = wgl.makeColor(1, 1, 1, 0.7);
const MOUSE_BUTTON_LEFT = 0;

// Inline helper — mirrors weapon_usage_slot_for_weapon_id from weapon_usage.py
const WEAPON_USAGE_TRACKED_WEAPON_ID_MIN = WeaponId.PISTOL as number;
const WEAPON_USAGE_TRACKED_WEAPON_ID_MAX = 52;

function weaponUsageSlotForWeaponId(weaponId: number): number | null {
  const id = weaponId | 0;
  if (WEAPON_USAGE_TRACKED_WEAPON_ID_MIN <= id && id <= WEAPON_USAGE_TRACKED_WEAPON_ID_MAX) {
    return id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// UnlockedWeaponsDatabaseView
// ---------------------------------------------------------------------------

export class UnlockedWeaponsDatabaseView extends DatabaseBaseView {
  private _weaponIds: number[] = [];
  private _selectedWeaponId: number | null = null;
  private _listScrollIndex = 0;

  constructor(state: GameState) {
    super(state);
  }

  override open(): void {
    super.open();
    this._weaponIds = this._buildWeaponDatabaseIds();
    this._selectedWeaponId = null;
    this._listScrollIndex = 0;
  }

  override close(): void {
    this._selectedWeaponId = null;
    super.close();
  }

  protected override _backButtonPos(): Vec2 {
    // state_15: ui_buttonSm bbox [270,507]..[352,539] => relative to left panel (-98,194): (368, 313)
    return new Vec2(368.0, 313.0);
  }

  protected override _drawContents(
    leftTopLeft: Vec2,
    rightTopLeft: Vec2,
    scale: number,
    font: SmallFontData,
  ): void {
    const left = leftTopLeft;
    const right = rightTopLeft;
    const detailShiftX = weaponsDbRightDetailXShift(this.state.config.display.width);
    const detailTopLeft = right.add(new Vec2(detailShiftX * scale, 0.0));
    const dimColor = wgl.makeColor(1, 1, 1, 0.7);
    const textColor = wgl.makeColor(1, 1, 1, 1);

    // state_15 title at (153,244) => relative to left panel (-98,194): (251,50)
    const titlePos = left.add(new Vec2(251.0 * scale, 50.0 * scale));
    const titleText = 'Unlocked Weapons Database';
    drawSmallText(font, titleText, titlePos, wgl.makeColor(1, 1, 1, 1));
    const titleW = measureSmallTextWidth(font, titleText);
    // 1px outline strip under the title with alpha 0.5
    wgl.drawRectangle(
      Math.floor(titlePos.x),
      Math.floor(titlePos.y + 13.0 * scale),
      Math.floor(titleW),
      Math.max(1, Math.floor(1.0 * scale)),
      wgl.makeColor(1, 1, 1, 0.5),
    );

    const weaponIds = this._weaponIds;
    const count = weaponIds.length;
    const weaponLabel = count === 1 ? 'weapon' : 'weapons';
    drawSmallText(font, `${count} ${weaponLabel} in database`, left.add(new Vec2(210.0 * scale, 80.0 * scale)), dimColor);
    drawSmallText(font, 'Weapon', left.add(new Vec2(210.0 * scale, 108.0 * scale)), textColor);

    // Oracle frame: outer [114,322]-[364,486], inner [115,323]-[363,485]
    const frameX = left.x + 212.0 * scale;
    const frameY = left.y + 128.0 * scale;
    const frameW = 250.0 * scale;
    const frameH = 164.0 * scale;
    wgl.drawRectangle(
      Math.round(frameX), Math.round(frameY),
      Math.round(frameW), Math.round(frameH),
      wgl.makeColor(1, 1, 1, 1),
    );
    wgl.drawRectangle(
      Math.round(frameX + 1.0 * scale),
      Math.round(frameY + 1.0 * scale),
      Math.max(0, Math.round(frameW - 2.0 * scale)),
      Math.max(0, Math.round(frameH - 2.0 * scale)),
      wgl.makeColor(0, 0, 0, 1),
    );

    // Oracle list widget is 10 rows tall
    const listTopLeft = left.add(new Vec2(218.0 * scale, 130.0 * scale));
    const rowStep = 16.0 * scale;
    const visibleRows = 10;
    const maxScroll = Math.max(0, weaponIds.length - visibleRows);
    const start = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
    const end = Math.min(weaponIds.length, start + visibleRows);
    const visibleWeaponIds = weaponIds.slice(start, end);
    for (let row = 0; row < visibleWeaponIds.length; row++) {
      const weaponId = visibleWeaponIds[row];
      const [name, _icon] = this._weaponLabelAndIcon(weaponId);
      const rowColor =
        this._selectedWeaponId !== null && weaponId === this._selectedWeaponId
          ? textColor
          : dimColor;
      drawSmallText(font, name, listTopLeft.offset({ dy: row * rowStep }), rowColor);
    }

    if (this._selectedWeaponId === null) return;

    const weaponId = this._selectedWeaponId;
    const [name, iconIndex] = this._weaponLabelAndIcon(weaponId);
    const weapon = this._weaponEntry(weaponId);
    const preserveBugs = this.state.preserveBugs;
    const weaponNoLabel = preserveBugs ? 'wepno' : 'weapon';
    drawSmallText(font, `${weaponNoLabel} #${weaponId}`, detailTopLeft.add(new Vec2(240.0 * scale, 32.0 * scale)), wgl.makeColor(1, 1, 1, 0.4));
    drawSmallText(font, name, detailTopLeft.add(new Vec2(50.0 * scale, 50.0 * scale)), textColor);
    if (iconIndex !== null) {
      this._drawWicon(iconIndex, detailTopLeft.add(new Vec2(82.0 * scale, 82.0 * scale)), scale);
    }

    const reloadTime = weapon.reloadTime;
    const clipSize = weapon.clipSize;
    const ammoClass = (weapon.ammoClass ?? 0) | 0;
    const firerateLabel = preserveBugs ? 'Firerate' : 'Fire rate';
    let firerateText: string;
    if (ammoClass === 1) {
      firerateText = `${firerateLabel}: n/a`;
    } else {
      firerateText = `${firerateLabel}: ${this._weaponRpm(weapon)} rpm`;
    }
    drawSmallText(font, firerateText, detailTopLeft.add(new Vec2(66.0 * scale, 128.0 * scale)), textColor);
    drawSmallText(font, `Reload time: ${reloadTime.toFixed(1)} secs`, detailTopLeft.add(new Vec2(66.0 * scale, 146.0 * scale)), textColor);
    drawSmallText(font, `Clip size: ${clipSize}`, detailTopLeft.add(new Vec2(66.0 * scale, 164.0 * scale)), textColor);
  }

  protected override _updateContentInteraction(
    leftTopLeft: Vec2,
    scale: number,
    mouse: { x: number; y: number },
  ): void {
    const weaponIds = this._weaponIds;
    if (weaponIds.length === 0) {
      this._selectedWeaponId = null;
      this._listScrollIndex = 0;
      return;
    }

    const visibleRows = 10;
    const maxScroll = Math.max(0, weaponIds.length - visibleRows);
    const mouseWheel = InputState.mouseWheelDelta() | 0;
    if (mouseWheel) {
      this._listScrollIndex = Math.max(0, Math.min(maxScroll, (this._listScrollIndex | 0) - mouseWheel));
    }
    const start = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
    const end = Math.min(weaponIds.length, start + visibleRows);
    const rowCount = end - start;
    if (rowCount <= 0) {
      this._selectedWeaponId = null;
      return;
    }

    const rowStep = 16.0 * scale;
    const listHitX = leftTopLeft.x + 214.0 * scale;
    const listHitY = leftTopLeft.y + 128.0 * scale;
    const listHitW = 246.0 * scale;
    const listHitH = Math.min(160.0 * scale, rowStep * rowCount);
    if (
      listHitX <= mouse.x && mouse.x < listHitX + listHitW &&
      listHitY <= mouse.y && mouse.y < listHitY + listHitH
    ) {
      const listTextTop = leftTopLeft.y + 130.0 * scale;
      const row = ((mouse.y - listTextTop) / rowStep) | 0;
      if (row >= 0 && row < rowCount) {
        this._selectedWeaponId = weaponIds[start + row];
        return;
      }
    }
    this._selectedWeaponId = null;
  }

  private _buildWeaponDatabaseIds(): number[] {
    const status = (this.state as unknown as { status?: WeaponAvailabilityStatus | null }).status ?? null;
    const available = buildWeaponAvailability({
      status,
      gameMode: this.state.config.gameplay.mode,
      demoModeActive: this.state.demoEnabled,
    });
    const used: number[] = [];
    for (const weapon of WEAPON_TABLE) {
      const weaponId = weapon.weaponId as number;
      let include = false;
      if (weaponId >= 0 && weaponId < available.length) {
        include = available[weaponId];
      }
      if (!include) {
        if (weaponId === (WeaponId.PISTOL as number)) {
          include = true;
        } else {
          const usageSlot = weaponUsageSlotForWeaponId(weaponId);
          include = status !== null &&
            usageSlot !== null &&
            status.weaponUsageCountSlot(usageSlot) !== 0;
        }
      }
      if (include) {
        used.push(weaponId);
      }
    }
    used.sort((a, b) => a - b);
    return used;
  }

  private _weaponEntry(weaponId: number): Weapon {
    return WEAPON_BY_ID.get(weaponId as WeaponId)!;
  }

  private _weaponRpm(weapon: Weapon): number {
    return (60.0 / weapon.shotCooldown) | 0;
  }

  private _drawWicon(iconIndex: number, pos: Vec2, scale: number): void {
    const resources = this.state.resources!;
    const tex = getTexture(resources, TextureId.UI_WICONS);
    const idx = iconIndex | 0;
    if (idx < 0 || idx > 31) return;
    const grid = 8;
    const cellW = tex.width / grid;
    const cellH = tex.height / grid;
    const frame = idx * 2;
    const srcX = (frame % grid) * cellW;
    const srcY = ((frame / grid) | 0) * cellH;
    const iconW = cellW * 2.0;
    const iconH = cellH;
    wgl.drawTexturePro(
      tex,
      wgl.makeRectangle(srcX, srcY, iconW, iconH),
      wgl.makeRectangle(pos.x, pos.y, iconW * scale, iconH * scale),
      wgl.makeVector2(0.0, 0.0),
      0.0,
      WHITE,
    );
  }

  private _weaponLabelAndIcon(weaponId: number): [string, number | null] {
    const weapon = WEAPON_BY_ID.get(weaponId as WeaponId);
    if (!weapon) return [`weapon_${weaponId}`, null];
    const name = weaponDisplayName(weapon.weaponId, { preserveBugs: this.state.preserveBugs });
    return [name, weapon.iconIndex];
  }
}
