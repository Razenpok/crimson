// Port of crimson/collision_math.py

const _NATIVE_FIND_SIZE_MARGIN_SCALE = 0.14285715;
const _NATIVE_FIND_SIZE_MARGIN_BIAS = 3.0;

export function nativeFindSizeMargin(targetSize: number): number {
  return targetSize * _NATIVE_FIND_SIZE_MARGIN_SCALE + _NATIVE_FIND_SIZE_MARGIN_BIAS;
}
