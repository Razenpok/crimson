// Port of grim/console.py

import * as wgl from '@wgl';
import { Vec2 } from './geom.ts';
import { clamp } from './math.ts';
import { type SmallFontData, drawSmallText, measureSmallTextWidth } from './fonts/small.ts';
import { type GrimMonoFont, drawGrimMonoText } from './fonts/grim-mono.ts';
import { InputState } from './input.ts';

export const MAX_CONSOLE_LINES = 0x1000;
export const MAX_CONSOLE_INPUT = 0x3FF;
export const DEFAULT_CONSOLE_HEIGHT = 300;
export const EXTENDED_CONSOLE_HEIGHT = 480;
export const CONSOLE_VERSION_TEXT = 'Crimsonland 1.9.93';
export const CONSOLE_ANIM_SPEED = 3.5;
export const CONSOLE_BLINK_SPEED = 3.0;
export const CONSOLE_LINE_HEIGHT = 16.0;
export const CONSOLE_MONO_SCALE = 0.5;
export const CONSOLE_TEXT_X = 10.0;
export const CONSOLE_INPUT_X_MONO = 26.0;
export const CONSOLE_VERSION_OFFSET_X = 210.0;
export const CONSOLE_VERSION_OFFSET_Y = 18.0;
export const CONSOLE_BG_COLOR: [number, number, number] = [0.140625, 0.1875, 0.2890625];
export const CONSOLE_BORDER_COLOR: [number, number, number] = [0.21875, 0.265625, 0.3671875];
export const CONSOLE_BORDER_HEIGHT = 4.0;
export const CONSOLE_PROMPT_MONO = '>';
export const CONSOLE_PROMPT_SMALL = '>';
export const CONSOLE_CARET_TEXT = '_';

// DOM keyCodes
const KEY_ENTER = 13;
const KEY_BACKSPACE = 8;
const KEY_DELETE = 46;
const KEY_LEFT = 37;
const KEY_RIGHT = 39;
const KEY_UP = 38;
const KEY_DOWN = 40;
const KEY_PAGE_UP = 33;
const KEY_PAGE_DOWN = 34;
const KEY_HOME = 36;
const KEY_END = 35;
const KEY_TAB = 9;
const KEY_LEFT_CONTROL = 17;

export type CommandHandler = (args: string[]) => void;

export class ConsoleLog {
  lines: string[] = [];

  log(message: string): void {
    this.lines.push(message);
    if (this.lines.length > MAX_CONSOLE_LINES) {
      this.lines.splice(0, this.lines.length - MAX_CONSOLE_LINES);
    }
  }

  clear(): void {
    this.lines.length = 0;
  }

  flush(): void {
    // No-op in WebGL — Python flushes to a log file on disk.
  }
}

export interface ConsoleCvar {
  name: string;
  value: string;
  valueF: number;
}

export class ConsoleState {
  log = new ConsoleLog();
  commands = new Map<string, CommandHandler>();
  cvars = new Map<string, ConsoleCvar>();
  openFlag = false;
  inputEnabled = false;
  inputReady = false;
  inputBuffer = '';
  inputCaret = 0;
  history: string[] = [];
  historyIndex: number | null = null;
  historyPending = '';
  scrollOffset = 0;
  heightPx = DEFAULT_CONSOLE_HEIGHT;
  echoEnabled = true;
  quitRequested = false;
  promptString = '> %s';

  _slideT = 1.0;
  _offsetY = 0.0;
  _blinkTime = 0.0;

  registerCommand(name: string, handler: CommandHandler): void {
    this.commands.set(name, handler);
  }

  registerCvar(name: string, value: string): void {
    this.cvars.set(name, { name, value, valueF: parseFloat(value) || 0.0 });
  }

  setOpen(open: boolean): void {
    this.openFlag = open;
    this.inputEnabled = open;
    this.inputReady = false;
    this.historyIndex = null;
    this._flushInputQueue();
  }

  toggleOpen(): void {
    this.setOpen(!this.openFlag);
  }

