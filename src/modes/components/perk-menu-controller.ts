// Port of crimson/modes/components/perk_menu_controller.py

import { type WebGLContext } from '../../engine/webgl.ts';
import { Vec2 } from '../../engine/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '../../engine/assets.ts';
import { type SmallFontData } from '../../engine/assets.ts';
import { measureSmallTextWidth } from '../../engine/fonts/small.ts';
import { clamp } from '../../engine/math.ts';
import { InputState } from '../../engine/input.ts';
import { SfxId } from '../../engine/sfx-map.ts';
import { PerkId, perkDisplayName, perkDisplayDescription } from '../../game/perks/ids.ts';
import { type PlayerState } from '../../game/sim/state-types.ts';
import { uiOrigin, uiScale } from '../../ui/layout.ts';
import { drawClassicMenuPanel } from '../../ui/menu-panel.ts';
import {
  PERK_MENU_TRANSITION_MS,
  PerkMenuLayout,
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
  drawMenuItem,
  drawUiText,
  menuItemHitRect,
  perkMenuComputeLayout,
  perkMenuPanelSlideX,
} from '../../ui/perk-menu.ts';

export type PlaySfxFn = (sfxId: SfxId) => void;
export type OnCloseFn = () => void;

const UI_TEXT_COLOR: [number, number, number, number] = [220 / 255, 220 / 255, 220 / 255, 1.0];
const UI_SPONSOR_COLOR: [number, number, number, number] = [1.0, 1.0, 1.0, 0.5];

export interface PerkMenuUiContext {
  player: PlayerState;
  violenceDisabled: number;
  preserveBugs: boolean;
  resources: RuntimeResources;
  screenW: number;
  screenH: number;
  mouse: Vec2;
  fxDetail?: boolean;
  playSfx?: PlaySfxFn | null;
}

export class PerkMenuController {
  private static readonly _DESC_WRAP_WIDTH_PX = 256.0;

  private _cancelLabel: string;
  private _onClose: OnCloseFn | null;
  private _layout!: PerkMenuLayout;
  private _cancelButton!: UiButtonState;
  private _open!: boolean;
  private _selectedIndex!: number;
  private _timelineMs!: number;
  private _wrappedDescCache!: Map<string, string>;

  constructor(opts?: { cancelLabel?: string; onClose?: OnCloseFn | null }) {
    this._cancelLabel = opts?.cancelLabel ?? 'Cancel';
    this._onClose = opts?.onClose ?? null;
    this.reset();
  }

  get open(): boolean {
    return this._open;
  }

  set open(value: boolean) {
    if (!value && this._open) {
      this.close();
    } else {
      this._open = value;
    }
  }

  get selectedIndex(): number {
    return this._selectedIndex;
  }

  set selectedIndex(value: number) {
    this._selectedIndex = Math.floor(value);
  }

  get timelineMs(): number {
    return this._timelineMs;
  }

  set timelineMs(value: number) {
    this._timelineMs = value;
  }

  get active(): boolean {
    return this._open || this._timelineMs > 1e-3;
  }

  reset(): void {
    this._layout = new PerkMenuLayout();
    this._cancelButton = new UiButtonState(this._cancelLabel);
    this._open = false;
    this._selectedIndex = 0;
    this._timelineMs = 0.0;
    this._wrappedDescCache = new Map();
  }

