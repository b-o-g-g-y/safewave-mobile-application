/**
 * OTAManager — drives the BK OTA sequence against a connected Safewave
 * band using react-native-ble-plx.
 *
 * Ported from the vendor Android reference (`OtaActiviy.java` +
 * `WriterOperation.java` + `BluetoothLeClass.java`). The flow is
 * notification-driven: every command sent to the SEND characteristic
 * triggers a single notification on the RECV characteristic, and we wait
 * for that notification before sending the next command.
 */

import { Device, Subscription, ConnectionPriority } from 'react-native-ble-plx';
import { OTA_SERVICE_UUID, OTA_CHAR_1_UUID, OTA_CHAR_2_UUID } from './BLEConstants';
import {
  OTA_OP_NVDS_TYPE,
  OTA_OP_GET_STR_BASE,
  OTA_OP_PAGE_ERASE,
  OTA_OP_WRITE_DATA,
  FLASH_PAGE_SIZE,
  buildOperationHeader,
  buildRebootPacket,
  concatBytes,
  chunkBytes,
  crc32BekenFile,
  parseDeviceType,
  parseAddr,
  pickTargetAddress,
  bytesToBase64,
  base64ToBytes,
  OTADeviceType,
} from './OTAProtocol';

export type OTAPhase =
  | 'preparing'
  | 'handshake'
  | 'negotiating-mtu'
  | 'erasing'
  | 'writing-firmware'
  | 'finalising'
  | 'rebooting'
  | 'done';

export interface OTAProgress {
  phase: OTAPhase;
  bytesWritten: number;
  totalBytes: number;
  deviceType?: OTADeviceType;
}

export interface PerformOTAOptions {
  device: Device;
  firmwareBytes: Uint8Array;
  onProgress?: (p: OTAProgress) => void;
  isCancelled?: () => boolean;
}

export class OTACancelled extends Error {
  constructor() {
    super('OTA cancelled');
    this.name = 'OTACancelled';
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const NOTIFY_TIMEOUT_MS = 5000;

/**
 * Tiny notification queue: every incoming notify pushes its bytes in, and
 * callers await `next()` to consume the next one that arrives. Also
 * exposes `latest` for the tail-sync check.
 */
class NotifyQueue {
  private pending: Array<(bytes: Uint8Array) => void> = [];
  private errored: Error | null = null;
  latest: Uint8Array | null = null;

  push(bytes: Uint8Array): void {
    this.latest = bytes;
    const resolver = this.pending.shift();
    if (resolver) resolver(bytes);
  }

  fail(err: Error): void {
    this.errored = err;
    const pending = this.pending.splice(0);
    for (const r of pending) r(new Uint8Array()); // unblock; caller sees err via timeout
  }

  next(timeoutMs: number = NOTIFY_TIMEOUT_MS): Promise<Uint8Array> {
    if (this.errored) return Promise.reject(this.errored);
    return new Promise<Uint8Array>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error('OTA: timed out waiting for band notification')),
        timeoutMs
      );
      this.pending.push((bytes) => {
        clearTimeout(t);
        if (this.errored) reject(this.errored);
        else resolve(bytes);
      });
    });
  }
}

const writePacket = async (
  device: Device,
  packet: Uint8Array,
  chunkSize: number
): Promise<void> => {
  const slices = chunkBytes(packet, chunkSize);
  for (const slice of slices) {
    await device.writeCharacteristicWithoutResponseForService(
      OTA_SERVICE_UUID,
      OTA_CHAR_1_UUID,
      bytesToBase64(slice)
    );
  }
};

/**
 * Subscribe to notifications on the RECV characteristic and funnel each
 * incoming packet into the queue. Returns the subscription so the caller
 * can tear it down in a finally block.
 */
const subscribeNotifications = (
  device: Device,
  queue: NotifyQueue
): Subscription => {
  return device.monitorCharacteristicForService(
    OTA_SERVICE_UUID,
    OTA_CHAR_2_UUID,
    (error, char) => {
      if (error) {
        // A subscription cancellation during teardown is expected.
        if (!/cancelled|disconnected/i.test(error.message ?? '')) {
          queue.fail(error);
        }
        return;
      }
      if (char?.value) {
        queue.push(base64ToBytes(char.value));
      }
    }
  );
};

/**
 * Execute the full BK OTA flow. Preconditions the caller must verify:
 *   - device is connected
 *   - battery level ≥ 40 %
 *   - firmwareBytes non-empty
 */
