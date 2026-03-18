// Port of crimson/screens/quest_views/end_note.py — End-note ("victory") screen

import { Vec2 } from '../../../grim/geom.ts';
import { type WebGLContext } from '../../../grim/webgl.ts';
import { type RuntimeResources, TextureId, getTexture } from '../../../grim/assets.ts';
import { drawSmallText } from '../../../grim/fonts/small.ts';
import { InputState } from '../../../grim/input.ts';
import { type AudioState, audioPlaySfx, audioUpdate } from '../../../grim/audio.ts';
import { SfxId } from '../../../grim/sfx-map.ts';
import { GameMode } from '../../game-modes.ts';
import { drawClassicMenuPanel } from '../../ui/menu-panel.ts';
import { drawMenuCursor } from '../../ui/cursor.ts';
import { menuWidescreenYShift } from '../../ui/layout.ts';
import {
  UiButtonState,
  buttonDraw,
  buttonUpdate,
  buttonWidth,
} from '../../ui/perk-menu.ts';
import {
  PANEL_TIMELINE_START_MS,
  PANEL_TIMELINE_END_MS,
} from '../panels/base.ts';
import { drawScreenFade } from '../transitions.ts';
import {
  END_NOTE_AFTER_BODY_Y_GAP,
  END_NOTE_BODY_X_OFFSET,
  END_NOTE_BODY_Y_GAP,
  END_NOTE_BUTTON_STEP_Y,
  END_NOTE_BUTTON_X_OFFSET,
  END_NOTE_BUTTON_Y_OFFSET,
  END_NOTE_HEADER_X_OFFSET,
  END_NOTE_HEADER_Y_OFFSET,
  END_NOTE_LINE_STEP_Y,
  END_NOTE_PANEL_GEOM_X0,
  END_NOTE_PANEL_GEOM_Y0,
  END_NOTE_PANEL_H,
  END_NOTE_PANEL_POS_X,
  END_NOTE_PANEL_POS_Y,
  END_NOTE_PANEL_W,
} from './shared.ts';

// ---------------------------------------------------------------------------
// Key constants
// ---------------------------------------------------------------------------

const KEY_ESCAPE = 27;
const MOUSE_BUTTON_LEFT = 0;

type Color = [number, number, number, number];
const WHITE: Color = [1, 1, 1, 1];
const ORIGIN: [number, number] = [0, 0];

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface EndNoteState {
  config: {
    display: {
      width: number;
      height: number;
      fxDetail: [boolean, boolean, boolean];
    };
    gameplay: {
      mode: number;
      hardcore: boolean;
    };
  };
  audio: AudioState | null;
  resources: RuntimeResources | null;
  preserveBugs: boolean;
  pauseBackground: { drawPauseBackground(ctx: WebGLContext, opts?: { entityAlpha?: number }): void } | null;
  menuGround: { processPending(): void; draw(camera: Vec2): void } | null;
  menuGroundCamera: Vec2 | null;
  screenFadeAlpha: number;
  screenFadeRamp: boolean;
}

// ---------------------------------------------------------------------------
// EndNoteView
// ---------------------------------------------------------------------------

export class EndNoteView {
  private state: EndNoteState;
  private _ground: { processPending(): void; draw(camera: Vec2): void } | null = null;
  private _action: string | null = null;
  private _cursorPulseTime: number = 0.0;
  private _timelineMs: number = 0;
  private _timelineMaxMs: number = PANEL_TIMELINE_START_MS;
  private _closing: boolean = false;
  private _closeAction: string | null = null;

  private _survivalButton: UiButtonState;
  private _rushButton: UiButtonState;
  private _typoButton: UiButtonState;
  private _mainMenuButton: UiButtonState;

  constructor(state: EndNoteState) {
    this.state = state;
    this._survivalButton = new UiButtonState('Survival', { forceWide: true });
    this._rushButton = new UiButtonState('  Rush  ', { forceWide: true });
    this._typoButton = new UiButtonState("Typ'o'Shooter", { forceWide: true });
    this._mainMenuButton = new UiButtonState('Main Menu', { forceWide: true });
  }

  open(): void {
    this._action = null;
    this._cursorPulseTime = 0.0;
    this._timelineMs = 0;
    this._timelineMaxMs = PANEL_TIMELINE_START_MS;
    this._closing = false;
    this._closeAction = null;
    this._ground = this.state.pauseBackground !== null ? null : (this.state.menuGround ?? null);
  }

  close(): void {
    this._ground = null;
    this._closing = false;
    this._closeAction = null;
  }

  update(dt: number): void {
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this._ground !== null) {
      this._ground.processPending();
    }
    const dtStep = Math.min(dt, 0.1);
    this._cursorPulseTime += dtStep * 1.1;
    const dtMs = (dtStep * 1000.0) | 0;