  execLine(line: string): void {
    const tokens = line.trim().split(/\s+/);
    if (tokens.length === 0 || !tokens[0]) return;
    if (tokens[0].startsWith('//')) return;

    const name = tokens[0];
    const args = tokens.slice(1);

    const cvar = this.cvars.get(name);
    if (cvar) {
      if (args.length > 0) {
        cvar.value = args.join(' ');
        cvar.valueF = parseFloat(cvar.value) || 0.0;
        this.log.log(`"${cvar.name}" set to "${cvar.value}" (${cvar.valueF.toFixed(6)})`);
      } else {
        this.log.log(`"${cvar.name}" is "${cvar.value}" (${cvar.valueF.toFixed(6)})`);
      }
      return;
    }

    const handler = this.commands.get(name);
    if (handler) {
      handler(args);
      return;
    }

    this.log.log(`Unknown command "${name}"`);
  }

  update(dt: number): void {
    const frameDt = Math.min(dt, 0.1);
    this._blinkTime += frameDt;
    this._updateSlide(frameDt);

    if (!this.openFlag || !this.inputEnabled) return;

    const ctrlDown = InputState.isKeyDown(KEY_LEFT_CONTROL);

    if (InputState.wasKeyPressed(KEY_UP)) {
      if (ctrlDown) {
        this._scrollLines(1);
      } else {
        this._historyPrev();
      }
    }
    if (InputState.wasKeyPressed(KEY_DOWN)) {
      if (ctrlDown) {
        this._scrollLines(-1);
      } else {
        this._historyNext();
      }
    }
    if (InputState.wasKeyPressed(KEY_PAGE_UP)) {
      this._scrollLines(2);
    }
    if (InputState.wasKeyPressed(KEY_PAGE_DOWN)) {
      this._scrollLines(-2);
    }
    if (InputState.wasKeyPressed(KEY_LEFT)) {
      this.inputCaret = Math.max(0, this.inputCaret - 1);
    }
    if (InputState.wasKeyPressed(KEY_RIGHT)) {
      this.inputCaret = Math.min(this.inputBuffer.length, this.inputCaret + 1);
    }
    if (InputState.wasKeyPressed(KEY_HOME)) {
      this._scrollLines(0x14);
    }
    if (InputState.wasKeyPressed(KEY_END)) {
      this.scrollOffset = 0;
    }
    if (InputState.wasKeyPressed(KEY_TAB)) {
      this._autocomplete();
    }
    if (InputState.wasKeyPressed(KEY_BACKSPACE)) {
      if (this.inputCaret > 0) {
        this._exitHistoryEdit();
        this.inputBuffer =
          this.inputBuffer.substring(0, this.inputCaret - 1) +
          this.inputBuffer.substring(this.inputCaret);
        this.inputCaret -= 1;
      }
    }
    if (InputState.wasKeyPressed(KEY_DELETE)) {
      if (this.inputCaret < this.inputBuffer.length) {
        this._exitHistoryEdit();
        this.inputBuffer =
          this.inputBuffer.substring(0, this.inputCaret) +
          this.inputBuffer.substring(this.inputCaret + 1);
      }
    }
    if (InputState.wasKeyPressed(KEY_ENTER)) {
      this._submitInput();
    }
    this._pollTextInput();
  }

