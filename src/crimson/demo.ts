// Port of crimson/demo.py

import * as wgl from "@wgl";
import { getTexture, TextureId } from "@grim/assets.ts";
import { audioUpdate } from "@grim/audio.ts";
import { drawSmallText, measureSmallTextWidth } from "@grim/fonts/small.ts";
import { createGrimMonoFont, drawGrimMonoText, type GrimMonoFont } from "@grim/fonts/grim-mono.ts";
import { Vec2 } from "@grim/geom.ts";
import { InputState } from "@grim/input.ts";
import { clamp } from "@grim/math.ts";
import type { CreatureState } from "./creatures/runtime.ts";
import { RANDOM_HEADING_SENTINEL, SpawnId } from "./creatures/spawn-ids.ts";
import { GameMode } from "./game-modes.ts";
import { RngCallerStatic } from "./rng-caller-static.ts";
import { requireRuntimeResources } from "./screens/assets.ts";
import { PlayerInput } from "./sim/input.ts";
import { FrameContext } from "./sim/input-providers.ts";
import type { PlayerState } from "./sim/state-types.ts";
import { QuestLevel } from "./quests/level.ts";
import { questByLevel } from "./quests/registry.ts";
import { advanceExplicitTerrain } from "./sim/bootstrap.ts";
import { Q2_TERRAIN_SLOTS, type TerrainSlotTriplet } from "./terrain-slots.ts";
import type { GameState } from "./game/types.ts";
import { buttonDraw, buttonUpdate, buttonWidth, UiButtonState } from "./ui/perk-menu.ts";
import { drawMenuCursor } from "./ui/cursor.ts";
import { weaponAssignPlayer } from "./weapon-runtime/assign.ts";
import { weaponDisplayName, WeaponId } from "./weapons.ts";
import { WorldRuntime } from "./world/runtime.ts";
import { StandaloneTickHarness } from "@crimson/world/standalone-tick-harness.js";

export const WORLD_SIZE = 1024.0;
export const DEMO_VARIANT_COUNT = 6;

const _DEMO_UPSELL_MESSAGES: readonly string[] = [
  'Want more Levels?',
  'Want more Weapons?',
  'Want more Perks?',
  'Want unlimited Play time?',
  'Want to post your high scores?',
];

export const DEMO_PURCHASE_URL = 'https://www.crimsonland.com/';
export const DEMO_PURCHASE_SCREEN_LIMIT_MS = 16_000;
export const DEMO_PURCHASE_INTERSTITIAL_LIMIT_MS = 10_000;

const DEMO_PURCHASE_TITLE = 'Upgrade to the full version of Crimsonland Today!';
const DEMO_PURCHASE_FEATURES_TITLE = 'Full version features:';
const DEMO_PURCHASE_FEATURE_LINES: readonly [string, number][] = [
  ['-Unlimited Play Time in three thrilling Game Modes!', 22.0],
  ['-The varied weapon arsenal consisting of over 20 unique', 17.0],
  [' weapons that allow you to deal death with plasma, lead,', 17.0],
  [' fire and electricity!', 22.0],
  ['-Over 40 game altering Perks!', 22.0],
  ['-40 insane Levels that give you', 18.0],
  [' hours of intense and fun gameplay!', 22.0],
  ['-The ability to post your high scores online!', 44.0],
];
const DEMO_PURCHASE_FOOTER = 'Purchasing the game is very easy and secure.';

function weaponName(weaponId: WeaponId, opts: { preserveBugs?: boolean } = {}): string {
  const preserveBugs = opts.preserveBugs ?? false;
  return weaponDisplayName(weaponId, { preserveBugs });
}

/**
 * Attract-mode demo scaffold.
 *
 * Modeled after the classic demo helpers in crimsonland.exe:
 *   - demo_setup_variant_0 @ 0x00402ED0
 *   - demo_setup_variant_1 @ 0x004030F0
 *   - demo_setup_variant_2 @ 0x00402FE0
 *   - demo_setup_variant_3 @ 0x00403250
 *   - demo_mode_start       @ 0x00403390
 */
export class DemoView {
  state: GameState;
  private _runtime: WorldRuntime;

