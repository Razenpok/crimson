// Port of crimson/screens/high_scores_view/right_panel.py

import { type WebGLContext } from '@grim/webgl.ts';
import { Vec2 } from '@grim/geom.ts';
import { type RuntimeResources, TextureId, getTexture } from '@grim/assets.ts';
import { type SmallFontData } from '@grim/assets.ts';
import { drawSmallText, measureSmallTextWidth } from '@grim/fonts/small.ts';
import { GameMode } from '@crimson/game-modes.ts';
import { WeaponId, WEAPON_BY_ID, weaponDisplayName } from '@crimson/weapons.ts';
import { formatOrdinal, formatTimeMmSs } from '@crimson/ui/formatting.ts';
import { formatScoreDate } from './shared.ts';
import { mouseInsideRectWithPadding } from '@crimson/screens/panels/hit-test.ts';
import { InputState } from '@grim/input.ts';
import {
  HS_LOCAL_CLOCK_X,
  HS_LOCAL_CLOCK_Y,
  HS_LOCAL_DATE_X,
  HS_LOCAL_DATE_Y,
  HS_LOCAL_FRAGS_X,
  HS_LOCAL_FRAGS_Y,
  HS_LOCAL_HIT_X,
  HS_LOCAL_HIT_Y,
  HS_LOCAL_LABEL_X,
  HS_LOCAL_LABEL_Y,
  HS_LOCAL_NAME_X,
  HS_LOCAL_NAME_Y,
  HS_LOCAL_RANK_X,
  HS_LOCAL_RANK_Y,
  HS_LOCAL_SCORE_LABEL_X,
  HS_LOCAL_SCORE_LABEL_Y,
  HS_LOCAL_SCORE_VALUE_X,
  HS_LOCAL_SCORE_VALUE_Y,
  HS_LOCAL_TIME_LABEL_X,
  HS_LOCAL_TIME_LABEL_Y,
  HS_LOCAL_TIME_VALUE_X,
  HS_LOCAL_TIME_VALUE_Y,
  HS_LOCAL_WEAPON_Y,
  HS_LOCAL_WICON_X,
  HS_LOCAL_WICON_Y,
  HS_RIGHT_CHECK_X,
  HS_RIGHT_CHECK_Y,
  HS_RIGHT_GAME_MODE_DROP_X,
  HS_RIGHT_GAME_MODE_DROP_Y,
  HS_RIGHT_GAME_MODE_VALUE_X,
  HS_RIGHT_GAME_MODE_VALUE_Y,
  HS_RIGHT_GAME_MODE_WIDGET_W,
  HS_RIGHT_GAME_MODE_WIDGET_X,
  HS_RIGHT_GAME_MODE_WIDGET_Y,
  HS_RIGHT_GAME_MODE_X,
  HS_RIGHT_GAME_MODE_Y,
  HS_RIGHT_NUMBER_PLAYERS_X,
  HS_RIGHT_NUMBER_PLAYERS_Y,
  HS_RIGHT_PLAYER_COUNT_DROP_X,
  HS_RIGHT_PLAYER_COUNT_DROP_Y,
  HS_RIGHT_PLAYER_COUNT_VALUE_X,
  HS_RIGHT_PLAYER_COUNT_VALUE_Y,
  HS_RIGHT_PLAYER_COUNT_WIDGET_W,
  HS_RIGHT_PLAYER_COUNT_WIDGET_X,
  HS_RIGHT_PLAYER_COUNT_WIDGET_Y,
  HS_RIGHT_SCORE_LIST_DROP_X,
  HS_RIGHT_SCORE_LIST_DROP_Y,
  HS_RIGHT_SCORE_LIST_VALUE_X,
  HS_RIGHT_SCORE_LIST_VALUE_Y,
  HS_RIGHT_SCORE_LIST_WIDGET_W,
  HS_RIGHT_SCORE_LIST_WIDGET_X,
  HS_RIGHT_SCORE_LIST_WIDGET_Y,
  HS_RIGHT_SCORE_LIST_X,
  HS_RIGHT_SCORE_LIST_Y,
  HS_RIGHT_SHOW_INTERNET_X,
  HS_RIGHT_SHOW_INTERNET_Y,
  HS_RIGHT_SHOW_SCORES_DROP_X,
  HS_RIGHT_SHOW_SCORES_DROP_Y,
  HS_RIGHT_SHOW_SCORES_VALUE_X,
  HS_RIGHT_SHOW_SCORES_VALUE_Y,
  HS_RIGHT_SHOW_SCORES_WIDGET_W,
  HS_RIGHT_SHOW_SCORES_WIDGET_X,
  HS_RIGHT_SHOW_SCORES_WIDGET_Y,
  HS_RIGHT_SHOW_SCORES_X,
  HS_RIGHT_SHOW_SCORES_Y,
  hsRightLocalCardXShift,
  hsRightOptionsXShift,
} from '@crimson/screens/high-scores-layout.ts';
import type { HighScoresView } from './view.ts';

