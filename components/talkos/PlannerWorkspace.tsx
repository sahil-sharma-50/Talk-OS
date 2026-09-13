"use client";

import { CalendarDays, Download, FilePlus2, ListTodo, Plus } from "lucide-react";
import Papa from "papaparse";
import { useState } from "react";
import { applyWorkspaceChanges, createPlanner, duplicateArtifact, moveArtifactToTrash, renameArtifact } from "@/features/workspace/workspace-model";
import { exportPlannerIcs, findPlannerConflicts } from "@/features/workspace/planner-export";
import { PlannerTaskRow } from "./PlannerTaskRow";
import type { PlannerTask, WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
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
  Blocked: task.blockedReason ?? "",
  Risk: task.riskLevel ?? "Not assessed",
})), { escapeFormulae: true });

export function PlannerWorkspace({ workspace, onChange }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }) {
  const active = workspace.planners.find((planner) => planner.id === workspace.activePlannerId) ?? workspace.planners[0];
  const [title, setTitle] = useState("");
  const [notice, setNotice] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  if (!active) return <div className="tool-empty"><CalendarDays size={30} /><h2>Turn the work into a plan</h2><p>Schedule tasks, spot conflicts, and redirect the timeline by voice.</p><button type="button" onClick={() => onChange(createPlanner(workspace, "My plan"))}><FilePlus2 size={14} /> Create a plan</button></div>;
  const commit = (tasks: PlannerTask[], label: string) => {
    const result = applyWorkspaceChanges(workspace, label, [{ kind: "planner", artifactId: active.id, expectedRevision: active.revision, tasks }], "user");
    if (result.ok) onChange(result.workspace);
    return result.ok;
  };
  const updateTask = (id: string, patch: Partial<PlannerTask>, label: string) => {
    const tasks = active.tasks.map((item) => item.id === id ? { ...item, ...patch } : item);
    if (tasks.some((task) => task.startsAt && task.endsAt && Date.parse(task.endsAt) <= Date.parse(task.startsAt))) { setNotice("End time must be after start time."); return false; }
    setNotice("");
    return commit(tasks, label);
  };
  const reorder = (id: string, targetIndex: number) => {
    const tasks = [...active.tasks]; const index = tasks.findIndex((task) => task.id === id);
    if (index < 0 || targetIndex < 0 || targetIndex >= tasks.length) return;
    tasks.splice(targetIndex, 0, tasks.splice(index, 1)[0]); commit(tasks, "Reordered tasks");
  };
  const conflicts = findPlannerConflicts(active.tasks);
  return <div className="planner-workspace">
    <ArtifactNavigator label="Plans" count={workspace.planners.length} countLabel={`${workspace.planners.length} plans`} actions={<button type="button" onClick={() => onChange(createPlanner(workspace, "Untitled plan"))}><Plus size={14} /> New</button>}>
      {workspace.planners.map((planner) => <ArtifactNavigatorItem active={planner.id === active.id} icon={ListTodo} title={planner.title} meta={`${planner.tasks.length} ${planner.tasks.length === 1 ? "task" : "tasks"}`} key={planner.id} onSelect={() => onChange({ ...workspace, activePlannerId: planner.id })} menu={<FileActionMenu name={planner.title} kind="plan" onRename={(name) => onChange(renameArtifact(workspace, "planner", planner.id, name))} onDuplicate={() => onChange(duplicateArtifact(workspace, "planner", planner.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "planner", planner.id))} onExport={() => download(`${planner.title}.ics`, exportPlannerIcs(planner.tasks, planner.timezone))} />} />)}
    </ArtifactNavigator>
    <section className="planner-editor">
      <header>
        <div><EditableArtifactTitle title={active.title} ariaLabel="Plan title" onCommit={(title) => onChange(renameArtifact(workspace, "planner", active.id, title))} /><span>{active.timezone}</span></div>
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
        {notice ? <p role="alert">{notice}</p> : null}
        {conflicts.length ? <p role="status">{conflicts.length} overlapping task {conflicts.length === 1 ? "pair" : "pairs"}. Review the start and end times.</p> : null}
        <section tabIndex={0} aria-label="Planner tasks"><h2>Tasks</h2>{active.tasks.length ? active.tasks.map((task, index) => <PlannerTaskRow key={`${active.id}:${task.id}`} task={task} timezone={active.timezone} index={index} count={active.tasks.length}
          onToggle={() => updateTask(task.id, { completed: !task.completed }, `Updated ${task.title}`)}
          onSave={(patch) => updateTask(task.id, patch, `Edited ${task.title}`)}
          onDelete={() => commit(active.tasks.filter((item) => item.id !== task.id), `Removed ${task.title}`)}
          onMove={(target) => reorder(task.id, target)} onDragStart={() => setDraggedId(task.id)} onDragEnd={() => setDraggedId(null)}
          onDrop={() => { if (draggedId) reorder(draggedId, index); setDraggedId(null); }} />) : <p className="empty-copy">No tasks yet. Add one here or ask TalkOS.</p>}</section>
      </div>
    </section>
    <WorkspaceResizeHandle />
  </div>;
}
