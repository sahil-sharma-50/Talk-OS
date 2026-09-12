type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function zonedParts(date: Date, timeZone: string): DateTimeParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function toPlannerDateTime(value: string | undefined, timeZone: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function fromPlannerDateTime(value: string, timeZone: string): string | undefined {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute] = match.map(Number);
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute);
  const wallClockValue = (instant: number) => {
    const shown = zonedParts(new Date(instant), timeZone);
    return Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  };
  const hourMs = 60 * 60 * 1000;
  const offsets = [...new Set([-36, -12, 0, 12, 36].map((hours) => {
    const probe = desiredWallClock + hours * hourMs;
    return Math.round((wallClockValue(probe) - probe) / 60_000);
  }))];
  const candidates = offsets.map((offset) => desiredWallClock - offset * 60_000);
  const exact = candidates.filter((instant) => wallClockValue(instant) === desiredWallClock).sort((left, right) => left - right);

  // A repeated fall-back wall time maps to two instants; use the earlier one.
  if (exact.length) return new Date(exact[0]).toISOString();

  // A spring-forward wall time does not exist. Normalize it forward by the gap,
  // matching the behavior users see in native date/time controls.
  const normalized = candidates
    .map((instant) => ({ instant, wallClock: wallClockValue(instant) }))
    .filter(({ wallClock }) => wallClock > desiredWallClock)
    .sort((left, right) => left.wallClock - right.wallClock || left.instant - right.instant)[0];
  return normalized ? new Date(normalized.instant).toISOString() : undefined;
}
