"use client";

export function EditableArtifactTitle({ title, ariaLabel, onCommit, className = "workspace-title-input" }: {
  title: string;
  ariaLabel: string;
  onCommit: (title: string) => void;
  className?: string;
}) {
  const commit = (input: HTMLInputElement) => {
    const next = input.value.trim();
    if (!next) {
      input.value = title;
      return;
    }
    if (next !== title) onCommit(next);
    if (next !== input.value) input.value = next;
  };

  return <input
    key={title}
    aria-label={ariaLabel}
    className={className}
    defaultValue={title}
    onBlur={(event) => commit(event.currentTarget)}
    onKeyDown={(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.currentTarget.value = title;
        event.currentTarget.blur();
      }
    }}
  />;
}