  private _demoTargets: (number | null)[] = [];
  private _variantIndex = 0;
  private _demoVariantIndex = 0;
  private _questSpawnTimelineMs = 0;
  private _demoTimeLimitMs = 0;
  private _finished = false;
  private _upsellMessageIndex = 0;
  private _upsellPulseMs = 0;
  private _upsellFont: GrimMonoFont | null = null;
  private _purchaseActive = false;
  private _purchaseButton: UiButtonState;
  private _maybeLaterButton: UiButtonState;
  private _tickHarness: StandaloneTickHarness;
  private _seedFromAppState = true;

  constructor(state: GameState) {
    this.state = state;
    this._runtime = new WorldRuntime({
      worldSize: WORLD_SIZE,
      demoModeActive: true,
      hardcore: this.state.config.gameplay.hardcore,
      preserveBugs: this.state.preserveBugs,
      config: this.state.config,
      audio: this.state.audio,
      audioRng: this.state.rng,
    });
    this._runtime.reset();

    this._purchaseButton = new UiButtonState('Purchase', { forceWide: true });
    this._maybeLaterButton = new UiButtonState('Maybe later', { forceWide: true });
    this._tickHarness = new StandaloneTickHarness({
      gameMode: GameMode.DEMO,
      buildInputs: (ctx: FrameContext) => this._buildRunnerInputs(ctx),
    });
  }

  private _openWorldRuntime(): void {
    this._runtime.openRuntime();
  }

  private _closeWorldRuntime(): void {
    this._runtime.closeRuntime();
  }

  private _applyTerrainSetup(opts: { terrainSlots: TerrainSlotTriplet }): void {
    const terrain = advanceExplicitTerrain(
      this._runtime.simWorld.state.rng,
      {
        terrainSlots: opts.terrainSlots,
        width: int(WORLD_SIZE),
        height: int(WORLD_SIZE)
      },
    );
    this._runtime.terrainRuntime.applyTerrainSetup({
      terrainSlots: terrain.terrainSlots,
      seed: terrain.terrainSeed
    });
    this._syncAudioRngFromRuntime();
  }

  private _syncAudioRngFromRuntime(): void {
    const liveRng = this._runtime.simWorld.state.rng;
    this._runtime.audioRng = liveRng;
    this._runtime.syncAudioBridgeState();
  }

  private _commitLiveRngStateToApp(): void {
    this.state.rng.srand(int(this._runtime.simWorld.state.rng.state));
  }

  private _nextDemoResetSeed(): number {
    if (this._seedFromAppState) {
      this._seedFromAppState = false;
      return int(this.state.rng.state);
    }
    return int(this._runtime.simWorld.state.rng.state);
  }

  private _drawWorld(opts: { drawAimIndicators?: boolean; entityAlpha?: number } = {}): void {
    const drawAimIndicators = opts.drawAimIndicators ?? true;
    const entityAlpha = opts.entityAlpha ?? 1.0;
    this._runtime.renderer.draw({
      renderFrame: this._runtime.buildRenderFrame(),
      drawAimIndicators,
      entityAlpha,
    });
  }

  open(): void {
    this._finished = false;
    this._upsellMessageIndex = 0;
    this._upsellPulseMs = 0;
    this._purchaseActive = false;
    this._purchaseButton = new UiButtonState('Purchase', { forceWide: true });
    this._maybeLaterButton = new UiButtonState('Maybe later', { forceWide: true });
    this._variantIndex = 0;
    this._demoVariantIndex = 0;
    this._questSpawnTimelineMs = 0;
    this._demoTimeLimitMs = 0;
    this._openWorldRuntime();
    this._demoModeStart();
  }

  close(): void {
    this._finished = true;
    this._purchaseActive = false;
    if (!this._seedFromAppState) {
      this._commitLiveRngStateToApp();
    }
    this._tickHarness.reset();
    this._closeWorldRuntime();
    this._upsellFont = null;
    this._seedFromAppState = true;
  }

  isFinished(): boolean {
    return this._finished;
  }

