// Port of grim/paq.py

// PAQ archive format (Crimsonland).
//
// File layout:
//   - magic: 4 bytes, ASCII "paq\0"
//   - entries: repeated until EOF
//       - name: NUL-terminated UTF-8 string (relative path)
//       - size: u32 little-endian payload size
//       - payload: raw file bytes of length `size`

const MAGIC = new Uint8Array([0x70, 0x61, 0x71, 0x00]); // "paq\0"

export interface PaqEntry {
  name: string;
  payload: Uint8Array;
}

function readCString(view: DataView, offset: number): [string, number] {
  const bytes: number[] = [];
  let pos = offset;
  while (pos < view.byteLength) {
    const b = view.getUint8(pos);
    pos++;
    if (b === 0) break;
    bytes.push(b);
  }
  const decoder = new TextDecoder('utf-8');
  return [decoder.decode(new Uint8Array(bytes)), pos];
}

export function* iterEntriesBytes(data: ArrayBuffer): Generator<PaqEntry> {
  const view = new DataView(data);
  // Verify magic
  for (let i = 0; i < 4; i++) {
    if (view.getUint8(i) !== MAGIC[i]) {
      throw new Error('Invalid PAQ magic');
    }
  }
  let offset = 4;
  while (offset < data.byteLength) {
    const [name, afterName] = readCString(view, offset);
    if (afterName + 4 > data.byteLength) break;
    const size = view.getUint32(afterName, true);
    const payloadStart = afterName + 4;
    if (payloadStart + size > data.byteLength) break;
    const payload = new Uint8Array(data, payloadStart, size);
    yield { name, payload };
    offset = payloadStart + size;
  }
}

export function decodePaq(data: ArrayBuffer): PaqEntry[] {
  return [...iterEntriesBytes(data)];
}

export function paqToMap(data: ArrayBuffer): Map<string, Uint8Array> {
  const map = new Map<string, Uint8Array>();
  for (const entry of iterEntriesBytes(data)) {
    map.set(entry.name.replace(/\\/g, '/'), entry.payload);
  }
  return map;
}

export async function fetchPaq(url: string): Promise<Map<string, Uint8Array>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PAQ: ${response.status}`);
  const buffer = await response.arrayBuffer();
  return paqToMap(buffer);
}
