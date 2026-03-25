// Port of crimson/demo.py
//
// The original DemoView class contains heavy rendering/UI logic (raylib drawing,
// texture rendering, purchase screen, etc.) that is not applicable to the WebGL
// port's headless simulation. This file ports the simulation-relevant logic:
//   - Demo variant setup (creature spawning, weapon assignment, terrain)
//   - AI-driven demo input generation
//   - Demo lifecycle (start, update, draw hooks)
//
// Rendering methods are stubbed with TODO comments for future WebGL renderer integration.

import { audioUpdate, type AudioState } from '@grim/audio.ts';
import { Vec2 } from '@grim/geom.ts';
import { InputState } from '@grim/input.ts';

import type { CreatureState } from './creatures/runtime.ts';
import { RANDOM_HEADING_SENTINEL, SpawnId } from './creatures/spawn-ids.ts';
import { GameMode } from './game-modes.ts';
import { RngCallerStatic } from './rng-caller-static.ts';
import {
  applySimMetadataBatch,
  applyPresentationOutputs,

} from './sim/batch-apply.ts';
import { FixedStepClock } from './sim/clock.ts';
import { advanceTickRunnerFrame } from './sim/frame-pump.ts';
import { PlayerInput } from './sim/input.ts';
import { FrameContext, LocalInputProvider } from './sim/input-providers.ts';
import {
  buildPostApplyReaction,
  applyPostApplyReaction,
  type PostApplyReaction,
} from './sim/presentation-reactions.ts';
import { DeterministicSession } from './sim/sessions.ts';
import type { PlayerState } from './sim/state-types.ts';
import { TickRunner, type TickBatchResult } from './sim/tick-runner.ts';
import { questByLevel } from './quests/registry.ts';
import { advanceExplicitTerrain } from './sim/bootstrap.ts';
import { Q2_TERRAIN_SLOTS, type TerrainSlotTriplet } from './terrain-slots.ts';
import type { GameState } from './game/types.ts';
import { weaponAssignPlayer } from './weapon-runtime/assign.ts';
import { WeaponId, weaponDisplayName } from './weapons.ts';
import { WorldRuntime } from './world/runtime.ts';
import type { SimWorldState } from './world/sim-world-state.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const WORLD_SIZE = 1024.0;
export const DEMO_VARIANT_COUNT = 6;

export const DEMO_UPSELL_MESSAGES: readonly string[] = [
  'Want more Levels?',
  'Want more Weapons?',
  'Want more Perks?',
  'Want unlimited Play time?',
  'Want to post your high scores?',
];

export const DEMO_PURCHASE_URL = 'http://buy.crimsonland.com';
export const DEMO_PURCHASE_SCREEN_LIMIT_MS = 16_000;
export const DEMO_PURCHASE_INTERSTITIAL_LIMIT_MS = 10_000;

export const DEMO_PURCHASE_TITLE = 'Upgrade to the full version of Crimsonland Today!';
export const DEMO_PURCHASE_FEATURES_TITLE = 'Full version features:';
export const DEMO_PURCHASE_FEATURE_LINES: readonly [string, number][] = [
  ['-Unlimited Play Time in three thrilling Game Modes!', 22.0],
  ['-The varied weapon arsenal consisting of over 20 unique', 17.0],
  [' weapons that allow you to deal death with plasma, lead,', 17.0],
  [' fire and electricity!', 22.0],
  ['-Over 40 game altering Perks!', 22.0],
  ['-40 insane Levels that give you', 18.0],
  [' hours of intense and fun gameplay!', 22.0],
  ['-The ability to post your high scores online!', 44.0],
];
export const DEMO_PURCHASE_FOOTER = 'Purchasing the game is very easy and secure.';

// ---------------------------------------------------------------------------
// Type aliases for clarity
// ---------------------------------------------------------------------------

type SimWorld = SimWorldState;

// FrameContext re-exported for external callers that reference the demo harness callback type.
export type { FrameContext } from './sim/input-providers.ts';

