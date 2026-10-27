/**
 * Science of Gifts - Product Mockup Image Validation, Compression & Management Utilities
 * Handles client-side file validation, Canvas-based downscaling/compression,
 * deterministic content hashing, and primary-image selection.
 */

import { ProductMockupImage } from '../types/project';

export const ALLOWED_PRODUCT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export const MAX_RAW_PRODUCT_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB raw upload limit
export const MAX_COMPRESSED_DIMENSION_PX = 900;
export const DEFAULT_COMPRESSION_QUALITY = 0.78;
export const MAX_MOCKUP_IMAGES_PER_PRODUCT = 6;

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export interface CompressedMockupResult {
  dataUrl: string;
  mimeType: string;
  width: number;
  height: number;
  compressedSizeBytes: number;
  contentHash: string;
}

/**
 * Validates an uploaded file's MIME type and size before reading/compressing.
 */
export function validateProductImageFile(file: {
  name: string;
  type: string;
  size: number;
}): ImageValidationResult {
  if (!file || typeof file.size !== 'number') {
    return { valid: false, error: 'Invalid image file provided.' };
  }

  if (file.size <= 0) {
    return { valid: false, error: `File "${file.name || 'image'}" is empty.` };
  }

  if (file.size > MAX_RAW_PRODUCT_IMAGE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File "${file.name}" (${sizeMb} MB) exceeds the 15 MB upload limit.`,
    };
  }

  const normalizedMime = (file.type || '').toLowerCase().trim();
  const isAllowedMime = ALLOWED_PRODUCT_IMAGE_MIME_TYPES.includes(
    normalizedMime as (typeof ALLOWED_PRODUCT_IMAGE_MIME_TYPES)[number]
  );

  // Fallback check on file extension if browser omits MIME type
  const extMatch = (file.name || '').toLowerCase().match(/\.(jpe?g|png|webp|gif)$/);

  if (!isAllowedMime && !extMatch) {
    return {
      valid: false,
      error: `Unsupported file type "${file.type || file.name}". Please upload a PNG, JPEG, WebP, or GIF mockup image.`,
    };
  }

  return { valid: true };
}

/**
 * Deterministic 32-bit FNV-1a hash formatted as a hex string.
 * Used to fingerprint compressed image payloads without storing raw base64 in version snapshots.
 */
export function computeSimpleContentHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}-${input.length}`;
}

/**
 * Parses a data:image/...;base64,... URL into its MIME type and raw base64 payload.
 */
export function extractBase64AndMimeFromDataUrl(
  dataUrl: string
): { mimeType: string; base64Data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  const match = trimmed.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  const base64Data = match[2].replace(/\s+/g, '');
  if (!base64Data) return null;
  return { mimeType, base64Data };
}

/**
 * Estimates binary byte size from a base64 string or data URL.
 */
export function estimateDataUrlByteSize(dataUrl: string): number {
  const parsed = extractBase64AndMimeFromDataUrl(dataUrl);
  const b64 = parsed ? parsed.base64Data : dataUrl;
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

/**
 * Calculates target dimensions preserving aspect ratio within maxDimension.
 */
export function calculateTargetDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number = MAX_COMPRESSED_DIMENSION_PX
): { width: number; height: number } {
  const safeW = Math.max(1, Math.round(srcWidth || 1));
  const safeH = Math.max(1, Math.round(srcHeight || 1));
  const safeMax = Math.max(64, maxDimension);

  if (safeW <= safeMax && safeH <= safeMax) {
    return { width: safeW, height: safeH };
  }

  if (safeW >= safeH) {
    const ratio = safeMax / safeW;
    return {
      width: safeMax,
      height: Math.max(1, Math.round(safeH * ratio)),
    };
  } else {
    const ratio = safeMax / safeH;
    return {
      width: Math.max(1, Math.round(safeW * ratio)),
      height: safeMax,
    };
  }
}

/**
 * Compresses a dataUrl image using browser Canvas when available,
 * or falls back deterministically in non-DOM environments (such as Node unit tests).
 */
export async function compressProductMockupDataUrl(
  dataUrl: string,
  options?: {
    maxDimension?: number;
    quality?: number;
  }
): Promise<CompressedMockupResult> {
  const parsed = extractBase64AndMimeFromDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('Invalid image data URL format.');
  }

  const maxDimension = options?.maxDimension ?? MAX_COMPRESSED_DIMENSION_PX;
  const quality = options?.quality ?? DEFAULT_COMPRESSION_QUALITY;

  // Check if running in a browser DOM environment with Image and HTMLCanvasElement support
  const hasBrowserCanvas =
    typeof window !== 'undefined' &&
    typeof document !== 'undefined' &&
    typeof Image !== 'undefined' &&
    typeof document.createElement === 'function';

  if (hasBrowserCanvas) {
    try {
      const result = await new Promise<CompressedMockupResult>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          try {
            const { width, height } = calculateTargetDimensions(
              img.naturalWidth || img.width || 600,
              img.naturalHeight || img.height || 600,
              maxDimension
            );
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Canvas 2D context unavailable'));
              return;
            }
            // Fill subtle white/neutral background for transparent images if converting to JPEG,
            // or preserve alpha via WebP when supported
            ctx.drawImage(img, 0, 0, width, height);

            let outDataUrl = canvas.toDataURL('image/webp', quality);
            let outMime = 'image/webp';
            if (!outDataUrl.startsWith('data:image/webp')) {
              outDataUrl = canvas.toDataURL('image/jpeg', quality);
              outMime = 'image/jpeg';
            }

            // If original dataUrl is already smaller than re-encoded canvas output and within dimension bounds, keep smaller
            const originalBytes = estimateDataUrlByteSize(dataUrl);
            const compressedBytes = estimateDataUrlByteSize(outDataUrl);
            const useOriginal =
              originalBytes <= compressedBytes &&
              (img.naturalWidth || 0) <= maxDimension &&
              (img.naturalHeight || 0) <= maxDimension;

            const finalDataUrl = useOriginal ? dataUrl : outDataUrl;
            const finalMime = useOriginal ? parsed.mimeType : outMime;
            const finalBytes = useOriginal ? originalBytes : compressedBytes;

            resolve({
              dataUrl: finalDataUrl,
              mimeType: finalMime,
              width,
              height,
              compressedSizeBytes: finalBytes,
              contentHash: computeSimpleContentHash(finalDataUrl),
            });
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Failed to decode image for compression.'));
        img.src = dataUrl;
      });
      return result;
    } catch {
      // Fall through to deterministic fallback if Canvas fails in headless environment
    }
  }

  const byteSize = estimateDataUrlByteSize(dataUrl);
  return {
    dataUrl: `data:${parsed.mimeType};base64,${parsed.base64Data}`,
    mimeType: parsed.mimeType,
    width: Math.min(600, maxDimension),
    height: Math.min(600, maxDimension),
    compressedSizeBytes: byteSize,
    contentHash: computeSimpleContentHash(parsed.base64Data),
  };
}

