// Port of grim/assets.py

import * as wgl from '@wgl';
import { paqToMap } from './paq.ts';
import { decodeJazToImageBitmap } from './jaz.ts';
import { SmallFontData } from '@grim/fonts/small.ts';

export const PAQ_NAME = 'crimson.paq';

const FALLBACK_ASSETS_URL = 'https://refactoring.ninja/crimson-paq/v1.9.93';

let _resolvedAssetsUrl: string | null = null;

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
  }
  console.log(`Assets not found at ${primaryUrl}, falling back to ${FALLBACK_ASSETS_URL}`);
  _resolvedAssetsUrl = FALLBACK_ASSETS_URL;
  return _resolvedAssetsUrl;
}

export enum TextureId {
  BACKPLASMA = 1,
  MOCKUP,
  LOGO_ESRB,
  LOADING,
  CL_LOGO,
  SPLASH_10TONS,
  SPLASH_REFLEXIVE,
  DEFAULT_FONT_COURIER,
  SMALL_WHITE,
  TROOPER,
  ZOMBIE,
  SPIDER_SP1,
  SPIDER_SP2,
  ALIEN,
  LIZARD,
  ARROW,
  BULLET_I,
  BULLET_TRAIL,
  BODYSET,
  PROJS,
  UI_ICON_AIM,
  UI_BUTTON_SM,
  UI_BUTTON_MD,
  UI_CHECK_ON,
  UI_CHECK_OFF,
  UI_RECT_OFF,
  UI_RECT_ON,
  BONUSES,
  UI_IND_BULLET,
  UI_IND_ROCKET,
  UI_IND_ELECTRIC,
  UI_IND_FIRE,
  PARTICLES,
  UI_IND_LIFE,
  UI_IND_PANEL,
  UI_ARROW,
  UI_CURSOR,
  UI_AIM,
  TER_Q1_BASE,
  TER_Q1_OVERLAY,
  TER_Q2_BASE,
  TER_Q2_OVERLAY,
  TER_Q3_BASE,
  TER_Q3_OVERLAY,
  TER_Q4_BASE,
  TER_Q4_OVERLAY,
  UI_TEXT_LEVEL_COMPLETE,
  UI_TEXT_QUEST,
  UI_NUM1,
  UI_NUM2,
  UI_NUM3,
  UI_NUM4,
  UI_NUM5,
  UI_WICONS,
  UI_GAME_TOP,
  UI_LIFE_HEART,
  UI_CLOCK_TABLE,
  UI_CLOCK_POINTER,
  MUZZLE_FLASH,
  UI_DROP_ON,
  UI_DROP_OFF,
  UI_SIGN_CRIMSON,
  UI_MENU_ITEM,
  UI_MENU_PANEL,
  UI_ITEM_TEXTS,
  UI_TEXT_REAPER,
  UI_TEXT_WELL_DONE,
  UI_TEXT_CONTROLS,
  UI_TEXT_PICK_A_PERK,
  UI_TEXT_LEVEL_UP,
}

export class TextureSpec {
  readonly relPath: string;
  readonly clamp: boolean;
  readonly pointFilter: boolean;

  constructor(opts: { relPath: string; clamp?: boolean; pointFilter?: boolean }) {
    this.relPath = opts.relPath;
    this.clamp = opts.clamp ?? false;
    this.pointFilter = opts.pointFilter ?? false;
  }
}

