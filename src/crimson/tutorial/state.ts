// Port of crimson/tutorial/state.py

export class TutorialState {
  stageIndex = -1;
  stageTimerMs = 0;
  stageTransitionTimerMs = -1000;
  hintIndex = -1;
  hintAlpha = 0;
  hintFadeIn = false;
  repeatSpawnCount = 0;
  hintBonusCreatureRef: number | null = null;
  preserveBugs = false;
  moveActiveThisTick = false;
  fireActiveThisTick = false;
  hintBonusAliveBeforeTick = false;
}


export class TutorialOverlayState {
  promptText = '';
  promptAlpha = 0.0;
  hintText = '';
  hintAlpha = 0.0;
}


export function resetTutorialState(
  tutorial: TutorialState,
  overlay: TutorialOverlayState,
  opts: { preserveBugs: boolean },
): void {
  tutorial.stageIndex = -1;
  tutorial.stageTimerMs = 0;
  tutorial.stageTransitionTimerMs = -1000;
  tutorial.hintIndex = -1;
  tutorial.hintAlpha = 0;
  tutorial.hintFadeIn = false;
  tutorial.repeatSpawnCount = 0;
  tutorial.hintBonusCreatureRef = null;
  tutorial.preserveBugs = opts.preserveBugs;
  tutorial.moveActiveThisTick = false;
  tutorial.fireActiveThisTick = false;
  tutorial.hintBonusAliveBeforeTick = false;
  overlay.promptText = '';
  overlay.promptAlpha = 0.0;
  overlay.hintText = '';
  overlay.hintAlpha = 0.0;
}
