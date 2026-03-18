// Port of crimson/owner_ref.py

export const LOCAL_PLAYER_OWNER_ID = -100;

export enum OwnerKind {
  NONE = 0,
  PLAYER = 1,
  CREATURE = 2,
}

export class OwnerRef {
  readonly kind: OwnerKind;
  readonly index: number;
  readonly localHost: boolean;

  constructor(kind: OwnerKind, index: number = 0, localHost: boolean = false) {
    this.kind = kind;
    this.index = index;
    this.localHost = localHost;
  }

  static none(): OwnerRef {
    return new OwnerRef(OwnerKind.NONE);
  }

  static fromLocalPlayer(index: number): OwnerRef {
    return new OwnerRef(OwnerKind.PLAYER, index, true);
  }

  static fromPlayer(index: number): OwnerRef {
    return new OwnerRef(OwnerKind.PLAYER, index, false);
  }

  static fromCreature(index: number): OwnerRef {
    return new OwnerRef(OwnerKind.CREATURE, index, false);
  }

  static fromLegacy(ownerId: number): OwnerRef {
    const legacy = ownerId | 0;
    if (legacy === LOCAL_PLAYER_OWNER_ID) return OwnerRef.fromLocalPlayer(0);
    if (legacy < 0) {
      const idx = -1 - legacy;
      if (idx >= 0) return OwnerRef.fromPlayer(idx);
      return OwnerRef.none();
    }
    return OwnerRef.fromCreature(legacy);
  }

  toLegacy(): number {
    if (this.kind === OwnerKind.NONE) return 0;
    if (this.kind === OwnerKind.CREATURE) return this.index;
    if (this.localHost && this.index === 0) return LOCAL_PLAYER_OWNER_ID;
    return -1 - this.index;
  }

  isPlayer(): boolean {
    return this.kind === OwnerKind.PLAYER;
  }

  playerIndex(): number | null {
    if (this.kind !== OwnerKind.PLAYER) return null;
    return this.index;
  }

  playerIndexInBounds(playerCount: number): number | null {
    const idx = this.playerIndex();
    if (idx === null) return null;
    if (idx >= 0 && idx < playerCount) return idx;
    return null;
  }

  creatureIndex(): number | null {
    if (this.kind !== OwnerKind.CREATURE) return null;
    return this.index;
  }

  creatureIndexInBounds(creatureCount: number): number | null {
    const idx = this.creatureIndex();
    if (idx === null) return null;
    if (idx >= 0 && idx < creatureCount) return idx;
    return null;
  }
}