/**
 * Reads a File object into a compressed ProductMockupImage record.
 */
export async function processUploadedMockupFile(
  file: File,
  makePrimary = false
): Promise<ProductMockupImage> {
  const validation = validateProductImageFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image file.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read image file as data URL.'));
      }
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });

  const compressed = await compressProductMockupDataUrl(rawDataUrl);

  return {
    id: `mockup-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name || 'product-mockup.webp',
    mimeType: compressed.mimeType,
    isPrimary: makePrimary,
    width: compressed.width,
    height: compressed.height,
    originalSizeBytes: file.size,
    compressedSizeBytes: compressed.compressedSizeBytes,
    contentHash: compressed.contentHash,
    addedAt: new Date().toISOString(),
    dataUrl: compressed.dataUrl,
  };
}

/**
 * Ensures exactly one mockup image is marked as primary when the list is non-empty.
 */
export function ensureSinglePrimaryImage(images: ProductMockupImage[]): ProductMockupImage[] {
  if (!Array.isArray(images) || images.length === 0) return [];
  const primaryIdx = images.findIndex((img) => Boolean(img.isPrimary));
  const activePrimaryIdx = primaryIdx >= 0 ? primaryIdx : 0;
  return images.map((img, idx) => ({
    ...img,
    isPrimary: idx === activePrimaryIdx,
  }));
}

/**
 * Sets the specified mockup image ID as the primary image.
 */
export function setPrimaryMockupImage(
  images: ProductMockupImage[],
  targetId: string
): ProductMockupImage[] {
  if (!Array.isArray(images) || images.length === 0) return [];
  const exists = images.some((img) => img.id === targetId);
  if (!exists) return ensureSinglePrimaryImage(images);
  return images.map((img) => ({
    ...img,
    isPrimary: img.id === targetId,
  }));
}

/**
 * Removes a mockup image by ID and promotes the first remaining image to primary if needed.
 */
export function removeMockupImage(
  images: ProductMockupImage[],
  targetId: string
): ProductMockupImage[] {
  if (!Array.isArray(images) || images.length === 0) return [];
  const filtered = images.filter((img) => img.id !== targetId);
  return ensureSinglePrimaryImage(filtered);
}
