export type Brand<K, T extends string> = K & { readonly __brand: T };
// Kludge for in-progress porting.
export type Unbrand<T> =
  T extends [infer A, infer B, infer C, infer D] & { readonly __brand: string } ? [A, B, C, D] :
    T extends [infer A, infer B] & { readonly __brand: string } ? [A, B] :
      T;

export type Color = Brand<[number, number, number, number], 'Color'>;
export function makeColor(r: number, g: number, b: number, a: number): Color { return [r, g, b, a] as Color; }

export type Rectangle = Brand<[number, number, number, number], 'Rectangle'>;
export function makeRectangle(x: number, y: number, w: number, h: number): Rectangle { return [x, y, w, h] as Rectangle; }

export type Vector2 = Brand<[number, number], 'Vector2'>;
export function makeVector2(x: number, y: number): Vector2 { return [x, y] as Vector2; }
