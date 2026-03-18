// Port of crimson/typo/typing.py

const TYPING_MAX_CHARS = 17;

export class TypingBuffer {
  text = '';
  submitCount = 0;
  matchCount = 0;

  clear(): void {
    this.text = '';
  }

  backspace(): void {
    if (this.text) {
      this.text = this.text.slice(0, -1);
    }
  }

  pushChar(ch: string): void {
    if (!ch) return;
    if (this.text.length >= TYPING_MAX_CHARS) return;
    this.text += ch[0];
  }

  submit(matched: boolean): string | null {
    if (!this.text) return null;

    const entered = this.text;
    this.submitCount += 1;
    if (matched) {
      this.matchCount += 1;
    }
    this.clear();
    return entered;
  }
}
