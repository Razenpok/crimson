// Port of crimson/projectiles/runtime/__init__.py
// Barrel re-export for the runtime sub-package.

export { withinNativeFindRadius } from './collision.ts';
export {
  type PrimaryProjectileRule,
  primaryRuleForTypeId,
} from './primary-rules.ts';
export {
  CreatureDamageType,
  type PrimaryStepCtx,
  ProjectilePool,
  type ProjectileUpdateOptions,
  projectileCollisionProfile,
} from './projectile-pool.ts';
export {
  SecondaryProjectilePool,
  type SecondarySpawnSpec,
  type SecondaryStepCtx,
} from './secondary-pool.ts';
export {
  SECONDARY_RULE_BY_TYPE_ID,
  secondaryRuleForTypeId,
} from './secondary-rules.ts';
