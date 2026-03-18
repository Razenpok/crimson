// Port of grim/view.py

export class ViewContext {
  constructor(
    public readonly assetsUrl: string = 'assets',
    public readonly preserveBugs: boolean = false
  ) {
  }
}

export interface View {
  open(): void;
  update(dt: number): void;
  draw(): void;
  close(): void;
}
