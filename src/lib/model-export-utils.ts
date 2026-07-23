export function resolveEvaluatedMatchCount(
  explicitCount: number,
  predictionCsv?: string
): number {
  if (!predictionCsv?.trim()) return explicitCount;

  const [, ...dataRows] = predictionCsv.trim().split(/\r?\n/);
  return dataRows.length || explicitCount;
}