  draw(smallFont: SmallFontData | null, monoFont: GrimMonoFont | null): void {
    const height = this.heightPx;
    if (height <= 0) return;
    const ratio = this._openRatio(height);
    if (ratio <= 0) return;

    const screenW = wgl.getScreenWidth();
    const offsetY = this._offsetY;

    // Background
    wgl.drawRectangle(0, offsetY, screenW, height, wgl.makeColor(...CONSOLE_BG_COLOR, ratio));
    const borderY = offsetY + height - CONSOLE_BORDER_HEIGHT;
    wgl.drawRectangle(0, borderY, screenW, CONSOLE_BORDER_HEIGHT, wgl.makeColor(...CONSOLE_BORDER_COLOR, ratio));

    const useMono = this._useMonoFont() && monoFont !== null;

    // Version text (top-right, faint)
    const versionX = screenW - CONSOLE_VERSION_OFFSET_X;
    const versionY = offsetY + height - CONSOLE_VERSION_OFFSET_Y;
    const versionColor = wgl.makeColor(1.0, 1.0, 1.0, ratio * 0.3);
    if (smallFont) {
      drawSmallText(smallFont, CONSOLE_VERSION_TEXT, new Vec2(versionX, versionY), versionColor);
    } else if (monoFont) {
      const advance = monoFont.advance * CONSOLE_MONO_SCALE;
      drawGrimMonoText(monoFont, CONSOLE_VERSION_TEXT, new Vec2(versionX - advance, versionY), CONSOLE_MONO_SCALE, versionColor);
    }

    // Compute visible log block
    const [visible, visibleCount] = this._visibleLogBlock(height);

    // Input prompt line
    const inputY = offsetY + (visibleCount + 1) * CONSOLE_LINE_HEIGHT;
    const textColor = wgl.makeColor(1.0, 1.0, 1.0, ratio);
    if (useMono && monoFont) {
      const advance = monoFont.advance * CONSOLE_MONO_SCALE;
      drawGrimMonoText(monoFont, CONSOLE_PROMPT_MONO, new Vec2(CONSOLE_TEXT_X - advance, inputY), CONSOLE_MONO_SCALE, textColor);
      drawGrimMonoText(monoFont, this.inputBuffer, new Vec2(CONSOLE_INPUT_X_MONO - advance, inputY), CONSOLE_MONO_SCALE, textColor);
    } else if (smallFont) {
      const prompt = `>${this.inputBuffer}`;
      drawSmallText(smallFont, prompt, new Vec2(CONSOLE_TEXT_X, inputY), textColor);
    }

    // Log lines
    const logColor = wgl.makeColor(0.6, 0.6, 0.7, ratio);
    let y = offsetY + CONSOLE_LINE_HEIGHT;
    for (const line of visible) {
      if (useMono && monoFont) {
        const advance = monoFont.advance * CONSOLE_MONO_SCALE;
        drawGrimMonoText(monoFont, line, new Vec2(CONSOLE_TEXT_X - advance, y), CONSOLE_MONO_SCALE, logColor);
      } else if (smallFont) {
        drawSmallText(smallFont, line, new Vec2(CONSOLE_TEXT_X, y), logColor);
      }
      y += CONSOLE_LINE_HEIGHT;
    }

    // Blinking caret
    const caretAlpha = ratio * this._caretBlinkAlpha();
    const caretColor = wgl.makeColor(1.0, 1.0, 1.0, caretAlpha);
    const caretY = inputY + 2.0;
    if (useMono && monoFont) {
      const advance = monoFont.advance * CONSOLE_MONO_SCALE;
      const caretX = CONSOLE_INPUT_X_MONO + this.inputCaret * 8.0;
      drawGrimMonoText(monoFont, CONSOLE_CARET_TEXT, new Vec2(caretX - advance, caretY), CONSOLE_MONO_SCALE, caretColor);
    } else if (smallFont) {
      const caretX = this._smallCaretX(smallFont);
      drawSmallText(smallFont, CONSOLE_CARET_TEXT, new Vec2(caretX, caretY), caretColor);
    }
  }

  flush(): void {
    // No-op in WebGL — Python flushes to a log file on disk.
  }

  drawFpsCounter(): void {
    const cvar = this.cvars.get('cv_showFPS');
    if (cvar === undefined || cvar.valueF === 0.0) return;
    // FPS counter rendering not yet implemented for WebGL
  }

  handleHotkey(): void {
    // Grave/tilde key toggles the console
    if (InputState.wasKeyPressed(192)) {
      this.toggleOpen();
    }
  }

  // --- Private helpers ---

  private _useMonoFont(): boolean {
    const cvar = this.cvars.get('con_monoFont');
    if (!cvar) return false;
    return cvar.valueF !== 0;
  }

  private _caretBlinkAlpha(): number {
    const pulse = Math.sin(this._blinkTime * CONSOLE_BLINK_SPEED);
    const value = Math.max(0.2, Math.abs(pulse) ** 2);
    return clamp(value, 0.0, 1.0);
  }

