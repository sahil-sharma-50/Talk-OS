import type { ArtifactType } from "./workspace.types";

export interface WorkspaceSelection { kind: ArtifactType; artifactId: string; start?: number; end?: number; text?: string; range?: string; ids?: string[] }
let selection: WorkspaceSelection | null = null;
export const setWorkspaceSelection = (next: WorkspaceSelection | null) => { selection = next; };
export const getWorkspaceSelection = () => selection;
