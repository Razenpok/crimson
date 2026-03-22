// Port of grim/assets.py

import { type GlTexture, type WebGLContext } from './webgl.ts';
import { paqToMap } from './paq.ts';
import { decodeJazToImageBitmap } from './jaz.ts';
import { SmallFontData } from "@grim/fonts/small.js";

export const PAQ_NAME = 'crimson.paq';

const FALLBACK_ASSETS_URL = 'https://refactoring.ninja/crimson-paq/v1.9.93';

let _resolvedAssetsUrl: string | null = null;

// Probe the relative asset path for local testing; if crimson.paq isn't reachable there,
// fall back to the CDN-hosted assets. Caches the result for subsequent calls.
export async function resolveAssetsUrl(primaryUrl: string): Promise<string> {
  if (_resolvedAssetsUrl !== null) return _resolvedAssetsUrl;
  try {
    const resp = await fetch(`${primaryUrl}/${PAQ_NAME}`, { method: 'HEAD' });
    const ct = resp.headers.get('content-type') ?? '';
    if (resp.ok && !ct.startsWith('text/html')) {
      _resolvedAssetsUrl = primaryUrl;
      return _resolvedAssetsUrl;
    }
  } catch {
    // primary unreachable
  }
  console.log(`Assets not found at ${primaryUrl}, falling back to ${FALLBACK_ASSETS_URL}`);
  _resolvedAssetsUrl = FALLBACK_ASSETS_URL;
  return _resolvedAssetsUrl;
}

export enum TextureId {
  BACKPLASMA = 'BACKPLASMA',
  MOCKUP = 'MOCKUP',
  LOGO_ESRB = 'LOGO_ESRB',
  LOADING = 'LOADING',
  CL_LOGO = 'CL_LOGO',
  SPLASH_10TONS = 'SPLASH_10TONS',
  SPLASH_REFLEXIVE = 'SPLASH_REFLEXIVE',
  DEFAULT_FONT_COURIER = 'DEFAULT_FONT_COURIER',
  SMALL_WHITE = 'SMALL_WHITE',
  TROOPER = 'TROOPER',
  ZOMBIE = 'ZOMBIE',
  SPIDER_SP1 = 'SPIDER_SP1',
  SPIDER_SP2 = 'SPIDER_SP2',
  ALIEN = 'ALIEN',
  LIZARD = 'LIZARD',
  ARROW = 'ARROW',
  BULLET_I = 'BULLET_I',
  BULLET_TRAIL = 'BULLET_TRAIL',
  BODYSET = 'BODYSET',
  PROJS = 'PROJS',
  UI_ICON_AIM = 'UI_ICON_AIM',
  UI_BUTTON_SM = 'UI_BUTTON_SM',
  UI_BUTTON_MD = 'UI_BUTTON_MD',
  UI_CHECK_ON = 'UI_CHECK_ON',
  UI_CHECK_OFF = 'UI_CHECK_OFF',
  UI_RECT_OFF = 'UI_RECT_OFF',
  UI_RECT_ON = 'UI_RECT_ON',
  BONUSES = 'BONUSES',
  UI_IND_BULLET = 'UI_IND_BULLET',
  UI_IND_ROCKET = 'UI_IND_ROCKET',
  UI_IND_ELECTRIC = 'UI_IND_ELECTRIC',
  UI_IND_FIRE = 'UI_IND_FIRE',
  PARTICLES = 'PARTICLES',
  UI_IND_LIFE = 'UI_IND_LIFE',
  UI_IND_PANEL = 'UI_IND_PANEL',
  UI_ARROW = 'UI_ARROW',
  UI_CURSOR = 'UI_CURSOR',
  UI_AIM = 'UI_AIM',
  TER_Q1_BASE = 'TER_Q1_BASE',
  TER_Q1_OVERLAY = 'TER_Q1_OVERLAY',
  TER_Q2_BASE = 'TER_Q2_BASE',
  TER_Q2_OVERLAY = 'TER_Q2_OVERLAY',
  TER_Q3_BASE = 'TER_Q3_BASE',
  TER_Q3_OVERLAY = 'TER_Q3_OVERLAY',
  TER_Q4_BASE = 'TER_Q4_BASE',
  TER_Q4_OVERLAY = 'TER_Q4_OVERLAY',
  UI_TEXT_LEVEL_COMPLETE = 'UI_TEXT_LEVEL_COMPLETE',
  UI_TEXT_QUEST = 'UI_TEXT_QUEST',
  UI_NUM1 = 'UI_NUM1',
  UI_NUM2 = 'UI_NUM2',
  UI_NUM3 = 'UI_NUM3',
  UI_NUM4 = 'UI_NUM4',
  UI_NUM5 = 'UI_NUM5',
  UI_WICONS = 'UI_WICONS',
  UI_GAME_TOP = 'UI_GAME_TOP',
  UI_LIFE_HEART = 'UI_LIFE_HEART',
  UI_CLOCK_TABLE = 'UI_CLOCK_TABLE',
  UI_CLOCK_POINTER = 'UI_CLOCK_POINTER',
  MUZZLE_FLASH = 'MUZZLE_FLASH',
  UI_DROP_ON = 'UI_DROP_ON',
  UI_DROP_OFF = 'UI_DROP_OFF',
  UI_SIGN_CRIMSON = 'UI_SIGN_CRIMSON',
  UI_MENU_ITEM = 'UI_MENU_ITEM',
  UI_MENU_PANEL = 'UI_MENU_PANEL',
  UI_ITEM_TEXTS = 'UI_ITEM_TEXTS',
  UI_TEXT_REAPER = 'UI_TEXT_REAPER',
  UI_TEXT_WELL_DONE = 'UI_TEXT_WELL_DONE',
  UI_TEXT_CONTROLS = 'UI_TEXT_CONTROLS',
  UI_TEXT_PICK_A_PERK = 'UI_TEXT_PICK_A_PERK',
  UI_TEXT_LEVEL_UP = 'UI_TEXT_LEVEL_UP',
}