  private _smallCaretX(font: SmallFontData): number {
    const promptW = measureSmallTextWidth(font, '>');
    const inputW = measureSmallTextWidth(font, this.inputBuffer.substring(0, this.inputCaret));
    return CONSOLE_TEXT_X + promptW + inputW;
  }

  private _maxVisibleLines(height?: number): number {
    const useHeight = height !== undefined ? height : this.heightPx;
    if (useHeight <= 0) return 0;
    return Math.max(Math.floor(useHeight / CONSOLE_LINE_HEIGHT) - 2, 0);
  }

  private _maxScrollOffset(): number {
    const maxLines = this._maxVisibleLines();
    const logCount = this.log.lines.length;
    const visible = Math.min(logCount, maxLines);
    return Math.max(0, logCount - visible);
  }

  private _visibleLogBlock(height: number): [string[], number] {
    const maxLines = this._maxVisibleLines(height);
    const logCount = this.log.lines.length;
    const visibleCount = Math.min(logCount, maxLines);
    if (visibleCount <= 0) return [[], 0];
    const maxOffset = Math.max(0, logCount - visibleCount);
    if (this.scrollOffset > maxOffset) {
      this.scrollOffset = maxOffset;
    }
    const start = Math.max(0, logCount - visibleCount - this.scrollOffset);
    const end = Math.min(logCount, start + visibleCount);
    return [this.log.lines.slice(start, end), visibleCount];
  }

  private _scrollLines(delta: number): void {
    const maxOffset = this._maxScrollOffset();
    if (maxOffset <= 0) {
      this.scrollOffset = 0;
      return;
    }
    this.scrollOffset = Math.max(0, Math.min(maxOffset, this.scrollOffset + delta));
  }

  private _historyPrev(): void {
    if (this.history.length === 0) return;
    if (this.historyIndex === null) {
      this.historyIndex = this.history.length - 1;
      this.historyPending = this.inputBuffer;
    } else if (this.historyIndex > 0) {
      this.historyIndex -= 1;
    }
    this.inputBuffer = this.history[this.historyIndex];
    this.inputCaret = this.inputBuffer.length;
  }

  private _historyNext(): void {
    if (this.historyIndex === null) return;
    if (this.historyIndex < this.history.length - 1) {
      this.historyIndex += 1;
      this.inputBuffer = this.history[this.historyIndex];
    } else {
      this.historyIndex = null;
      this.inputBuffer = this.historyPending;
    }
    this.inputCaret = this.inputBuffer.length;
  }

  private _exitHistoryEdit(): void {
    if (this.historyIndex !== null) {
      this.historyIndex = null;
      this.historyPending = this.inputBuffer;
    }
  }

  private _submitInput(): void {
    this.inputReady = true;
    const line = this.inputBuffer.trim();
    this.inputBuffer = '';
    this.inputCaret = 0;
    this.historyIndex = null;
    if (!line) return;
    if (this.echoEnabled) {
      const prompt = this.promptString;
      if (prompt.includes('%s')) {
        this.log.log(prompt.replace('%s', line));
      } else {
        this.log.log(`${prompt}${line}`);
      }
    }
    if (this.history.length === 0 || this.history[this.history.length - 1] !== line) {
      this.history.push(line);
    }
    this.execLine(line);
    this.inputReady = false;
    this.scrollOffset = 0;
  }

  private _pollTextInput(): void {
    while (true) {
      const value = InputState.getCharPressed();
      if (value === 0) break;
      if (value < 0x20 || value > 0xFF) continue;
      if (this.inputBuffer.length >= MAX_CONSOLE_INPUT) continue;
      const char = String.fromCharCode(value);
      this._exitHistoryEdit();
      this.inputBuffer =
        this.inputBuffer.substring(0, this.inputCaret) +
        char +
        this.inputBuffer.substring(this.inputCaret);
      this.inputCaret += 1;
    }
  }

