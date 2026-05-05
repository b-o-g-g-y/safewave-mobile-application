/**
 * FirmwareRepository — discovers the latest firmware and produces
 * the `.bin` bytes ready to be flashed via OTAManager.
 *
 * Source of truth: Firestore `GlobalVariables/FirmwareUpdate` document
 * (`FirmwareUpdateDocument`), which carries `{ updateAvailable, version,
 * url }`. The `url` is a direct download link to the binary.
 */

import { File, Paths, Directory } from 'expo-file-system';
import { FirestoreService } from '../firebase/FirestoreService';
import { FirmwareUpdateDocument } from '../../types/user';

export interface FirmwareManifest {
  version: string;
  url: string;
  updateAvailable: boolean;
}

const OTA_CACHE_DIR = 'ota';

const safeFileNameForUrl = (url: string, version: string): string => {
  // Prefer a deterministic name keyed on version so repeated fetches hit the cache.
  const cleanVersion = version.replace(/[^a-zA-Z0-9._-]+/g, '_') || 'latest';
  return `safewave-${cleanVersion}.bin`;
};

export const FirmwareRepository = {
  /**
   * Fetch the latest firmware manifest from Firestore.
   * Returns null if the document does not exist.
   */
  getManifest: async (): Promise<FirmwareManifest | null> => {
    const doc: FirmwareUpdateDocument | null =
      await FirestoreService.getFirmwareInfo();
    if (!doc) return null;
    return {
      version: doc.version,
      url: doc.url,
      updateAvailable: doc.updateAvailable,
    };
  },

  /**
   * Download (or reuse from cache) the firmware binary for a manifest and
   * return its raw bytes. The file is persisted in the app's cache dir.
   */
  fetchFirmwareBytes: async (manifest: FirmwareManifest): Promise<Uint8Array> => {
    const dir = new Directory(Paths.cache, OTA_CACHE_DIR);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });

    const fileName = safeFileNameForUrl(manifest.url, manifest.version);
    const cached = new File(dir, fileName);

    if (!cached.exists) {
      await File.downloadFileAsync(manifest.url, cached, { idempotent: true });
    }

    if (!cached.exists || cached.size === 0) {
      throw new Error('Firmware file missing or empty after download');
    }

    return await cached.bytes();
  },

  /**
   * Convenience — manifest + bytes in one call.
   */
  fetchLatest: async (): Promise<{
    manifest: FirmwareManifest;
    bytes: Uint8Array;
  } | null> => {
    const manifest = await FirmwareRepository.getManifest();
    if (!manifest) return null;
    const bytes = await FirmwareRepository.fetchFirmwareBytes(manifest);
    return { manifest, bytes };
  },
};
