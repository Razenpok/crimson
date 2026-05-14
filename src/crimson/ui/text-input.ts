// Port of crimson/ui/text_input.py

import { InputState } from '@grim/input.ts';
import { CrimsonConfig } from '@grim/config.ts';
import { CrandLike } from '@grim/rand.ts';
import { SfxId } from '@grim/sfx-map.ts';
import { INPUT_CODE_UNBOUND, inputCodeIsDown } from '@crimson/input-codes.ts';
import { RngCallerStatic } from '@crimson/rng-caller-static.ts';

const _CONTROL_BIND_SLOTS = 5;
const _SINGLE_PLAYER_ALT_MOVE_CODES: readonly number[] = [0xC8, 0xD0, 0xCB, 0xCD];

const KEY_BACKSPACE = 8;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_HOME = 36;
const KEY_END = 35;

function _textChars(text: string): string[] {
  return Array.from(text);
}

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

export function flushTextInputEvents(): void {
  // Native flows call `grim_flush_input()` before entering high-score name input.
  while (InputState.getCharPressed()) {}
  while (InputState.getKeyPressed()) {}
}

export function updateNameEntryText(
  text: string,
  caret: number,
  opts: {
    maxLen: number;
    rng: CrandLike;
    playSfx?: ((id: SfxId) => void) | null;
  },
): [string, number] {
  const typed = pollTextInput(opts.maxLen - _textChars(text).length, { allowSpace: true });
  if (typed) {
    const chars = _textChars(text);
    const typedChars = _textChars(typed);
    text = [...chars.slice(0, caret), ...typedChars, ...chars.slice(caret)]
      .slice(0, opts.maxLen)
      .join('');
    caret = Math.min(_textChars(text).length, caret + typedChars.length);
    if (opts.playSfx != null) {
      opts.playSfx(
        (opts.rng.rand({ caller: RngCallerStatic.UI_TEXT_INPUT_UPDATE_TYPECLICK }) & 1) === 0
          ? SfxId.UI_TYPECLICK_01
          : SfxId.UI_TYPECLICK_02,
      );
    }
  }

  if (InputState.wasKeyPressed(KEY_BACKSPACE) && caret > 0) {
    const chars = _textChars(text);
    text = [...chars.slice(0, caret - 1), ...chars.slice(caret)].join('');
    caret -= 1;
    if (opts.playSfx != null) {
      opts.playSfx(
        (opts.rng.rand({ caller: RngCallerStatic.UI_TEXT_INPUT_UPDATE_TYPECLICK }) & 1) === 0
          ? SfxId.UI_TYPECLICK_01
          : SfxId.UI_TYPECLICK_02,
      );
    }
  }

  if (InputState.wasKeyPressed(KEY_LEFT)) {
    caret = Math.max(0, caret - 1);
  }
  if (InputState.wasKeyPressed(KEY_RIGHT)) {
    caret = Math.min(_textChars(text).length, caret + 1);
  }
  if (InputState.wasKeyPressed(KEY_HOME)) {
    caret = 0;
  }
  if (InputState.wasKeyPressed(KEY_END)) {
    caret = _textChars(text).length;
  }

  return [text, caret];
}

export function gameplayControlsHeld(config: CrimsonConfig): boolean {
  const playerCount = Math.max(1, Math.min(4, config.gameplay.playerCount));

  for (let playerIndex = 0; playerIndex < playerCount; playerIndex++) {
    const playerControls = config.controls.player(playerIndex);
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
