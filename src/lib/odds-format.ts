export function decimalToAmericanOdds(
  decimalOdds: number | null | undefined
): number | null {
  if (
    decimalOdds === null ||
    decimalOdds === undefined ||
    !Number.isFinite(decimalOdds) ||
    decimalOdds <= 1
  ) {
    return null;
  }

  return decimalOdds >= 2
    ? Math.round((decimalOdds - 1) * 100)
    : Math.round(-100 / (decimalOdds - 1));
}

export function formatAmericanOdds(
  decimalOdds: number | null | undefined,
  fallback = "—"
): string {
  const americanOdds = decimalToAmericanOdds(decimalOdds);
  if (americanOdds === null) return fallback;
  return americanOdds > 0 ? `+${americanOdds}` : String(americanOdds);
}
