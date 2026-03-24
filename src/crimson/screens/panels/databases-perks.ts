// Port of crimson/screens/panels/databases_perks.py — Unlocked Perks Database view

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { type WebGLContext } from '@grim/webgl.ts';
import { drawSmallText, measureSmallTextWidth, SmallFontData } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { audioPlaySfx } from '@grim/audio.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { type GameState } from '@crimson/game/types.ts';
import {
  PerkId,
  PERK_BY_ID,
  perkDisplayName,
  perkDisplayDescription,
} from '@crimson/perks/ids.ts';
import { buildPerkAvailability, type GameStatus } from '@crimson/perks/availability.ts';
import { perksDbRightDetailXShift } from '@crimson/screens/high-scores-layout.ts';
import { DatabaseBaseView } from './databases-base.ts';

const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_UP = 38;
const KEY_DOWN = 40;
const KEY_PAGE_UP = 33;
const KEY_PAGE_DOWN = 34;
const KEY_ENTER = 13;
const MOUSE_BUTTON_LEFT = 0;

// ---------------------------------------------------------------------------
// UnlockedPerksDatabaseView
// ---------------------------------------------------------------------------

export class UnlockedPerksDatabaseView extends DatabaseBaseView {
  private static readonly _VISIBLE_ROWS = 10;
  private static readonly _LIST_WIDTH = 250.0;
  private static readonly _LIST_FRAME_X = 212.0;
  private static readonly _LIST_FRAME_Y = 126.0;
  private static readonly _LIST_ROW_HEIGHT = 16.0;
  private static readonly _LIST_TEXT_X = 218.0;
  private static readonly _LIST_TEXT_Y = 128.0;
  private static readonly _DESC_WRAP_WIDTH_PX = 256.0;

  private _perkIds: PerkId[] = [];
  private _listScrollIndex = 0;
  private _selectedRowIndex = 0;
  private _hoveredRowIndex = -1;
  private _navFocusIndex = 0;
  private _scrollDragActive = false;
  private _scrollDragOffset = 0.0;
  private _wrappedDescCache: Map<string, string> = new Map();

  constructor(state: GameState) {
    super(state);
  }

  override open(): void {
    super.open();
    this._perkIds = this._buildPerkDatabaseIds();
    this._hoveredRowIndex = -1;
    this._scrollDragActive = false;
    this._scrollDragOffset = 0.0;
    this._wrappedDescCache.clear();
    if (this._perkIds.length === 0) {
      this._listScrollIndex = 0;
      this._selectedRowIndex = 0;
      this._navFocusIndex = 0;
      return;
    }
    const maxScroll = Math.max(0, this._perkIds.length - UnlockedPerksDatabaseView._VISIBLE_ROWS);
    this._listScrollIndex = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
    this._selectedRowIndex = Math.max(0, this._selectedRowIndex | 0);
    this._navFocusIndex = Math.max(0, Math.min(1, this._navFocusIndex | 0));
  }

  protected override _backButtonPos(): Vec2 {
    // state_16: ui_buttonSm bbox [258,509]..[340,541] => relative to left panel (-98,194): (356, 315)
    return new Vec2(356.0, 315.0);
  }

