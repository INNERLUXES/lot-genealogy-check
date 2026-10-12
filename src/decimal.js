// Amounts as the files write them: decimal numbers read from the characters of a file into a whole number and a scale,
// added, taken away, multiplied and compared with BigInt and never through a floating point number, so that holdings of
// 0.1 and 0.2 add up to a supply of 0.3 and a holding of 1000.000000000000000001 is above a cap of 1000. A number with
// an exponent, a sign, a thousands separator or more digits than the limit is not read.

export const DECIMAL_LIMITS = { maxDigits: 40 };

const PLAIN = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/;

// The value of a plain decimal text: { int, scale } with value = int / 10^scale, or null when the text is not a plain
// decimal of at most maxDigits digits before and after the point.
export function parseDecimal(raw, limits = DECIMAL_LIMITS) {
  const m = PLAIN.exec(raw);
  if (!m) return null;
  const whole = m[1];
  const frac = m[2] ?? '';
  if (whole.length > limits.maxDigits || frac.length > limits.maxDigits) return null;
  return { int: BigInt(`${whole}${frac}`), scale: frac.length };
}

// -1, 0 or 1 as a is below, equal to or above b.
export function compareDecimal(a, b) {
  const left = a.int * 10n ** BigInt(b.scale);
  const right = b.int * 10n ** BigInt(a.scale);
  return left < right ? -1 : left > right ? 1 : 0;
}

// The sum of two decimals, exact, at the larger of the two scales.
export function addDecimal(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { int: a.int * 10n ** BigInt(scale - a.scale) + b.int * 10n ** BigInt(scale - b.scale), scale };
}

// a less b, exact, at the larger of the two scales; the caller makes sure that b is not above a.
export function subDecimal(a, b) {
  const scale = Math.max(a.scale, b.scale);
  return { int: a.int * 10n ** BigInt(scale - a.scale) - b.int * 10n ** BigInt(scale - b.scale), scale };
}

// The product of two decimals, exact.
export const mulDecimal = (a, b) => ({ int: a.int * b.int, scale: a.scale + b.scale });

// A decimal divided by 100, exact: a percent as a share.
export const percentOf = (d) => ({ int: d.int, scale: d.scale + 2 });

export const ZERO = { int: 0n, scale: 0 };

export const isZero = (d) => d.int === 0n;

// The number of decimal places a value needs: the digits after the point with trailing zeros left out, so 1500.50 needs
// 1 and 1500.00 needs 0.
export function placesOf(d) {
  let { int, scale } = d;
  while (scale > 0 && int % 10n === 0n) {
    int /= 10n;
    scale -= 1;
  }
  return scale;
}

// A decimal in its shortest form: no trailing zeros after the point, and no point when nothing follows it.
export function formatDecimal(d) {
  const s = d.int.toString().padStart(d.scale + 1, '0');
  if (d.scale === 0) return s;
  const whole = s.slice(0, s.length - d.scale);
  const frac = s.slice(s.length - d.scale).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole;
}
