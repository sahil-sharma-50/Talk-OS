"use client";

import { CalendarDays, Download, FilePlus2, Plus } from "lucide-react";
import Papa from "papaparse";
import { useState } from "react";
import { applyWorkspaceChanges, createPlanner, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import { exportPlannerIcs, findPlannerConflicts } from "@/features/workspace/planner-export";
import { fromPlannerDateTime, toPlannerDateTime } from "@/features/workspace/planner-datetime";
import type { PlannerTask, WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

const download = (name: string, content: string, type = "text/calendar") => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
};
const taskCsv = (tasks: PlannerTask[]) => Papa.unparse(tasks.map((task) => ({
  Task: task.title,
  Notes: task.notes ?? "",
  Completed: task.completed ? "Yes" : "No",
  Due: task.dueDate ?? "",
  Start: task.startsAt ?? "",
  End: task.endsAt ?? "",
})), { escapeFormulae: true });

export function PlannerWorkspace({ workspace, onChange }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }) {
  const active = workspace.planners.find((planner) => planner.id === workspace.activePlannerId) ?? workspace.planners[0];
  const [title, setTitle] = useState("");
  if (!active) return <div className="tool-empty"><CalendarDays size={30} /><h2>Turn the work into a plan</h2><p>Schedule tasks, spot conflicts, and redirect the timeline by voice.</p><button type="button" onClick={() => onChange(createPlanner(workspace, "My plan"))}><FilePlus2 size={14} /> Create a plan</button></div>;
  const commit = (tasks: PlannerTask[], label: string) => {
    const result = applyWorkspaceChanges(workspace, label, [{ kind: "planner", artifactId: active.id, expectedRevision: active.revision, tasks }], "user");
    if (result.ok) onChange(result.workspace);
  };
  const updateTask = (id: string, patch: Partial<PlannerTask>, label: string) => commit(active.tasks.map((item) => item.id === id ? { ...item, ...patch } : item), label);
  const conflicts = new Set(findPlannerConflicts(active.tasks).flat());
  return <div className="planner-workspace">
    <aside className="artifact-list">
      <div className="artifact-list__heading"><strong>Plans</strong><span>{workspace.planners.length}</span></div>
      <div className="artifact-list__actions artifact-list__actions--single"><button type="button" onClick={() => onChange(createPlanner(workspace, "Untitled plan"))}><FilePlus2 size={14} /> New</button></div>
      {workspace.planners.map((planner) => <div className="artifact-row" data-active={planner.id === active.id} key={planner.id} onClick={() => onChange({ ...workspace, activePlannerId: planner.id })}>
        <button type="button"><strong>{planner.title}</strong><small>{planner.tasks.length} tasks</small></button>
        <FileActionMenu name={planner.title} onRename={(name) => onChange(renameArtifact(workspace, "planner", planner.id, name))} onDuplicate={() => onChange(duplicateArtifact(workspace, "planner", planner.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "planner", planner.id))} onExport={() => download(`${planner.title}.ics`, exportPlannerIcs(planner.tasks, planner.timezone))} />
      </div>)}
    </aside>
    <section className="planner-editor">
      <header>
        <div><strong>{active.title}</strong><span>{active.timezone}</span></div>
        <div className="planner-exports">
          <button type="button" onClick={() => download(`${active.title}.csv`, taskCsv(active.tasks), "text/csv")}><Download size={13} /> Tasks CSV</button>
          <button type="button" onClick={() => download(`${active.title}.ics`, exportPlannerIcs(active.tasks, active.timezone))}><CalendarDays size={13} /> Calendar</button>
          <span>{active.tasks.filter((task) => task.completed).length}/{active.tasks.length} done</span>
        </div>
      </header>
      <form className="quick-task" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) return;
        commit([...active.tasks, { id: crypto.randomUUID(), title: title.trim(), completed: false }], `Added ${title.trim()}`);
        setTitle("");
      }}><input aria-label="New task" placeholder="Add a task…" value={title} onChange={(event) => setTitle(event.target.value)} /><button type="submit"><Plus size={14} /> Add</button></form>
      <div className="planner-columns">
        <section><h2>Tasks</h2>{active.tasks.length ? active.tasks.map((task) => <article className="planner-task" data-conflict={conflicts.has(task.id)} key={task.id}>
          <input aria-label={`Complete ${task.title}`} type="checkbox" checked={task.completed} onChange={() => updateTask(task.id, { completed: !task.completed }, `Updated ${task.title}`)} />
          <div><strong>{task.title}</strong>{task.notes ? <p>{task.notes}</p> : null}{conflicts.has(task.id) ? <small>Overlaps another task</small> : null}</div>
          <div className="task-dates">
            <label>Due<input aria-label={`Due date for ${task.title}`} type="date" value={task.dueDate ?? ""} onChange={(event) => updateTask(task.id, { dueDate: event.target.value }, `Rescheduled ${task.title}`)} /></label>
            <details><summary>Schedule</summary><label>Starts<input aria-label={`Start time for ${task.title}`} type="datetime-local" value={toPlannerDateTime(task.startsAt, active.timezone)} onChange={(event) => updateTask(task.id, { startsAt: event.target.value ? fromPlannerDateTime(event.target.value, active.timezone) : undefined }, `Rescheduled ${task.title}`)} /></label><label>Ends<input aria-label={`End time for ${task.title}`} type="datetime-local" value={toPlannerDateTime(task.endsAt, active.timezone)} onChange={(event) => updateTask(task.id, { endsAt: event.target.value ? fromPlannerDateTime(event.target.value, active.timezone) : undefined }, `Rescheduled ${task.title}`)} /></label></details>
          </div>
        </article>) : <p className="empty-copy">No tasks yet. Add one here or ask TalkOS.</p>}</section>
      </div>
    </section>
    <WorkspaceResizeHandle />
  </div>;
}
