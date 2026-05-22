export type MetadataEntry = { key: string; value: string };

export function MetadataToArray(
  metadata: Record<string, string> | null | undefined
): MetadataEntry[] {
  if (!metadata || Object.keys(metadata).length === 0) {
    return [{ key: '', value: '' }];
  }
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value: String(value),
  }));
}

export function MetadataFromArray(
  entries: MetadataEntry[]
): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.key !== '') {
      metadata[entry.key] = entry.value;
    }
  }
  return metadata;
}
