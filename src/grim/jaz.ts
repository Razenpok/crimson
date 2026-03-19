// Port of grim/jaz.py
// JAZ texture format (Crimsonland).
//
// File layout:
//   - u8  method: compression method (1 = zlib)
//   - u32 comp_size: compressed payload size (bytes)
//   - u32 raw_size: uncompressed payload size (bytes)
//   - zlib stream (length = comp_size)
//
// Decompressed payload:
//   - u32 jpeg_len
//   - jpeg bytes (length = jpeg_len)
//   - alpha_rle: (count, value) byte pairs for alpha channel

export interface JazImage {
  width: number;
  height: number;
  jpegData: Uint8Array;
  alphaData: Uint8Array;
}

function decodeAlphaRle(data: Uint8Array, expected: number): Uint8Array {
  const out = new Uint8Array(expected);
  let filled = 0;
  for (let i = 0; i < data.length - 1; i += 2) {
    const count = data[i];
    const value = data[i + 1];
    if (count === 0) continue;
    if (filled >= expected) break;
    const end = Math.min(filled + count, expected);
    out.fill(value, filled, end);
    filled = end;
  }
  return out;
}

async function decompressZlib(data: Uint8Array): Promise<Uint8Array> {
  // JAZ files use zlib-wrapped streams (RFC 1950). Despite the name, browsers'
  // DecompressionStream('deflate') handles both raw deflate AND zlib-wrapped
  // data transparently, so no manual header stripping is needed.
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  // Write compressed data and close
  writer.write(data as BufferSource);
  writer.close();

  // Read all decompressed chunks
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  // Concatenate
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export async function decodeJazBytes(data: Uint8Array): Promise<JazImage> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const method = view.getUint8(0);
  const compSize = view.getUint32(1, true);
  const rawSize = view.getUint32(5, true);

  if (method !== 1) {
    throw new Error(`unsupported compression method: ${method}`);
  }

  const compressed = data.subarray(9, 9 + compSize);
  const raw = await decompressZlib(compressed);

  if (raw.length !== rawSize) {
    throw new Error(`raw size mismatch: ${raw.length} != ${rawSize}`);
  }

  const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const jpegLen = rawView.getUint32(0, true);
  const jpegData = raw.subarray(4, 4 + jpegLen);
  const alphaRle = raw.subarray(4 + jpegLen);

  // Decode JPEG to get dimensions
  const jpegBlob = new Blob([jpegData as BlobPart], { type: 'image/jpeg' });
  const bitmap = await createImageBitmap(jpegBlob);
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();

  const alphaData = decodeAlphaRle(alphaRle, width * height);

  return { width, height, jpegData, alphaData };
}

/**
 * Decode a JAZ image and composite the JPEG RGB with the RLE alpha channel,
 * returning an ImageBitmap ready for WebGL texture upload.
 */
export async function decodeJazToImageBitmap(data: Uint8Array): Promise<ImageBitmap> {
  const jaz = await decodeJazBytes(data);

  // Decode JPEG to canvas to extract RGB pixels
  const jpegBlob = new Blob([jaz.jpegData as BlobPart], { type: 'image/jpeg' });
  const jpegBitmap = await createImageBitmap(jpegBlob);

  const canvas = new OffscreenCanvas(jaz.width, jaz.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(jpegBitmap, 0, 0);
  jpegBitmap.close();

  const imageData = ctx.getImageData(0, 0, jaz.width, jaz.height);
  const pixels = imageData.data;

  // Apply alpha channel from RLE data
  for (let i = 0; i < jaz.alphaData.length; i++) {
    pixels[i * 4 + 3] = jaz.alphaData[i];
  }

  // Build the bitmap directly from ImageData — do NOT round-trip through the
  // OffscreenCanvas 2D context (putImageData → createImageBitmap(canvas)),
  // because the canvas backing store premultiplies alpha, which is lossy for
  // straight-alpha DX8 content and causes dark halos / double-darkening under
  // SRC_ALPHA blending (see docs/cheatsheets/directx8.md §3B).
  return createImageBitmap(imageData, { premultiplyAlpha: 'none' });
}
