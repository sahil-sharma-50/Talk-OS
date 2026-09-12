import type { PlannerTask } from "./workspace.types";

export function findPlannerConflicts(tasks: PlannerTask[]): Array<[string, string]> {
  const scheduled = tasks.filter((task) => task.startsAt && task.endsAt);
  const conflicts: Array<[string, string]> = [];
  for (let left = 0; left < scheduled.length; left += 1) for (let right = left + 1; right < scheduled.length; right += 1) {
    if (Date.parse(scheduled[left].startsAt!) < Date.parse(scheduled[right].endsAt!) && Date.parse(scheduled[right].startsAt!) < Date.parse(scheduled[left].endsAt!)) conflicts.push([scheduled[left].id, scheduled[right].id]);
  }
  return conflicts;
}

const escapeIcs = (value: string) => value.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
const icsDate = (value: string) => new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
export function exportPlannerIcs(tasks: PlannerTask[], timezone: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//TalkOS//Planner//EN", `X-WR-TIMEZONE:${escapeIcs(timezone)}`];
  tasks.filter((task) => task.startsAt && task.endsAt).forEach((task) => lines.push(
    "BEGIN:VEVENT", `UID:${escapeIcs(task.id)}@talkos.local`, `DTSTART:${icsDate(task.startsAt!)}`, `DTEND:${icsDate(task.endsAt!)}`,
    `SUMMARY:${escapeIcs(task.title)}`, ...(task.notes ? [`DESCRIPTION:${escapeIcs(task.notes)}`] : []), "END:VEVENT",
  ));
  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
