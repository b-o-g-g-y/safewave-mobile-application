/**
 * Beken BK OTA protocol — pure byte-layout helpers.
 *
 * Ported from the vendor Android reference (`WriterOperation.java` +
 * `OtaActiviy.java`). OTA.md also describes this protocol, but where the
 * two disagree this file matches the Java — the live band bootloader was
 * built against that code path.
 *
 * Quirks that MUST be preserved:
 *   - Header byte-2 is always 0 because of the double-mask bug in
 *     `cmd_write_op` (`(length & 0xff) >> 8`). The firmware was compiled
 *     against this exact byte layout.
 *   - CRC32 uses Java's peculiar MSB-shift algorithm with the standard
 *     CRC-32/IEEE reversed table, init = 0, no final XOR, skipping the
 *     first 256 bytes of the firmware image.
 *   - Addresses / status are extracted from bytes 4..7 of every recv
 *     notification (`bytetoint`), and the device-type flag lives in byte 4
 *     (`bytetochar & 0x10`).
 */

export const OTA_OP_NVDS_TYPE = 0;
export const OTA_OP_GET_STR_BASE = 1;
export const OTA_OP_PAGE_ERASE = 3;
export const OTA_OP_WRITE_DATA = 5;
export const OTA_OP_REBOOT = 9;

export const FLASH_PAGE_SIZE = 0x1000;

export const FIRST_ADDR = 0x00000000;
export const SECOND_ADDR = 0x00014000;

export type OTADeviceType = 'BK8010' | 'BK8010H';

/**
 * Standard CRC-32 IEEE reversed table (same numeric values as the
 * vendor's `crc_ta_8`). Bundled here so the module is self-contained.
 */
const CRC_TA_8: readonly number[] = [
  0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
  0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
  0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
  0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
  0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
  0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
  0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
  0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
  0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
  0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
  0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
  0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
  0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
  0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
  0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
  0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
  0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
  0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
  0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
  0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
  0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
  0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
  0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
  0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
  0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
  0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
  0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
  0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
  0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
  0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
  0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
  0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
  0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
  0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
  0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
  0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
  0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
  0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
  0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
  0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
  0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
  0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
  0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d,
];

/**
 * Replicates Java's signed `int high = crc / 256` followed by `& 0xff`.
 * Java's signed integer division rounds toward zero, which differs from
 * a logical right shift (`>>> 8`) when `crc` has its top bit set. This
 * quirk is load-bearing for the firmware's CRC check.
 */
const javaHighByte = (crc: number): number => {
  // Reinterpret as signed int32, divide, truncate toward zero, mask.
  const signed = crc | 0;
  const q = (signed / 256) | 0; // `| 0` truncates toward zero in JS
  return q & 0xff;
};

/**
 * CRC32 as implemented by the vendor Android reference
 * (`Crc32CalByByte`): init = 0, no final XOR, MSB-shift algorithm using
 * the IEEE-reversed table.
 */
const crc32BekenBytes = (bytes: Uint8Array | number[]): number => {
  let crc = 0;
  for (let i = 0; i < bytes.length; i++) {
    const high = javaHighByte(crc);
    crc = ((crc << 8) >>> 0) ^ CRC_TA_8[(high ^ (bytes[i] & 0xff)) & 0xff];
    crc = crc >>> 0;
  }
  return crc >>> 0;
};

/**
 * File-level CRC: runs the Beken CRC32 over everything EXCEPT the first
 * 256-byte block, matching the vendor reference's `getCRC32new` which
 * skips `couts == 0`.
 */
export const crc32BekenFile = (bytes: Uint8Array): number => {
  if (bytes.length <= 256) return 0;
  return crc32BekenBytes(bytes.subarray(256));
};

/**
 * Build the short command header. Byte 2 is deliberately `(length & 0xff) >> 8`
 * (always 0) — this is the "byte-2 bug" the firmware was compiled against.
 */
export const buildHeader = (
  opcode: number,
  length: number,
  addr: number,
  dataLength: number
): Uint8Array => {
  const isPageErase = opcode === OTA_OP_PAGE_ERASE;
  const size = isPageErase ? 7 : 9;
  const out = new Uint8Array(size);

  out[0] = opcode & 0xff;
  out[1] = length & 0xff;
  out[2] = ((length & 0xff) >> 8) & 0xff; // always 0 — faithful reproduction
  out[3] = addr & 0xff;
  out[4] = (addr & 0xff00) >>> 8;
  out[5] = (addr & 0xff0000) >>> 16;
  out[6] = (addr >>> 24) & 0xff;

  if (!isPageErase) {
    out[7] = dataLength & 0xff;
    out[8] = (dataLength & 0xff00) >>> 8;
  }

  return out;
};

