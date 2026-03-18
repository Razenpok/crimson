// Port of crimson/render/sink.py

import { type RenderSink, WindowSink } from '../../grim/render-pipeline.ts';

export { type RenderSink, WindowSink };

/** Headless sink used for determinism-only verification paths. */
export class NullSink implements RenderSink {
  open(): void {}
  present(): void {}
  flush(): void {}
  close(): void {}
}
