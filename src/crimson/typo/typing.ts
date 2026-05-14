// Port of crimson/typo/typing.py

export const TYPING_MAX_CHARS = 17;

export class TypingBuffer {
  text: string;
  submitCount: number;
  matchCount: number;

  constructor(opts: {
    text?: string;
    submitCount?: number;
    matchCount?: number;
  } = {}) {
    this.text = opts.text ?? '';
    this.submitCount = opts.submitCount ?? 0;
    this.matchCount = opts.matchCount ?? 0;
  }

  clear(): void {
    this.text = '';
  }

  backspace(): void {
    if (this.text) {
      this.text = Array.from(this.text).slice(0, -1).join('');
    }
  }

  pushChar(ch: string): void {
    if (!ch) return;
    if (Array.from(this.text).length >= TYPING_MAX_CHARS) return;
    this.text += Array.from(ch)[0];
  }

  submit(opts: { matched: boolean }): string | null {
    if (!this.text) return null;

    const entered = this.text;
    this.submitCount += 1;
    if (opts.matched) {
      this.matchCount += 1;
    }
    this.clear();
    return entered;
  }
}
