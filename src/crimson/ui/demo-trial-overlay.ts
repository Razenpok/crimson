// Port of crimson/ui/demo_trial_overlay.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { clamp } from '@grim/math.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText } from '@grim/fonts/small.ts';
import { DemoTrialOverlayInfo } from '@crimson/demo-trial.ts';
import { UiButtonState, buttonDraw, buttonUpdate, buttonWidth } from './perk-menu.ts';
import { drawMenuCursor } from './cursor.ts';

const _DEMO_HEADER_TEXT = "You've been playing the Demo version of";
const _QUEST_COMPLETED_TEXT =
  "You've completed all Quest mode levels available in the Demo version.";
const _QUEST_LIMIT_REMAINING_TEXT =
  'However, you still have {remaining} time left to play Survival and Rush game modes.';
const _QUEST_GRACE_USED_UP_TEXT =
  'You have used up your play time in this game mode. However, you still';
const _QUEST_GRACE_REMAINING_TEXT =
  'have {remaining} time left to play Quest mode levels only.';
const _UPGRADE_ALL_FEATURES_TEXT =
  'If you would like to have unlimited play time and access to all features,';
const _UPGRADE_FEATURES_LINE_TEXT =
  'The full version features unrestricted access to all 3';
const _UPGRADE_BUY_FULL_TEXT =
  'Buy the full version to gain unrestricted access to all 3';
const _UPGRADE_BUY_LINE_TEXT =
  'game modes and be able to post your scores on the Internet. Why not buy';
const _UPGRADE_TRAILER_TEXT = "it now? You'll have a great time!";
const _UPGRADE_PLEASE_TEXT =
  'please upgrade to the full version of Crimsonland.';
const _UPGRADE_PROCESS_TEXT =
  'please upgrade to the full version of Crimsonland.  The process is very easy';
const _UPGRADE_PROCESS_CONT_TEXT = 'and takes just minutes. ';
const _UPGRADE_EASY_TEXT = 'is very easy and takes just minutes.';
const _TIME_UP_TEXT =
  'Trial time is up. If you would like to have unlimited play time and access to';
const _TIME_UP_ALL_FEATURES_TEXT =
  'all features, please upgrade to the full version of Crimsonland.  The process';

type BodyLine = [number, string];

function _overlayBodyLines(info: DemoTrialOverlayInfo): BodyLine[] {
  if (info.kind === 'quest_tier_limit') {
    if (info.showRemainingLine) {
      return [
        [74.0, _QUEST_COMPLETED_TEXT],
        [92.0, _QUEST_LIMIT_REMAINING_TEXT.replace('{remaining}', info.remainingLabel)],
        [124.0, _UPGRADE_ALL_FEATURES_TEXT],
        [142.0, _UPGRADE_PLEASE_TEXT],
        [164.0, _UPGRADE_FEATURES_LINE_TEXT],
        [182.0, _UPGRADE_BUY_LINE_TEXT],
        [200.0, _UPGRADE_TRAILER_TEXT],
      ];
    }
    return [
      [86.0, _QUEST_COMPLETED_TEXT],
      [104.0, _UPGRADE_ALL_FEATURES_TEXT],
      [122.0, _UPGRADE_PLEASE_TEXT],
      [144.0, _UPGRADE_FEATURES_LINE_TEXT],
      [162.0, _UPGRADE_BUY_LINE_TEXT],
      [180.0, _UPGRADE_TRAILER_TEXT],
    ];
  }
  if (info.kind === 'quest_grace_left') {
    return [
      [73.0, _QUEST_GRACE_USED_UP_TEXT],
      [89.0, _QUEST_GRACE_REMAINING_TEXT.replace('{remaining}', info.remainingLabel)],
      [111.0, _UPGRADE_ALL_FEATURES_TEXT],
      [127.0, _UPGRADE_PROCESS_TEXT],
      [143.0, _UPGRADE_PROCESS_CONT_TEXT],
      [165.0, _UPGRADE_BUY_FULL_TEXT],
      [181.0, _UPGRADE_BUY_LINE_TEXT],
      [197.0, _UPGRADE_TRAILER_TEXT],
    ];
  }
  // time_up (default)
  return [
    [80.0, _TIME_UP_TEXT],
    [98.0, _TIME_UP_ALL_FEATURES_TEXT],
    [116.0, _UPGRADE_EASY_TEXT],
    [140.0, _UPGRADE_BUY_FULL_TEXT],
    [158.0, _UPGRADE_BUY_LINE_TEXT],
    [176.0, _UPGRADE_TRAILER_TEXT],
  ];
}

function _panelXY(screenW: number, screenH: number): Vec2 {
  return new Vec2(screenW * 0.5 - 256.0, screenH * 0.5 - 128.0);
}

export class DemoTrialOverlayUi {
  private readonly _resources: RuntimeResources;
  private _cursorPulseTime: number = 0.0;
  private readonly _purchaseButton: UiButtonState;
  private readonly _maybeLaterButton: UiButtonState;

