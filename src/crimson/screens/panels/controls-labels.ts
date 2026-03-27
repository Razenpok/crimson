// Port of crimson/screens/panels/controls_labels.py

import { AimScheme, MovementControlType, type CrimsonControlsConfig } from '@grim/config.ts';

// ---------------------------------------------------------------------------
// RebindTarget — identifies which config field a rebind row controls
// ---------------------------------------------------------------------------

export enum RebindTarget {
  PLAYER_MOVE_CODES = 1,
  PLAYER_FIRE_CODE = 2,
  PLAYER_KEYBOARD_AIM_CODES = 3,
  PLAYER_AIM_AXIS_CODES = 4,
  PLAYER_MOVE_AXIS_CODES = 5,
  GLOBAL_PICK_PERK_CODE = 6,
  GLOBAL_RELOAD_CODE = 7,
}

// ---------------------------------------------------------------------------
// RebindRowSpec — one row in the controls rebind list
// ---------------------------------------------------------------------------

export interface RebindRowSpec {
  readonly label: string;
  readonly target: RebindTarget;
  readonly targetIndex: number | null;
  readonly axis: boolean;
}

export function rebindRow(
  label: string,
  target: RebindTarget,
  targetIndex: number | null = null,
  axis: boolean = false,
): RebindRowSpec {
  return { label, target, targetIndex, axis };
}

// ---------------------------------------------------------------------------
// Label helpers — port of input_configure_for_label (0x00447c90)
// ---------------------------------------------------------------------------

export function inputConfigureForLabel(configId: AimScheme): string {
  switch (configId) {
    case AimScheme.MOUSE: return 'Mouse';
    case AimScheme.KEYBOARD: return 'Keyboard';
    case AimScheme.JOYSTICK: return 'Joystick';
    case AimScheme.MOUSE_RELATIVE: return 'Mouse relative';
    case AimScheme.DUAL_ACTION_PAD: return 'Dual Action Pad';
    case AimScheme.COMPUTER: return 'Computer';
    default: return 'Unknown';
  }
}

// Port of input_scheme_label (0x00447cf0)
export function inputSchemeLabel(scheme: MovementControlType): string {
  switch (scheme) {
    case MovementControlType.UNKNOWN: return 'Unknown';
    case MovementControlType.RELATIVE: return 'Relative';
    case MovementControlType.STATIC: return 'Static';
    case MovementControlType.DUAL_ACTION_PAD: return 'Dual Action Pad';
    case MovementControlType.MOUSE_POINT_CLICK: return 'Mouse point click';
    case MovementControlType.COMPUTER: return 'Computer';
    default: return 'Unknown';
  }
}

export function controlsMethodLabels(
  controls: CrimsonControlsConfig,
  opts: { playerIndex: number },
): [string, string] {
  const player = controls.players[opts.playerIndex];
  return [inputConfigureForLabel(player.aimScheme), inputSchemeLabel(player.movement)];
}

// ---------------------------------------------------------------------------
// Dropdown IDs
// ---------------------------------------------------------------------------

export function controlsAimMethodDropdownIds(currentAimScheme: AimScheme): AimScheme[] {
  const ids: AimScheme[] = [
    AimScheme.MOUSE,
    AimScheme.KEYBOARD,
    AimScheme.JOYSTICK,
    AimScheme.MOUSE_RELATIVE,
    AimScheme.DUAL_ACTION_PAD,
  ];
  if (currentAimScheme === AimScheme.COMPUTER) {
    // Original menu keeps "Computer" hidden unless loaded from config.
    ids.push(AimScheme.COMPUTER);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Rebind plan — returns (aim_rows, move_rows, misc_rows)
// ---------------------------------------------------------------------------

export function controlsRebindPlan(
  opts: { aimScheme: AimScheme; moveMode: MovementControlType; playerIndex: number },
): [RebindRowSpec[], RebindRowSpec[], RebindRowSpec[]] {
  const aimRows: RebindRowSpec[] = [];
  const moveRows: RebindRowSpec[] = [];
  const miscRows: RebindRowSpec[] = [];

  if (opts.aimScheme === AimScheme.KEYBOARD) {
    aimRows.push(rebindRow('Torso left:', RebindTarget.PLAYER_KEYBOARD_AIM_CODES, 0));
    aimRows.push(rebindRow('Torso right:', RebindTarget.PLAYER_KEYBOARD_AIM_CODES, 1));
  } else if (opts.aimScheme === AimScheme.DUAL_ACTION_PAD) {
    aimRows.push(rebindRow('Aim Up/Down Axis:', RebindTarget.PLAYER_AIM_AXIS_CODES, 0, true));
    aimRows.push(rebindRow('Aim Left/Right Axis:', RebindTarget.PLAYER_AIM_AXIS_CODES, 1, true));
  }
  aimRows.push(rebindRow('Fire:', RebindTarget.PLAYER_FIRE_CODE));

  if (opts.moveMode === MovementControlType.STATIC) {
    moveRows.push(
      rebindRow('Move Up:', RebindTarget.PLAYER_MOVE_CODES, 0),
      rebindRow('Move Down:', RebindTarget.PLAYER_MOVE_CODES, 1),
      rebindRow('Move Left:', RebindTarget.PLAYER_MOVE_CODES, 2),
      rebindRow('Move Right:', RebindTarget.PLAYER_MOVE_CODES, 3),
    );
  } else if (opts.moveMode === MovementControlType.RELATIVE) {
    moveRows.push(
      rebindRow('Forward:', RebindTarget.PLAYER_MOVE_CODES, 0),
      rebindRow('Backwards:', RebindTarget.PLAYER_MOVE_CODES, 1),
      rebindRow('Turn left:', RebindTarget.PLAYER_MOVE_CODES, 2),
      rebindRow('Turn right:', RebindTarget.PLAYER_MOVE_CODES, 3),
    );
  } else if (opts.moveMode === MovementControlType.DUAL_ACTION_PAD) {
    moveRows.push(
      rebindRow('Up/Down Axis:', RebindTarget.PLAYER_MOVE_AXIS_CODES, 0, true),
      rebindRow('Left/Right Axis:', RebindTarget.PLAYER_MOVE_AXIS_CODES, 1, true),
    );
  } else if (opts.moveMode === MovementControlType.MOUSE_POINT_CLICK) {
    moveRows.push(rebindRow('Move to cursor:', RebindTarget.GLOBAL_RELOAD_CODE));
  }

  if (opts.playerIndex === 0) {
    miscRows.push(rebindRow('Level Up:', RebindTarget.GLOBAL_PICK_PERK_CODE));
    if (opts.moveMode !== MovementControlType.MOUSE_POINT_CLICK) {
      miscRows.push(rebindRow('Reload:', RebindTarget.GLOBAL_RELOAD_CODE));
    }
  }

  return [aimRows, moveRows, miscRows];
}
