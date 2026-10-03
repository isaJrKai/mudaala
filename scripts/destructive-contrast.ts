// One-off: WCAG contrast of white text on the new warm destructive token,
// light + dark. oklch -> oklab -> linear sRGB -> relative luminance.
// (Locally-prefixed names - this file shares the tsc program with
// palette-contrast.ts, which already declares lum/contrast globals.)
function ocToRgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3
  let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  const lin = (c: number) => Math.min(1, Math.max(0, c))
  return [lin(r), lin(g), lin(bl)]
}
function lumOf([r, g, b]: [number, number, number]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function cr(a: number, b: number) {
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}
const white = 1.0
const light = lumOf(ocToRgb(0.55, 0.17, 26))
for (const L of [0.64, 0.6, 0.58, 0.57, 0.56]) {
  const d = lumOf(ocToRgb(L, 0.16, 26))
  console.log(`DARK candidate L=${L}:`, cr(white, d).toFixed(2) + ':1', cr(white, d) >= 4.5 ? 'AA ✓' : 'AA ✗')
}
const dark = lumOf(ocToRgb(0.56, 0.16, 26))
console.log('LIGHT white on destructive:', cr(white, light).toFixed(2) + ':1', cr(white, light) >= 4.5 ? 'AA ✓' : 'AA ✗')
console.log('DARK  white on destructive:', cr(white, dark).toFixed(2) + ':1', cr(white, dark) >= 4.5 ? 'AA ✓' : 'AA ✗')
// flash greens used in the subtotal flash, as text on bg-secondary/40 (≈ bg):
const gain = lumOf(ocToRgb(0.508, 0.118, 165)) // emerald-700 #047857
const bg = lumOf(ocToRgb(0.952, 0.006, 85))
console.log('flash green / background:', cr(gain, bg).toFixed(2) + ':1', cr(gain, bg) >= 4.5 ? 'AA ✓' : 'AA ✗')