// ---------------------------------------------------------------------------
// StandaloneTickHarness — port of crimson/world/standalone_tick_harness.py
// ---------------------------------------------------------------------------

type WorldTickInputBuilder = (ctx: FrameContext) => readonly PlayerInput[];

class StandaloneTickHarness {
  private _gameMode: GameMode;
  private _buildInputs: WorldTickInputBuilder;
  private _tickRate: number;
  private _session: DeterministicSession | null = null;
  private _runner: TickRunner | null = null;
  private _worldState: object | null = null;
  private _playerCount = 0;
  private _clock: FixedStepClock;
  private _frameIndex = 0;
  private _nextTickIndex = 0;

  constructor(opts: {
    gameMode: GameMode;
    buildInputs: WorldTickInputBuilder;
    tickRate?: number;
  }) {
    this._gameMode = opts.gameMode;
    this._buildInputs = opts.buildInputs;
    this._tickRate = Math.max(1, opts.tickRate ?? 60);
    this._clock = new FixedStepClock(this._tickRate);
  }

  reset(): void {
    this._session = null;
    this._runner = null;
    this._worldState = null;
    this._playerCount = 0;
    this._clock = new FixedStepClock(this._tickRate);
    this._frameIndex = 0;
    this._nextTickIndex = 0;
  }

  private _ensureRunner(runtime: WorldRuntime): [TickRunner, DeterministicSession] {
    const worldState = runtime.simWorld.worldState;
    const playerCount = runtime.simWorld.players.length;

    if (
      this._session !== null &&
      this._runner !== null &&
      this._worldState === worldState &&
      this._playerCount === playerCount
    ) {
      return [this._runner, this._session];
    }

    let detailPreset = 5;
    let violenceDisabled = 0;
    const config = runtime.config;
    if (config !== null) {
      detailPreset = config.display.detailPreset;
      violenceDisabled = config.display.violenceDisabled;
    }

    const session = new DeterministicSession({
      world: worldState,
      worldSize: runtime.worldSize,
      damageScaleByType: runtime.simWorld.damageScaleByType,
      gameMode: this._gameMode,
      detailPreset,
      violenceDisabled,
      gameTuneStarted: runtime.simWorld.gameTuneStarted,
      demoModeActive: runtime.demoModeActive,
      perkProgressionEnabled: false,
      applyWorldDtSteps: true,
    });

    const provider = new LocalInputProvider({
      playerCount,
      buildInputs: this._buildInputs,
    });

    const runner = new TickRunner({
      session,
      inputProvider: provider,
    });

    this._session = session;
    this._runner = runner;
    this._worldState = worldState;
    this._playerCount = playerCount;
    this._clock = new FixedStepClock(this._tickRate);
    this._frameIndex = 0;
    this._nextTickIndex = 0;
    return [runner, session];
  }

  private _applyTickBatch(
    runtime: WorldRuntime,
    batch: TickBatchResult,
    session: DeterministicSession,
  ): number {
    const outputs = applySimMetadataBatch({
      simWorld: runtime.simWorld,
      completedResults: batch.completedResults,
      gameTuneStarted: session.gameTuneStarted,
    });

    const reactions = new Map<number, PostApplyReaction>();
    for (const result of batch.completedResults) {
      reactions.set(
        result.sourceTick.tickIndex | 0,
        buildPostApplyReaction({ tickResult: result }),
      );
    }

    applyPresentationOutputs({
      outputs,
      syncAudioBridgeState: () => runtime.syncAudioBridgeState(),
      applyAudioPlan: (plan, shouldApplyAudio) =>
        runtime.audioBridge.applyPlan({ plan, applyAudio: shouldApplyAudio }),
      applyTerrainFx: (batch) => runtime.renderResources.consumeTerrainFxBatch(batch, {}),
      updateCamera: (dtSim) => runtime.updateCamera(dtSim),
      onOutputApplied: (output) => {
        const reaction = reactions.get(output.tickIndex | 0);
        if (reaction) {
          applyPostApplyReaction({
            reaction,
            playSfx: (sfx) => runtime.audioBridge.router.playSfx(sfx),
          });
        }
      },
      applyAudio: true,
    });

    return outputs.length;
  }