  constructor(resources: RuntimeResources) {
    this._resources = resources;
    this._purchaseButton = new UiButtonState('Purchase', { forceWide: true });
    this._maybeLaterButton = new UiButtonState('Maybe later', { forceWide: true });
  }

  close(): void {
    this._cursorPulseTime = 0.0;
  }

  update(
    dtMs: number,
    screenW: number,
    screenH: number,
    mouseX: number,
    mouseY: number,
    click: boolean,
  ): string | null {
    const dt = Math.max(0, int(dtMs));
    this._cursorPulseTime += dt * 0.001 * 1.1;

    const mx = clamp(mouseX, 0.0, Math.max(0.0, screenW - 1.0));
    const my = clamp(mouseY, 0.0, Math.max(0.0, screenH - 1.0));
    const mouse = { x: mx, y: my };

    const panelPos = _panelXY(screenW, screenH);
    const scale = 1.0;
    const btnW = buttonWidth(this._resources, this._purchaseButton.label, {
      scale,
      forceWide: true,
    });
    const gap = 20.0;
    const rowW = btnW * 2.0 + gap;
    const buttonBasePos = panelPos.offset({ dx: 256.0 - rowW * 0.5, dy: 214.0 });

    const purchaseClicked = buttonUpdate(this._purchaseButton, {
      pos: buttonBasePos,
      width: btnW,
      dtMs: dt,
      mouse,
      click,
    });
    const maybeClicked = buttonUpdate(this._maybeLaterButton, {
      pos: buttonBasePos.offset({ dx: btnW + gap }),
      width: btnW,
      dtMs: dt,
      mouse,
      click,
    });

    if (purchaseClicked) return 'purchase';
    if (maybeClicked) return 'maybe_later';
    return null;
  }

  draw(
    info: DemoTrialOverlayInfo,
    screenW: number,
    screenH: number,
    mouseX: number,
    mouseY: number,
  ): void {
    if (!info.visible) return;

    const panelPos = _panelXY(screenW, screenH);
    const px = int(panelPos.x);
    const py = int(panelPos.y);
    const pw = 512;
    const ph = 256;

    // Panel background
    wgl.drawRectangle(px, py, pw, ph, wgl.makeColor(18 / 255, 18 / 255, 22 / 255, 230 / 255));

    // Panel border (4 thin rectangles)
    const bR = 1.0;
    const bG = 1.0;
    const bB = 1.0;
    const bA = 1.0;
    const borderColor = wgl.makeColor(bR, bG, bB, bA);
    wgl.drawRectangle(px, py, pw, 1, borderColor);           // top
    wgl.drawRectangle(px, py + ph - 1, pw, 1, borderColor);  // bottom
    wgl.drawRectangle(px, py, 1, ph, borderColor);            // left
    wgl.drawRectangle(px + pw - 1, py, 1, ph, borderColor);   // right

    // Logo
    const logo = getTexture(this._resources, TextureId.CL_LOGO);
    const logoSrc = wgl.makeRectangle(0, 0, logo.width, logo.height);
    const logoDst = wgl.makeRectangle(
      panelPos.x + 72.0,
      panelPos.y + 22.0,
      371.2,
      46.4,
    );
    wgl.drawTexturePro(logo, logoSrc, logoDst, wgl.makeVector2(0, 0), 0, wgl.makeColor(1, 1, 1, 1));

    // Header text
    const font = this._resources.smallFont;
    const headerColor = wgl.makeColor(220 / 255, 220 / 255, 220 / 255, 1.0);
    drawSmallText(
      font,
      _DEMO_HEADER_TEXT,
      new Vec2(panelPos.x + 131.0, panelPos.y + 9.0),
      headerColor,
    );

    // Body lines
    const bodyColor = wgl.makeColor(220 / 255, 220 / 255, 220 / 255, 1.0);
    const bodyX = panelPos.x + 26.0;
    const bodyLines = _overlayBodyLines(info);
    for (const [yOffset, line] of bodyLines) {
      drawSmallText(font, line, new Vec2(bodyX, panelPos.y + yOffset), bodyColor);
    }

    // Buttons
    const scale = 1.0;
    const btnW = 145.0 * scale;
    const gap = 20.0;
    const rowW = btnW * 2.0 + gap;
    const buttonBasePos = panelPos.offset({ dx: 256.0 - rowW * 0.5, dy: 214.0 });

    buttonDraw(this._resources, this._purchaseButton, {
      pos: buttonBasePos,
      width: btnW,
      scale,
    });
    buttonDraw(this._resources, this._maybeLaterButton, {
      pos: buttonBasePos.offset({ dx: btnW + gap }),
      width: btnW,
      scale,
    });

    // Cursor
    const particlesTex = this._resources.textures.get(TextureId.PARTICLES) ?? null;
    const cursorTex = this._resources.textures.get(TextureId.UI_CURSOR) ?? null;
    drawMenuCursor(
      particlesTex,
      cursorTex,
      { pos: new Vec2(mouseX, mouseY), pulseTime: this._cursorPulseTime },
    );
  }
}
