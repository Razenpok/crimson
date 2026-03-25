// Port of crimson/ui/overlays/quest_title.py

import * as wgl from '@wgl';
import { Vec2 } from '@grim/geom.ts';
import { type GrimMonoFont, drawGrimMonoText } from '@grim/fonts/grim-mono.ts';

const QUEST_TITLE_ALPHA = 1.0;
const QUEST_NUMBER_ALPHA_RATIO = 0.5;
const QUEST_TITLE_SCALE_SMALL = 0.75;
const QUEST_TITLE_SCALE_LARGE = 0.8;
const QUEST_TITLE_SCALE_THRESHOLD_PX = 640;
const QUEST_TITLE_Y_OFFSET = 32.0;
const QUEST_NUMBER_SCALE_DELTA = 0.2;
const QUEST_NUMBER_HALF_ADVANCE = 8.0;
const QUEST_NUMBER_BASE_GAP = 32.0;
const QUEST_NUMBER_FIXED_OFFSET = 4.0;
const QUEST_NUMBER_Y_MULTIPLIER = 7.36;

export interface QuestTitleOverlayLayout {
  readonly titlePos: Vec2;
  readonly titleScale: number;
  readonly numberPos: Vec2;
  readonly numberScale: number;
}

export function questTitleBaseScale(screenWidth: number): number {
  return screenWidth <= QUEST_TITLE_SCALE_THRESHOLD_PX
    ? QUEST_TITLE_SCALE_SMALL
    : QUEST_TITLE_SCALE_LARGE;
}

export function questNumberScale(titleScale: number): number {
  return Math.max(0.0, titleScale - QUEST_NUMBER_SCALE_DELTA);
}

export function layoutQuestTitleOverlay(
  opts: {
    screenWidth: number;
    screenHeight: number;
    title: string;
    number: string;
    fontAdvance: number;
  },
): QuestTitleOverlayLayout {
  const titleScale = questTitleBaseScale(int(opts.screenWidth));
  const numberSc = questNumberScale(titleScale);
  const titleWidth = opts.title.length * opts.fontAdvance * titleScale;
  const centerX = (int(opts.screenWidth) >> 1);
  const centerY = (int(opts.screenHeight) >> 1);
  const titlePos = new Vec2(centerX - titleWidth / 2.0, centerY - QUEST_TITLE_Y_OFFSET);
  const numberX =
    titlePos.x -
    opts.number.length * numberSc * QUEST_NUMBER_HALF_ADVANCE -
    numberSc * QUEST_NUMBER_BASE_GAP -
    QUEST_NUMBER_FIXED_OFFSET;
  const numberY = titlePos.y + numberSc * QUEST_NUMBER_Y_MULTIPLIER;
  return {
    titlePos,
    titleScale,
    numberPos: new Vec2(numberX, numberY),
    numberScale: numberSc,
  };
}

export function drawQuestTitleOverlay(
  screenW: number,
  screenH: number,
  font: GrimMonoFont,
  title: string,
  number: string,
  opts: { alpha?: number } = {},
): void {
  const alpha = Math.max(0.0, Math.min(1.0, opts.alpha ?? 1.0));
  const layout = layoutQuestTitleOverlay({
    screenWidth: screenW,
    screenHeight: screenH,
    title,
    number,
    fontAdvance: font.advance,
  });
  const titleColor = wgl.makeColor(
    1.0,
    1.0,
    1.0,
    QUEST_TITLE_ALPHA * alpha,
  );
  const numberColor = wgl.makeColor(
    1.0,
    1.0,
    1.0,
    QUEST_TITLE_ALPHA * QUEST_NUMBER_ALPHA_RATIO * alpha,
  );
  drawGrimMonoText(font, title, layout.titlePos, layout.titleScale, titleColor);
  drawGrimMonoText(font, number, layout.numberPos, layout.numberScale, numberColor);
}