export const TEXTURE_SPECS: ReadonlyMap<TextureId, TextureSpec> = new Map([
  [TextureId.BACKPLASMA, new TextureSpec({ relPath: 'load/backplasma.jaz' })],
  [TextureId.MOCKUP, new TextureSpec({ relPath: 'load/mockup.jaz' })],
  [TextureId.LOGO_ESRB, new TextureSpec({ relPath: 'load/esrb_mature.jaz' })],
  [TextureId.LOADING, new TextureSpec({ relPath: 'load/loading.jaz' })],
  [TextureId.CL_LOGO, new TextureSpec({ relPath: 'load/logo_crimsonland.tga' })],
  [TextureId.SPLASH_10TONS, new TextureSpec({ relPath: 'load/splash10tons.jaz' })],
  [TextureId.SPLASH_REFLEXIVE, new TextureSpec({ relPath: 'load/splashReflexive.jpg' })],
  [TextureId.DEFAULT_FONT_COURIER, new TextureSpec({ relPath: 'load/default_font_courier.tga' })],
  [TextureId.SMALL_WHITE, new TextureSpec({ relPath: 'load/smallWhite.tga', pointFilter: true })],
  [TextureId.TROOPER, new TextureSpec({ relPath: 'game/trooper.jaz' })],
  [TextureId.ZOMBIE, new TextureSpec({ relPath: 'game/zombie.jaz' })],
  [TextureId.SPIDER_SP1, new TextureSpec({ relPath: 'game/spider_sp1.jaz' })],
  [TextureId.SPIDER_SP2, new TextureSpec({ relPath: 'game/spider_sp2.jaz' })],
  [TextureId.ALIEN, new TextureSpec({ relPath: 'game/alien.jaz' })],
  [TextureId.LIZARD, new TextureSpec({ relPath: 'game/lizard.jaz' })],
  [TextureId.ARROW, new TextureSpec({ relPath: 'load/arrow.tga' })],
  [TextureId.BULLET_I, new TextureSpec({ relPath: 'load/bullet16.tga' })],
  [TextureId.BULLET_TRAIL, new TextureSpec({ relPath: 'load/bulletTrail.tga' })],
  [TextureId.BODYSET, new TextureSpec({ relPath: 'game/bodyset.jaz' })],
  [TextureId.PROJS, new TextureSpec({ relPath: 'game/projs.jaz' })],
  [TextureId.UI_ICON_AIM, new TextureSpec({ relPath: 'ui/ui_iconAim.jaz', clamp: true })],
  [TextureId.UI_BUTTON_SM, new TextureSpec({ relPath: 'ui/ui_button_64x32.jaz', clamp: true })],
  [TextureId.UI_BUTTON_MD, new TextureSpec({ relPath: 'ui/ui_button_128x32.jaz', clamp: true })],
  [TextureId.UI_CHECK_ON, new TextureSpec({ relPath: 'ui/ui_checkOn.jaz', clamp: true })],
  [TextureId.UI_CHECK_OFF, new TextureSpec({ relPath: 'ui/ui_checkOff.jaz', clamp: true })],
  [TextureId.UI_RECT_OFF, new TextureSpec({ relPath: 'ui/ui_rectOff.jaz', clamp: true })],
  [TextureId.UI_RECT_ON, new TextureSpec({ relPath: 'ui/ui_rectOn.jaz', clamp: true })],
  [TextureId.BONUSES, new TextureSpec({ relPath: 'game/bonuses.jaz' })],
  [TextureId.UI_IND_BULLET, new TextureSpec({ relPath: 'ui/ui_indBullet.jaz', clamp: true })],
  [TextureId.UI_IND_ROCKET, new TextureSpec({ relPath: 'ui/ui_indRocket.jaz', clamp: true })],
  [TextureId.UI_IND_ELECTRIC, new TextureSpec({ relPath: 'ui/ui_indElectric.jaz', clamp: true })],
  [TextureId.UI_IND_FIRE, new TextureSpec({ relPath: 'ui/ui_indFire.jaz', clamp: true })],
  [TextureId.PARTICLES, new TextureSpec({ relPath: 'game/particles.jaz' })],
  [TextureId.UI_IND_LIFE, new TextureSpec({ relPath: 'ui/ui_indLife.jaz', clamp: true })],
  [TextureId.UI_IND_PANEL, new TextureSpec({ relPath: 'ui/ui_indPanel.jaz', clamp: true })],
  [TextureId.UI_ARROW, new TextureSpec({ relPath: 'ui/ui_arrow.jaz', clamp: true })],
  [TextureId.UI_CURSOR, new TextureSpec({ relPath: 'ui/ui_cursor.jaz', clamp: true })],
  [TextureId.UI_AIM, new TextureSpec({ relPath: 'ui/ui_aim.jaz', clamp: true })],
  [TextureId.TER_Q1_BASE, new TextureSpec({ relPath: 'ter/ter_q1_base.jaz' })],
  [TextureId.TER_Q1_OVERLAY, new TextureSpec({ relPath: 'ter/ter_q1_tex1.jaz' })],
  [TextureId.TER_Q2_BASE, new TextureSpec({ relPath: 'ter/ter_q2_base.jaz' })],
  [TextureId.TER_Q2_OVERLAY, new TextureSpec({ relPath: 'ter/ter_q2_tex1.jaz' })],
  [TextureId.TER_Q3_BASE, new TextureSpec({ relPath: 'ter/ter_q3_base.jaz' })],
  [TextureId.TER_Q3_OVERLAY, new TextureSpec({ relPath: 'ter/ter_q3_tex1.jaz' })],
  [TextureId.TER_Q4_BASE, new TextureSpec({ relPath: 'ter/ter_q4_base.jaz' })],
  [TextureId.TER_Q4_OVERLAY, new TextureSpec({ relPath: 'ter/ter_q4_tex1.jaz' })],
  [TextureId.UI_TEXT_LEVEL_COMPLETE, new TextureSpec({ relPath: 'ui/ui_textLevComp.jaz', clamp: true })],
  [TextureId.UI_TEXT_QUEST, new TextureSpec({ relPath: 'ui/ui_textQuest.jaz', clamp: true })],
  [TextureId.UI_NUM1, new TextureSpec({ relPath: 'ui/ui_num1.jaz', clamp: true })],
  [TextureId.UI_NUM2, new TextureSpec({ relPath: 'ui/ui_num2.jaz', clamp: true })],
  [TextureId.UI_NUM3, new TextureSpec({ relPath: 'ui/ui_num3.jaz', clamp: true })],
  [TextureId.UI_NUM4, new TextureSpec({ relPath: 'ui/ui_num4.jaz', clamp: true })],
  [TextureId.UI_NUM5, new TextureSpec({ relPath: 'ui/ui_num5.jaz', clamp: true })],
  [TextureId.UI_WICONS, new TextureSpec({ relPath: 'ui/ui_wicons.jaz', clamp: true })],
  [TextureId.UI_GAME_TOP, new TextureSpec({ relPath: 'ui/ui_gameTop.jaz', clamp: true })],
  [TextureId.UI_LIFE_HEART, new TextureSpec({ relPath: 'ui/ui_lifeHeart.jaz', clamp: true })],
  [TextureId.UI_CLOCK_TABLE, new TextureSpec({ relPath: 'ui/ui_clockTable.jaz', clamp: true })],
  [TextureId.UI_CLOCK_POINTER, new TextureSpec({ relPath: 'ui/ui_clockPointer.jaz', clamp: true })],
  [TextureId.MUZZLE_FLASH, new TextureSpec({ relPath: 'game/muzzleFlash.jaz' })],
  [TextureId.UI_DROP_ON, new TextureSpec({ relPath: 'ui/ui_dropDownOn.jaz', clamp: true })],
  [TextureId.UI_DROP_OFF, new TextureSpec({ relPath: 'ui/ui_dropDownOff.jaz', clamp: true })],
  [TextureId.UI_SIGN_CRIMSON, new TextureSpec({ relPath: 'ui/ui_signCrimson.jaz', clamp: true })],
  [TextureId.UI_MENU_ITEM, new TextureSpec({ relPath: 'ui/ui_menuItem.jaz', clamp: true })],
  [TextureId.UI_MENU_PANEL, new TextureSpec({ relPath: 'ui/ui_menuPanel.jaz', clamp: true })],
  [TextureId.UI_ITEM_TEXTS, new TextureSpec({ relPath: 'ui/ui_itemTexts.jaz', clamp: true })],
  [TextureId.UI_TEXT_REAPER, new TextureSpec({ relPath: 'ui/ui_textReaper.jaz', clamp: true })],
  [TextureId.UI_TEXT_WELL_DONE, new TextureSpec({ relPath: 'ui/ui_textWellDone.jaz', clamp: true })],
  [TextureId.UI_TEXT_CONTROLS, new TextureSpec({ relPath: 'ui/ui_textControls.jaz', clamp: true })],
  [TextureId.UI_TEXT_PICK_A_PERK, new TextureSpec({ relPath: 'ui/ui_textPickAPerk.jaz', clamp: true })],
  [TextureId.UI_TEXT_LEVEL_UP, new TextureSpec({ relPath: 'ui/ui_textLevelUp.jaz', clamp: true })],
]);