    if (this._closing) {
      if (dtMs > 0 && this._action === null) {
        this._timelineMs -= dtMs;
        if (this._timelineMs < 0 && this._closeAction !== null) {
          this._action = this._closeAction;
          this._closeAction = null;
        }
      }
      return;
    }
    if (dtMs > 0) {
      this._timelineMs = Math.min(this._timelineMaxMs, this._timelineMs + dtMs);
    }

    const enabled = this._timelineMs >= this._timelineMaxMs;
    if (InputState.wasKeyPressed(KEY_ESCAPE) && enabled) {
      this._beginCloseTransition('back_to_menu');
      return;
    }

    if (!enabled) return;

    const screenW = this.state.config.display.width;
    const scale = 1.0;
    const layoutW = scale ? screenW / scale : screenW;
    const widescreenShiftY = menuWidescreenYShift(layoutW);

    const panelTopLeft = new Vec2(
      (END_NOTE_PANEL_GEOM_X0 + END_NOTE_PANEL_POS_X) * scale,
      (END_NOTE_PANEL_GEOM_Y0 + END_NOTE_PANEL_POS_Y + widescreenShiftY) * scale,
    );
    let buttonPos = panelTopLeft.add(new Vec2(
      END_NOTE_BUTTON_X_OFFSET * scale,
      END_NOTE_BUTTON_Y_OFFSET * scale,
    ));

    const resources = this._requireResources();
    const [mx, my] = InputState.mousePosition();
    const mouse = { x: mx, y: my };
    const click = InputState.wasMouseButtonPressed(MOUSE_BUTTON_LEFT);

    const survivalW = buttonWidth(resources, this._survivalButton.label, { scale, forceWide: this._survivalButton.forceWide });
    if (buttonUpdate(this._survivalButton, { pos: buttonPos, width: survivalW, dtMs, mouse, click })) {
      this.state.config.gameplay.mode = GameMode.SURVIVAL;
      this._beginCloseTransition('start_survival');
      return;
    }

    buttonPos = buttonPos.offset(0.0, END_NOTE_BUTTON_STEP_Y * scale);
    const rushW = buttonWidth(resources, this._rushButton.label, { scale, forceWide: this._rushButton.forceWide });
    if (buttonUpdate(this._rushButton, { pos: buttonPos, width: rushW, dtMs, mouse, click })) {
      this.state.config.gameplay.mode = GameMode.RUSH;
      this._beginCloseTransition('start_rush');
      return;
    }

    buttonPos = buttonPos.offset(0.0, END_NOTE_BUTTON_STEP_Y * scale);
    const typoW = buttonWidth(resources, this._typoButton.label, { scale, forceWide: this._typoButton.forceWide });
    if (buttonUpdate(this._typoButton, { pos: buttonPos, width: typoW, dtMs, mouse, click })) {
      this.state.config.gameplay.mode = GameMode.TYPO;
      this._beginCloseTransition('start_typo', true);
      return;
    }