  private _prewrappedPerkDesc(
    perkId: PerkId,
    font: SmallFontData,
    opts: { violenceDisabled: number; preserveBugs: boolean },
  ): string {
    const key = `${perkId}:${opts.violenceDisabled}:${opts.preserveBugs ? 1 : 0}`;
    const cached = this._wrappedDescCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const desc = perkDisplayDescription(perkId, opts.violenceDisabled, opts.preserveBugs);
    const wrapped = PerkMenuController._wrapSmallTextNative(
      font,
      desc,
      PerkMenuController._DESC_WRAP_WIDTH_PX,
      1.0,
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
    if (wrapped.length === 0) {
      return '';
    }

    const maxWidth = maxWidthPx;
    let remaining = maxWidth;
    let i = 0;
    while (i < wrapped.length) {
      const ch = wrapped[i];
      if (ch === '\r') {
        i += 1;
        continue;
      }
      if (ch === '\n') {
        remaining = maxWidth;
        i += 1;
        continue;
      }

      remaining -= measureSmallTextWidth(font, ch);
      if (remaining < 0.0) {
        let j = i;
        while (j > 0 && wrapped[j] !== ' ' && wrapped[j] !== '\n') {
          j -= 1;
        }
        if (wrapped[j] === ' ') {
          wrapped[j] = '\n';
          i = j;
        }
        remaining = maxWidth;
      }
      i += 1;
    }

    return wrapped.join('');
  }

  close(): void {
    if (!this._open) {
      return;
    }
    this._open = false;
    if (this._onClose !== null) {
      this._onClose();
    }
  }

  openMenu(opts?: { playSfx?: PlaySfxFn | null }): void {
    if (this._open) {
      return;
    }
    if (opts?.playSfx) {
      opts.playSfx(SfxId.UI_PANELCLICK);
    }
    this._open = true;
    this._selectedIndex = 0;
  }

  tickTimeline(dtUiMs: number): void {
    if (this._open) {
      this._timelineMs = clamp(this._timelineMs + dtUiMs, 0.0, PERK_MENU_TRANSITION_MS);
    } else {
      this._timelineMs = clamp(this._timelineMs - dtUiMs, 0.0, PERK_MENU_TRANSITION_MS);
    }
  }

  handleInput(
    ctx: PerkMenuUiContext,
    choices: readonly PerkId[],
    opts: { dtUiMs: number },
  ): number | null {
    if (choices.length === 0) {
      this.close();
      return null;
    }

    if (this._selectedIndex >= choices.length) {
      this._selectedIndex = 0;
    }

    // Keyboard navigation: Arrow Down
    if (InputState.wasKeyPressed(40)) {
      this._selectedIndex = (this._selectedIndex + 1) % choices.length;
    }
    // Keyboard navigation: Arrow Up
    if (InputState.wasKeyPressed(38)) {
      this._selectedIndex = (this._selectedIndex - 1 + choices.length) % choices.length;
    }

    const screenW = ctx.screenW;
    const screenH = ctx.screenH;
    const scale = uiScale(screenW, screenH);
    const origin = uiOrigin(screenW, screenH, scale);
    const slideX = perkMenuPanelSlideX(this._timelineMs, { width: this._layout.panelSize.x });

    const click = InputState.wasMouseButtonPressed(0);

    const masterOwned = ctx.player.perkCounts[PerkId.PERK_MASTER] > 0;
    const expertOwned = ctx.player.perkCounts[PerkId.PERK_EXPERT] > 0;
    const computed = perkMenuComputeLayout(this._layout, {
      screenW,
      origin,
      scale,
      choiceCount: choices.length,
      expertOwned,
      masterOwned,
      panelSlideX: slideX,
    });

    const preserveBugs = ctx.preserveBugs;
    for (let idx = 0; idx < choices.length; idx++) {
      const perkId = choices[idx];
      const label = perkDisplayName(perkId, ctx.violenceDisabled, preserveBugs);
      const itemPos = computed.listPos.offset(0.0, idx * computed.listStepY);
      const rect = menuItemHitRect(ctx.resources, label, { pos: itemPos, scale });
      if (rect.contains(ctx.mouse)) {
        this._selectedIndex = idx;
        if (click) {
          if (ctx.playSfx) {
            ctx.playSfx(SfxId.UI_BUTTONCLICK);
          }
          this.close();
          return idx;
        }
        break;
      }
    }

    const cancelW = buttonWidth(ctx.resources, this._cancelButton.label, {
      scale,
      forceWide: this._cancelButton.forceWide,
    });
    if (
      buttonUpdate(this._cancelButton, {
        pos: computed.cancelPos,
        width: cancelW,
        dtMs: opts.dtUiMs,
        mouse: ctx.mouse,
        click,
      })
    ) {
      if (ctx.playSfx) {
        ctx.playSfx(SfxId.UI_BUTTONCLICK);
      }
      this.close();
      return null;
    }

    // Enter or Space to confirm selection
    if (InputState.wasKeyPressed(13) || InputState.wasKeyPressed(32)) {
      if (ctx.playSfx) {
        ctx.playSfx(SfxId.UI_BUTTONCLICK);
      }
      this.close();
      return this._selectedIndex;
    }

    return null;
  }

  draw(glCtx: WebGLContext, ctx: PerkMenuUiContext, choices: readonly PerkId[]): void {
    const menuT = clamp(this._timelineMs / PERK_MENU_TRANSITION_MS, 0.0, 1.0);
    if (menuT <= 1e-3) {
      return;
    }

    if (choices.length === 0) {
      return;
    }
    if (this._selectedIndex >= choices.length) {
      this._selectedIndex = 0;
    }

    const screenW = ctx.screenW;
    const screenH = ctx.screenH;
    const scale = uiScale(screenW, screenH);
    const origin = uiOrigin(screenW, screenH, scale);
    const slideX = perkMenuPanelSlideX(this._timelineMs, { width: this._layout.panelSize.x });

    const masterOwned = ctx.player.perkCounts[PerkId.PERK_MASTER] > 0;
    const expertOwned = ctx.player.perkCounts[PerkId.PERK_EXPERT] > 0;
    const computed = perkMenuComputeLayout(this._layout, {
      screenW,
      origin,
      scale,
      choiceCount: choices.length,
      expertOwned,
      masterOwned,
      panelSlideX: slideX,
    });

    // Draw panel background
    const panelTex = getTexture(ctx.resources, TextureId.UI_MENU_PANEL);
    const panelDst: [number, number, number, number] = [
      computed.panel.x,
      computed.panel.y,
      computed.panel.w,
      computed.panel.h,
    ];
    drawClassicMenuPanel(glCtx, panelTex, panelDst, undefined, ctx.fxDetail ?? false);

    // Draw title texture
    const titleTex = getTexture(ctx.resources, TextureId.UI_TEXT_PICK_A_PERK);
    const titleSrc: [number, number, number, number] = [0.0, 0.0, titleTex.width, titleTex.height];
    const titleDst: [number, number, number, number] = [
      computed.title.x,
      computed.title.y,
      computed.title.w,
      computed.title.h,
    ];
    glCtx.drawTexturePro(titleTex, titleSrc, titleDst, [0.0, 0.0], 0.0, [1, 1, 1, 1]);

    // Sponsor text
    let sponsor: string | null = null;
    if (masterOwned) {
      sponsor = 'extra perks sponsored by the Perk Master';
    } else if (expertOwned) {
      sponsor = 'extra perk sponsored by the Perk Expert';
    }
    if (sponsor) {
      drawUiText(glCtx, ctx.resources, sponsor, computed.sponsorPos, {
        scale,
        color: UI_SPONSOR_COLOR,
      });
    }

    // Draw perk choice list
    const preserveBugs = ctx.preserveBugs;
    for (let idx = 0; idx < choices.length; idx++) {
      const perkId = choices[idx];
      const label = perkDisplayName(perkId, ctx.violenceDisabled, preserveBugs);
      const itemPos = computed.listPos.offset(0.0, idx * computed.listStepY);
      const rect = menuItemHitRect(ctx.resources, label, { pos: itemPos, scale });
      const hovered = rect.contains(ctx.mouse) || idx === this._selectedIndex;
      drawMenuItem(glCtx, ctx.resources, label, { pos: itemPos, scale, hovered });
    }

    // Draw selected perk description
    const selected = choices[this._selectedIndex];
    const desc = this._prewrappedPerkDesc(selected, ctx.resources.smallFont, {
      violenceDisabled: ctx.violenceDisabled,
      preserveBugs,
    });
    drawUiText(glCtx, ctx.resources, desc, computed.desc.topLeft, {
      scale,
      color: UI_TEXT_COLOR,
    });

    // Draw cancel button
    const cancelW = buttonWidth(ctx.resources, this._cancelButton.label, {
      scale,
      forceWide: this._cancelButton.forceWide,
    });
    buttonDraw(glCtx, ctx.resources, this._cancelButton, {
      pos: computed.cancelPos,
      width: cancelW,
      scale,
    });
  }
}