/**
 * Header picker — mirrors Java `cmd_operation`.
 */
export const buildOperationHeader = (
  opcode: number,
  length: number,
  addr: number
): Uint8Array => {
  switch (opcode) {
    case OTA_OP_WRITE_DATA:
      return buildHeader(opcode, 9, addr, length);
    case OTA_OP_GET_STR_BASE:
    case OTA_OP_NVDS_TYPE:
      return buildHeader(opcode, 3, 0, 0);
    case OTA_OP_PAGE_ERASE:
      return buildHeader(opcode, 7, addr, 0);
    default:
      throw new Error(`buildOperationHeader: unsupported opcode ${opcode}`);
  }
};

/**
 * 11-byte reboot packet. `length` = firmware length, `crc32` = checksum
 * over file[256:]. Matches Java `send_data_long` with `addr=fileCRC`.
 */
export const buildRebootPacket = (length: number, crc32: number): Uint8Array => {
  const out = new Uint8Array(11);
  out[0] = OTA_OP_REBOOT & 0xff;
  out[1] = 0x0a;
  out[2] = 0x00;
  out[3] = length & 0xff;
  out[4] = (length >>> 8) & 0xff;
  out[5] = (length >>> 16) & 0xff;
  out[6] = (length >>> 24) & 0xff;
  out[7] = crc32 & 0xff;
  out[8] = (crc32 >>> 8) & 0xff;
  out[9] = (crc32 >>> 16) & 0xff;
  out[10] = (crc32 >>> 24) & 0xff;
  return out;
};

export const concatBytes = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

export const chunkBytes = (buf: Uint8Array, chunkSize: number): Uint8Array[] => {
  if (chunkSize <= 0) throw new Error('chunkBytes: chunkSize must be > 0');
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < buf.length; i += chunkSize) {
    chunks.push(buf.slice(i, Math.min(i + chunkSize, buf.length)));
  }
  return chunks;
};

/**
 * Extract the device-type flag from a recv notification. Mirrors Java
 * `bytetochar`: returns byte 4, then caller checks bit 0x10.
 */
export const parseDeviceType = (recv: Uint8Array): OTADeviceType => {
  if (recv.length < 5) {
    throw new Error(
      `OTA recv too short for device type: ${recv.length} bytes`
    );
  }
  return (recv[4] & 0x10) === 0 ? 'BK8010' : 'BK8010H';
};

/**
 * Decode bytes 4..7 of a recv notification as a little-endian u32.
 * Mirrors Java `bytetoint` — used for current-running-bank addr,
 * erase/write echo addresses, and the tail sync check.
 */
export const parseAddr = (recv: Uint8Array): number => {
  if (recv.length < 8) {
    throw new Error(`OTA recv too short for addr: ${recv.length} bytes`);
  }
  return (
    ((recv[4] & 0xff) |
      ((recv[5] & 0xff) << 8) |
      ((recv[6] & 0xff) << 16) |
      ((recv[7] & 0xff) << 24)) >>>
    0
  );
};

/**
 * Given the GET_STR_BASE response and the detected device type, pick
 * which flash address the new firmware should be written to. For the
 * dual-bank BK8010 we swap; for the write-in-place BK8010H we reuse the
 * current running address.
 */
export const pickTargetAddress = (
  deviceType: OTADeviceType,
  currentAddr: number
): number => {
  if (deviceType === 'BK8010') {
    return currentAddr === FIRST_ADDR ? SECOND_ADDR : FIRST_ADDR;
  }
  return currentAddr;
};

/**
 * Base64 <-> Uint8Array helpers (no Buffer dependency).
 */
const B64_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64_CHARS[b1 >> 2];
    result += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? B64_CHARS[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[b3 & 63] : '=';
  }
  return result;
};

export const base64ToBytes = (b64: string): Uint8Array => {
  const out: number[] = [];
  const len = b64.length;
  for (let i = 0; i < len; i += 4) {
    const c1 = B64_CHARS.indexOf(b64[i]);
    const c2 = B64_CHARS.indexOf(b64[i + 1]);
    const c3 = b64[i + 2] === '=' ? 0 : B64_CHARS.indexOf(b64[i + 2]);
    const c4 = b64[i + 3] === '=' ? 0 : B64_CHARS.indexOf(b64[i + 3]);
    out.push((c1 << 2) | (c2 >> 4));
    if (b64[i + 2] !== '=') out.push(((c2 & 15) << 4) | (c3 >> 2));
    if (b64[i + 3] !== '=') out.push(((c3 & 3) << 6) | c4);
  }
  return Uint8Array.from(out);
};
