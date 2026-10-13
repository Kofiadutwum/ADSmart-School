/** Money is kept in pesewas (GH₵1 = 100) and shown in cedis. */
export function ghs(pesewas: number | null | undefined): string {
  const value = (pesewas ?? 0) / 100;
  return `GH₵${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "12.5" → 1250. Returns null for anything that isn't an amount. */
export function toPesewas(text: string): number | null {
  const cleaned = text.replaceAll(",", "").trim();
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** 1250 → "12.50", for an input's starting value. */
export function toCedis(pesewas: number | null | undefined): string {
  return pesewas === null || pesewas === undefined ? "" : (pesewas / 100).toFixed(2);
}
