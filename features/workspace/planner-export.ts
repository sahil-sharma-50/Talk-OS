import type { PlannerTask } from "./workspace.types";

export function findPlannerConflicts(tasks: PlannerTask[]): Array<[string, string]> {
  const scheduled = tasks.filter((task) => task.startsAt && task.endsAt);
  const conflicts: Array<[string, string]> = [];
  for (let left = 0; left < scheduled.length; left += 1) for (let right = left + 1; right < scheduled.length; right += 1) {
    if (Date.parse(scheduled[left].startsAt!) < Date.parse(scheduled[right].endsAt!) && Date.parse(scheduled[right].startsAt!) < Date.parse(scheduled[left].endsAt!)) conflicts.push([scheduled[left].id, scheduled[right].id]);
  }
  return conflicts;
}

const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\r\n|\r|\n/g, "\\n");
const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
export function exportPlannerIcs(tasks: PlannerTask[], timezone: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TalkOS//Planner//EN", `X-WR-TIMEZONE:${escapeIcs(timezone)}`];
  const stamp = icsDate(new Date().toISOString());
  tasks.filter((task) => task.startsAt && task.endsAt && Number.isFinite(Date.parse(task.startsAt)) && Date.parse(task.endsAt) > Date.parse(task.startsAt)).forEach((task) => lines.push(
    "BEGIN:VEVENT", `UID:${escapeIcs(task.id)}@talkos.local`, `DTSTAMP:${stamp}`, `DTSTART:${icsDate(task.startsAt!)}`, `DTEND:${icsDate(task.endsAt!)}`,
    `SUMMARY:${escapeIcs(task.title)}`, ...(() => { const details = [task.notes, task.blockedReason ? `Blocked: ${task.blockedReason}` : "", task.riskLevel ? `Risk: ${task.riskLevel}` : ""].filter(Boolean).join("\n"); return details ? [`DESCRIPTION:${escapeIcs(details)}`] : []; })(), "END:VEVENT",
  ));
  lines.push("END:VCALENDAR");
  const encoder = new TextEncoder();
  const folded = lines.map((line) => {
    let output = ""; let bytes = 0;
    for (const character of line) {
      const length = encoder.encode(character).length;
      if (bytes + length > 75) { output += "\r\n "; bytes = 1; }
      output += character; bytes += length;
    }
    return output;
  });
  return `${folded.join("\r\n")}\r\n`;
}