  advanceFrame(runtime: WorldRuntime, dt: number): number {
    if (runtime.simWorld.players.length === 0) return 0;
    runtime.terrainRuntime.processPending();

    const [runner, session] = this._ensureRunner(runtime);
    session.demoModeActive = runtime.demoModeActive;

    const ticksRequested = this._clock.advance(dt);
    const advance = advanceTickRunnerFrame({
      runner,
      startTick: this._nextTickIndex,
      frameIndex: this._frameIndex,
      ticksRequested,
      dtSeconds: dt,
      tickDtSeconds: this._clock.dtTick,
      isNetworked: false,
      isReplay: false,
      refundClock: this._clock,
    });

    this._frameIndex = advance.frameIndex;
    this._nextTickIndex = advance.nextTickIndex;

    return this._applyTickBatch(runtime, advance.batch, session);
  }
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function weaponName(weaponId: WeaponId, preserveBugs = false): string {
  return weaponDisplayName(weaponId, { preserveBugs });
}

// ---------------------------------------------------------------------------
// DemoView
// ---------------------------------------------------------------------------

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
  private _purchaseActive = false;
  private _tickHarness: StandaloneTickHarness;
  private _seedFromAppState = true;

  constructor(state: GameState, runtime: WorldRuntime) {
    this.state = state;
    this._runtime = runtime;
    this._runtime.reset();

    this._tickHarness = new StandaloneTickHarness({
      gameMode: GameMode.DEMO,
      buildInputs: (ctx: FrameContext) => this._buildRunnerInputs(ctx),
    });
  }

  // -----------------------------------------------------------------------
  // Runtime open/close
  // -----------------------------------------------------------------------

  private _openWorldRuntime(): void {
    this._runtime.openRuntime();
  }

  private _closeWorldRuntime(): void {
    this._runtime.closeRuntime();
  }

  // -----------------------------------------------------------------------
  // Terrain setup
  // -----------------------------------------------------------------------

  private _applyTerrainSetup(terrainSlots: TerrainSlotTriplet): void {
    const terrain = advanceExplicitTerrain(
      this._runtime.simWorld.state.rng,
      { terrainSlots, width: WORLD_SIZE | 0, height: WORLD_SIZE | 0 },
    );
    this._runtime.terrainRuntime.applyTerrainSetup({ terrainSlots: terrain.terrainSlots, seed: terrain.terrainSeed });
    this._syncAudioRngFromRuntime();
  }

  // -----------------------------------------------------------------------
  // RNG syncing
  // -----------------------------------------------------------------------

  private _syncAudioRngFromRuntime(): void {
    const liveRng = this._runtime.simWorld.state.rng;
    this._runtime.audioRng = liveRng;
    this._runtime.syncAudioBridgeState();
  }

  private _commitLiveRngStateToApp(): void {
    this.state.rng.srand(this._runtime.simWorld.state.rng.state | 0);
  }