type Color = [number, number, number, number];
type RectTuple = [number, number, number, number];

const WHITE: Color = [1, 1, 1, 1];
const ORIGIN: [number, number] = [0, 0];

function savedScoreNames(view: HighScoresView): string[] {
  const config = view.state.config.profile;
  const count = Math.max(0, Math.min(config.savedNames.length, config.savedNameCount));
  return config.savedNames.slice(0, Math.max(1, count));
}

function drawDropdown(
  ctx: WebGLContext,
  opts: {
    resources: RuntimeResources;
    font: SmallFontData;
    widgetPos: Vec2;
    widgetW: number;
    items: string[];
    selectedIndex: number;
    valuePos: Vec2;
    arrowPos: Vec2;
    isOpen: boolean;
    enabled: boolean;
    scale: number;
  },
): void {
  const { resources, font, widgetPos, widgetW, items, valuePos, arrowPos, isOpen, enabled, scale } = opts;
  let selectedIndex = opts.selectedIndex;
  const itemCount = Math.max(0, items.length);
  const headerH = 16.0 * scale;
  const rowH = 16.0 * scale;
  const fullH = (itemCount * 16.0 + 24.0) * scale;
  const rowsY0 = widgetPos.y + 17.0 * scale;

  const [mx, my] = InputState.mousePosition();
  const mouse = { x: mx, y: my };
  const hoveredHeader = enabled && mouseInsideRectWithPadding(
    mouse, widgetPos, widgetW, 14.0 * scale,
  );

  const widgetH = isOpen ? fullH : headerH;
  ctx.drawRectangle(Math.floor(widgetPos.x), Math.floor(widgetPos.y), Math.floor(widgetW), Math.floor(widgetH), 1, 1, 1, 1);
  ctx.drawRectangle(
    Math.floor(widgetPos.x) + 1,
    Math.floor(widgetPos.y) + 1,
    Math.max(0, Math.floor(widgetW) - 2),
    Math.max(0, Math.floor(widgetH) - 2),
    0, 0, 0, 1,
  );

  if ((isOpen || hoveredHeader) && enabled) {
    const lineH = Math.max(1, Math.floor(1.0 * scale));
    ctx.drawRectangle(
      Math.floor(widgetPos.x),
      Math.floor(widgetPos.y + 15.0 * scale),
      Math.floor(widgetW),
      lineH,
      1, 1, 1, 0.5,
    );
  }

  const arrowTex = ((isOpen || hoveredHeader) && enabled)
    ? getTexture(resources, TextureId.UI_DROP_ON)
    : getTexture(resources, TextureId.UI_DROP_OFF);
  const arrowW = arrowTex.width * scale;
  const arrowH = arrowTex.height * scale;
  ctx.drawTexturePro(
    arrowTex,
    [0.0, 0.0, arrowTex.width, arrowTex.height],
    [arrowPos.x, arrowPos.y, arrowW, arrowH],
    ORIGIN,
    0.0,
    WHITE,
  );

  if (itemCount <= 0) return;

  selectedIndex = Math.max(0, Math.min(itemCount - 1, Math.floor(selectedIndex)));
  const headerAlpha = ((isOpen || hoveredHeader) && enabled) ? 242 / 255 : 191 / 255;
  drawSmallText(ctx, font, items[selectedIndex], valuePos, [1, 1, 1, headerAlpha]);

  if (!isOpen) return;

  for (let idx = 0; idx < items.length; idx++) {
    const label = items[idx];
    const itemY = rowsY0 + rowH * idx;
    const hovered = enabled && mouseInsideRectWithPadding(
      mouse, new Vec2(widgetPos.x, itemY), widgetW, 14.0 * scale,
    );
    let alpha = 153 / 255;
    if (hovered) alpha = 242 / 255;
    if (idx === selectedIndex) alpha = Math.max(alpha, 245 / 255);
    drawSmallText(ctx, font, label, new Vec2(valuePos.x, itemY), [1, 1, 1, alpha]);
  }
}