export interface TextureSpec {
  readonly relPath: string;
  readonly clamp: boolean;
  readonly pointFilter: boolean;
}

function spec(relPath: string, clamp = false, pointFilter = false): TextureSpec {
  return { relPath, clamp, pointFilter };
}

export const TEXTURE_SPECS: ReadonlyMap<TextureId, TextureSpec> = new Map([
  [TextureId.BACKPLASMA, spec('load/backplasma.jaz')],
  [TextureId.MOCKUP, spec('load/mockup.jaz')],
  [TextureId.LOGO_ESRB, spec('load/esrb_mature.jaz')],
  [TextureId.LOADING, spec('load/loading.jaz')],
  [TextureId.CL_LOGO, spec('load/logo_crimsonland.tga')],
  [TextureId.SPLASH_10TONS, spec('load/splash10tons.jaz')],
  [TextureId.SPLASH_REFLEXIVE, spec('load/splashReflexive.jpg')],
  [TextureId.DEFAULT_FONT_COURIER, spec('load/default_font_courier.tga')],
  [TextureId.SMALL_WHITE, spec('load/smallWhite.tga', false, true)],
  [TextureId.TROOPER, spec('game/trooper.jaz')],
  [TextureId.ZOMBIE, spec('game/zombie.jaz')],
  [TextureId.SPIDER_SP1, spec('game/spider_sp1.jaz')],
  [TextureId.SPIDER_SP2, spec('game/spider_sp2.jaz')],
  [TextureId.ALIEN, spec('game/alien.jaz')],
  [TextureId.LIZARD, spec('game/lizard.jaz')],
  [TextureId.ARROW, spec('load/arrow.tga')],
  [TextureId.BULLET_I, spec('load/bullet16.tga')],
  [TextureId.BULLET_TRAIL, spec('load/bulletTrail.tga')],
  [TextureId.BODYSET, spec('game/bodyset.jaz')],
  [TextureId.PROJS, spec('game/projs.jaz')],
  [TextureId.UI_ICON_AIM, spec('ui/ui_iconAim.jaz', true)],
  [TextureId.UI_BUTTON_SM, spec('ui/ui_button_64x32.jaz', true)],
  [TextureId.UI_BUTTON_MD, spec('ui/ui_button_128x32.jaz', true)],
  [TextureId.UI_CHECK_ON, spec('ui/ui_checkOn.jaz', true)],
  [TextureId.UI_CHECK_OFF, spec('ui/ui_checkOff.jaz', true)],
  [TextureId.UI_RECT_OFF, spec('ui/ui_rectOff.jaz', true)],
  [TextureId.UI_RECT_ON, spec('ui/ui_rectOn.jaz', true)],
  [TextureId.BONUSES, spec('game/bonuses.jaz')],
  [TextureId.UI_IND_BULLET, spec('ui/ui_indBullet.jaz', true)],
  [TextureId.UI_IND_ROCKET, spec('ui/ui_indRocket.jaz', true)],
  [TextureId.UI_IND_ELECTRIC, spec('ui/ui_indElectric.jaz', true)],
  [TextureId.UI_IND_FIRE, spec('ui/ui_indFire.jaz', true)],
  [TextureId.PARTICLES, spec('game/particles.jaz')],
  [TextureId.UI_IND_LIFE, spec('ui/ui_indLife.jaz', true)],
  [TextureId.UI_IND_PANEL, spec('ui/ui_indPanel.jaz', true)],
  [TextureId.UI_ARROW, spec('ui/ui_arrow.jaz', true)],
  [TextureId.UI_CURSOR, spec('ui/ui_cursor.jaz', true)],
  [TextureId.UI_AIM, spec('ui/ui_aim.jaz', true)],
  [TextureId.TER_Q1_BASE, spec('ter/ter_q1_base.jaz')],
  [TextureId.TER_Q1_OVERLAY, spec('ter/ter_q1_tex1.jaz')],
  [TextureId.TER_Q2_BASE, spec('ter/ter_q2_base.jaz')],
  [TextureId.TER_Q2_OVERLAY, spec('ter/ter_q2_tex1.jaz')],
  [TextureId.TER_Q3_BASE, spec('ter/ter_q3_base.jaz')],
  [TextureId.TER_Q3_OVERLAY, spec('ter/ter_q3_tex1.jaz')],
  [TextureId.TER_Q4_BASE, spec('ter/ter_q4_base.jaz')],
  [TextureId.TER_Q4_OVERLAY, spec('ter/ter_q4_tex1.jaz')],
  [TextureId.UI_TEXT_LEVEL_COMPLETE, spec('ui/ui_textLevComp.jaz', true)],
  [TextureId.UI_TEXT_QUEST, spec('ui/ui_textQuest.jaz', true)],
  [TextureId.UI_NUM1, spec('ui/ui_num1.jaz', true)],
  [TextureId.UI_NUM2, spec('ui/ui_num2.jaz', true)],
  [TextureId.UI_NUM3, spec('ui/ui_num3.jaz', true)],
  [TextureId.UI_NUM4, spec('ui/ui_num4.jaz', true)],
  [TextureId.UI_NUM5, spec('ui/ui_num5.jaz', true)],
  [TextureId.UI_WICONS, spec('ui/ui_wicons.jaz', true)],
  [TextureId.UI_GAME_TOP, spec('ui/ui_gameTop.jaz', true)],
  [TextureId.UI_LIFE_HEART, spec('ui/ui_lifeHeart.jaz', true)],
  [TextureId.UI_CLOCK_TABLE, spec('ui/ui_clockTable.jaz', true)],
  [TextureId.UI_CLOCK_POINTER, spec('ui/ui_clockPointer.jaz', true)],
  [TextureId.MUZZLE_FLASH, spec('game/muzzleFlash.jaz')],
  [TextureId.UI_DROP_ON, spec('ui/ui_dropDownOn.jaz', true)],
  [TextureId.UI_DROP_OFF, spec('ui/ui_dropDownOff.jaz', true)],
  [TextureId.UI_SIGN_CRIMSON, spec('ui/ui_signCrimson.jaz', true)],
  [TextureId.UI_MENU_ITEM, spec('ui/ui_menuItem.jaz', true)],
  [TextureId.UI_MENU_PANEL, spec('ui/ui_menuPanel.jaz', true)],
  [TextureId.UI_ITEM_TEXTS, spec('ui/ui_itemTexts.jaz', true)],
  [TextureId.UI_TEXT_REAPER, spec('ui/ui_textReaper.jaz', true)],
  [TextureId.UI_TEXT_WELL_DONE, spec('ui/ui_textWellDone.jaz', true)],
  [TextureId.UI_TEXT_CONTROLS, spec('ui/ui_textControls.jaz', true)],
  [TextureId.UI_TEXT_PICK_A_PERK, spec('ui/ui_textPickAPerk.jaz', true)],
  [TextureId.UI_TEXT_LEVEL_UP, spec('ui/ui_textLevelUp.jaz', true)],
]);

