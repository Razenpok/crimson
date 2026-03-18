import { PlayerInput } from './input.ts';

export class InputFrame {
  readonly players: readonly PlayerInput[];

  constructor(players: readonly PlayerInput[]) {
    this.players = players;
  }

  asList(): PlayerInput[] {
    return [...this.players];
  }
}

export function normalizeInputFrame(
  inputs: readonly PlayerInput[] | null,
  playerCount: number,
): InputFrame {
  const count = Math.max(0, Math.trunc(playerCount));
  const frame: PlayerInput[] = [];
  for (let i = 0; i < count; i++) {
    frame.push(new PlayerInput());
  }
  if (inputs !== null) {
    const limit = Math.min(inputs.length, count);
    for (let idx = 0; idx < limit; idx++) {
      const inp = inputs[idx];
      frame[idx] = new PlayerInput({
        move: inp.move,
        aim: inp.aim,
        moveMode: inp.moveMode,
        aimScheme: inp.aimScheme,
        fireDown: inp.fireDown,
        firePressed: inp.firePressed,
        reloadPressed: inp.reloadPressed,
        reloadDown: inp.reloadDown,
        moveToCursorPressed: inp.moveToCursorPressed,
        moveForwardPressed: inp.moveForwardPressed,
        moveBackwardPressed: inp.moveBackwardPressed,
        turnLeftPressed: inp.turnLeftPressed,
        turnRightPressed: inp.turnRightPressed,
      });
    }
  }
  return new InputFrame(frame);
}