export function drawRightPanel(
  ctx: WebGLContext,
  view: HighScoresView,
  opts: {
    resources: RuntimeResources;
    font: SmallFontData;
    rightTopLeft: Vec2;
    scale: number;
    highlightRank: number | null;
  },
): void {
  if (opts.highlightRank === null) {
    drawRightPanelQuestOptions(ctx, view, opts);
    return;
  }
  drawRightPanelLocalScore(ctx, view, {
    resources: opts.resources,
    font: opts.font,
    rightTopLeft: opts.rightTopLeft,
    scale: opts.scale,
    highlightRank: opts.highlightRank,
  });
}

function drawRightPanelQuestOptions(
  ctx: WebGLContext,
  view: HighScoresView,
  opts: {
    resources: RuntimeResources;
    font: SmallFontData;
    rightTopLeft: Vec2;
    scale: number;
  },
): void {
  const { resources, font, rightTopLeft, scale } = opts;
  const optionsShiftX = hsRightOptionsXShift(view.state.config.display.width);
  const optionsTopLeft = rightTopLeft.add(new Vec2(optionsShiftX * scale, 0.0));
  const textColor: Color = [1, 1, 1, 0.8];

  // Checkbox: "Show internet scores"
  const checkTex = view.state.config.profile.showInternetScores
    ? getTexture(resources, TextureId.UI_CHECK_ON)
    : getTexture(resources, TextureId.UI_CHECK_OFF);
  const checkW = checkTex.width * scale;
  const checkH = checkTex.height * scale;
  ctx.drawTexturePro(
    checkTex,
    [0.0, 0.0, checkTex.width, checkTex.height],
    [
      optionsTopLeft.x + HS_RIGHT_CHECK_X * scale,
      optionsTopLeft.y + HS_RIGHT_CHECK_Y * scale,
      checkW,
      checkH,
    ],
    ORIGIN,
    0.0,
    WHITE,
  );

  drawSmallText(ctx, font, 'Show internet scores', optionsTopLeft.add(new Vec2(HS_RIGHT_SHOW_INTERNET_X * scale, HS_RIGHT_SHOW_INTERNET_Y * scale)), textColor);
  drawSmallText(ctx, font, 'Number of players', optionsTopLeft.add(new Vec2(HS_RIGHT_NUMBER_PLAYERS_X * scale, HS_RIGHT_NUMBER_PLAYERS_Y * scale)), textColor);
  drawSmallText(ctx, font, 'Game mode', optionsTopLeft.add(new Vec2(HS_RIGHT_GAME_MODE_X * scale, HS_RIGHT_GAME_MODE_Y * scale)), textColor);
  drawSmallText(ctx, font, 'Show scores:', optionsTopLeft.add(new Vec2(HS_RIGHT_SHOW_SCORES_X * scale, HS_RIGHT_SHOW_SCORES_Y * scale)), textColor);
  drawSmallText(ctx, font, 'Selected score list:', optionsTopLeft.add(new Vec2(HS_RIGHT_SCORE_LIST_X * scale, HS_RIGHT_SCORE_LIST_Y * scale)), textColor);

  // Dropdown items
  const showScoresItems = ['Best of all time', 'Best of month', 'Best of week', 'Best of day'];
  const playerItems = ['1 player', '2 players', '3 players', '4 players'];
  const modeItems: [string, number][] = [['Quests', 3], ['Rush', 2], ['Survival', 1]];
  if ((view.questUnlockIndex | 0) >= 0x28) {
    modeItems.push(["Typ'o'Shooter", 4]);
  }
  const names = savedScoreNames(view);

  const playerCount = Math.max(1, Math.min(4, view.state.config.gameplay.playerCount));
  const playerSelected = playerCount - 1;
  const showScoresSelected = Math.max(0, Math.min(showScoresItems.length - 1, Math.floor(view.state.config.profile.scoreDateMode)));
  const modeId = view.state.config.gameplay.mode;
  let modeSelected = 0;
  for (let idx = 0; idx < modeItems.length; idx++) {
    if (modeItems[idx][1] === (modeId as number)) {
      modeSelected = idx;
      break;
    }
  }
  const nameSelected = Math.max(0, Math.min(names.length - 1, Math.floor(view.state.config.profile.selectedSavedNameSlot)));

  type DropdownSpec = [boolean, Vec2, number, string[], number, Vec2, Vec2, boolean];
  const dropdowns: DropdownSpec[] = [
    [
      view.playerCountOpen,
      new Vec2(HS_RIGHT_PLAYER_COUNT_WIDGET_X, HS_RIGHT_PLAYER_COUNT_WIDGET_Y),
      HS_RIGHT_PLAYER_COUNT_WIDGET_W,
      playerItems,
      playerSelected,
      new Vec2(HS_RIGHT_PLAYER_COUNT_VALUE_X, HS_RIGHT_PLAYER_COUNT_VALUE_Y),
      new Vec2(HS_RIGHT_PLAYER_COUNT_DROP_X, HS_RIGHT_PLAYER_COUNT_DROP_Y),
      !(view.gameModeOpen || view.showScoresOpen || view.scoreListOpen),
    ],
    [
      view.gameModeOpen,
      new Vec2(HS_RIGHT_GAME_MODE_WIDGET_X, HS_RIGHT_GAME_MODE_WIDGET_Y),
      HS_RIGHT_GAME_MODE_WIDGET_W,
      modeItems.map(([label]) => label),
      modeSelected,
      new Vec2(HS_RIGHT_GAME_MODE_VALUE_X, HS_RIGHT_GAME_MODE_VALUE_Y),
      new Vec2(HS_RIGHT_GAME_MODE_DROP_X, HS_RIGHT_GAME_MODE_DROP_Y),
      !(view.playerCountOpen || view.showScoresOpen || view.scoreListOpen),
    ],
    [
      view.showScoresOpen,
      new Vec2(HS_RIGHT_SHOW_SCORES_WIDGET_X, HS_RIGHT_SHOW_SCORES_WIDGET_Y),
      HS_RIGHT_SHOW_SCORES_WIDGET_W,
      showScoresItems,
      showScoresSelected,
      new Vec2(HS_RIGHT_SHOW_SCORES_VALUE_X, HS_RIGHT_SHOW_SCORES_VALUE_Y),
      new Vec2(HS_RIGHT_SHOW_SCORES_DROP_X, HS_RIGHT_SHOW_SCORES_DROP_Y),
      !(view.playerCountOpen || view.gameModeOpen || view.scoreListOpen),
    ],
    [
      view.scoreListOpen,
      new Vec2(HS_RIGHT_SCORE_LIST_WIDGET_X, HS_RIGHT_SCORE_LIST_WIDGET_Y),
      HS_RIGHT_SCORE_LIST_WIDGET_W,
      names,
      nameSelected,
      new Vec2(HS_RIGHT_SCORE_LIST_VALUE_X, HS_RIGHT_SCORE_LIST_VALUE_Y),
      new Vec2(HS_RIGHT_SCORE_LIST_DROP_X, HS_RIGHT_SCORE_LIST_DROP_Y),
      !(view.playerCountOpen || view.gameModeOpen || view.showScoresOpen),
    ],
  ];

  // Active list must render last so overlapping widgets don't occlude open options.
  for (const [isOpen, widgetOffset, widgetW, items, selectedIndex, valueOffset, arrowOffset, enabled] of dropdowns) {
    if (isOpen) continue;
    drawDropdown(ctx, {
      resources,
      font,
      widgetPos: optionsTopLeft.add(widgetOffset.mul(scale)),
      widgetW: widgetW * scale,
      items,
      selectedIndex,
      valuePos: optionsTopLeft.add(valueOffset.mul(scale)),
      arrowPos: optionsTopLeft.add(arrowOffset.mul(scale)),
      isOpen,
      enabled,
      scale,
    });
  }
  for (const [isOpen, widgetOffset, widgetW, items, selectedIndex, valueOffset, arrowOffset, enabled] of dropdowns) {
    if (!isOpen) continue;
    drawDropdown(ctx, {
      resources,
      font,
      widgetPos: optionsTopLeft.add(widgetOffset.mul(scale)),
      widgetW: widgetW * scale,
      items,
      selectedIndex,
      valuePos: optionsTopLeft.add(valueOffset.mul(scale)),
      arrowPos: optionsTopLeft.add(arrowOffset.mul(scale)),
      isOpen,
      enabled,
      scale,
    });
  }
}