export interface RuntimeResources {
  assetsUrl: string;
  textures: Map<TextureId, GlTexture>;
  smallFont: SmallFontData;
}

export function getTexture(res: RuntimeResources, id: TextureId): GlTexture {
  const tex = res.textures.get(id);
  if (!tex) {
    const spec = TEXTURE_SPECS.get(id);
    throw new Error(`runtime texture is not available: ${spec?.relPath ?? id}`);
  }
  return tex;
}

// Unused in WebGL port: browser handles resource cleanup on page unload
export function unloadResources(ctx: WebGLContext, res: RuntimeResources): void {
  for (const tex of res.textures.values()) {
    ctx.unloadTexture(tex);
  }
  res.textures.clear();
}

// --- Runtime resources registry (mirrors Python's _REGISTERED_RESOURCES) ---

const _registeredResources = new Map<string, RuntimeResources>();

export function registerRuntimeResources(resources: RuntimeResources): void {
  _registeredResources.set(resources.assetsUrl, resources);
}

// Unused in WebGL port: browser handles resource cleanup on page unload
export function unregisterRuntimeResources(assetsUrl: string): void {
  _registeredResources.delete(assetsUrl);
}

export function runtimeResourcesFor(assetsUrl: string): RuntimeResources {
  const resources = _registeredResources.get(assetsUrl);
  if (!resources) throw new Error(`runtime resources not loaded for ${assetsUrl}`);
  return resources;
}

