// Port of grim/view.py

export interface ViewContext {
  readonly assetsUrl: string;
  readonly preserveBugs: boolean;
}

export function createViewContext(assetsUrl: string = 'assets', preserveBugs: boolean = false): ViewContext {
  return { assetsUrl, preserveBugs };
}

export interface View {
  open(): void;
  update(dt: number): void;
  draw(): void;
  close(): void;
}
