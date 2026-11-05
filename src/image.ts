// A picture from the device, made small enough to go into the group's picture,
// which takes at most 1,000,000 characters as a `data:` address. The group's
// picture is also its avatar, so every list that shows the group loads it too.

export const MAX_PICTURE_CHARS = 1_000_000;
const MAX_SIDE = 1080;
const QUALITIES = [0.82, 0.7, 0.55, 0.4];

/** The size that keeps the picture's shape and fits `MAX_SIDE`. */
export function fittedSize(width: number, height: number, side = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, side / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) return createImageBitmap(file);

  const image = new Image();
  image.src = URL.createObjectURL(file);
  await image.decode();
  return image;
}

/** A JPEG `data:` address for the file, or null when it is no picture this browser can read. */
export async function shrinkImage(file: File): Promise<string | null> {
  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = fittedSize(bitmap.width, bitmap.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) return null;

    // JPEG has no transparency, and an empty canvas turns black in it.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    for (const quality of QUALITIES) {
      const address = canvas.toDataURL('image/jpeg', quality);
      if (address.length <= MAX_PICTURE_CHARS) return address;
    }

    return null;
  } catch {
    return null;
  }
}
