// Client-side downscale before upload. Supabase Storage's free tier has no
// on-the-fly image transformation (that's a paid-plan feature) -- doing the
// resize here instead of adding a server-side image library (sharp, a new
// backend dependency) keeps the backend simple and cuts upload bandwidth,
// at the cost of the browser doing the work instead of the CDN. Good
// enough for headshots/logos, which never need to be large.

const MAX_DIMENSION = 512;
const JPEG_QUALITY = 0.85;

// Resolves to a resized JPEG Blob no larger than MAX_DIMENSION on its
// longest side (smaller originals are left at their own size, never
// upscaled). Rejects on anything that isn't a decodable image.
function resizeImageFile(file, maxDimension = MAX_DIMENSION) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))),
        'image/jpeg',
        JPEG_QUALITY,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('That file is not a readable image'));
    };
    img.src = objectUrl;
  });
}

export { resizeImageFile };
