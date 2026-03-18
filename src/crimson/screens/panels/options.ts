// Port of crimson/screens/panels/options.py — Options menu panel

import { Vec2, Rect } from '@grim/geom.ts';
import { type WebGLContext, type GlTexture } from '@grim/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth } from '@grim/fonts/small.ts';
import { InputState } from '@grim/input.ts';
import { audioSetSfxVolume, audioSetMusicVolume } from '@grim/audio.ts';
import { type CrimsonConfig, applyDetailPreset } from '@grim/config.ts';
import {
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
} from '@crimson/ui/perk-menu.ts';
import {
  PanelMenuView,
  type PanelGameState,
  MENU_LABEL_ROW_HEIGHT,
  MENU_PANEL_WIDTH,
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
  uiElementAnim,
} from './base.ts';
import { mouseInsideRectWithPadding } from './hit-test.ts';

// ---------------------------------------------------------------------------
// Label row indices for the UI_ITEM_TEXTS sprite sheet
// ---------------------------------------------------------------------------

const MENU_LABEL_ROW_OPTIONS = 2;

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const MOUSE_BUTTON_LEFT = 0;

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

type Color = [number, number, number, number];
const WHITE: Color = [1, 1, 1, 1];

// ---------------------------------------------------------------------------
// SliderState
// ---------------------------------------------------------------------------

export class SliderState {
  value: number;
  minValue: number;
  maxValue: number;

  constructor(value: number, minValue: number, maxValue: number) {
    this.value = value;
    this.minValue = minValue;
    this.maxValue = maxValue;
  }
}

// ---------------------------------------------------------------------------
// OptionsContentLayout
// ---------------------------------------------------------------------------

interface OptionsContentLayout {
  scale: number;
  basePos: Vec2;
  labelPos: Vec2;
  sliderPos: Vec2;
}

// ---------------------------------------------------------------------------
// State interface consumed by OptionsMenuView
// ---------------------------------------------------------------------------

export interface OptionsPanelState extends PanelGameState {
  config: PanelGameState['config'] & {
    audio: {
      sfxVolume: number;
      musicVolume: number;
    };
    gameplay: {
      showInfoTexts: boolean;
    };
    display: PanelGameState['config']['display'] & {
      mouseSensitivity: number;
      detailPreset: number;
    };
    save?(): void;
  };
  console: {
    log: { log(msg: string): void };
  };
}

// ---------------------------------------------------------------------------
// OptionsMenuView
// ---------------------------------------------------------------------------

export class OptionsMenuView extends PanelMenuView {
  private static readonly _LABELS = [
    'Sound volume:',
    'Music volume:',
    'Graphics detail:',
    'Mouse sensitivity:',
  ];

  private _controlsButton: UiButtonState = new UiButtonState('Controls', { forceWide: true });
  private _sliderSfx: SliderState = new SliderState(10, 0, 10);
  private _sliderMusic: SliderState = new SliderState(10, 0, 10);
  private _sliderDetail: SliderState = new SliderState(5, 1, 5);
  private _sliderMouse: SliderState = new SliderState(10, 1, 10);
  private _uiInfoTexts: boolean = true;
  private _activeSlider: string | null = null;
  private _dirty: boolean = false;

  constructor(state: OptionsPanelState) {
    super(state, {
      title: 'Options',
      backAction: 'open_pause_menu',
    });
  }

  private get _optState(): OptionsPanelState {
    return this.state as OptionsPanelState;
  }

  override open(): void {
    super.open();
    this._controlsButton = new UiButtonState('Controls', { forceWide: true });
    this._activeSlider = null;
    this._dirty = false;
    this._syncFromConfig();
  }