  private _autocomplete(): void {
    if (!this.inputBuffer) return;
    const tokenStart = this.inputBuffer.length - this.inputBuffer.trimStart().length;
    if (tokenStart >= this.inputBuffer.length) return;
    const spaceIdx = this.inputBuffer.indexOf(' ', tokenStart);
    const tokenEnd = spaceIdx === -1 ? this.inputBuffer.length : spaceIdx;
    if (this.inputCaret > tokenEnd) return;
    const prefix = this.inputBuffer.substring(tokenStart, this.inputCaret);
    if (!prefix) return;
    let match = this._autocompleteName(prefix, this.cvars.keys());
    if (match === null) {
      match = this._autocompleteName(prefix, this.commands.keys());
    }
    if (match === null) return;
    this.inputBuffer = this.inputBuffer.substring(0, tokenStart) + match + this.inputBuffer.substring(tokenEnd);
    this.inputCaret = tokenStart + match.length;
  }

  private _autocompleteName(prefix: string, names: Iterable<string>): string | null {
    // Exact match first pass
    const nameList: string[] = [];
    for (const name of names) {
      nameList.push(name);
      if (name === prefix) return name;
    }
    // Prefix match second pass
    for (const name of nameList) {
      if (name.startsWith(prefix)) return name;
    }
    return null;
  }

  private _flushInputQueue(): void {
    while (InputState.getCharPressed()) { /* drain */ }
    while (InputState.getKeyPressed()) { /* drain */ }
  }

  private _updateSlide(dt: number): void {
    if (this.openFlag) {
      this._slideT = Math.max(0.0, this._slideT - dt * CONSOLE_ANIM_SPEED);
    } else {
      this._slideT = Math.min(1.0, this._slideT + dt * CONSOLE_ANIM_SPEED);
    }
    const height = this.heightPx;
    if (height <= 0) {
      this._offsetY = -height;
      return;
    }
    const eased = Math.sin((1.0 - this._slideT) * Math.PI / 2.0);
    this._offsetY = eased * height - height;
  }

  private _openRatio(height: number): number {
    if (height <= 0) return 0;
    return clamp((height + this._offsetY) / height, 0.0, 1.0);
  }
}

export function registerCoreCommands(console: ConsoleState): void {
  console.registerCommand('cmdlist', (_args: string[]) => {
    for (const name of console.commands.keys()) {
      console.log.log(name);
    }
    console.log.log(`${console.commands.size} commands`);
  });

  console.registerCommand('vars', (_args: string[]) => {
    for (const name of console.cvars.keys()) {
      console.log.log(name);
    }
    console.log.log(`${console.cvars.size} variables`);
  });

  console.registerCommand('set', (args: string[]) => {
    if (args.length < 2) {
      console.log.log('Usage: set <var> <value>');
      return;
    }
    const name = args[0];
    const value = args.slice(1).join(' ');
    console.registerCvar(name, value);
    console.log.log(`'${name}' set to '${value}'`);
  });

  console.registerCommand('echo', (args: string[]) => {
    if (args.length === 0) {
      console.log.log(`echo is ${console.echoEnabled ? 'on' : 'off'}`);
      return;
    }
    const mode = args[0].toLowerCase();
    if (mode === 'on' || mode === 'off') {
      console.echoEnabled = mode === 'on';
      console.log.log(`echo ${mode}`);
      return;
    }
    console.log.log(args.join(' '));
  });

  console.registerCommand('quit', (_args: string[]) => {
    console.quitRequested = true;
  });

  console.registerCommand('clear', (_args: string[]) => {
    console.log.clear();
    console.scrollOffset = 0;
  });

  console.registerCommand('extendconsole', (_args: string[]) => {
    console.heightPx = EXTENDED_CONSOLE_HEIGHT;
  });

  console.registerCommand('minimizeconsole', (_args: string[]) => {
    console.heightPx = DEFAULT_CONSOLE_HEIGHT;
  });
}

export function createConsole(): ConsoleState {
  const console = new ConsoleState();
  console.registerCvar('version', CONSOLE_VERSION_TEXT);
  console.registerCvar('con_monoFont', '1');
  console.registerCvar('cv_showFPS', '0');
  console.registerCvar('cv_silentloads', '1');
  console.registerCvar('cv_bodiesFade', '1');
  console.registerCvar('cv_uiTransparency', '1');
  console._slideT = 1.0;
  console._offsetY = -console.heightPx;
  registerCoreCommands(console);
  return console;
}
