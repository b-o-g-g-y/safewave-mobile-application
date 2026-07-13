/**
 * Firmware version helpers.
 *
 * The firmware's APP_VERSION is a BCD-style hex literal whose digits read
 * as a version:
 *
 *   0x0001043  ->  major 1, minor 0, patch 43  ->  "1.0.43"
 *        ^^^^      the low 4 nibbles are M.m.pp
 *
 * Firmware only ever writes decimal digits (0-9), never A-F: 0x1049 bumps
 * to 0x1050, not 0x104A. The raw value still increases with every bump, so
 * ordering is a plain integer compare on APP_VERSION.
 *
 * Three input forms are accepted, all normalized to that raw integer so
 * they compare against each other correctly:
 *
 *   "4163"     decimal APP_VERSION, as reported by the band over BLE
 *   "0x1043"   hex APP_VERSION, as written in the firmware source
 *   "1.0.43"   dotted, as a human would write it in the Firestore manifest
 *
 * The dotted form matters: whoever publishes a release naturally types
 * "1.6.55" rather than "0x1655". Parsing it back to the raw value is what
 * keeps that from comparing as version 1 against the band's 4163 and
 * silently suppressing the update.
 */

/** Fields are single decimal digits except patch, which is two. */
const DOTTED_RE = /^(\d)\.(\d)\.(\d{1,2})$/;

/**
 * Normalize any accepted version form to the raw APP_VERSION integer.
 * Returns `null` if the input is unparseable or out of range.
 */
const parseVersion = (raw: string | null | undefined): number | null => {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Hex, as written in the firmware source: 0x1043
  if (/^0[xX][0-9a-fA-F]+$/.test(trimmed)) {
    return Number.parseInt(trimmed.slice(2), 16);
  }

  // Dotted, as written in the Firestore manifest: 1.6.55
  const dotted = DOTTED_RE.exec(trimmed);
  if (dotted) {
    const major = Number.parseInt(dotted[1], 10);
    const minor = Number.parseInt(dotted[2], 10);
    const patch = Number.parseInt(dotted[3], 10);
    // Patch occupies two BCD digits, so it cannot exceed 99.
    if (patch > 99) return null;
    return (major << 12) | (minor << 8) | (((patch / 10) | 0) << 4) | patch % 10;
  }

  // Bare decimal, as reported by the band: 4163
  if (/^\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  return null;
};

/**
 * Compare two firmware versions in any accepted form.
 * @returns -1 if `a < b`, 0 if equal, 1 if `a > b`, or `null` if either
 *   side is unparseable.
 */
export const compareFirmwareVersions = (
  a: string | null | undefined,
  b: string | null | undefined
): -1 | 0 | 1 | null => {
  const va = parseVersion(a);
  const vb = parseVersion(b);
  if (va === null || vb === null) return null;
  if (va < vb) return -1;
  if (va > vb) return 1;
  return 0;
};

/**
 * True only if `latest` is strictly newer than `current`. Returns false
 * when either version is unparseable — we prefer not to surface a false
 * update prompt when we can't verify the comparison.
 */
export const isFirmwareNewer = (
  current: string | null | undefined,
  latest: string | null | undefined
): boolean => {
  const cmp = compareFirmwareVersions(current, latest);
  return cmp === -1;
};

/**
 * Render a version for display: 0x1043 -> "1.0.43". Returns `null` if
 * unparseable.
 *
 * Display only — never compare these strings, compare the raw values with
 * `compareFirmwareVersions`.
 */
export const formatFirmwareVersion = (
  raw: string | null | undefined
): string | null => {
  const n = parseVersion(raw);
  if (n === null) return null;

  const nibbles = [
    (n >> 12) & 0xf, // major
    (n >> 8) & 0xf, // minor
    (n >> 4) & 0xf, // patch, tens
    n & 0xf, // patch, ones
  ];

  // Firmware only writes decimal digits. An A-F digit means the convention
  // broke, so fall back to the raw value rather than printing garbage.
  if (n > 0xffff || nibbles.some((d) => d > 9)) return `Build ${n}`;

  const [major, minor, tens, ones] = nibbles;
  return `${major}.${minor}.${tens}${ones}`;
};