    buttonPos = buttonPos.offset(0.0, END_NOTE_BUTTON_STEP_Y * scale);
    const mainW = buttonWidth(resources, this._mainMenuButton.label, { scale, forceWide: this._mainMenuButton.forceWide });
    if (buttonUpdate(this._mainMenuButton, { pos: buttonPos, width: mainW, dtMs, mouse, click })) {
      this._beginCloseTransition('back_to_menu');
      return;
    }
  }

  draw(ctx: WebGLContext, screenW: number = ctx.screenWidth, screenH: number = ctx.screenHeight): void {
    ctx.clearBackground(0, 0, 0, 1);
    const pauseBackground = this.state.pauseBackground;
    if (pauseBackground !== null) {
      pauseBackground.drawPauseBackground(ctx, { entityAlpha: this._worldEntityAlpha() });
    } else if (this._ground !== null) {
      const camera = this.state.menuGroundCamera ?? new Vec2();
      this._ground.draw(camera);
    }
    drawScreenFade(ctx, this.state, screenW, screenH);

    const resources = this._requireResources();
    const scale = 1.0;
    const layoutW = scale ? screenW / scale : screenW;
    const widescreenShiftY = menuWidescreenYShift(layoutW);

    const panelTopLeft = new Vec2(
      (END_NOTE_PANEL_GEOM_X0 + END_NOTE_PANEL_POS_X) * scale,
      (END_NOTE_PANEL_GEOM_Y0 + END_NOTE_PANEL_POS_Y + widescreenShiftY) * scale,
    );

    const fxDetail = this.state.config.display.fxDetail[0];
    const panelTex = getTexture(resources, TextureId.UI_MENU_PANEL);
    drawClassicMenuPanel(
      ctx, panelTex,
      [panelTopLeft.x, panelTopLeft.y, END_NOTE_PANEL_W * scale, END_NOTE_PANEL_H * scale],
      WHITE, fxDetail,
    );

    const font = resources.smallFont;
    const hardcore = this.state.config.gameplay.hardcore;
    const header = hardcore ? '   Incredible!' : 'Congratulations!';
    const levelsLine = this.state.preserveBugs
      ? "You've completed all the levels but the battle"
      : "You've completed all the levels, but the battle";

    const bodyLines = hardcore
      ? [
          "You've done the thing we all thought was",
          'virtually impossible. To reward your',
          'efforts a new weapon has been unlocked ',
          'for you: Splitter Gun.',
          '',
          '',
        ]
      : [
          levelsLine,
          "isn't over yet! With all of the unlocked perks",
          'and weapons your Survival is just a bit easier.',
          'You can also replay the quests in Hardcore.',
          'As an additional reward for your victorious',
          'playing, a completely new and different game',
          "mode is unlocked for you: Typ'o'Shooter.",
        ];

    const headerPos = panelTopLeft.add(new Vec2(
      END_NOTE_HEADER_X_OFFSET * scale,
      END_NOTE_HEADER_Y_OFFSET * scale,
    ));
    const headerColor: Color = [1.0, 1.0, 1.0, 0.8];
    const bodyColor: Color = [1.0, 1.0, 1.0, 0.5];

    drawSmallText(ctx, font, header, headerPos, headerColor);

    let bodyPos = new Vec2(
      panelTopLeft.x + END_NOTE_BODY_X_OFFSET * scale,
      headerPos.y + END_NOTE_BODY_Y_GAP * scale,
    );
    for (let idx = 0; idx < bodyLines.length; idx++) {
      drawSmallText(ctx, font, bodyLines[idx], bodyPos, bodyColor);
      if (idx !== bodyLines.length - 1) {
        bodyPos = bodyPos.offset(0.0, END_NOTE_LINE_STEP_Y * scale);
      }
    }
    bodyPos = bodyPos.offset(0.0, END_NOTE_AFTER_BODY_Y_GAP * scale);
    drawSmallText(ctx, font, 'Good luck with your battles, trooper!', bodyPos, bodyColor);

    // Buttons
    let buttonPos = panelTopLeft.add(new Vec2(
      END_NOTE_BUTTON_X_OFFSET * scale,
      END_NOTE_BUTTON_Y_OFFSET * scale,
    ));
    const survivalW = buttonWidth(resources, this._survivalButton.label, { scale, forceWide: this._survivalButton.forceWide });
    buttonDraw(ctx, resources, this._survivalButton, { pos: buttonPos, width: survivalW, scale });
    buttonPos = buttonPos.offset(0.0, END_NOTE_BUTTON_STEP_Y * scale);
    const rushW = buttonWidth(resources, this._rushButton.label, { scale, forceWide: this._rushButton.forceWide });
    buttonDraw(ctx, resources, this._rushButton, { pos: buttonPos, width: rushW, scale });
    buttonPos = buttonPos.offset(0.0, END_NOTE_BUTTON_STEP_Y * scale);
    const typoW = buttonWidth(resources, this._typoButton.label, { scale, forceWide: this._typoButton.forceWide });
    buttonDraw(ctx, resources, this._typoButton, { pos: buttonPos, width: typoW, scale });
    buttonPos = buttonPos.offset(0.0, END_NOTE_BUTTON_STEP_Y * scale);
    const mainW = buttonWidth(resources, this._mainMenuButton.label, { scale, forceWide: this._mainMenuButton.forceWide });
    buttonDraw(ctx, resources, this._mainMenuButton, { pos: buttonPos, width: mainW, scale });

    // Menu cursor
    const particles = getTexture(resources, TextureId.PARTICLES);
    const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
    const [mx, my] = InputState.mousePosition();
    drawMenuCursor(ctx, particles, cursorTex, new Vec2(mx, my), this._cursorPulseTime);
  }

  takeAction(): string | null {
    const action = this._action;
    this._action = null;
    return action;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _requireResources(): RuntimeResources {
    if (this.state.resources === null) {
      throw new Error('runtime resources are not loaded');
    }
    return this.state.resources;
  }

  private _worldEntityAlpha(): number {
    if (!this._closing) return 1.0;
    const span = PANEL_TIMELINE_START_MS - PANEL_TIMELINE_END_MS;
    if (span <= 0) return 0.0;
    let alpha = (this._timelineMs - PANEL_TIMELINE_END_MS) / span;
    if (alpha < 0.0) return 0.0;
    if (alpha > 1.0) return 1.0;
    return alpha;
  }

  private _beginCloseTransition(action: string, fadeToBlack: boolean = false): void {
    if (this._closing) return;
    if (fadeToBlack) {
      this.state.screenFadeAlpha = 0.0;
      this.state.screenFadeRamp = true;
    }
    if (this.state.audio !== null) {
      audioPlaySfx(this.state.audio, SfxId.UI_BUTTONCLICK);
    }
    this._closing = true;
    this._closeAction = action;
  }
}
