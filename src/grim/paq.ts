// Port of grim/paq.py

// PAQ archive format (Crimsonland).
//
// File layout:
//   - magic: 4 bytes, ASCII "paq\0"
//   - entries: repeated until EOF
//       - name: NUL-terminated UTF-8 string (relative path)
//       - size: u32 little-endian payload size
//       - payload: raw file bytes of length `size`

export const MAGIC = new Uint8Array([0x70, 0x61, 0x71, 0x00]);

export type PaqEntry = readonly [string, Uint8Array];

const textDecoder = new TextDecoder('utf-8');
const textEncoder = new TextEncoder();

function readCString(view: DataView, offset: number): [string, number] {
  const bytes: number[] = [];
  let pos = offset;
  while (pos < view.byteLength) {
    const b = view.getUint8(pos);
    pos++;
    if (b === 0) break;
    bytes.push(b);
  }
  if (pos > view.byteLength || view.getUint8(pos - 1) !== 0) {
    throw new Error('Invalid PAQ entry name');
  }
  return [textDecoder.decode(new Uint8Array(bytes)), pos];
}

export function* iterEntriesBytes(data: ArrayBuffer): Generator<PaqEntry> {
  const view = new DataView(data);
  for (let i = 0; i < 4; i++) {
    if (view.getUint8(i) !== MAGIC[i]) {
      throw new Error('Invalid PAQ magic');
    }
  }
  let offset = 4;
  while (offset < data.byteLength) {
    const [name, afterName] = readCString(view, offset);
    if (afterName + 4 > data.byteLength) {
      throw new Error('Invalid PAQ entry size');
    }
    const size = view.getUint32(afterName, true);
    const payloadStart = afterName + 4;
    if (payloadStart + size > data.byteLength) {
      throw new Error('Invalid PAQ entry payload');
    }
    const payload = new Uint8Array(data, payloadStart, size);
    yield [name, payload];
    offset = payloadStart + size;
  }
}

export function* iterEntries(_source: string): Generator<PaqEntry> {
  // Path-based PAQ reading is unavailable in WebGL.
  throw new Error('Path-based PAQ reading is unavailable in WebGL');
}

export function readPaq(source: string): PaqEntry[] {
  return [...iterEntries(source)];
}

export function decodeBytes(data: ArrayBuffer): PaqEntry[] {
  return [...iterEntriesBytes(data)];
}

function bytesFrom(data: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

export function buildEntries(entries: Iterable<readonly [string | { toString(): string }, Uint8Array | ArrayBuffer | ArrayBufferView]>): Uint8Array {
  const chunks: Uint8Array[] = [MAGIC];
  let totalSize = MAGIC.byteLength;

  for (const [nameValue, dataValue] of entries) {
    const name = textEncoder.encode(`${nameValue}`);
    const data = bytesFrom(dataValue);
    const size = new Uint8Array(4);
    new DataView(size.buffer).setUint32(0, data.byteLength, true);
    const nameTerminator = new Uint8Array([0]);
    chunks.push(name, nameTerminator, size, data);
    totalSize += name.byteLength + nameTerminator.byteLength + size.byteLength + data.byteLength;
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export function writePaq(_dest: string, _entries: Iterable<PaqEntry>): void {
  // Path-based PAQ writing is unavailable in WebGL.
  throw new Error('Path-based PAQ writing is unavailable in WebGL');
}

export function encodeBytes(entries: Iterable<PaqEntry>): Uint8Array {
  return buildEntries(entries);
}

export function decodePaq(data: ArrayBuffer): PaqEntry[] {
  return decodeBytes(data);
}

export function paqToMap(data: ArrayBuffer): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const [name, payload] of iterEntriesBytes(data)) {
    map.set(name.replace(/\\/g, '/'), payload);
  }
  return map;
}

export async function fetchPaq(url: string): Promise<Map<string, Uint8Array>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PAQ: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return paqToMap(buffer);
}
