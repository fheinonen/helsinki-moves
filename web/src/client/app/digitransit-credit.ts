const CREDIT_TIME_ZONE = "Europe/Helsinki";

export function formatDigitransitCredit(receivedAtIso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: CREDIT_TIME_ZONE,
    year: "numeric",
  }).formatToParts(new Date(receivedAtIso));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = String(value.year);
  const month = String(value.month);
  const day = String(value.day);
  const hour = String(value.hour);
  const minute = String(value.minute);
  const second = String(value.second);
  return `Data © Digitransit ${year}, received ${year}-${month}-${day} ${hour}:${minute}:${second}.`;
}