  protected override _drawContents(
    ctx: WebGLContext,
    leftTopLeft: Vec2,
    rightTopLeft: Vec2,
    scale: number,
    font: SmallFontData,
  ): void {
    const left = leftTopLeft;
    const right = rightTopLeft;
    const textColor = wgl.makeColor(1, 1, 1, 1);
    const dimColor = wgl.makeColor(1, 1, 1, 0.7);
    const violenceDisabled = this._violenceDisabled();
    const detailShiftX = perksDbRightDetailXShift(this.state.config.display.width);

    // state_16 title at (163,244) => relative to left panel (-98,194): (261,50)
    const titlePos = left.add(new Vec2(261.0 * scale, 50.0 * scale));
    const titleText = 'Unlocked Perks Database';
    drawSmallText(ctx, font, titleText, titlePos, wgl.makeColor(1, 1, 1, 1));
    const titleW = measureSmallTextWidth(font, titleText);
    // 1px outline strip under the title with alpha 0.5
    ctx.drawRectangle(
      Math.floor(titlePos.x),
      Math.floor(titlePos.y + 13.0 * scale),
      Math.floor(titleW),
      Math.max(1, Math.floor(1.0 * scale)),
      1, 1, 1, 0.5,
    );

    const perkIds = this._perkIds;
    const count = perkIds.length;
    const perkLabel = count === 1 ? 'perk' : 'perks';
    drawSmallText(ctx, font, `${count} ${perkLabel} in database`, left.add(new Vec2(210.0 * scale, 78.0 * scale)), dimColor);
    drawSmallText(ctx, font, 'Perks', left.add(new Vec2(210.0 * scale, 106.0 * scale)), textColor);

    const VR = UnlockedPerksDatabaseView._VISIBLE_ROWS;
    const LFX = UnlockedPerksDatabaseView._LIST_FRAME_X;
    const LFY = UnlockedPerksDatabaseView._LIST_FRAME_Y;
    const LW = UnlockedPerksDatabaseView._LIST_WIDTH;
    const LRH = UnlockedPerksDatabaseView._LIST_ROW_HEIGHT;
    const LTX = UnlockedPerksDatabaseView._LIST_TEXT_X;
    const LTY = UnlockedPerksDatabaseView._LIST_TEXT_Y;

    const frameX = left.x + LFX * scale;
    const frameY = left.y + LFY * scale;
    const frameW = LW * scale;
    const frameH = (VR * LRH + 4.0) * scale;
    ctx.drawRectangle(
      Math.round(frameX), Math.round(frameY),
      Math.round(frameW), Math.round(frameH),
      1, 1, 1, 1,
    );
    ctx.drawRectangle(
      Math.round(frameX + 1.0 * scale),
      Math.round(frameY + 1.0 * scale),
      Math.max(0, Math.round(frameW - 2.0 * scale)),
      Math.max(0, Math.round(frameH - 2.0 * scale)),
      0, 0, 0, 1,
    );

    const maxScroll = Math.max(0, perkIds.length - VR);
    const start = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
    const end = Math.min(perkIds.length, start + VR);
    const listTopLeft = left.add(new Vec2(LTX * scale, LTY * scale));
    const rowStep = LRH * scale;
    const preserveBugs = this._preserveBugs();
    for (let row = 0; row < end - start; row++) {
      const perkId = perkIds[start + row];
      const listIndex = start + row;
      let rowAlpha: number;
      if (listIndex === this._hoveredRowIndex) {
        rowAlpha = 1.0;
      } else if (listIndex === this._selectedRowIndex) {
        rowAlpha = 0.9;
      } else {
        rowAlpha = 0.7;
      }
      drawSmallText(
        ctx, font,
        this._perkName(perkId, violenceDisabled, preserveBugs),
        listTopLeft.offset(0.0, row * rowStep),
        wgl.makeColor(1, 1, 1, rowAlpha),
      );
    }

    if (count > VR) {
      // Scrollbar: 1px track + draggable thumb
      const [trackX, trackY, trackH, thumbTop, thumbH, _scrollSpan] = this._scrollbarGeometry(
        left, scale, count, start,
      );
      ctx.drawRectangle(
        Math.round(trackX),
        Math.round(trackY),
        Math.max(1, Math.round(1.0 * scale)),
        Math.round(trackH),
        1, 1, 1, 1,
      );
      ctx.drawRectangle(
        Math.round(trackX + 1.0 * scale),
        Math.round(thumbTop),
        Math.max(1, Math.round(8.0 * scale)),
        Math.max(1, Math.round(thumbH + 1.0 * scale)),
        1, 1, 1, 0.8,
      );
      ctx.drawRectangle(
        Math.round(trackX + 2.0 * scale),
        Math.round(thumbTop + 1.0 * scale),
        Math.max(1, Math.round(6.0 * scale)),
        Math.max(1, Math.round(Math.max(1.0, thumbH - 1.0 * scale))),
        51 / 255, 204 / 255, 1, 0.2,
      );
    }

    const hoveredPerkId = this._hoveredPerkId();
    if (hoveredPerkId === null) return;
    const perkId = hoveredPerkId;
    const perkName = this._perkName(perkId, violenceDisabled, preserveBugs);
    const detailAnchor = right.add(new Vec2((34.0 + detailShiftX) * scale, 72.0 * scale));
    const perkNoLabel = preserveBugs ? 'perkno' : 'perk';
    drawSmallText(ctx, font, `${perkNoLabel} #${perkId}`, detailAnchor.add(new Vec2(190.0 * scale, -40.0 * scale)), wgl.makeColor(1, 1, 1, 0.4));
    const nameW = measureSmallTextWidth(font, perkName);
    const perkNamePos = new Vec2(detailAnchor.x + 128.0 * scale - nameW * 0.5, detailAnchor.y - 22.0 * scale);
    drawSmallText(ctx, font, perkName, perkNamePos, textColor);
    ctx.drawRectangle(
      Math.floor(perkNamePos.x),
      Math.floor(perkNamePos.y + 13.0 * scale),
      Math.floor(nameW),
      Math.max(1, Math.floor(1.0 * scale)),
      1, 1, 1, 0.5,
    );

    let descPos = detailAnchor.add(new Vec2(16.0 * scale, 0.0));
    const prereqName = this._perkPrereqName(perkId, violenceDisabled, preserveBugs);
    if (prereqName) {
      drawSmallText(ctx, font, `Requires: ${prereqName}`, descPos, wgl.makeColor(1, 204 / 255, 204 / 255, 0.8));
      descPos = descPos.offset(0.0, 18.0 * scale);
    }

    const wrappedDesc = this._prewrappedPerkDesc(perkId, font, violenceDisabled);
    if (wrappedDesc) {
      drawSmallText(ctx, font, wrappedDesc, descPos, dimColor);
    }
  }