  private _nextDemoResetSeed(): number {
    if (this._seedFromAppState) {
      this._seedFromAppState = false;
      return this.state.rng.state | 0;
    }
    return this._runtime.simWorld.state.rng.state | 0;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  open(): void {
    this._finished = false;
    this._upsellMessageIndex = 0;
    this._upsellPulseMs = 0;
    this._purchaseActive = false;
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
    this._seedFromAppState = true;
  }

  isFinished(): boolean {
    return this._finished;
  }

  takeAction(): string | null {
    return this._finished ? 'finished' : null;
  }

  // -----------------------------------------------------------------------
  // Update
  // -----------------------------------------------------------------------

  update(dt: number): void {
    if (this.state.audio !== null) {
      audioUpdate(this.state.audio as AudioState, dt);
    }
    if (this._finished) return;

    const frameDt = Math.min(dt, 0.1);
    const frameDtMs = (frameDt * 1000.0) | 0;
    if (frameDtMs <= 0) return;

    if (
      !this._purchaseActive &&
      this.state.demoEnabled &&
      this._purchaseScreenTriggered()
    ) {
      this._beginPurchaseScreen(DEMO_PURCHASE_SCREEN_LIMIT_MS, false);
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

  // -----------------------------------------------------------------------
  // Draw (stub — rendering deferred to WebGL renderer)
  // -----------------------------------------------------------------------

  draw(): void {
    if (this._finished) return;
    if (this._purchaseActive) {
      this._drawPurchaseScreen();
      return;
    }
    this._drawWorld();
    this._drawOverlay();
  }

  // -----------------------------------------------------------------------
  // Input detection stubs
  // -----------------------------------------------------------------------

  /** Override in platform layer to detect key/mouse presses */
  protected _skipTriggered(): boolean {
    // Check common skip keys + mouse buttons (Python checks any key pressed)
    return InputState.wasKeyPressed(27) || InputState.wasKeyPressed(32) || InputState.wasKeyPressed(13) ||
      InputState.wasMouseButtonPressed(0) || InputState.wasMouseButtonPressed(2);
  }

  protected _purchaseScreenTriggered(): boolean {
    return InputState.wasMouseButtonPressed(0) || InputState.wasKeyPressed(27) || InputState.wasKeyPressed(32);
  }

  // -----------------------------------------------------------------------
  // Purchase screen
  // -----------------------------------------------------------------------

  private _beginPurchaseScreen(limitMs: number, resetTimeline: boolean): void {
    this._purchaseActive = true;
    if (resetTimeline) {
      this._questSpawnTimelineMs = 0;
    }
    this._demoTimeLimitMs = Math.max(0, limitMs | 0);
  }

  get purchaseLayoutWideShift(): number {
    const screenW = this.state.config.display.width;
    if (screenW === 0x320) return 64.0; // 800
    if (screenW === 0x400) return 128.0; // 1024
    return 0.0;
  }

  private _triggerPurchase(): void {
    this.state.quitRequested = true;
    // TODO: Open DEMO_PURCHASE_URL in browser (window.open in WebGL context)
  }

  private _updatePurchaseScreen(_dtMs: number): void {
    // TODO: Port purchase screen update logic for WebGL
    // Original handles button hit-testing and keyboard activation.
    // For now, this is a no-op stub.
  }

  private _drawPurchaseScreen(): void {
    // TODO: Port purchase screen rendering for WebGL renderer
    // Original draws backplasma quad, mockup/logo textures, feature text, buttons, cursor.
  }

  // -----------------------------------------------------------------------
  // Demo mode start
  // -----------------------------------------------------------------------

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
      this._beginPurchaseScreen(DEMO_PURCHASE_INTERSTITIAL_LIMIT_MS, true);
    }

    // demo_purchase_screen_update increments demo_upsell_message_index when the
    // timeline resets (quest_spawn_timeline == 0) and the purchase screen is inactive.
    if (!this._purchaseActive && DEMO_UPSELL_MESSAGES.length > 0) {
      this._upsellMessageIndex = (this._upsellMessageIndex + 1) % DEMO_UPSELL_MESSAGES.length;
    }
    this._syncAudioRngFromRuntime();
  }

  // -----------------------------------------------------------------------
  // Player / creature setup helpers
  // -----------------------------------------------------------------------

  private _setupWorldPlayers(specs: [Vec2, number][]): void {
    for (let idx = 0; idx < specs.length; idx++) {
      if (idx >= this._runtime.simWorld.players.length) continue;
      const [pos, weaponId] = specs[idx];
      const player = this._runtime.simWorld.players[idx];
      player.pos = pos;
      // Keep aim anchored to the spawn position so demo aim starts stable.
      player.aim = pos;
      weaponAssignPlayer(player, weaponId as WeaponId, { state: this._runtime.simWorld.state });
    }
    this._demoTargets = new Array(this._runtime.simWorld.players.length).fill(null);
  }

  private _spawn(spawnId: SpawnId, pos: Vec2, opts: { heading?: number } = {}): void {
    const heading = opts.heading ?? 0.0;
    const rng = this._runtime.simWorld.state.rng;
    this._runtime.simWorld.creatures.spawnTemplate(spawnId, pos, heading, rng);
  }

  // -----------------------------------------------------------------------
  // Variant setups
  // -----------------------------------------------------------------------

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
    this._applyTerrainSetup(Q2_TERRAIN_SLOTS);
    this._runtime.simWorld.state.bonuses.weaponPowerUp = 15.0;
    for (let idx = 0; idx < 20; idx++) {
      const x =
        ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP1_X }) % 200) | 0) + 32;
      const y =
        ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP1_Y }) % 899) | 0) + 64;
      this._spawn(SpawnId.SPIDER_SP1_RANDOM_GREEN_34, new Vec2(x, y), { heading: RANDOM_HEADING_SENTINEL });
      if (idx % 3 !== 0) {
        const sx =
          ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP2_X }) % 30) | 0) + 32;
        const sy =
          ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_1_SPIDER_SP2_Y }) % 899) | 0) + 64;
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
    const quest = questByLevel({ major: 1, minor: 1 });
    // Native variant 3 calls terrain_generate(&quest_selected_meta), which is the
    // base of the quest metadata array in this build, so it resolves to quest 1.1.
    if (quest !== null) {
      this._applyTerrainSetup(quest.terrainSlots);
    }
    for (let idx = 0; idx < 20; idx++) {
      const x =
        ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_BIG_X }) % 200) | 0) + 32;
      const y =
        ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_BIG_Y }) % 899) | 0) + 64;
      this._spawn(SpawnId.ALIEN_CONST_GREEN_24, new Vec2(x, y), { heading: 0.0 });
      if (idx % 3 !== 0) {
        const sx =
          ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_SMALL_X }) % 30) | 0) + 32;
        const sy =
          ((rng.rand({ caller: RngCallerStatic.DEMO_SETUP_VARIANT_3_ALIEN_SMALL_Y }) % 899) | 0) + 64;
        this._spawn(SpawnId.ALIEN_CONST_GREEN_SMALL_25, new Vec2(sx, sy), { heading: 0.0 });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Draw stubs
  // -----------------------------------------------------------------------

  private _drawWorld(): void {
    this._runtime.draw({ drawAimIndicators: true, entityAlpha: 1.0 });
  }

  private _drawOverlay(): void {
    // TODO: Port to WebGL renderer
    // Original draws variant index, weapon names, time remaining, upsell messages
  }

  // -----------------------------------------------------------------------
  // World update
  // -----------------------------------------------------------------------

  private _buildRunnerInputs(frameCtx: FrameContext): PlayerInput[] {
    return this._buildDemoInputs(frameCtx.dtSeconds);
  }

  private _updateWorld(dt: number): void {
    if (this._runtime.simWorld.players.length === 0) return;
    this._tickHarness.advanceFrame(this._runtime, dt);
  }

  // -----------------------------------------------------------------------
  // Demo AI input generation
  // -----------------------------------------------------------------------

  private _buildDemoInputs(dt: number): PlayerInput[] {
    const players = this._runtime.simWorld.players;
    const creatures = this._runtime.simWorld.creatures.entries;
    if (this._demoTargets.length !== players.length) {
      this._demoTargets = new Array(players.length).fill(null);
    }
    const center = new Vec2(this._runtime.worldSize * 0.5, this._runtime.worldSize * 0.5);

    dt = Number(dt);
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

  // -----------------------------------------------------------------------
  // Target selection
  // -----------------------------------------------------------------------

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

  // -----------------------------------------------------------------------
  // Accessors for overlay/debug
  // -----------------------------------------------------------------------

  get variantIndex(): number {
    return this._variantIndex;
  }

  get questSpawnTimelineMs(): number {
    return this._questSpawnTimelineMs;
  }

  get demoTimeLimitMs(): number {
    return this._demoTimeLimitMs;
  }

  get upsellMessageIndex(): number {
    return this._upsellMessageIndex;
  }

  get upsellPulseMs(): number {
    return this._upsellPulseMs;
  }

  get purchaseActive(): boolean {
    return this._purchaseActive;
  }
}