  update(dt: number): void {
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio, dt);
    }
    if (this._finished) return;

    const frameDt = Math.min(dt, 0.1);
    const frameDtMs = int(frameDt * 1000.0);
    if (frameDtMs <= 0) return;

    if (
      !this._purchaseActive &&
      this.state.demoEnabled &&
      this._purchaseScreenTriggered()
    ) {
      this._beginPurchaseScreen(DEMO_PURCHASE_SCREEN_LIMIT_MS, { resetTimeline: false });
    }

    if (this._purchaseActive) {
      this._upsellPulseMs += frameDtMs;
      this._updatePurchaseScreen(frameDtMs);
      this._questSpawnTimelineMs += frameDtMs;
      if (this._questSpawnTimelineMs > this._demoTimeLimitMs) {
        // demo_purchase_screen_update restarts the demo once the purchase screen
        // timer exceeds demo_time_limit_ms.
        this._demoModeStart();
      }
      return;
    }

    if (this._skipTriggered()) {
      this._finished = true;
      return;
    }

    this._questSpawnTimelineMs += frameDtMs;
    this._updateWorld(frameDt);
    this._syncAudioRngFromRuntime();
    if (this._questSpawnTimelineMs > this._demoTimeLimitMs) {
      this._demoModeStart();
    }
  }

  draw(): void {
    if (this._finished) return;
    if (this._purchaseActive) {
      this._drawPurchaseScreen();
      return;
    }
    this._drawWorld();
    this._drawOverlay();
  }

  protected _skipTriggered(): boolean {
    if (InputState.getKeyPressed() !== 0) return true;
    if (InputState.wasMouseButtonPressed(0)) return true;
    if (InputState.wasMouseButtonPressed(2)) return true;
    return false;
  }

  protected _purchaseScreenTriggered(): boolean {
    if (InputState.wasMouseButtonPressed(0)) return true;
    if (InputState.wasKeyPressed(27)) return true; // KEY_ESCAPE
    if (InputState.wasKeyPressed(32)) return true; // KEY_SPACE
    return false;
  }

  private _beginPurchaseScreen(limitMs: number, opts: { resetTimeline: boolean }): void {
    this._purchaseActive = true;
    if (opts.resetTimeline) {
      this._questSpawnTimelineMs = 0;
    }
    this._demoTimeLimitMs = Math.max(0, int(limitMs));
    this._purchaseButton = new UiButtonState('Purchase', { forceWide: true });
    this._maybeLaterButton = new UiButtonState('Maybe later', { forceWide: true });
  }

  private _purchaseLayoutWideShift(): number {
    const screenW = this.state.config.display.width;
    if (screenW === 0x320) return 64.0; // 800
    if (screenW === 0x400) return 128.0; // 1024
    return 0.0;
  }

  private _triggerPurchase(): void {
    this.state.quitRequested = true;
    window.open(DEMO_PURCHASE_URL);
  }

  private _updatePurchaseScreen(dtMs: number): void {
    dtMs = Math.max(0, int(dtMs));
    if (InputState.wasKeyPressed(27)) { // KEY_ESCAPE
      this._purchaseActive = false;
      this._finished = true;
      return;
    }

    const resources = requireRuntimeResources(this.state);

    const w = this.state.config.display.width;
    const h = this.state.config.display.height;
    const wideShift = this._purchaseLayoutWideShift();
    const buttonBaseY = h / 2.0 + 102.0 + wideShift * 0.3;
    const buttonBasePos = new Vec2(w / 2.0 + 128.0, buttonBaseY + 50.0);

    const [mouseX, mouseY] = InputState.mousePosition();
    const mouse = { x: mouseX, y: mouseY };
    const click = InputState.wasMouseButtonPressed(0);
    const scale = 1.0;
    const buttonW = buttonWidth(
      resources, this._purchaseButton.label, { scale, forceWide: this._purchaseButton.forceWide },
    );
    let purchaseRequested = buttonUpdate(
      this._purchaseButton,
      {
        pos: buttonBasePos,
        width: buttonW,
        dtMs,
        mouse,
        click,
      },
    );

    if (buttonUpdate(
      this._maybeLaterButton,
      {
        pos: buttonBasePos.offset({ dy: 40.0 }),
        width: buttonW,
        dtMs,
        mouse,
        click,
      },
    )) {
      this._purchaseActive = false;
      this._finished = true;
      return;
    }

    // Keyboard activation for convenience; original uses UI mouse.
    purchaseRequested = purchaseRequested || InputState.wasKeyPressed(13); // KEY_ENTER
    if (purchaseRequested) {
      this._triggerPurchase();
    }
  }

  private _drawPurchaseScreen(): void {
    wgl.clearBackground(wgl.makeColor(0, 0, 0, 1));

    const resources = requireRuntimeResources(this.state);
    const backplasma = getTexture(resources, TextureId.BACKPLASMA);

    const pulsePhase = this._upsellPulseMs % 1000;
    let pulse = Math.sin(pulsePhase * 6.2831855);
    pulse = pulse * pulse;

    const screenW = this.state.config.display.width;
    const screenH = this.state.config.display.height;

    // demo_purchase_screen_update @ 0x0040b985:
    //   - full-screen quad
    //   - UV: 0..0.5 (top-left quarter of the backplasma atlas)
    //   - per-corner color slots, with a sin^2 pulse at bottom-right

    function _to_u8(value: number) {
      return int(clamp(value, 0.0, 1.0) * 255.0 + 0.5)
    }

    const c0 = wgl.makeColor(_to_u8(0.0), _to_u8(0.0), _to_u8(0.0), _to_u8(1.0))
    const c1 = wgl.makeColor(_to_u8(0.0), _to_u8(0.0), _to_u8(0.3), _to_u8(1.0))
    const c2 = wgl.makeColor(
      _to_u8(0.0),
      _to_u8(0.4),
      _to_u8(pulse * 0.55),
      _to_u8(pulse),
    )
    const c3 = wgl.makeColor(_to_u8(0.0), _to_u8(0.4), _to_u8(0.4), _to_u8(1.0))

    wgl.beginBlendMode(wgl.BlendMode.ALPHA);
    wgl.beginQuads(backplasma);
    // TL
    wgl.rlColor4f(c0[0], c0[1], c0[2], c0[3]);
    wgl.rlTexCoord2f(0.0, 0.0);
    wgl.rlVertex2f(0.0, 0.0);
    // TR
    wgl.rlColor4f(c1[0], c1[1], c1[2], c1[3]);
    wgl.rlTexCoord2f(0.5, 0.0);
    wgl.rlVertex2f(screenW, 0.0);
    // BR
    wgl.rlColor4f(c2[0], c2[1], c2[2], c2[3]);
    wgl.rlTexCoord2f(0.5, 0.5);
    wgl.rlVertex2f(screenW, screenH);
    // BL
    wgl.rlColor4f(c3[0], c3[1], c3[2], c3[3]);
    wgl.rlTexCoord2f(0.0, 0.5);
    wgl.rlVertex2f(0.0, screenH);
    wgl.endQuads();
    wgl.endBlendMode();

    const wideShift = this._purchaseLayoutWideShift();

    // Mockup and logo textures.
    const mockup = getTexture(resources, TextureId.MOCKUP);
    let x = screenW / 2.0 - 128.0 + wideShift;
    let y = screenH / 2.0 - 140.0;
    let dst = wgl.makeRectangle(x, y, 512.0, 256.0);
    let src = wgl.makeRectangle(0.0, 0.0, mockup.width, mockup.height);
    wgl.drawTexturePro(mockup, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, wgl.makeColor(1, 1, 1, 1));

    const clLogo = getTexture(resources, TextureId.CL_LOGO);
    x = screenW / 2.0 - 256.0;
    y = screenH / 2.0 - 200.0 - wideShift * 0.4;
    dst = wgl.makeRectangle(x, y, 512.0, 64.0);
    src = wgl.makeRectangle(0.0, 0.0, clLogo.width, clLogo.height);
    wgl.drawTexturePro(clLogo, src, dst, wgl.makeVector2(0.0, 0.0), 0.0, wgl.makeColor(1, 1, 1, 1));

    const xText = screenW / 2.0 - 296.0 - wideShift * 0.8;
    y = screenH / 2.0 - 104.0;
    const color = wgl.makeColor(1, 1, 1, 1);
    const small = resources.smallFont;
    drawSmallText(small, DEMO_PURCHASE_TITLE, new Vec2(xText, y), color);
    y += 28.0;
    drawSmallText(small, DEMO_PURCHASE_FEATURES_TITLE, new Vec2(xText, y), color);

    const underlineW = measureSmallTextWidth(small, DEMO_PURCHASE_FEATURES_TITLE);
    wgl.drawRectangle(int(xText), int(y + 15.0), int(underlineW), 2, wgl.makeColor(1, 1, 1, 160 / 255.0));

    y += 22.0;
    const xList = xText + 8.0;
    for (const [line, deltaY] of DEMO_PURCHASE_FEATURE_LINES) {
      drawSmallText(small, line, new Vec2(xList, y), color);
      y += deltaY;
    }
    drawSmallText(small, DEMO_PURCHASE_FOOTER, new Vec2(xText, y), color);

    // Buttons on the right.
    const buttonBaseY = screenH / 2.0 + 102.0 + wideShift * 0.3;
    const buttonBasePos = new Vec2(screenW / 2.0 + 128.0, buttonBaseY + 50.0);
    const scale = 1.0;
    const buttonW = buttonWidth(
      resources, this._purchaseButton.label, { scale, forceWide: this._purchaseButton.forceWide },
    );
    buttonDraw(resources, this._purchaseButton, { pos: buttonBasePos, width: buttonW, scale });
    buttonDraw(
      resources,
      this._maybeLaterButton,
      {
        pos: buttonBasePos.offset({ dy: 40.0 }),
        width: buttonW,
        scale
      },
    );

    // Demo purchase screen uses menu-style cursor; draw it explicitly since the OS cursor is hidden.
    const particles = getTexture(resources, TextureId.PARTICLES);
    const cursorTex = getTexture(resources, TextureId.UI_CURSOR);
    const [mouseX, mouseY] = InputState.mousePosition();
    const pulseTime = this._upsellPulseMs * 0.001;
    drawMenuCursor(particles, cursorTex, { pos: new Vec2(mouseX, mouseY), pulseTime });
  }

  private _demoModeStart(): void {
    const index = this._demoVariantIndex;
    this._demoVariantIndex = (index + 1) % DEMO_VARIANT_COUNT;
    this._variantIndex = index;
    this._questSpawnTimelineMs = 0;
    this._demoTimeLimitMs = 0;
    this._purchaseActive = false;

    const playerCount = (index === 0 || index === 1 || index === 4) ? 2 : 1;
    this._runtime.reset({ seed: this._nextDemoResetSeed(), playerCount });
    this._tickHarness.reset();
    this._syncAudioRngFromRuntime();
    this._runtime.simWorld.state.bonuses.weaponPowerUp = 0.0;

    if (index === 0) {
      this._setupVariant0();
    } else if (index === 1) {
      this._setupVariant1();
    } else if (index === 2) {
      this._setupVariant2();
    } else if (index === 3) {
      this._setupVariant3();
    } else if (index === 4) {
      this._setupVariant0();
    } else {
      // demo_purchase_interstitial_begin
      this._beginPurchaseScreen(DEMO_PURCHASE_INTERSTITIAL_LIMIT_MS, { resetTimeline: true });
    }

    // demo_purchase_screen_update increments demo_upsell_message_index when the
    // timeline resets (quest_spawn_timeline == 0) and the purchase screen is inactive.
    if (!this._purchaseActive && _DEMO_UPSELL_MESSAGES.length > 0) {
      this._upsellMessageIndex = (this._upsellMessageIndex + 1) % _DEMO_UPSELL_MESSAGES.length;
    }
    this._syncAudioRngFromRuntime();
  }

  private _setupWorldPlayers(specs: [Vec2, number][]): void {
    for (let idx = 0; idx < specs.length; idx++) {
      if (idx >= this._runtime.simWorld.players.length) continue;
      const [pos, weaponId] = specs[idx];
      const player = this._runtime.simWorld.players[idx];
      player.pos = pos;
      // Keep aim anchored to the spawn position so demo aim starts stable.
      player.aim = pos;
      weaponAssignPlayer(player, weaponId, { state: this._runtime.simWorld.state });
    }
    this._demoTargets = new Array(this._runtime.simWorld.players.length).fill(null);
  }

  private _spawn(spawnId: SpawnId, pos: Vec2, opts: { heading?: number } = {}): void {
    const heading = opts.heading ?? 0.0;
    const rng = this._runtime.simWorld.state.rng;
    this._runtime.simWorld.creatures.spawnTemplate(spawnId, pos, heading, rng);
  }

  private _setupVariant0(): void {
    this._demoTimeLimitMs = 4000;
    // demo_setup_variant_0 uses weapon_id=0x0B.
    const weaponId = 11;
    this._setupWorldPlayers([
      [new Vec2(448.0, 384.0), weaponId],
      [new Vec2(546.0, 654.0), weaponId],
    ]);
    let y = 256;
    let i = 0;
    while (y < 1696) {
      const col = i % 2;
      this._spawn(SpawnId.SPIDER_SP1_AI7_TIMER_38, new Vec2((col + 2) * 64, y), { heading: RANDOM_HEADING_SENTINEL });
      this._spawn(SpawnId.SPIDER_SP1_AI7_TIMER_38, new Vec2(col * 64 + 798, y), { heading: RANDOM_HEADING_SENTINEL });
      y += 80;
      i += 1;
    }
  }

  private _setupVariant1(): void {
    this._demoTimeLimitMs = 5000;
    // demo_setup_variant_1 uses weapon_id=0x05.
    const weaponId = 5;
    const rng = this._runtime.simWorld.state.rng;
    this._setupWorldPlayers([
      [new Vec2(490.0, 448.0), weaponId],
      [new Vec2(480.0, 576.0), weaponId],
    ]);
    // Native variant 1 calls terrain_generate(&quest_meta_terrain_desc_unlock_gt_0x13).
    this._applyTerrainSetup({ terrainSlots: Q2_TERRAIN_SLOTS });
    this._runtime.simWorld.state.bonuses.weaponPowerUp = 15.0;
    for (let idx = 0; idx < 20; idx++) {
      const x =
        int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP1_X }) % 200) + 32;
      const y =
        int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP1_Y }) % 899) + 64;
      this._spawn(SpawnId.SPIDER_SP1_RANDOM_GREEN_34, new Vec2(x, y), { heading: RANDOM_HEADING_SENTINEL });
      if (idx % 3 !== 0) {
        const sx =
          int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP2_X }) % 30) + 32;
        const sy =
          int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP2_Y }) % 899) + 64;
        this._spawn(SpawnId.SPIDER_SP2_RANDOM_35, new Vec2(sx, sy), { heading: RANDOM_HEADING_SENTINEL });
      }
    }
  }

  private _setupVariant2(): void {
    this._demoTimeLimitMs = 5000;
    // demo_setup_variant_2 uses weapon_id=0x15.
    const weaponId = 21;
    this._setupWorldPlayers([[new Vec2(512.0, 512.0), weaponId]]);
    let y = 128;
    let i = 0;
    while (y < 848) {
      const col = i % 2;
      this._spawn(SpawnId.ZOMBIE_RANDOM_41, new Vec2(col * 64 + 32, y), { heading: RANDOM_HEADING_SENTINEL });
      this._spawn(SpawnId.ZOMBIE_RANDOM_41, new Vec2((col + 2) * 64, y), { heading: RANDOM_HEADING_SENTINEL });
      this._spawn(SpawnId.ZOMBIE_RANDOM_41, new Vec2(col * 64 - 64, y), { heading: RANDOM_HEADING_SENTINEL });
      this._spawn(SpawnId.ZOMBIE_RANDOM_41, new Vec2((col + 12) * 64, y), { heading: RANDOM_HEADING_SENTINEL });
      y += 60;
      i += 1;
    }
  }

  private _setupVariant3(): void {
    this._demoTimeLimitMs = 4000;
    // demo_setup_variant_3 uses weapon_id=0x12.
    const weaponId = 18;
    const rng = this._runtime.simWorld.state.rng;
    this._setupWorldPlayers([[new Vec2(512.0, 512.0), weaponId]]);
    const quest = questByLevel(new QuestLevel(1, 1));
    // Native variant 3 calls terrain_generate(&quest_selected_meta), which is the
    // base of the quest metadata array in this build, so it resolves to quest 1.1.
    if (quest !== null) {
      this._applyTerrainSetup({ terrainSlots: quest.terrainSlots });
    }
    for (let idx = 0; idx < 20; idx++) {
      const x =
        int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_BIG_X }) % 200) + 32;
      const y =
        int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_BIG_Y }) % 899) + 64;
      this._spawn(SpawnId.ALIEN_CONST_GREEN_24, new Vec2(x, y), { heading: 0.0 });
      if (idx % 3 !== 0) {
        const sx =
          int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_SMALL_X }) % 30) + 32;
        const sy =
          int(rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_SMALL_Y }) % 899) + 64;
        this._spawn(SpawnId.ALIEN_CONST_GREEN_SMALL_25, new Vec2(sx, sy), { heading: 0.0 });
      }
    }
  }

  private _drawOverlay(): void {
    if (this.state.demoEnabled) {
      this._drawDemoUpsellOverlay();
      return;
    }
    const resources = requireRuntimeResources(this.state);
    const small = resources.smallFont;
    const title = `DEMO MODE  (${this._variantIndex + 1}/${DEMO_VARIANT_COUNT})`;
    const hint = 'Press any key / click to skip';
    const remaining = Math.max(0.0, (this._demoTimeLimitMs - this._questSpawnTimelineMs) / 1000.0);
    const weapons = this._runtime.simWorld.players.map(
      (p) => `P${p.index + 1}:${weaponName(p.weapon.weaponId, { preserveBugs: this.state.preserveBugs })}`,
    ).join(', ');
    const detail = `${weapons}  \u2014  next in ${remaining.toFixed(1)}s`;
    drawSmallText(small, title, new Vec2(16, 12), wgl.makeColor(240 / 255.0, 240 / 255.0, 240 / 255.0, 255 / 255.0));
    drawSmallText(small, detail, new Vec2(16, 36), wgl.makeColor(180 / 255.0, 180 / 255.0, 190 / 255.0, 255 / 255.0));
    drawSmallText(small, hint, new Vec2(16, 56), wgl.makeColor(140 / 255.0, 140 / 255.0, 150 / 255.0, 255 / 255.0));
  }

  private _ensureUpsellFont(): GrimMonoFont {
    if (this._upsellFont !== null) return this._upsellFont;
    const resources = requireRuntimeResources(this.state);
    const texture = getTexture(resources, TextureId.DEFAULT_FONT_COURIER);
    this._upsellFont = createGrimMonoFont(texture);
    return this._upsellFont;
  }

  private _drawDemoUpsellOverlay(): void {
    // Modeled after the shareware "Want more ..." overlay in demo_purchase_screen_update
    // (crimsonland.exe 0x0040B740), but without the purchase screen.
    if (_DEMO_UPSELL_MESSAGES.length === 0) return;

    const font = this._ensureUpsellFont();
    const msg = _DEMO_UPSELL_MESSAGES[this._upsellMessageIndex];

    const timelineMs = this._questSpawnTimelineMs;
    const limitMs = this._demoTimeLimitMs;
    const var2c = timelineMs * 0.016;

    let alpha = 1.0;
    if (var2c < 20.0) {
      alpha = var2c * 0.05;
    }
    if (timelineMs > limitMs - 500) {
      alpha = (limitMs - timelineMs) * 0.002;
    }
    alpha = clamp(alpha, 0.0, 1.0);

    const scale = 0.8;
    const textW = msg.length * 12.8;

    const textX = 50.0;
    const textY = var2c + 50.0;
    const bgX = 60.0;
    const bgY = textY - 4.0;
    const barX = 64.0;
    const barY = var2c + 72.0;

    const bgAlpha = int(Math.round(clamp(alpha * 0.5, 0.0, 1.0) * 255.0));
    const barAlpha = int(Math.round(clamp(alpha * 0.8, 0.0, 1.0) * 255.0));
    const txtAlpha = int(Math.round(clamp(alpha, 0.0, 1.0) * 255.0));

    wgl.drawRectangle(
      int(bgX), int(bgY), int(textW + 12.0), 30,
      wgl.makeColor(0, 0, 0, bgAlpha),
    );

    let progress = 0.0;
    if (limitMs > 0) {
      progress = clamp(timelineMs / limitMs, 0.0, 1.0);
    }
    wgl.drawRectangle(
      int(barX), int(barY), int(textW * progress), 3,
      wgl.makeColor(128 / 255.0, 26 / 255.0, 26 / 255.0, barAlpha / 255.0),
    );

    drawGrimMonoText(font, msg, new Vec2(textX, textY), scale, wgl.makeColor(255 / 255.0, 255 / 255.0, 255 / 255.0, txtAlpha / 255.0));
  }

  private _buildRunnerInputs(frameCtx: FrameContext): PlayerInput[] {
    return this._buildDemoInputs(frameCtx.dtSeconds);
  }

  private _updateWorld(dt: number): void {
    if (this._runtime.simWorld.players.length === 0) return;
    this._tickHarness.advanceFrame(this._runtime, dt);
  }

  private _buildDemoInputs(dt: number): PlayerInput[] {
    const players = this._runtime.simWorld.players;
    const creatures = this._runtime.simWorld.creatures.entries;
    if (this._demoTargets.length !== players.length) {
      this._demoTargets = new Array(players.length).fill(null);
    }
    const center = new Vec2(this._runtime.worldSize * 0.5, this._runtime.worldSize * 0.5);

    const TAU = Math.PI * 2;

    function turnTowardsHeading(cur: number, target: number): [number, number] {
      let c = cur % TAU;
      let t = target % TAU;
      let delta = (t - c + Math.PI) % TAU - Math.PI;
      const diff = Math.abs(delta);
      if (diff <= 1e-9) return [c, 0.0];
      const step = dt * diff * 5.0;
      c = delta > 0.0 ? (c + step) % TAU : (c - step) % TAU;
      return [c, diff];
    }

    const inputs: PlayerInput[] = [];
    for (let idx = 0; idx < players.length; idx++) {
      const player = players[idx];
      const targetIdx = this._selectDemoTarget(idx, player, creatures);
      let target: CreatureState | null = null;
      if (targetIdx !== null && targetIdx >= 0 && targetIdx < creatures.length) {
        const candidate = creatures[targetIdx];
        if (candidate.active && candidate.hp > 0.0) {
          target = candidate;
        }
      }

      // Aim: ease the aim point toward the target.
      let aim = player.aim;
      let autoFire = false;
      if (target !== null) {
        const targetPos = target.pos;
        const aimDelta = targetPos.sub(aim);
        const [aimDir, aimDist] = aimDelta.normalizedWithLength();
        if (aimDist >= 4.0) {
          const step = aimDist * 6.0 * dt;
          aim = aim.add(aimDir.mul(step));
        } else {
          aim = targetPos;
        }
        autoFire = aimDist < 128.0;
      } else {
        const awayDelta = player.pos.sub(center);
        const [awayDir, aMag] = awayDelta.normalizedWithLength();
        const awayFromCenter = aMag <= 1e-6 ? new Vec2(0.0, -1.0) : awayDir;
        aim = player.pos.add(awayFromCenter.mul(60.0));
      }

      // Movement:
      // - orbit center if no target
      // - chase target when near center
      // - return to center when too far
      let moveDelta: Vec2;
      if (target === null) {
        moveDelta = player.pos.sub(center).rotated(Math.PI / 2.0);
      } else {
        const centerDist = player.pos.sub(center).length();
        if (centerDist <= 300.0) {
          moveDelta = target.pos.sub(player.pos);
        } else {
          moveDelta = center.sub(player.pos);
        }
      }

      const [desiredDir, desiredMag] = moveDelta.normalizedWithLength();
      let move: Vec2;
      if (desiredMag <= 1e-6) {
        move = new Vec2();
      } else {
        const desiredHeading = desiredDir.toHeading();
        const [smoothedHeading, angleDiff] = turnTowardsHeading(player.heading, desiredHeading);
        const moveMag = Math.max(0.001, (Math.PI - angleDiff) / Math.PI);
        move = Vec2.fromHeading(smoothedHeading).mul(moveMag);
      }

      inputs.push(
        new PlayerInput({
          move,
          aim,
          fireDown: autoFire,
          firePressed: autoFire,
          reloadPressed: false,
        }),
      );
    }

    return inputs;
  }

  private _nearestWorldCreatureIndex(pos: Vec2): number | null {
    const creatures = this._runtime.simWorld.creatures.entries;
    let bestIdx: number | null = null;
    let bestDist = 0.0;
    for (let idx = 0; idx < creatures.length; idx++) {
      const creature = creatures[idx];
      if (!(creature.active && creature.hp > 0.0)) continue;
      const d = Vec2.distanceSq(pos, creature.pos);
      if (bestIdx === null || d < bestDist) {
        bestIdx = idx;
        bestDist = d;
      }
    }
    return bestIdx;
  }

  private _selectDemoTarget(
    playerIndex: number,
    player: PlayerState,
    creatures: CreatureState[],
  ): number | null {
    const candidate = this._nearestWorldCreatureIndex(player.pos);
    const current =
      playerIndex < this._demoTargets.length ? this._demoTargets[playerIndex] : null;

    if (current === null) {
      this._demoTargets[playerIndex] = candidate;
      return candidate;
    }
    if (!(current >= 0 && current < creatures.length)) {
      this._demoTargets[playerIndex] = candidate;
      return candidate;
    }
    const currentCreature = creatures[current];
    if (currentCreature.hp <= 0.0 || !currentCreature.active) {
      this._demoTargets[playerIndex] = candidate;
      return candidate;
    }
    if (candidate === null || candidate === current) {
      return current;
    }
    const candCreature = creatures[candidate];
    if (!candCreature.active || candCreature.hp <= 0.0) {
      return current;
    }
    const curD = currentCreature.pos.sub(player.pos).length();
    const candD = candCreature.pos.sub(player.pos).length();
    if (candD + 64.0 < curD) {
      this._demoTargets[playerIndex] = candidate;
      return candidate;
    }
    return current;
  }
}
