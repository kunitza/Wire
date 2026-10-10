/** Color helpers shared by the Lists, Meals and Recipes screens. */

function hexToHsl(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = parseInt(
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h.slice(0, 6),
    16,
  );
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let hue = 0;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return [hue * 60, s, l];
}

/**
 * A stronger version of a (often pastel) color, readable with white text:
 * used for count badges, category letter dots and filled checkboxes.
 */
export function strong(hex: string, maxLightness = 0.58): string {
  try {
    const [h, s, l] = hexToHsl(hex);
    const sat = s < 0.08 ? s : Math.max(s * 0.85, 0.5);
    return `hsl(${Math.round(h)}, ${Math.round(sat * 100)}%, ${Math.round(Math.min(l, maxLightness) * 100)}%)`;
  } catch {
    return hex;
  }
}
