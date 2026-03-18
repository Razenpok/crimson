// Port of crimson/screens/assets.py

import type { RuntimeResources } from '../engine/assets.ts';
import type { GameState } from '../game/types.ts';

export function requireRuntimeResources(state: GameState): RuntimeResources {
  if (state.resources === null) {
    throw new Error('runtime resources are not loaded');
  }
  return state.resources;
}