export class RuntimeResources {
  assetsUrl: string;
  textures: Map<TextureId, wgl.Texture>;
  smallFont: SmallFontData;

  constructor(opts: { assetsUrl: string; textures: Map<TextureId, wgl.Texture>; smallFont: SmallFontData }) {
    this.assetsUrl = opts.assetsUrl;
    this.textures = opts.textures;
    this.smallFont = opts.smallFont;
  }

  texture(textureId: TextureId): wgl.Texture {
    return getTexture(this, textureId);
  }

  unload(): void {
    unloadResources(this);
  }
}

export function getTexture(res: RuntimeResources, id: TextureId): wgl.Texture {
  const tex = res.textures.get(id);
  if (!tex) {
    const spec = TEXTURE_SPECS.get(id);
    throw new Error(`runtime texture is not available: ${spec?.relPath ?? id}`);
  }
  return tex;
}

export function unloadResources(res: RuntimeResources): void {
  const seen = new Set<WebGLTexture>();
  for (const tex of res.textures.values()) {
    if (seen.has(tex.id)) {
      continue;
    }
    wgl.unloadTexture(tex);
    seen.add(tex.id);
  }
  res.textures.clear();
}

export function unloadRuntimeResources(resources: RuntimeResources | null): void {
  if (resources === null) {
    return;
  }
  unregisterRuntimeResources(resources.assetsUrl);
  unloadResources(resources);
}

