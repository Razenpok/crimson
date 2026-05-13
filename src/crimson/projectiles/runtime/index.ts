// Port of crimson/projectiles/runtime/__init__.py

export { withinNativeFindRadius } from './collision.ts';
export {
  PRIMARY_PROJECTILE_RULE_BY_TYPE_ID,
  type PrimaryProjectileRule,
  primaryRuleForTypeId,
} from './primary-rules.ts';
export {
  PrimaryStepCtx,
  ProjectilePool,
  ProjectileUpdateOptions,
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
