import type { WorkspaceView } from "@/features/session/session.types";

// Only a complete, standalone tab command can bypass model tool selection.
// Titles, conditions, negation and compound instructions stay with the agent.
export function directWorkspaceNavigation(request: string): WorkspaceView | null {
  const match = request.trim().match(/^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:open|show|switch(?: over)? to|go to)\s+(?:(?:my|the)\s+)?(documents?|docs?|sheets?|spreadsheets?|planners?|canvas|canvases|dashboards?|research|settings)(?:\s+(?:tab|workspace))?(?:,?\s+please)?[.!?]*$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (/^doc/.test(name)) return "documents";
  if (/^(sheet|spreadsheet)/.test(name)) return "sheets";
  if (/^planner/.test(name)) return "planner";
  if (/^canvas/.test(name)) return "canvas";
  if (/^dashboard/.test(name)) return "dashboard";
  return name as "research" | "settings";
}

// Enforce only an unambiguous named workspace. Multi-workspace instructions stay
// with the agent; this is not a keyword classifier for the user's whole task.
export function explicitWorkspaceTarget(request: string): WorkspaceView | null {
  if (!/\b(?:open|switch(?: over)? to|go to|use|in)\s+(?:(?:my|the|a|an|our|this|that)\s+)?(?:documents?|docs?|sheets?|spreadsheets?|planner|canvas|dashboard|research|settings)\b/i.test(request)) return null;
  const names: Array<[WorkspaceView, RegExp]> = [
    ["documents", /\b(documents?|docs?|prds?)\b/i], ["sheets", /\b(sheets?|spreadsheets?|excel|tables?)\b/i],
    ["planner", /\bplanners?\b/i], ["canvas", /\b(canvas|canvases|diagrams?|flowcharts?|drawings?)\b/i],
    ["dashboard", /\bdashboards?\b/i], ["research", /\bresearch\b/i], ["settings", /\bsettings\b/i],
  ];
  const matches = names.filter(([, pattern]) => pattern.test(request));
  return matches.length === 1 ? matches[0][0] : null;
}
