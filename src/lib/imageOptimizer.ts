/**
 * Client-side image optimization utilities
 * - Converts images to WebP format
 * - Caps max dimensions while preserving aspect ratio
 */

const MAX_DIMENSION = 1920; // Max width or height
const WEBP_QUALITY = 0.85; // WebP quality (0-1)

interface OptimizedImage {
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  fileName: string;
}

/**
 * Optimizes an image file: resizes if needed and converts to WebP
 */
export async function optimizeImage(
  file: File | Blob,
  originalFileName: string
): Promise<OptimizedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width: originalWidth, height: originalHeight } = img;
      let { width, height } = img;

      // Scale down if either dimension exceeds max
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Create canvas and draw scaled image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to WebP
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Failed to create WebP blob"));
            return;
          }

          // Generate new filename with .webp extension
          const baseName = originalFileName.replace(/\.[^/.]+$/, "");
          const fileName = `${baseName}.webp`;

          resolve({
            blob,
            width,
            height,
            originalWidth,
            originalHeight,
            fileName,
          });
        },
        "image/webp",
        WEBP_QUALITY
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Optimizes an image from a base64 string
 */
export async function optimizeImageFromBase64(
  base64: string,
  contentType: string,
  originalFileName: string
): Promise<OptimizedImage> {
  // Convert base64 to Blob
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: contentType });

  return optimizeImage(blob, originalFileName);
}
