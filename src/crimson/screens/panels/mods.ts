// Port of crimson/screens/panels/mods.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { type RuntimeResources } from '@grim/assets.ts';
import { drawSmallText } from '@grim/fonts/small.ts';
import {
  MENU_PANEL_WIDTH,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
  type PanelGameState,
  PanelMenuView,
  uiElementAnim,
} from './base.ts';

interface ModsContentLayout {
  scale: number;
  basePos: Vec2;
  labelPos: Vec2;
}

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
    const labelPos = basePos.offset({ dx: 8.0 * panelScale });
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

  protected _drawContents(resources: RuntimeResources): void {
    const layout = this._contentLayout();
    const basePos = layout.basePos;
    const labelPos = layout.labelPos;
    const scale = layout.scale;

    const font = resources.smallFont;
    const titleColor = wgl.makeColor(1, 1, 1, 1);
    const textColor = wgl.makeColor(1, 1, 1, 0.8);

    drawSmallText(font, 'MODS', basePos, titleColor);
    let linePos = labelPos.offset({ dy: 44.0 * scale });
    const lineStep = (font.cellSize + 4.0) * scale;
    for (const line of this._lines) {
      drawSmallText(font, line, linePos, textColor);
      linePos = linePos.offset({ dy: lineStep });
    }
  }
}
