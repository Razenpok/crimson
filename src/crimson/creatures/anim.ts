// Port of crimson/creatures/anim.py

import { CreatureAiMode, CreatureFlags } from './spawn-ids';

const _FLAG_ANIM_PING_PONG = CreatureFlags.ANIM_PING_PONG as number;
const _FLAG_ANIM_LONG_STRIP = CreatureFlags.ANIM_LONG_STRIP as number;
const _FLAG_RANGED_ATTACK_SHOCK = CreatureFlags.RANGED_ATTACK_SHOCK as number;

const _f32Buffer = new Float32Array(1);

function _f32(value: number): number {
    _f32Buffer[0] = value;
    return _f32Buffer[0];
}

function _u32(value: number): number {
    return value & 0xFFFFFFFF;
}

function _i32(value: number): number {
    value &= 0xFFFFFFFF;
    if (value & 0x80000000) {
        return value - 0x100000000;
    }
    return value;
}

const _CREATURE_CORPSE_FRAMES: Record<number, number> = {
    0: 0,  // zombie
    1: 3,  // lizard
    2: 4,  // alien
    3: 1,  // spider sp1
    4: 2,  // spider sp2
    5: 7,  // trooper
    7: 6,  // ping-pong strip corpse fallback
};


export function creatureCorpseFrameForType(typeId: number): number {
    const frame = _CREATURE_CORPSE_FRAMES[typeId];
    if (frame !== undefined) {
        return frame;
    }
    return typeId & 0xF;
}


export function creatureAnimIsLongStrip(flags: CreatureFlags): boolean {
    // From creature_update_all / creature_render_type:
    // long strip when (flags & 4) == 0 OR (flags & 0x40) != 0
    const flagsBits = flags as number;
    return (flagsBits & _FLAG_ANIM_PING_PONG) === 0 || (flagsBits & _FLAG_ANIM_LONG_STRIP) !== 0;
}


export function creatureAnimPhaseStep(opts: {
    animRate: number;
    moveSpeed: number;
    dt: number;
    size: number;
    localScale?: number;
    flags?: CreatureFlags;
    aiMode?: number;
    quantizeF32?: boolean;
}): number {
    let { animRate, moveSpeed, dt, size } = opts;
    let localScale = opts.localScale ?? 1.0;
    const flags = opts.flags ?? (0 as CreatureFlags);
    const aiMode = opts.aiMode ?? CreatureAiMode.ORBIT_PLAYER;
    const quantizeF32 = opts.quantizeF32 ?? true;

    if (size === 0.0) {
        return 0.0;
    }

    if (quantizeF32) {
        animRate = _f32(animRate);
        moveSpeed = _f32(moveSpeed);
        dt = _f32(dt);
        size = _f32(size);
        localScale = _f32(localScale);
    }

    const speedScale = (quantizeF32 ? _f32(30.0) : 30.0) / size;
    const flagsBits = flags as number;
    const isLongStrip = (flagsBits & _FLAG_ANIM_PING_PONG) === 0 || (flagsBits & _FLAG_ANIM_LONG_STRIP) !== 0;
    let stripMul: number;
    if (!isLongStrip) {
        stripMul = quantizeF32 ? _f32(22.0) : 22.0;
    } else if (aiMode === CreatureAiMode.HOLD_TIMER) {
        // Long-strip creatures stop advancing animation phase in ai_mode == 7.
        return 0.0;
    } else {
        stripMul = quantizeF32 ? _f32(25.0) : 25.0;
    }

    const step = animRate * moveSpeed * dt * speedScale * localScale * stripMul;
    return quantizeF32 ? _f32(step) : step;
}


export function creatureAnimAdvancePhase(
    phase: number,
    opts: {
        animRate: number;
        moveSpeed: number;
        dt: number;
        size: number;
        localScale?: number;
        flags?: CreatureFlags;
        aiMode?: number;
        quantizeF32?: boolean;
    },
): [number, number] {
    const quantizeF32 = opts.quantizeF32 ?? true;

    if (quantizeF32) {
        phase = _f32(phase);
    }

    const step = creatureAnimPhaseStep(opts);
    if (step === 0.0) {
        return [phase, 0.0];
    }

    phase = phase + step;
    if (quantizeF32) {
        phase = _f32(phase);
    }

    const flags = opts.flags ?? (0 as CreatureFlags);
    const flagsBits = flags as number;
    const isLongStrip = (flagsBits & _FLAG_ANIM_PING_PONG) === 0 || (flagsBits & _FLAG_ANIM_LONG_STRIP) !== 0;
    if (isLongStrip) {
        const limit = quantizeF32 ? _f32(31.0) : 31.0;
        while (phase > limit) {
            phase = phase - limit;
            if (quantizeF32) {
                phase = _f32(phase);
            }
        }
    } else {
        const limit = quantizeF32 ? _f32(15.0) : 15.0;
        if (phase > limit) {
            while (phase > limit) {
                phase = phase - limit;
                if (quantizeF32) {
                    phase = _f32(phase);
                }
            }
        }
    }

    return [phase, step];
}


export function creatureAnimSelectFrame(
    phase: number,
    opts: {
        baseFrame: number;
        mirrorLong: boolean;
        flags?: CreatureFlags;
    },
): [number, boolean, string] {
    const flags = opts.flags ?? (0 as CreatureFlags);
    const flagsBits = flags as number;
    const isLongStrip = (flagsBits & _FLAG_ANIM_PING_PONG) === 0 || (flagsBits & _FLAG_ANIM_LONG_STRIP) !== 0;
    if (isLongStrip) {
        let frame: number;
        let mirrored: boolean;
        if (phase < 0.0) {
            // Negative anim_phase is used as a special render state in the game; keep the
            // same fallback frame selection.
            frame = opts.baseFrame + 0x0F;
            mirrored = false;
        } else {
            // Matches __ftol(phase + 0.5f) used by the original binary.
            frame = Math.trunc(phase + 0.5);
            mirrored = false;
            if (opts.mirrorLong && frame > 0x0F) {
                frame = 0x1F - frame;
                mirrored = true;
            }
        }
        if ((flagsBits & _FLAG_RANGED_ATTACK_SHOCK) !== 0) {
            frame += 0x20;
        }
        return [frame, mirrored, 'long'];
    }

    // Ping-pong strip:
    //   idx = (__ftol(phase + 0.5f) & 0x8000000f); then normalize negatives; then mirror >7.
    const raw = Math.trunc(phase + 0.5);
    let idx = _i32(_u32(raw) & 0x8000000F);
    if (idx < 0) {
        idx = _i32(_u32(((idx - 1) | 0xFFFFFFF0) + 1));
    }
    if (idx > 7) {
        idx = 0x0F - idx;
    }
    const frame = opts.baseFrame + 0x10 + idx;
    return [frame, false, 'ping-pong'];
}