function drawRightPanelLocalScore(
  ctx: WebGLContext,
  view: HighScoresView,
  opts: {
    resources: RuntimeResources;
    font: SmallFontData;
    rightTopLeft: Vec2;
    scale: number;
    highlightRank: number | null;
  },
): void {
  const { resources, font, rightTopLeft, scale, highlightRank } = opts;
  const localShiftX = hsRightLocalCardXShift(view.state.config.display.width);
  const cardTopLeft = rightTopLeft.add(new Vec2(localShiftX * scale, 0.0));

  if (view.records.length === 0) return;

  let idx = highlightRank !== null ? Math.floor(highlightRank) : Math.floor(view.scrollIndex);
  if (idx < 0) idx = 0;
  if (idx >= view.records.length) idx = view.records.length - 1;
  const entry = view.records[idx];

  const textColor: Color = [0.9, 0.9, 0.9, 0.8];
  const valueColor: Color = [0.9, 0.9, 1, 1];
  const gameTimeColor: Color = [1, 1, 1, 0.8];
  const lowerSectionColor: Color = [0.9, 0.9, 0.9, 0.7];
  const separatorColor: Color = [149 / 255, 175 / 255, 198 / 255, 0.7];

  let name = entry.name();
  if (!name) name = '???';
  drawSmallText(ctx, font, name, cardTopLeft.add(new Vec2(HS_LOCAL_NAME_X * scale, HS_LOCAL_NAME_Y * scale)), textColor);
  drawSmallText(ctx, font, 'Local score', cardTopLeft.add(new Vec2(HS_LOCAL_LABEL_X * scale, HS_LOCAL_LABEL_Y * scale)), textColor);

  // Separator line
  ctx.drawRectangle(
    Math.floor(cardTopLeft.x + 78.0 * scale),
    Math.floor(cardTopLeft.y + 57.0 * scale),
    Math.floor(39.0 * scale),
    1,
    separatorColor[0], separatorColor[1], separatorColor[2], separatorColor[3],
  );

  const dateText = formatScoreDate(entry);
  if (dateText) {
    drawSmallText(ctx, font, dateText, cardTopLeft.add(new Vec2(HS_LOCAL_DATE_X * scale, HS_LOCAL_DATE_Y * scale)), textColor);
  }
  ctx.drawRectangle(
    Math.floor(cardTopLeft.x + 74.0 * scale),
    Math.floor(cardTopLeft.y + 72.0 * scale),
    Math.floor(192.0 * scale),
    1,
    separatorColor[0], separatorColor[1], separatorColor[2], separatorColor[3],
  );

  drawSmallText(ctx, font, 'Score', cardTopLeft.add(new Vec2(HS_LOCAL_SCORE_LABEL_X * scale, HS_LOCAL_SCORE_LABEL_Y * scale)), textColor);

  let modeId: GameMode;
  const modeRaw = Math.floor(entry.gameModeId);
  try {
    modeId = modeRaw as GameMode;
  } catch {
    modeId = GameMode.DEMO;
  }
  const elapsedMs = Math.floor(entry.survivalElapsedMs);
  const scoreXp = Math.floor(entry.scoreXp);

  let timeLabel: string;
  if (modeId === GameMode.QUESTS) {
    timeLabel = 'Experience';
  } else {
    timeLabel = 'Game time';
  }

  drawSmallText(ctx, font, timeLabel, cardTopLeft.add(new Vec2(HS_LOCAL_TIME_LABEL_X * scale, HS_LOCAL_TIME_LABEL_Y * scale)), gameTimeColor);
  // Vertical separator
  ctx.drawRectangle(
    Math.floor(cardTopLeft.x + 170.0 * scale),
    Math.floor(cardTopLeft.y + 90.0 * scale),
    1,
    Math.floor(48.0 * scale),
    separatorColor[0], separatorColor[1], separatorColor[2], separatorColor[3],
  );

  // Score value
  let scoreValuePosX = HS_LOCAL_SCORE_VALUE_X * scale;
  let scoreValuePosY = HS_LOCAL_SCORE_VALUE_Y * scale;
  let scoreValue: string;
  if (modeId === GameMode.RUSH || modeId === GameMode.QUESTS) {
    scoreValue = `${(Math.max(0, elapsedMs) * 0.001).toFixed(2)} secs`;
    const scoreLabelW = measureSmallTextWidth(font, 'Score');
    const scoreValueW = measureSmallTextWidth(font, scoreValue);
    const scoreColCenterX = HS_LOCAL_SCORE_LABEL_X * scale + scoreLabelW * 0.5;
    scoreValuePosX = scoreColCenterX - scoreValueW * 0.5;
  } else {
    scoreValue = `${scoreXp}`;
  }
  drawSmallText(ctx, font, scoreValue, cardTopLeft.add(new Vec2(scoreValuePosX, scoreValuePosY)), valueColor);

  if (modeId === GameMode.QUESTS) {
    drawSmallText(ctx, font, `${scoreXp}`, cardTopLeft.add(new Vec2(HS_LOCAL_TIME_VALUE_X * scale, HS_LOCAL_TIME_VALUE_Y * scale)), gameTimeColor);
  } else {
    drawClockGauge(ctx, {
      resources,
      elapsedMs,
      pos: cardTopLeft.add(new Vec2(HS_LOCAL_CLOCK_X * scale, HS_LOCAL_CLOCK_Y * scale)),
      scale,
    });
    drawSmallText(ctx, font, formatTimeMmSs(elapsedMs), cardTopLeft.add(new Vec2(HS_LOCAL_TIME_VALUE_X * scale, HS_LOCAL_TIME_VALUE_Y * scale)), gameTimeColor);
  }

  drawSmallText(ctx, font, `Rank: ${formatOrdinal(idx + 1)}`, cardTopLeft.add(new Vec2(HS_LOCAL_RANK_X * scale, HS_LOCAL_RANK_Y * scale)), textColor);

  const frags = Math.floor(entry.creatureKillCount);
  const shotsFired = Math.floor(entry.shotsFired);
  const shotsHit = Math.floor(entry.shotsHit);
  let hitPct = 0;
  if (shotsFired > 0) {
    hitPct = Math.floor((shotsHit * 100) / shotsFired);
  }

  ctx.drawRectangle(
    Math.floor(cardTopLeft.x + 74.0 * scale),
    Math.floor(cardTopLeft.y + 142.0 * scale),
    Math.floor(192.0 * scale),
    1,
    separatorColor[0], separatorColor[1], separatorColor[2], separatorColor[3],
  );

  const weaponId = entry.mostUsedWeaponId;
  const [weaponName, iconIndex] = weaponLabelAndIcon(view, weaponId);
  if (iconIndex !== null) {
    drawWicon(ctx, {
      resources,
      iconIndex,
      pos: cardTopLeft.add(new Vec2(HS_LOCAL_WICON_X * scale, HS_LOCAL_WICON_Y * scale)),
      scale,
    });
  }
  const weaponNameX = HS_LOCAL_WICON_X * scale + Math.max(
    0.0,
    32.0 * scale - measureSmallTextWidth(font, weaponName) * 0.5,
  );
  drawSmallText(ctx, font, weaponName, cardTopLeft.add(new Vec2(weaponNameX, HS_LOCAL_WEAPON_Y * scale)), lowerSectionColor);
  drawSmallText(ctx, font, `Frags: ${frags}`, cardTopLeft.add(new Vec2(HS_LOCAL_FRAGS_X * scale, HS_LOCAL_FRAGS_Y * scale)), lowerSectionColor);
  drawSmallText(ctx, font, `Hit %: ${hitPct}%`, cardTopLeft.add(new Vec2(HS_LOCAL_HIT_X * scale, HS_LOCAL_HIT_Y * scale)), lowerSectionColor);

  ctx.drawRectangle(
    Math.floor(cardTopLeft.x + 74.0 * scale),
    Math.floor(cardTopLeft.y + 194.0 * scale),
    Math.floor(192.0 * scale),
    1,
    separatorColor[0], separatorColor[1], separatorColor[2], separatorColor[3],
  );
}

