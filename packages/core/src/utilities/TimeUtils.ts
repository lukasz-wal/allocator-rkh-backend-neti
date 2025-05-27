/**
 * Convert an epoch timestamp (seconds or milliseconds) to an ISO 8601 Zulu string.
 *
 * If the input is ≤ 1e12 it’s assumed to be seconds; otherwise milliseconds.
 *
 * @param epoch – Number of seconds or milliseconds since Unix epoch.
 * @returns ISO 8601 timestamp in Zulu (UTC)
 */
export function epochToZulu(epoch: number): string {
  const ms = epoch > 1e12 ? epoch : epoch * 1000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) {
    console.log(`Error in epochToZulu: Invalid timestamp: "${epoch}"`);
    return "1970-01-01T00:00:01Z";
  }
  return d.toISOString();
}

/**
 * Convert an ISO 8601 Zulu string to a Unix epoch timestamp in seconds.
 *
 * @param zulu – ISO 8601 timestamp, e.g. "2025-05-15T17:25:32Z" or with milliseconds.
 * @returns Number of seconds since Unix epoch, or 0 on error.
 */
export function zuluToEpoch(zulu: string): number {
  const ms = Date.parse(zulu);
  if (isNaN(ms)) {
    console.log(`Error in zuluToEpoch: Invalid Zulu timestamp: "${zulu}"`);
    return 0;
  }
  return Math.floor(ms / 1000);
}