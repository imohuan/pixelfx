// 纯数值逻辑，不依赖 DOM，方便单独测试。

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function decimalsOf(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const text = String(n);
  if (text.includes("e-")) {
    const [mantissa, exponent] = text.split("e-");
    const fraction = mantissa.includes(".") ? mantissa.split(".")[1].length : 0;
    return fraction + Number(exponent);
  }
  return text.includes(".") ? text.split(".")[1].length : 0;
}

export function normalizeConfig(options = {}) {
  const pick = (value, fallback) => {
    if (value === undefined || value === null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };

  let min = pick(options.min, 0);
  let max = pick(options.max, 100);
  let step = pick(options.step, 1);
  if (max < min) [min, max] = [max, min];
  if (!(step > 0)) step = 1;

  let decimals = Math.max(decimalsOf(step), decimalsOf(min));
  if (options.precision !== undefined && options.precision !== null && options.precision !== "") {
    const precision = Number(options.precision);
    if (Number.isFinite(precision)) decimals = Math.trunc(precision);
  }
  decimals = Math.max(0, Math.min(12, decimals));

  return { min, max, step, decimals };
}

function roundTo(value, decimals) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

export function quantize(value, config) {
  const { min, max, step, decimals } = config;
  const n = Number(value);
  const base = Number.isFinite(n) ? clamp(n, min, max) : min;
  if (!(step > 0)) return roundTo(base, decimals);

  let cells = Math.round((base - min) / step);
  let out = min + cells * step;
  while (out > max + step * 1e-9 && cells > 0) {
    cells -= 1;
    out = min + cells * step;
  }
  if (out < min) out = min;
  return roundTo(out, decimals);
}

export function formatNumber(value, decimals = 0) {
  if (!Number.isFinite(value)) return "";
  const places = Math.max(0, Math.min(12, decimals));
  let out = value.toFixed(places);
  if (places > 0) out = out.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  if (out === "-0") out = "0";
  return out;
}

export function parseNumber(text) {
  const cleaned = String(text ?? "").trim().replace(/\s+/g, "");
  if (!cleaned || cleaned === "-" || cleaned === "+" || cleaned === "." || cleaned === "-.") {
    return NaN;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function percentOf(value, config) {
  const span = config.max - config.min;
  if (!(span > 0)) return 0;
  return clamp((value - config.min) / span, 0, 1) * 100;
}

export function dragFactor(event) {
  if (!event) return 1;
  if (event.shiftKey) return 4;
  if (event.ctrlKey || event.metaKey) return 0.25;
  return 1;
}

export function keyFactor(event) {
  if (!event) return 1;
  if (event.shiftKey) return 10;
  if (event.ctrlKey || event.metaKey) return 0.25;
  return 1;
}