function drawClockGauge(
  ctx: WebGLContext,
  opts: {
    resources: RuntimeResources;
    elapsedMs: number;
    pos: Vec2;
    scale: number;
  },
): void {
  const { resources, elapsedMs, pos, scale } = opts;
  const tableTex = getTexture(resources, TextureId.UI_CLOCK_TABLE);
  const pointerTex = getTexture(resources, TextureId.UI_CLOCK_POINTER);
  const drawW = 32.0 * scale;
  const drawH = 32.0 * scale;
  const dst: RectTuple = [pos.x, pos.y, drawW, drawH];
  const srcTable: RectTuple = [0.0, 0.0, tableTex.width, tableTex.height];
  const srcPointer: RectTuple = [0.0, 0.0, pointerTex.width, pointerTex.height];
  ctx.drawTexturePro(tableTex, srcTable, dst, ORIGIN, 0.0, WHITE);

  const seconds = Math.max(0, Math.floor(elapsedMs) / 1000) | 0;
  const rotationDeg = seconds * 6.0;
  const centerX = pos.x + drawW * 0.5;
  const centerY = pos.y + drawH * 0.5;
  ctx.drawTexturePro(
    pointerTex,
    srcPointer,
    [centerX, centerY, drawW, drawH],
    [drawW * 0.5, drawH * 0.5],
    rotationDeg,
    WHITE,
  );
}

