// Port of crimson/screens/panels/mods.py — Mods panel

import { Vec2 } from '../../../grim/geom.ts';
import { type WebGLContext } from '../../../grim/webgl.ts';
import { type RuntimeResources } from '../../../grim/assets.ts';
import { drawSmallText } from '../../../grim/fonts/small.ts';
import {
  MENU_PANEL_WIDTH,
  type PanelGameState,
  PanelMenuView,
  uiElementAnim,
} from './base.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PANEL_TIMELINE_START_MS = 300;
const PANEL_TIMELINE_END_MS = 0;

type Color = [number, number, number, number];

// ---------------------------------------------------------------------------
// Content layout
// ---------------------------------------------------------------------------

interface ModsContentLayout {
  scale: number;
  basePos: Vec2;
  labelPos: Vec2;
}

// ---------------------------------------------------------------------------
// ModsMenuView
// ---------------------------------------------------------------------------

export class ModsMenuView extends PanelMenuView {
  private _lines: string[] = [];

  constructor(state: PanelGameState) {
    super(state, { title: 'Mods' });
  }

  open(): void {
    super.open();
    this._lines = this._buildLines();
  }

  private _contentLayout(): ModsContentLayout {
    const [panelScale, _localShift] = this._menuItemScale(0);
    const panelW = MENU_PANEL_WIDTH * panelScale;
    const [_angleRad, slideX] = uiElementAnim(
      this,
      1,
      PANEL_TIMELINE_START_MS,
      PANEL_TIMELINE_END_MS,
      panelW,
    );
    const panelTopLeft = new Vec2(
      this._panelPos.x + slideX,
      this._panelPos.y + this._widescreenYShift,
    ).add(this._panelOffset.mul(panelScale));
    const basePos = panelTopLeft.add(new Vec2(212.0 * panelScale, 32.0 * panelScale));
    const labelPos = basePos.offset(8.0 * panelScale, 0);
    return { scale: panelScale, basePos, labelPos };
  }

  private _buildLines(): string[] {
    // In WebGL, there is no filesystem access, so we always show
    // a placeholder message explaining mods are not available.
    return [
      'No mod DLLs found.',
      '',
      'Mod loading is not available',
      'in the WebGL version.',
    ];
  }

  protected _drawContents(ctx: WebGLContext, resources: RuntimeResources): void {
    const layout = this._contentLayout();
    const basePos = layout.basePos;
    const labelPos = layout.labelPos;
    const scale = layout.scale;

    const font = resources.smallFont;
    const titleColor: Color = [1, 1, 1, 1];
    const textColor: Color = [1, 1, 1, 0.8];

    drawSmallText(ctx, font, 'MODS', basePos, titleColor);
    let linePos = labelPos.offset(0, 44.0 * scale);
    const lineStep = (font.cellSize + 4.0) * scale;
    for (const line of this._lines) {
      drawSmallText(ctx, font, line, linePos, textColor);
      linePos = linePos.offset(0, lineStep);
    }
  }
}