  protected override _updateContentInteraction(
    leftTopLeft: Vec2,
    scale: number,
    mouse: { x: number; y: number },
  ): void {
    const perkIds = this._perkIds;
    const count = perkIds.length;
    this._hoveredRowIndex = -1;
    if (count <= 0) {
      this._listScrollIndex = 0;
      this._selectedRowIndex = 0;
      this._navFocusIndex = 0;
      this._scrollDragActive = false;
      return;
    }

    const VR = UnlockedPerksDatabaseView._VISIBLE_ROWS;
    const LFX = UnlockedPerksDatabaseView._LIST_FRAME_X;
    const LFY = UnlockedPerksDatabaseView._LIST_FRAME_Y;
    const LW = UnlockedPerksDatabaseView._LIST_WIDTH;
    const LRH = UnlockedPerksDatabaseView._LIST_ROW_HEIGHT;
    const LTY = UnlockedPerksDatabaseView._LIST_TEXT_Y;

    const maxScroll = Math.max(0, count - VR);
    this._listScrollIndex = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
    this._selectedRowIndex = Math.max(0, this._selectedRowIndex | 0);

    if (InputState.wasKeyPressed(KEY_LEFT)) {
      this._navFocusIndex = Math.max(0, (this._navFocusIndex | 0) - 1);
    }
    if (InputState.wasKeyPressed(KEY_RIGHT)) {
      this._navFocusIndex = Math.min(1, (this._navFocusIndex | 0) + 1);
    }

    if (this._navFocusIndex === 1) {
      if (InputState.wasKeyPressed(KEY_UP)) {
        this._listScrollIndex -= 1;
      }
      if (InputState.wasKeyPressed(KEY_DOWN)) {
        this._listScrollIndex += 1;
      }
      if (InputState.wasKeyPressed(KEY_PAGE_UP)) {
        this._listScrollIndex -= VR - 1;
      }
      if (InputState.wasKeyPressed(KEY_PAGE_DOWN)) {
        this._listScrollIndex += VR - 1;
      }
    }

    const listHitX = leftTopLeft.x + LFX * scale;
    const listHitY = leftTopLeft.y + LFY * scale;
    const listHitW = LW * scale;
    const listHitH = (VR * LRH + 4.0) * scale;
    const mouseInList =
      listHitX <= mouse.x && mouse.x < listHitX + listHitW &&
      listHitY <= mouse.y && mouse.y < listHitY + listHitH;
    if (mouseInList) {
      this._navFocusIndex = 1;
    }

    const wheel = InputState.mouseWheelDelta() | 0;
    if (wheel && (mouseInList || this._navFocusIndex === 1)) {
      this._listScrollIndex -= wheel;
    }

    if (count > VR) {
      const start = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
      const [trackX, trackY, trackH, thumbTop, thumbH, scrollSpan] = this._scrollbarGeometry(
        leftTopLeft, scale, count, start,
      );
      const thumbX = trackX + 1.0 * scale;
      const thumbW = 8.0 * scale;
      const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
      const down = InputState.isMouseButtonDown(MOUSE_BUTTON_LEFT);
      const inTrack =
        trackX <= mouse.x && mouse.x < trackX + 10.0 * scale &&
        trackY <= mouse.y && mouse.y < trackY + trackH;
      const inThumb =
        thumbX <= mouse.x && mouse.x < thumbX + thumbW &&
        thumbTop <= mouse.y && mouse.y < thumbTop + thumbH + 1.0 * scale;

      if (click && inTrack) {
        this._navFocusIndex = 1;
        if (inThumb) {
          this._scrollDragActive = true;
          this._scrollDragOffset = mouse.y - thumbTop;
        } else {
          const travel = Math.max(1.0, trackH - 3.0 * scale - thumbH);
          let target = mouse.y - trackY - 1.0 * scale - thumbH * 0.5;
          target = Math.max(0.0, Math.min(travel, target));
          this._listScrollIndex = Math.round((target / travel) * scrollSpan);
          this._scrollDragActive = true;
          this._scrollDragOffset = thumbH * 0.5;
        }
      }

      if (this._scrollDragActive) {
        if (down) {
          const travel = Math.max(1.0, trackH - 3.0 * scale - thumbH);
          let target = mouse.y - trackY - 1.0 * scale - this._scrollDragOffset;
          target = Math.max(0.0, Math.min(travel, target));
          this._listScrollIndex = Math.round((target / travel) * scrollSpan);
        } else {
          this._scrollDragActive = false;
        }
      }
    } else {
      this._scrollDragActive = false;
    }

    this._listScrollIndex = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));

    const startFinal = Math.max(0, Math.min(maxScroll, this._listScrollIndex | 0));
    const endFinal = Math.min(count, startFinal + VR);
    const rowCount = endFinal - startFinal;
    if (rowCount > 0 && mouseInList) {
      const rowStep = LRH * scale;
      const listTextTop = leftTopLeft.y + LTY * scale;
      const row = ((mouse.y - listTextTop) / rowStep) | 0;
      if (row >= 0 && row < rowCount) {
        this._hoveredRowIndex = startFinal + row;
        if (InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
          this._selectedRowIndex = this._hoveredRowIndex;
        }
      }
    }

    if (
      this._navFocusIndex === 0 &&
      (InputState.wasKeyPressed(KEY_ENTER))
    ) {
      if (this.state.audio !== null) {
        audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
      }
      this._beginCloseTransition('back_to_previous');
    }
  }

  private _hoveredPerkId(): PerkId | null {
    if (this._hoveredRowIndex >= 0 && this._hoveredRowIndex < this._perkIds.length) {
      return this._perkIds[this._hoveredRowIndex];
    }
    return null;
  }

  private _selectedPerkId(): PerkId | null {
    if (this._selectedRowIndex >= 0 && this._selectedRowIndex < this._perkIds.length) {
      return this._perkIds[this._selectedRowIndex];
    }
    return null;
  }

  private _scrollbarGeometry(
    leftTopLeft: Vec2,
    scale: number,
    count: number,
    start: number,
  ): [number, number, number, number, number, number] {
    const VR = UnlockedPerksDatabaseView._VISIBLE_ROWS;
    const LFX = UnlockedPerksDatabaseView._LIST_FRAME_X;
    const LFY = UnlockedPerksDatabaseView._LIST_FRAME_Y;
    const LRH = UnlockedPerksDatabaseView._LIST_ROW_HEIGHT;

    const trackX = leftTopLeft.x + (LFX + 240.0) * scale;
    const trackY = leftTopLeft.y + LFY * scale;
    const trackH = (VR * LRH + 4.0) * scale;
    const scrollSpan = Math.max(1, count - VR);
    let thumbH = (VR / count) * trackH;
    thumbH = Math.min(thumbH, trackH - 3.0 * scale);
    const thumbTop = trackY + 1.0 * scale + ((trackH - 3.0 * scale - thumbH) / scrollSpan) * start;
    return [trackX, trackY, trackH, thumbTop, thumbH, scrollSpan];
  }

  private _buildPerkDatabaseIds(): PerkId[] {
    const status = (this.state as unknown as { status?: GameStatus | null }).status ?? null;
    const available = buildPerkAvailability(status);
    const perkIds: PerkId[] = [];
    for (let idx = 1; idx < available.length; idx++) {
      if (available[idx]) {
        perkIds.push(idx as PerkId);
      }
    }
    perkIds.sort((a, b) => (a as number) - (b as number));
    return perkIds;
  }

  private _perkName(perkId: PerkId, violenceDisabled: number, preserveBugs: boolean): string {
    return perkDisplayName(perkId, violenceDisabled, preserveBugs);
  }

  private _perkDesc(perkId: PerkId, violenceDisabled: number, preserveBugs: boolean): string {
    return perkDisplayDescription(perkId, violenceDisabled, preserveBugs);
  }

  private _perkPrereqName(perkId: PerkId, violenceDisabled: number, preserveBugs: boolean): string | null {
    const meta = PERK_BY_ID.get(perkId);
    if (!meta) return null;
    const prereq = meta.prereq;
    if (!prereq || prereq.length === 0) return null;
    return perkDisplayName(prereq[0], violenceDisabled, preserveBugs);
  }

  private _preserveBugs(): boolean {
    return this.state.preserveBugs;
  }

  private _violenceDisabled(): number {
    return this.state.config.display.violenceDisabled;
  }

  private _prewrappedPerkDesc(perkId: PerkId, font: SmallFontData, violenceDisabled: number): string {
    const key = `${perkId as number}:${violenceDisabled}:${this._preserveBugs() ? 1 : 0}`;
    const cached = this._wrappedDescCache.get(key);
    if (cached !== undefined) return cached;
    const desc = this._perkDesc(perkId, violenceDisabled, this._preserveBugs());
    const wrapped = UnlockedPerksDatabaseView._wrapSmallTextNative(
      font, desc, UnlockedPerksDatabaseView._DESC_WRAP_WIDTH_PX, 1.0,
    );
    this._wrappedDescCache.set(key, wrapped);
    return wrapped;
  }

  private static _wrapSmallTextNative(
    font: SmallFontData,
    text: string,
    maxWidthPx: number,
    _scale: number,
  ): string {
    const wrapped = Array.from(text);
    if (wrapped.length === 0) return '';

    const maxWidth = maxWidthPx;
    let remaining = maxWidth;
    let i = 0;
    while (i < wrapped.length) {
      const ch = wrapped[i];
      if (ch === '\r') {
        i++;
        continue;
      }
      if (ch === '\n') {
        remaining = maxWidth;
        i++;
        continue;
      }

      remaining -= measureSmallTextWidth(font, ch);
      if (remaining < 0.0) {
        let j = i;
        while (j > 0 && wrapped[j] !== ' ' && wrapped[j] !== '\n') {
          j--;
        }
        if (wrapped[j] === ' ') {
          wrapped[j] = '\n';
          i = j;
        }
        remaining = maxWidth;
      }
      i++;
    }

    return wrapped.join('');
  }
}