const _registeredResources = new Map<string, RuntimeResources>();

function _normalizeAssetsDir(assetsUrl: string): string {
  try {
    return new URL(assetsUrl, globalThis.location?.href).href;
  } catch {
    return assetsUrl;
  }
}

export function registerRuntimeResources(resources: RuntimeResources): void {
  _registeredResources.set(_normalizeAssetsDir(resources.assetsUrl), resources);
}

export function unregisterRuntimeResources(assetsUrl: string): void {
  _registeredResources.delete(_normalizeAssetsDir(assetsUrl));
}

export function runtimeResourcesFor(assetsUrl: string): RuntimeResources {
  const resources = _registeredResources.get(_normalizeAssetsDir(assetsUrl));
  if (!resources) throw new Error(`runtime resources not loaded for ${assetsUrl}`);
  return resources;
}

export async function loadPaqEntries(assetsUrl: string): Promise<Map<string, Uint8Array>> {
  return loadPaqEntriesFromPath(`${assetsUrl}/${PAQ_NAME}`);
}

export async function loadPaqEntriesFromPath(paqUrl: string): Promise<Map<string, Uint8Array>> {
  const response = await fetch(paqUrl);
  if (!response.ok) throw new Error(`Failed to fetch PAQ: ${paqUrl} (${response.status})`);
  const buffer = await response.arrayBuffer();
  return paqToMap(buffer);
}