function drawWicon(
  ctx: WebGLContext,
  opts: {
    resources: RuntimeResources;
    iconIndex: number;
    pos: Vec2;
    scale: number;
  },
): void {
  const { resources, iconIndex, pos, scale } = opts;
  const tex = getTexture(resources, TextureId.UI_WICONS);
  const idx = Math.floor(iconIndex);
  if (idx < 0 || idx > 31) return;
  const grid = 8;
  const cellW = tex.width / grid;
  const cellH = tex.height / grid;
  const frame = idx * 2;
  const srcX = (frame % grid) * cellW;
  const srcY = Math.floor(frame / grid) * cellH;
  const iconW = cellW * 2.0;
  const iconH = cellH;
  ctx.drawTexturePro(
    tex,
    [srcX, srcY, iconW, iconH],
    [pos.x, pos.y, iconW * scale, iconH * scale],
    ORIGIN,
    0.0,
    WHITE,
  );
}

function weaponLabelAndIcon(view: HighScoresView, weaponId: number): [string, number | null] {
  const weapon = WEAPON_BY_ID.get(weaponId as WeaponId);
  if (weapon === undefined) {
    return ['Unknown', null];
  }
  const name = weaponDisplayName(weapon.weaponId, view.state.preserveBugs);
  return [name, weapon.iconIndex];
}
