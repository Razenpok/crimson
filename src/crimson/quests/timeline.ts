import { Vec2 } from '../../grim/geom.ts';
import type { SpawnTemplateCall } from '../creatures/spawn.ts';
import { f32 } from '../math-parity.ts';
import type { SpawnEntry } from './types.ts';

export function tickQuestSpawnTimeline(
  entries: readonly SpawnEntry[],
  questSpawnTimelineMs: number,
  frameDtMs: number,
  opts: {
    terrainWidth: number;
    creaturesNoneActive: boolean;
    noCreaturesTimerMs: number;
  },
): {
  entries: readonly SpawnEntry[];
  creaturesNoneActive: boolean;
  noCreaturesTimerMs: number;
  spawnCalls: readonly SpawnTemplateCall[];
} {
  const timelineMs = f32(questSpawnTimelineMs);
  const dtMs = f32(frameDtMs);

  let { creaturesNoneActive, noCreaturesTimerMs } = opts;

  if (!creaturesNoneActive) {
    noCreaturesTimerMs = 0.0;
  } else {
    noCreaturesTimerMs = f32(noCreaturesTimerMs + dtMs);
  }

  const forceSpawn = creaturesNoneActive && 3000.0 < noCreaturesTimerMs && 0x6A4 < timelineMs;

  let startIdx: number | null = null;
  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx];
    if (entry.count <= 0) continue;
    if (f32(entry.triggerMs) < timelineMs || forceSpawn) {
      startIdx = idx;
      break;
    }
  }

  if (startIdx === null) {
    return { entries, creaturesNoneActive, noCreaturesTimerMs, spawnCalls: [] };
  }

  const spawns: SpawnTemplateCall[] = [];
  const updatedEntries = entries.slice();

  const triggerMs = entries[startIdx].triggerMs;
  for (let idx = startIdx; idx < entries.length; idx++) {
    const entry = entries[idx];
    if (entry.triggerMs !== triggerMs) break;

    const basePos = entry.pos;
    const offscreenX = basePos.x < 0.0 || f32(opts.terrainWidth) < basePos.x;

    for (let spawnIdx = 0; spawnIdx < entry.count; spawnIdx++) {
      const magnitude = f32(spawnIdx * 0x28);
      const offset = (spawnIdx & 1) === 0 ? magnitude : -magnitude;
      let pos: Vec2;
      if (offscreenX) {
        pos = basePos.offset(0.0, offset);
      } else {
        pos = basePos.offset(offset, 0.0);
      }
      spawns.push({ templateId: entry.spawnId, pos, heading: f32(entry.heading) });
    }

    if (entry.count !== 0) {
      updatedEntries[idx] = { ...entry, count: 0 };
    }
  }

  creaturesNoneActive = false;

  return {
    entries: updatedEntries,
    creaturesNoneActive,
    noCreaturesTimerMs,
    spawnCalls: spawns,
  };
}

export function questSpawnTableEmpty(entries: readonly SpawnEntry[]): boolean {
  return entries.every(entry => entry.count <= 0);
}

export function tickQuestModeSpawns(
  entries: readonly SpawnEntry[],
  questSpawnTimelineMs: number,
  frameDtMs: number,
  opts: {
    terrainWidth: number;
    creaturesNoneActive: boolean;
    noCreaturesTimerMs: number;
  },
): {
  entries: readonly SpawnEntry[];
  questSpawnTimelineMs: number;
  creaturesNoneActive: boolean;
  noCreaturesTimerMs: number;
  spawnCalls: readonly SpawnTemplateCall[];
} {
  let timelineMs = f32(questSpawnTimelineMs);
  const dtMs = f32(frameDtMs);

  if (!opts.creaturesNoneActive || !questSpawnTableEmpty(entries)) {
    timelineMs = f32(timelineMs + dtMs);
  }

  const result = tickQuestSpawnTimeline(entries, timelineMs, dtMs, {
    terrainWidth: opts.terrainWidth,
    creaturesNoneActive: opts.creaturesNoneActive,
    noCreaturesTimerMs: opts.noCreaturesTimerMs,
  });

  return {
    entries: result.entries,
    questSpawnTimelineMs: timelineMs,
    creaturesNoneActive: result.creaturesNoneActive,
    noCreaturesTimerMs: result.noCreaturesTimerMs,
    spawnCalls: result.spawnCalls,
  };
}