// --- PAQ entry helpers ---

// Unused in WebGL port: loadPaqEntriesFromPath called directly
export async function loadPaqEntries(assetsUrl: string): Promise<Map<string, Uint8Array>> {
  return loadPaqEntriesFromPath(`${assetsUrl}/${PAQ_NAME}`);
}

export async function loadPaqEntriesFromPath(paqUrl: string): Promise<Map<string, Uint8Array>> {
  const response = await fetch(paqUrl);
  if (!response.ok) throw new Error(`Failed to fetch PAQ: ${paqUrl} (${response.status})`);
  const buffer = await response.arrayBuffer();
  return paqToMap(buffer);
}

/**
 * Load an image from PAQ entry data based on file extension.
 * Returns an ImageBitmap ready for WebGL upload.
 */
async function loadImageFromPaqEntry(relPath: string, data: Uint8Array): Promise<ImageBitmap> {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.jaz')) {
    return decodeJazToImageBitmap(data);
  }
  // TGA, JPG, PNG — decode via browser
  const mimeMap: Record<string, string> = {
    '.tga': 'image/x-tga',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  // For TGA: browsers don't natively support TGA; we'll need a fallback
  // For now, try creating a blob and letting createImageBitmap handle it
  const ext = lower.substring(lower.lastIndexOf('.'));
  const mime = mimeMap[ext] ?? 'application/octet-stream';
  const blob = new Blob([data as BlobPart], { type: mime });
  try {
    // DX8 content uses straight alpha — prevent the browser from premultiplying,
    // which would cause double-darkening under SRC_ALPHA blending (see cheatsheet §3B).
    return await createImageBitmap(blob, { premultiplyAlpha: 'none' });
  } catch {
    // TGA fallback: parse manually
    if (ext === '.tga') {
      return decodeTgaToImageBitmap(data);
    }
    throw new Error(`Failed to decode image: ${relPath}`);
  }
}

