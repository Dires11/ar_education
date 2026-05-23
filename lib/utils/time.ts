// Must run in browser — uses the browser's local timezone for conversion.

export function localTimeToUTC(localHHmm: string): string {
  const [h, m] = localHHmm.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return `${d.getUTCHours().toString().padStart(2, "0")}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
}

export function utcTimeToLocal(utcHHmm: string): string {
  const [h, m] = utcHHmm.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