export const performOTA = async ({
  device: initialDevice,
  firmwareBytes,
  onProgress,
  isCancelled,
}: PerformOTAOptions): Promise<void> => {
  // Reassignable — `device.requestMTU()` returns a fresh Device instance
  // with the negotiated MTU; we must use that instance when reading
  // `.mtu` afterwards or we'll keep seeing the pre-negotiation value.
  let device = initialDevice;
  if (firmwareBytes.length === 0) {
    throw new Error('OTA: firmware is empty');
  }
  if (firmwareBytes.length <= 256) {
    throw new Error('OTA: firmware must be larger than 256 bytes');
  }

  const runStartedAt = Date.now();
  const fmtKB = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `[OTA] === Starting OTA run: firmware ${firmwareBytes.length} bytes (${fmtKB(firmwareBytes.length)}) ===`
  );

  const emit = (
    phase: OTAPhase,
    bytesWritten: number,
    deviceType?: OTADeviceType
  ) => {
    onProgress?.({
      phase,
      bytesWritten,
      totalBytes: firmwareBytes.length,
      deviceType,
    });
  };

  emit('preparing', 0);

  // Subscribe FIRST so we don't miss the NVDS_TYPE response.
  const queue = new NotifyQueue();
  const subscription = subscribeNotifications(device, queue);

  try {
    // Start with whatever MTU currently is — NVDS_TYPE / GET_STR_BASE
    // packets fit in 9 bytes, well under the default 23.
    const initialMtu = device.mtu ?? 23;
    let chunkSize = initialMtu - 3;

    // --- Step 1: NVDS_TYPE → learn device type ---------------------------
    emit('handshake', 0);
    await writePacket(
      device,
      buildOperationHeader(OTA_OP_NVDS_TYPE, 0, 0),
      chunkSize
    );
    const nvdsResp = await queue.next();
    const deviceType = parseDeviceType(nvdsResp);
    console.log(`[OTA] deviceType=${deviceType}`);
    emit('handshake', 0, deviceType);

    // --- Step 2: request device-appropriate MTU --------------------------
    // BK8010 → 247, BK8010H → 512. requestMTU resolves once the GATT MTU
    // change has landed; on iOS this is a no-op and current MTU stands.
    emit('negotiating-mtu', 0, deviceType);
    const targetMtu = deviceType === 'BK8010H' ? 512 : 247;
    try {
      device = await device.requestMTU(targetMtu);
      console.log(
        `[OTA] requestMTU(${targetMtu}) → negotiated MTU=${device.mtu}`
      );
    } catch (err) {
      console.log(
        `[OTA] requestMTU(${targetMtu}) failed/ignored:`,
        (err as Error)?.message ?? err
      );
    }
    const mtu = device.mtu ?? initialMtu;
    chunkSize = mtu - 3;
    const firmwareChunkSize = mtu - 3 - 9;
    if (firmwareChunkSize <= 0) {
      throw new Error(`OTA: negotiated MTU ${mtu} is too small to flash`);
    }
    console.log(
      `[OTA] MTU=${mtu} chunk=${chunkSize} firmwareChunk=${firmwareChunkSize}`
    );

    // Re-request HIGH connection priority after MTU negotiation. Some
    // Android stacks reset the interval to ~30 ms once MTU changes; with
    // ~7.5 ms intervals each write→notify round-trip shortens from
    // ~225 ms to ~60 ms. No-op on iOS.
    try {
      await device.requestConnectionPriority(ConnectionPriority.High);
      console.log('[OTA] Connection priority set to HIGH');
    } catch (err) {
      console.log(
        '[OTA] requestConnectionPriority(HIGH) failed/ignored:',
        (err as Error)?.message ?? err
      );
    }

    // --- Step 3: GET_STR_BASE → learn current running bank addr ---------
    await writePacket(
      device,
      buildOperationHeader(OTA_OP_GET_STR_BASE, 0, 0),
      chunkSize
    );
    const gsbResp = await queue.next();
    const currentAddr = parseAddr(gsbResp);
    const targetAddr = pickTargetAddress(deviceType, currentAddr);
    console.log(
      `[OTA] currentAddr=0x${currentAddr.toString(16)} targetAddr=0x${targetAddr.toString(16)}`
    );

    // --- Step 4: page-erase enough 4 KB pages to cover the firmware ------
    emit('erasing', 0, deviceType);
    const pageCount = Math.ceil(firmwareBytes.length / FLASH_PAGE_SIZE);
    const eraseStartedAt = Date.now();
    console.log(
      `[OTA] Erasing ${pageCount} pages (${fmtKB(pageCount * FLASH_PAGE_SIZE)}) starting at 0x${targetAddr.toString(16)}…`
    );
    let eraseAddr = targetAddr;
    for (let i = 0; i < pageCount; i++) {
      if (isCancelled?.()) {
        console.log(`[OTA] Cancel requested during erase (page ${i + 1}/${pageCount})`);
        throw new OTACancelled();
      }
      await writePacket(
        device,
        buildOperationHeader(OTA_OP_PAGE_ERASE, 0, eraseAddr),
        chunkSize
      );
      await queue.next();
      eraseAddr += FLASH_PAGE_SIZE;
      // Log every quarter of progress, at least every 16 pages, and the last one.
      const step = Math.max(1, Math.floor(pageCount / 4));
      if ((i + 1) % step === 0 || i + 1 === pageCount) {
        console.log(`[OTA] Erased ${i + 1}/${pageCount} pages`);
      }
    }
    console.log(
      `[OTA] Erase complete in ${((Date.now() - eraseStartedAt) / 1000).toFixed(1)}s`
    );

    // --- Step 5: stream firmware body -----------------------------------
    // `length` field per chunk = actual payload bytes (the Java code
    // passes `read_count` to send_data). The band notifies after every
    // WRITE_DATA; we wait for that notification before sending the next.
    emit('writing-firmware', 0, deviceType);
    const writeStartedAt = Date.now();
    const expectedChunkCount = Math.ceil(
      firmwareBytes.length / firmwareChunkSize
    );
    console.log(
      `[OTA] Writing firmware: ~${expectedChunkCount} chunks × ${firmwareChunkSize} bytes`
    );
    let offset = 0;
    let writeAddr = targetAddr;
    let lastReadCount = 0;
    let chunkIdx = 0;
    let lastLogAt = Date.now();
    let lastLogOffset = 0;
    while (offset < firmwareBytes.length) {
      if (isCancelled?.()) {
        console.log(
          `[OTA] Cancel requested during write (offset ${offset}/${firmwareBytes.length}, chunk ${chunkIdx}/${expectedChunkCount})`
        );
        throw new OTACancelled();
      }

      const take = Math.min(firmwareChunkSize, firmwareBytes.length - offset);
      const slice = firmwareBytes.slice(offset, offset + take);
      const header = buildOperationHeader(OTA_OP_WRITE_DATA, take, writeAddr);

      // Latency breakdown at a few checkpoints: isolates whether the
      // slowness is in the write-ack path, the band's notify path, or
      // changes over the course of the flash (e.g. flash-buffer fill).
      const probeChunk =
        chunkIdx < 3 ||
        chunkIdx === 10 ||
        chunkIdx === 50 ||
        chunkIdx === 100 ||
        chunkIdx === 300 ||
        chunkIdx === 600;
      const tStart = probeChunk ? Date.now() : 0;
      await writePacket(device, concatBytes(header, slice), chunkSize);
      const tAfterWrite = probeChunk ? Date.now() : 0;
      await queue.next();
      if (probeChunk) {
        const tAfterNotify = Date.now();
        console.log(
          `[OTA] chunk ${chunkIdx} latency: write=${tAfterWrite - tStart}ms notify=${tAfterNotify - tAfterWrite}ms total=${tAfterNotify - tStart}ms`
        );
      }

      offset += take;
      writeAddr += take;
      lastReadCount = take;
      chunkIdx++;
      emit('writing-firmware', offset, deviceType);

      // Periodic progress + throughput log. Rate-limited to ~every 2
      // seconds so big firmware images don't flood the console.
      const now = Date.now();
      if (now - lastLogAt >= 2000 || offset === firmwareBytes.length) {
        const deltaBytes = offset - lastLogOffset;
        const deltaMs = now - lastLogAt;
        const throughputKbps =
          deltaMs > 0 ? (deltaBytes / deltaMs) * 1000 / 1024 : 0;
        const pct = ((offset / firmwareBytes.length) * 100).toFixed(1);
        console.log(
          `[OTA] Writing ${pct}% (${offset}/${firmwareBytes.length} bytes, chunk ${chunkIdx}/${expectedChunkCount}, ${throughputKbps.toFixed(2)} KB/s)`
        );
        lastLogAt = now;
        lastLogOffset = offset;
      }
    }
    const writeElapsedSec = (Date.now() - writeStartedAt) / 1000;
    const avgKbps = firmwareBytes.length / 1024 / writeElapsedSec;
    console.log(
      `[OTA] Write complete in ${writeElapsedSec.toFixed(1)}s (avg ${avgKbps.toFixed(2)} KB/s)`
    );

    // --- Step 6: tail sync — last notify's addr should be the start of
    //             the final chunk, i.e. writeAddr - lastReadCount.
    emit('finalising', offset, deviceType);
    const expectedTailAddr = (writeAddr - lastReadCount) >>> 0;
    const latest = queue.latest;
    if (latest) {
      const seen = parseAddr(latest);
      if (seen !== expectedTailAddr) {
        console.log(
          `[OTA] tail sync mismatch: expected 0x${expectedTailAddr.toString(16)}, got 0x${seen.toString(16)} — waiting for one more notify…`
        );
        // Give the band one more notification to catch up.
        const more = await queue.next(2000);
        const seen2 = parseAddr(more);
        if (seen2 !== expectedTailAddr) {
          throw new Error(
            `OTA tail sync mismatch: expected 0x${expectedTailAddr.toString(16)}, got 0x${seen2.toString(16)}`
          );
        }
      }
    }

    // --- Step 7: REBOOT with length + CRC32 ------------------------------
    emit('rebooting', offset, deviceType);
    const crc = crc32BekenFile(firmwareBytes);
    console.log(
      `[OTA] rebooting with length=${firmwareBytes.length} crc=0x${crc.toString(16)}`
    );
    await writePacket(
      device,
      buildRebootPacket(firmwareBytes.length, crc),
      chunkSize
    );

    const totalElapsedSec = (Date.now() - runStartedAt) / 1000;
    console.log(
      `[OTA] === OTA complete in ${totalElapsedSec.toFixed(1)}s === band is rebooting`
    );
    emit('done', offset, deviceType);
  } finally {
    try {
      subscription.remove();
    } catch {
      /* ignore teardown errors */
    }
  }
};