/** Minimal TGA decoder for uncompressed RGBA/RGB images */
function decodeTgaToImageBitmap(data: Uint8Array): Promise<ImageBitmap> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const idLength = view.getUint8(0);
  const imageType = view.getUint8(2);
  const width = view.getUint16(12, true);
  const height = view.getUint16(14, true);
  const bpp = view.getUint8(16);
  const descriptor = view.getUint8(17);
  const topToBottom = (descriptor & 0x20) !== 0;

  const headerSize = 18 + idLength;
  const pixelData = data.subarray(headerSize);

  const pixels = new Uint8ClampedArray(width * height * 4);
  const imageData = new ImageData(pixels, width, height);

  if (imageType === 2) { // Uncompressed true-color
    const bytesPerPixel = bpp / 8;
    for (let y = 0; y < height; y++) {
      const srcY = topToBottom ? y : (height - 1 - y);
      for (let x = 0; x < width; x++) {
        const srcIdx = (srcY * width + x) * bytesPerPixel;
        const dstIdx = (y * width + x) * 4;
        pixels[dstIdx + 0] = pixelData[srcIdx + 2]; // R (TGA is BGR)
        pixels[dstIdx + 1] = pixelData[srcIdx + 1]; // G
        pixels[dstIdx + 2] = pixelData[srcIdx + 0]; // B
        pixels[dstIdx + 3] = bytesPerPixel >= 4 ? pixelData[srcIdx + 3] : 255; // A
      }
    }
  } else if (imageType === 10) { // RLE compressed true-color
    const bytesPerPixel = bpp / 8;
    let srcIdx = 0;
    let pixelIdx = 0;
    const totalPixels = width * height;
    while (pixelIdx < totalPixels && srcIdx < pixelData.length) {
      const header = pixelData[srcIdx++];
      const count = (header & 0x7F) + 1;
      if (header & 0x80) {
        // RLE packet
        const b = pixelData[srcIdx++];
        const g = pixelData[srcIdx++];
        const r = pixelData[srcIdx++];
        const a = bytesPerPixel >= 4 ? pixelData[srcIdx++] : 255;
        for (let i = 0; i < count && pixelIdx < totalPixels; i++) {
          const y = topToBottom ? Math.floor(pixelIdx / width) : (height - 1 - Math.floor(pixelIdx / width));
          const x = pixelIdx % width;
          const dstIdx = (y * width + x) * 4;
          pixels[dstIdx] = r;
          pixels[dstIdx + 1] = g;
          pixels[dstIdx + 2] = b;
          pixels[dstIdx + 3] = a;
          pixelIdx++;
        }
      } else {
        // Raw packet
        for (let i = 0; i < count && pixelIdx < totalPixels; i++) {
          const b = pixelData[srcIdx++];
          const g = pixelData[srcIdx++];
          const r = pixelData[srcIdx++];
          const a = bytesPerPixel >= 4 ? pixelData[srcIdx++] : 255;
          const y = topToBottom ? Math.floor(pixelIdx / width) : (height - 1 - Math.floor(pixelIdx / width));
          const x = pixelIdx % width;
          const dstIdx = (y * width + x) * 4;
          pixels[dstIdx] = r;
          pixels[dstIdx + 1] = g;
          pixels[dstIdx + 2] = b;
          pixels[dstIdx + 3] = a;
          pixelIdx++;
        }
      }
    }
  }

  // Bypass OffscreenCanvas 2D context — its putImageData + readback path
  // premultiplies alpha, which is lossy for straight-alpha DX8 content.
  // Construct an ImageData directly and let createImageBitmap keep it straight.
  return createImageBitmap(imageData, { premultiplyAlpha: 'none' });
}

export async function loadRuntimeResources(
  ctx: WebGLContext,
  assetsUrl: string,
): Promise<RuntimeResources> {
  const fetchUrl = await resolveAssetsUrl(assetsUrl);
  // Fetch and parse the PAQ archive
  const response = await fetch(`${fetchUrl}/${PAQ_NAME}`);
  if (!response.ok) throw new Error(`Failed to fetch ${PAQ_NAME}: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const entries = paqToMap(buffer);

  const textures = new Map<TextureId, GlTexture>();
  for (const [textureId, spec] of TEXTURE_SPECS) {
    const data = entries.get(spec.relPath);
    if (!data) throw new Error(`Missing runtime texture: ${spec.relPath}`);
    const bitmap = await loadImageFromPaqEntry(spec.relPath, data);
    const glTex = ctx.loadTexture(bitmap, {
      clamp: spec.clamp,
      pointFilter: spec.pointFilter,
    });
    bitmap.close();
    textures.set(textureId, glTex);
  }

  // Load small font widths
  const widthsData = entries.get('load/smallFnt.dat');
  if (!widthsData) throw new Error('Missing runtime font widths: load/smallFnt.dat');

  const smallFont: SmallFontData = {
    widths: Array.from(widthsData),
    texture: textures.get(TextureId.SMALL_WHITE)!,
    cellSize: 16,
    grid: 16,
  };

  const resources: RuntimeResources = { assetsUrl, textures, smallFont };
  registerRuntimeResources(resources);
  return resources;
}
