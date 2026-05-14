// Port of grim/view.py

export class ViewContext {
  readonly assetsUrl: string;
  readonly preserveBugs: boolean;

  constructor(opts: { assetsUrl?: string; preserveBugs?: boolean } = {}) {
    this.assetsUrl = opts.assetsUrl ?? 'artifacts/assets';
    this.preserveBugs = opts.preserveBugs ?? false;
  }
}

export interface View {
  open(): void;
  update(dt: number): void;
  draw(): void;
  close(): void;
}