async function loadImageFromPaqEntry(relPath: string, data: Uint8Array): Promise<ImageBitmap> {
  const lower = relPath.toLowerCase();
  if (lower.endsWith('.jaz')) {
    return decodeJazToImageBitmap(data);
  }
  const mimeMap: Record<string, string> = {
    '.tga': 'image/x-tga',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
  };
  const ext = lower.substring(lower.lastIndexOf('.'));
  const mime = mimeMap[ext] ?? 'application/octet-stream';
  const blobData = new ArrayBuffer(data.byteLength);
  new Uint8Array(blobData).set(data);
  const blob = new Blob([blobData], { type: mime });
  try {
    return await createImageBitmap(blob, { premultiplyAlpha: 'none' });
  } catch {
    if (ext === '.tga') {
      return decodeTgaToImageBitmap(data);
    }
    throw new Error(`Failed to decode image: ${relPath}`);
  }
}

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

  if (imageType === 2) {
    const bytesPerPixel = bpp / 8;
    for (let y = 0; y < height; y++) {
      const srcY = topToBottom ? y : (height - 1 - y);
      for (let x = 0; x < width; x++) {
        const srcIdx = (srcY * width + x) * bytesPerPixel;
        const dstIdx = (y * width + x) * 4;
        pixels[dstIdx + 0] = pixelData[srcIdx + 2];
        pixels[dstIdx + 1] = pixelData[srcIdx + 1];
        pixels[dstIdx + 2] = pixelData[srcIdx + 0];
        pixels[dstIdx + 3] = bytesPerPixel >= 4 ? pixelData[srcIdx + 3] : 255;
      }
    }
  } else if (imageType === 10) {
    const bytesPerPixel = bpp / 8;
    let srcIdx = 0;
    let pixelIdx = 0;
    const totalPixels = width * height;
    while (pixelIdx < totalPixels && srcIdx < pixelData.length) {
      const header = pixelData[srcIdx++];
      const count = (header & 0x7F) + 1;
      if (header & 0x80) {
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

  return createImageBitmap(imageData, { premultiplyAlpha: 'none' });
}

function _loadTextureFromBytes(data: Uint8Array, fmt: string): Promise<wgl.Texture> {
  void fmt;
  return loadImageFromPaqEntry(fmt, data).then((bitmap) => {
    const texture = wgl.loadTexture(bitmap);
    bitmap.close();
    wgl.setTextureFilter(texture, wgl.TextureFilter.BILINEAR);
    return texture;
  });
}

function _applyTextureSettings(texture: wgl.Texture, opts: { clamp: boolean; pointFilter: boolean }): void {
  if (opts.clamp) {
    wgl.setTextureWrap(texture, wgl.TextureWrap.CLAMP);
  }
  if (opts.pointFilter) {
    wgl.setTextureFilter(texture, wgl.TextureFilter.POINT);
  }
}

async function _loadTextureAssetFromBytes(relPath: string, data: Uint8Array | undefined): Promise<wgl.Texture | null> {
  if (data === undefined) {
    throw new Error(`Missing asset data: ${relPath}`);
  }
  let texture: wgl.Texture | null;
  if (relPath.toLowerCase().endsWith('.jaz')) {
    texture = await _loadTextureFromBytes(data, relPath);
  } else if (relPath.toLowerCase().endsWith('.tga')) {
    texture = await _loadTextureFromBytes(data, relPath);
  } else if (relPath.toLowerCase().endsWith('.jpg') || relPath.toLowerCase().endsWith('.jpeg')) {
    texture = await _loadTextureFromBytes(data, relPath);
  } else {
    texture = null;
  }
  return texture;
}

function _buildSmallFont(textures: Map<TextureId, wgl.Texture>, widthsData: Uint8Array): SmallFontData {
  const texture = textures.get(TextureId.SMALL_WHITE);
  if (texture === undefined) {
    throw new Error(`runtime texture is not available: ${TEXTURE_SPECS.get(TextureId.SMALL_WHITE)?.relPath ?? TextureId.SMALL_WHITE}`);
  }
  return new SmallFontData({
    widths: Array.from(widthsData),
    texture,
  });
}

export async function loadRuntimeResources(
  assetsUrl: string,
): Promise<RuntimeResources> {
  const fetchUrl = await resolveAssetsUrl(assetsUrl);
  const entries = await loadPaqEntries(fetchUrl);

  const textures = new Map<TextureId, wgl.Texture>();
  for (const [textureId, spec] of TEXTURE_SPECS) {
    const texture = await _loadTextureAssetFromBytes(spec.relPath, entries.get(spec.relPath));
    if (texture === null) {
      throw new Error(`Missing runtime texture: ${spec.relPath}`);
    }
    _applyTextureSettings(texture, { clamp: spec.clamp, pointFilter: spec.pointFilter });
    textures.set(textureId, texture);
  }

  const widthsData = entries.get('load/smallFnt.dat');
  if (!widthsData) throw new Error('Missing runtime font widths: load/smallFnt.dat');

  const smallFont = _buildSmallFont(textures, widthsData);

  const resources = new RuntimeResources({ assetsUrl, textures, smallFont });
  registerRuntimeResources(resources);
  return resources;
}
