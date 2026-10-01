// WCAG contrast for Mudaala's actual OKLCH tokens (grounded palette critique)
// OKLab -> linear sRGB (standard Björn Ottosson math), then WCAG relative luminance.

function oklchToSrgb(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  let bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const toGamma = (c: number) => {
    c = Math.min(1, Math.max(0, c));
    return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  };
  return [toGamma(r), toGamma(g), toGamma(bb)];
}

function relLum([r, g, b]: [number, number, number]): number {
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = relLum(fg), l2 = relLum(bg);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const pairs: Array<[string, string, string]> = [
  // name, fg, bg  (oklch strings)
  ["LIGHT body text / background", "oklch(0.235 0.012 95)", "oklch(0.977 0.004 85)"],
  ["LIGHT muted meta / background", "oklch(0.51 0.014 90)", "oklch(0.977 0.004 85)"],
  ["LIGHT muted meta / card", "oklch(0.51 0.014 90)", "oklch(0.995 0.002 90)"],
  ["LIGHT white text / primary button", "oklch(0.985 0.005 120)", "oklch(0.40 0.075 155)"],
  ["LIGHT accent-foreground / accent badge", "oklch(0.34 0.07 155)", "oklch(0.94 0.025 150)"],
  ["LIGHT primary green as text / background (price)", "oklch(0.40 0.075 155)", "oklch(0.977 0.004 85)"],
  ["DARK body text / background", "oklch(0.96 0.004 90)", "oklch(0.185 0.01 100)"],
  ["DARK muted meta / background", "oklch(0.68 0.01 90)", "oklch(0.185 0.01 100)"],
  ["DARK primary button text / dark primary", "oklch(0.19 0.03 155)", "oklch(0.72 0.11 152)"],
];

function parse(s: string): [number, number, number] {
  const m = s.match(/oklch\([\d.]+ ([\d.]+) ([\d.]+)\)/)!;
  const L = parseFloat(s.match(/oklch\(([\d.]+)/)![1]);
  return oklchToSrgb(L, parseFloat(m[1]), parseFloat(m[2]));
}

for (const [name, fg, bg] of pairs) {
  const c = contrast(parse(fg), parse(bg));
  const aa = c >= 4.5 ? "AA ✓" : c >= 3 ? "AA-large only ⚠" : "FAIL ✗";
  console.log(`${name.padEnd(52)} ${c.toFixed(2)}:1  ${aa}`);
}
