// Port of crimson/ui/text_input.py

import { InputState } from '@grim/input.ts';
import { CrimsonConfig } from '@grim/config.ts';
import { CrandLike } from '@grim/rand.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { INPUT_CODE_UNBOUND, inputCodeIsDown } from '@crimson/input-codes.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';

const _CONTROL_BIND_SLOTS = 5;

// DirectInput arrow key codes used as single-player alt move codes
const _SINGLE_PLAYER_ALT_MOVE_CODES: readonly number[] = [0xC8, 0xD0, 0xCB, 0xCD];

// DOM key codes
const KEY_BACKSPACE = 8;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_HOME = 36;
const KEY_END = 35;

/**
 * Drain the char queue and return any printable characters typed this frame.
 * Characters outside 0x20..0xFF are discarded; space can be excluded.
 */
export function pollTextInput(maxLen: number, opts: { allowSpace?: boolean } = {}): string {
  const allowSpace = opts.allowSpace ?? true;
  let out = '';
  while (true) {
    const value = InputState.getCharPressed();
    if (value === 0) break;
    if (value < 0x20 || value > 0xFF) continue;
    if (!allowSpace && value === 0x20) continue;
    if (out.length >= maxLen) continue;
    out += String.fromCharCode(value);
  }
  return out;
}

/**
 * Drain both char and key queues so no stale input leaks into the next frame.
 */
export function flushTextInputEvents(): void {
  while (InputState.getCharPressed()) { /* drain */ }
  while (InputState.getKeyPressed()) { /* drain */ }
}

/**
 * Process one frame of name-entry editing: typed characters, backspace,
 * arrow keys, home, and end.
 *
 * Returns the updated [text, caret] pair.
 */
export function updateNameEntryText(
  text: string,
  caret: number,
  opts: {
    maxLen: number;
    rng: CrandLike;
    playSfx?: ((id: SfxId) => void) | null;
  },
): [string, number] {
  const typed = pollTextInput(opts.maxLen - text.length, { allowSpace: true });
  if (typed) {
    text = (text.slice(0, caret) + typed + text.slice(caret)).slice(0, opts.maxLen);
    caret = Math.min(text.length, caret + typed.length);
    if (opts.playSfx != null) {
      opts.playSfx(
        (opts.rng.rand({ caller: RngCallerStatic.UI_TEXT_INPUT_UPDATE_TYPECLICK }) & 1) === 0
          ? SfxId.UI_TYPECLICK_01
          : SfxId.UI_TYPECLICK_02,
      );
    }
  }

  // Backspace
  if (InputState.wasKeyPressed(KEY_BACKSPACE) && caret > 0) {
    text = text.slice(0, caret - 1) + text.slice(caret);
    caret -= 1;
    if (opts.playSfx != null) {
      opts.playSfx(
        (opts.rng.rand({ caller: RngCallerStatic.UI_TEXT_INPUT_UPDATE_TYPECLICK }) & 1) === 0
          ? SfxId.UI_TYPECLICK_01
          : SfxId.UI_TYPECLICK_02,
      );
    }
  }

  // Arrow keys / Home / End
  if (InputState.wasKeyPressed(KEY_LEFT)) {
    caret = Math.max(0, caret - 1);
  }
  if (InputState.wasKeyPressed(KEY_RIGHT)) {
    caret = Math.min(text.length, caret + 1);
  }
  if (InputState.wasKeyPressed(KEY_HOME)) {
    caret = 0;
  }
  if (InputState.wasKeyPressed(KEY_END)) {
    caret = text.length;
  }

  return [text, caret];
}

/**
 * Return true if any gameplay control (movement or fire) is currently held
 * for any active player.  Used to detect "player is trying to play" while
 * a text-input overlay is open.
 */
export function gameplayControlsHeld(config: CrimsonConfig): boolean {
  const playerCount = Math.max(1, Math.min(4, config.gameplay.playerCount));

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    const playerControls = config.controls.players[playerIndex];
    const [moveForwardKey, moveBackwardKey, turnLeftKey, turnRightKey] = playerControls.moveCodes;

    const codes = [moveForwardKey, moveBackwardKey, turnLeftKey, turnRightKey, playerControls.fireCode];
    for (let i = 0; i < _CONTROL_BIND_SLOTS && i < codes.length; i++) {
      const code = codes[i];
      if (code === INPUT_CODE_UNBOUND) continue;
      if (inputCodeIsDown(code, { playerIndex })) return true;
    }
  }

  // Single-player alt movement (arrow keys in DirectInput codes)
  for (const code of _SINGLE_PLAYER_ALT_MOVE_CODES) {
    if (inputCodeIsDown(code, { playerIndex: 0 })) return true;
  }

  return false;
}
