"use client";

import { ArrowDown, ArrowUp, CalendarDays, Check, ChevronDown, GripVertical, Pencil, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { fromPlannerDateTime, toPlannerDateTime } from "@/features/workspace/planner-datetime";
import type { PlannerTask } from "@/features/workspace/workspace.types";

const editableFields = ["title", "notes", "dueDate", "startsAt", "endsAt", "blockedReason", "riskLevel"] as const;

export function PlannerTaskRow({ task, timezone, index, count, onToggle, onSave, onDelete, onMove, onDragStart, onDragEnd, onDrop }: {
  task: PlannerTask; timezone: string; index: number; count: number;
  onToggle: () => void; onSave: (patch: Partial<PlannerTask>) => boolean; onDelete: () => void;
  onMove: (index: number) => void; onDragStart: () => void; onDragEnd: () => void; onDrop: () => void;
}) {
  const [edit, setEdit] = useState<{ original: PlannerTask; draft: PlannerTask } | null>(null);
  const [error, setError] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const open = () => { setError(""); setEdit({ original: { ...task }, draft: { ...task } }); };
  const close = () => { setEdit(null); setError(""); editButton.current?.focus(); };
  const change = (patch: Partial<PlannerTask>) => setEdit((current) => current ? { ...current, draft: { ...current.draft, ...patch } } : null);
  const save = () => {
    if (!edit) return;
    const draft = { ...edit.draft, title: edit.draft.title.trim() };
    if (!draft.title) { setError("Give this task a title."); return; }
    if (draft.startsAt && draft.endsAt && Date.parse(draft.endsAt) <= Date.parse(draft.startsAt)) { setError("End time must be after start time."); return; }
    const changed = editableFields.filter((field) => draft[field] !== edit.original[field]);
    if (changed.some((field) => task[field] !== edit.original[field] && task[field] !== draft[field])) { setError("This task changed while you were editing. Cancel and reopen it to review the latest version."); return; }
    if (!changed.length || onSave(Object.fromEntries(changed.map((field) => [field, draft[field]])))) close();
  };
  const due = task.dueDate ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(`${task.dueDate}T12:00:00`)) : "";

  return <article className="planner-task" data-completed={task.completed} data-editing={Boolean(edit)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onDrop(); }}>
    <div className="task-row-header">
      <input aria-label={`Complete ${task.title}`} type="checkbox" checked={task.completed} onChange={onToggle} />
      <button className="task-title" type="button" onClick={open} aria-label={`Edit title for ${task.title}`}><strong>{task.title}</strong></button>
      <div className="task-row-actions">
        <button ref={editButton} type="button" className="task-edit-toggle" aria-label={`Edit ${task.title}`} aria-expanded={Boolean(edit)} aria-controls={`task-editor-${task.id}`} title="Edit task" onClick={edit ? close : open}><Pencil size={15} /></button>
        <button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} aria-label={`Drag ${task.title} to reorder`} title="Drag to reorder"><GripVertical size={15} /></button>
        <button type="button" aria-label={`Move ${task.title} up`} title="Move up" disabled={index === 0} onClick={() => onMove(index - 1)}><ArrowUp size={14} /></button>
        <button type="button" aria-label={`Move ${task.title} down`} title="Move down" disabled={index === count - 1} onClick={() => onMove(index + 1)}><ArrowDown size={14} /></button>
      </div>
    </div>
    {!edit && task.notes ? <p className="task-row-description">{task.notes}</p> : null}
    {!edit && (due || task.startsAt || task.blockedReason || task.riskLevel) ? <div className="task-row-meta">
      {due ? <span><CalendarDays size={12} /> Due {due}</span> : null}
      {task.startsAt ? <span>{toPlannerDateTime(task.startsAt, timezone).replace("T", " ")}</span> : null}
      {task.blockedReason ? <span data-status="blocked">Blocked: {task.blockedReason}</span> : null}
      {task.riskLevel ? <span>{task.riskLevel} risk</span> : null}
    </div> : null}
    {edit ? <form id={`task-editor-${task.id}`} className="task-editor-form" aria-label={`Edit task ${task.title}`} onSubmit={(event) => { event.preventDefault(); save(); }} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      <header><strong>Task details</strong><button type="button" aria-label="Close task editor" onClick={close}><X size={15} /></button></header>
      <label className="task-editor-title">Title<input autoFocus aria-label={`Title for ${task.title}`} value={edit.draft.title} onChange={(event) => change({ title: event.target.value })} /></label>
      <label className="task-editor-description">Description<textarea aria-label={`Description for ${task.title}`} placeholder="What needs to happen? Add details or a checklist…" value={edit.draft.notes ?? ""} onChange={(event) => change({ notes: event.target.value })} /></label>
      <fieldset><legend><CalendarDays size={13} /> Schedule <span>{timezone}</span></legend><div className="task-schedule-fields">
        <label>Due date<input type="date" aria-label={`Due date for ${task.title}`} value={edit.draft.dueDate ?? ""} onChange={(event) => change({ dueDate: event.target.value || undefined })} /></label>
        <label>Start<input type="datetime-local" aria-label={`Start time for ${task.title}`} value={toPlannerDateTime(edit.draft.startsAt, timezone)} onChange={(event) => change({ startsAt: fromPlannerDateTime(event.target.value, timezone) })} /></label>
        <label>End<input type="datetime-local" aria-label={`End time for ${task.title}`} value={toPlannerDateTime(edit.draft.endsAt, timezone)} onChange={(event) => change({ endsAt: fromPlannerDateTime(event.target.value, timezone) })} /></label>
      </div></fieldset>
      <details className="task-extra-fields" open={Boolean(task.blockedReason || task.riskLevel)}><summary><ChevronDown size={13} /> Blockers and risk</summary><div>
        <label>Blocker<input aria-label={`Blocker for ${task.title}`} placeholder="Anything holding this up?" value={edit.draft.blockedReason ?? ""} onChange={(event) => change({ blockedReason: event.target.value || undefined })} /></label>
        <label>Risk<select aria-label={`Risk for ${task.title}`} value={edit.draft.riskLevel ?? ""} onChange={(event) => change({ riskLevel: (event.target.value || undefined) as PlannerTask["riskLevel"] })}><option value="">Not assessed</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
      </div></details>
      {error ? <p className="task-editor-error" role="alert">{error}</p> : null}
      <footer><button className="task-delete" type="button" onClick={onDelete}><Trash2 size={14} /> Delete task</button><div><button type="button" onClick={close}>Cancel</button><button className="task-save" type="submit"><Check size={14} /> Save changes</button></div></footer>
    </form> : null}
  </article>;
}
