import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function ArtifactNavigator({ label, count, countLabel, actions, children, className = "" }: {
  label: string;
  count: number;
  countLabel: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <aside className={`artifact-navigator ${className}`.trim()} aria-label={label}>
    <header className="artifact-navigator__header">
      <div className="artifact-navigator__title">
        <h2>{label}</h2>
        <span aria-label={countLabel}>{count}</span>
      </div>
      {actions ? <div className="artifact-navigator__actions">{actions}</div> : null}
    </header>
    <nav aria-label={`${label} list`}>{children}</nav>
  </aside>;
}

export function ArtifactNavigatorItem({ active, icon: Icon, title, meta, onSelect, menu }: {
  active: boolean;
  icon: LucideIcon;
  title: string;
  meta: string;
  onSelect: () => void;
  menu?: ReactNode;
}) {
  return <div className="artifact-navigator__item" data-active={active}>
    <button type="button" className="artifact-navigator__select" aria-current={active ? "page" : undefined} aria-label={`${title}, ${meta}`} onClick={onSelect}>
      <span className="artifact-navigator__icon" aria-hidden="true"><Icon size={15} strokeWidth={1.8} /></span>
      <span className="artifact-navigator__copy"><strong>{title}</strong><small>{meta}</small></span>
    </button>
    {menu}
  </div>;
}