  override update(dt: number): void {
    super.update(dt);
    if (this._closing) return;
    const entry = this._entry;
    if (entry === null || !this._entryEnabled(entry)) return;

    const config = this._optState.config;
    const layout = this._contentLayout();
    const basePos = layout.basePos;
    const labelPos = layout.labelPos;
    const sliderPos = layout.sliderPos;
    const scale = layout.scale;

    const resources = this._requireResources();
    const rectOn = getTexture(resources, TextureId.UI_RECT_ON);
    const rectOff = getTexture(resources, TextureId.UI_RECT_OFF);

    if (this._updateSlider('sfx', this._sliderSfx, sliderPos.offset(0.0, 47.0 * scale), rectOn, rectOff, scale)) {
      config.audio.sfxVolume = this._sliderSfx.value * 0.1;
      audioSetSfxVolume(this._optState.audio, config.audio.sfxVolume);
      this._dirty = true;
    }

    if (this._updateSlider('music', this._sliderMusic, sliderPos.offset(0.0, 67.0 * scale), rectOn, rectOff, scale)) {
      config.audio.musicVolume = this._sliderMusic.value * 0.1;
      audioSetMusicVolume(this._optState.audio, config.audio.musicVolume);
      this._dirty = true;
    }

    if (this._updateSlider('detail', this._sliderDetail, sliderPos.offset(0.0, 87.0 * scale), rectOn, rectOff, scale)) {
      const preset = applyDetailPreset(config as unknown as CrimsonConfig, this._sliderDetail.value);
      this._sliderDetail.value = preset;
      this._dirty = true;
    }

    if (this._updateSlider('mouse', this._sliderMouse, sliderPos.offset(0.0, 107.0 * scale), rectOn, rectOff, scale)) {
      let sensitivity = this._sliderMouse.value * 0.1;
      if (sensitivity < 0.1) sensitivity = 0.1;
      if (sensitivity > 1.0) sensitivity = 1.0;
      config.display.mouseSensitivity = sensitivity;
      this._dirty = true;
    }

    if (this._updateCheckbox(labelPos.offset(0.0, 135.0 * scale), scale, resources)) {
      config.gameplay.showInfoTexts = this._uiInfoTexts;
      this._dirty = true;
    }

    // `sub_4475d0`: controls button is aligned with the panel content base.
    const controlsPos = basePos.offset(0.0, 155.0 * scale);
    const dtMs = Math.min(dt, 0.1) * 1000.0;
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);
    const width = buttonWidth(
      resources,
      this._controlsButton.label,
      { scale, forceWide: this._controlsButton.forceWide },
    );
    if (buttonUpdate(this._controlsButton, {
      pos: controlsPos,
      width,
      dtMs,
      mouse,
      click,
    })) {
      this._beginCloseTransition('open_controls');
    }
  }

  protected override _beginCloseTransition(action: string): void {
    if (this._dirty) {
      try {
        const cfg = this._optState.config;
        if (cfg.save) cfg.save();
        this._dirty = false;
      } catch (exc) {
        this._optState.console.log.log(`config: save failed: ${exc}`);
      }
    }
    super._beginCloseTransition(action);
  }

  private _requireResources(): RuntimeResources {
    return this._optState.resources as RuntimeResources;
  }

  private _syncFromConfig(): void {
    const config = this._optState.config;
    this._uiInfoTexts = config.gameplay.showInfoTexts;

    const sfxVolume = config.audio.sfxVolume;
    const musicVolume = config.audio.musicVolume;
    let detailPreset = config.display.detailPreset;
    const mouseSensitivity = config.display.mouseSensitivity;

    this._sliderSfx.value = Math.max(
      this._sliderSfx.minValue,
      Math.min(this._sliderSfx.maxValue, (sfxVolume * 10.0) | 0),
    );
    this._sliderMusic.value = Math.max(
      this._sliderMusic.minValue,
      Math.min(this._sliderMusic.maxValue, (musicVolume * 10.0) | 0),
    );
    if (detailPreset < this._sliderDetail.minValue) {
      detailPreset = this._sliderDetail.minValue;
    }
    if (detailPreset > this._sliderDetail.maxValue) {
      detailPreset = this._sliderDetail.maxValue;
    }
    this._sliderDetail.value = detailPreset;
    this._sliderMouse.value = Math.max(
      this._sliderMouse.minValue,
      Math.min(this._sliderMouse.maxValue, (mouseSensitivity * 10.0 + 0.5) | 0),
    );
  }

  private _contentLayout(): OptionsContentLayout {
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

    const basePos = panelTopLeft.add(new Vec2(212.0 * panelScale, 40.0 * panelScale));
    // `sub_4475d0`: title label is anchored at panel_top + 40.
    const labelPos = basePos.offset(8.0 * panelScale);
    const sliderPos = labelPos.offset(130.0 * panelScale);
    return { basePos, labelPos, sliderPos, scale: panelScale };
  }

  private _updateSlider(
    sliderId: string,
    slider: SliderState,
    pos: Vec2,
    rectOn: GlTexture,
    rectOff: GlTexture,
    scale: number,
  ): boolean {
    const rectW = rectOn.width * scale;
    const rectH = rectOn.height * scale;
    if (rectW <= 0.0 || rectH <= 0.0) return false;
    const barW = rectW * slider.maxValue;
    const [mx, my] = InputState.mousePosition();
    const mousePos = { x: mx, y: my };
    const hovered = mouseInsideRectWithPadding(
      mousePos, pos, barW, 18.0 * scale, 3.0 * scale, 1.0 * scale,
    );

    let changed = false;
    if (hovered) {
      if (InputState.wasKeyPressed(KEY_LEFT)) {
        slider.value = Math.max(slider.minValue, slider.value - 1);
        changed = true;
      }
      if (InputState.wasKeyPressed(KEY_RIGHT)) {
        slider.value = Math.min(slider.maxValue, slider.value + 1);
        changed = true;
      }
    }
    const mouseDown = InputState.isMouseButtonDown(MOUSE_BUTTON_LEFT);
    if (hovered && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._activeSlider = sliderId;
    }
    if (this._activeSlider === sliderId && mouseDown) {
      const relative = mx - pos.x;
      let idx = ((relative / rectW) | 0) + 1;
      if (idx < slider.minValue) idx = slider.minValue;
      if (idx > slider.maxValue) idx = slider.maxValue;
      if (slider.value !== idx) {
        slider.value = idx;
        changed = true;
      }
    }
    if (this._activeSlider === sliderId && !mouseDown) {
      this._activeSlider = null;
    }

    return changed;
  }

  private _updateCheckbox(pos: Vec2, scale: number, resources: RuntimeResources): boolean {
    const checkOn = getTexture(resources, TextureId.UI_CHECK_ON);
    const font = resources.smallFont;
    const textScale = 1.0 * scale;
    const label = 'UI Info texts';
    const labelW = measureSmallTextWidth(font, label);
    const rectW = checkOn.width * scale + 6.0 * scale + labelW;
    const rectH = Math.max(checkOn.height * scale, font.cellSize * textScale);
    const [mx, my] = InputState.mousePosition();
    const mousePos = { x: mx, y: my };
    const hitRect = Rect.fromTopLeft(pos, rectW, rectH);
    const hovered = hitRect.contains(mousePos);
    if (hovered && InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
      this._uiInfoTexts = !this._uiInfoTexts;
      return true;
    }
    return false;
  }

  protected override _drawContents(ctx: WebGLContext, resources: RuntimeResources): void {
    this._drawOptionsContents(ctx, resources);
  }

  private _drawOptionsContents(ctx: WebGLContext, resources: RuntimeResources): void {
    const labelsTex = getTexture(resources, TextureId.UI_ITEM_TEXTS);
    const layout = this._contentLayout();
    const basePos = layout.basePos;
    const labelPos = layout.labelPos;
    const sliderPos = layout.sliderPos;
    const scale = layout.scale;

    const font = resources.smallFont;
    const textColor: Color = [1, 1, 1, 0.8];

    const titleW = 128.0;
    const src: [number, number, number, number] = [
      0.0,
      MENU_LABEL_ROW_OPTIONS * MENU_LABEL_ROW_HEIGHT,
      titleW,
      MENU_LABEL_ROW_HEIGHT,
    ];
    const dst: [number, number, number, number] = [
      basePos.x, basePos.y,
      titleW * scale, MENU_LABEL_ROW_HEIGHT * scale,
    ];
    ctx.drawTexturePro(labelsTex, src, dst, [0.0, 0.0], 0.0, WHITE);

    const yOffsets = [47.0, 67.0, 87.0, 107.0];
    for (let i = 0; i < OptionsMenuView._LABELS.length; i++) {
      drawSmallText(
        ctx, font, OptionsMenuView._LABELS[i],
        labelPos.offset(0.0, yOffsets[i] * scale),
        textColor,
      );
    }

    const rectOn = getTexture(resources, TextureId.UI_RECT_ON);
    const rectOff = getTexture(resources, TextureId.UI_RECT_OFF);
    const rectW = rectOn.width * scale;
    const rectH = rectOn.height * scale;

    this._drawSlider(ctx, this._sliderSfx, sliderPos.offset(0.0, 47.0 * scale), rectOn, rectOff, rectW, rectH);
    this._drawSlider(ctx, this._sliderMusic, sliderPos.offset(0.0, 67.0 * scale), rectOn, rectOff, rectW, rectH);
    this._drawSlider(ctx, this._sliderDetail, sliderPos.offset(0.0, 87.0 * scale), rectOn, rectOff, rectW, rectH);
    this._drawSlider(ctx, this._sliderMouse, sliderPos.offset(0.0, 107.0 * scale), rectOn, rectOff, rectW, rectH);

    const checkTex = this._uiInfoTexts
      ? getTexture(resources, TextureId.UI_CHECK_ON)
      : getTexture(resources, TextureId.UI_CHECK_OFF);
    const checkW = checkTex.width * scale;
    const checkH = checkTex.height * scale;
    const checkPos = labelPos.offset(0.0, 135.0 * scale);
    ctx.drawTexturePro(
      checkTex,
      [0.0, 0.0, checkTex.width, checkTex.height],
      [checkPos.x, checkPos.y, checkW, checkH],
      [0.0, 0.0], 0.0, WHITE,
    );
    drawSmallText(
      ctx, font, 'UI Info texts',
      checkPos.add(new Vec2(checkW + 6.0 * scale, 1.0 * scale)),
      textColor,
    );

    const buttonPos = basePos.offset(0.0, 155.0 * scale);
    const buttonW = buttonWidth(
      resources, this._controlsButton.label,
      { scale, forceWide: this._controlsButton.forceWide },
    );
    buttonDraw(ctx, resources, this._controlsButton, {
      pos: buttonPos, width: buttonW, scale,
    });
  }

  private _drawSlider(
    ctx: WebGLContext,
    slider: SliderState,
    pos: Vec2,
    rectOn: GlTexture,
    rectOff: GlTexture,
    rectW: number,
    rectH: number,
  ): void {
    for (let idx = 0; idx < slider.maxValue; idx++) {
      const tex = idx < slider.value ? rectOn : rectOff;
      const dst: [number, number, number, number] = [pos.x + idx * rectW, pos.y, rectW, rectH];
      const tint: Color = idx < slider.value ? WHITE : [1, 1, 1, 0.5];
      ctx.drawTexturePro(
        tex,
        [0.0, 0.0, tex.width, tex.height],
        dst,
        [0.0, 0.0], 0.0, tint,
      );
    }
  }
}
