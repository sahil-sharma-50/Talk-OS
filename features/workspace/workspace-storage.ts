import type { WorkspaceSnapshot } from "./workspace.types";

const DATABASE_NAME = "talkos";
const STORE_NAME = "workspace";
const CURRENT_KEY = "current";

function isWorkspace(value: unknown): value is WorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorkspaceSnapshot>;
  return candidate.version === 2
    && Array.isArray(candidate.documents)
    && typeof candidate.activeDocumentId === "string"
    && Array.isArray(candidate.sources)
    && Array.isArray(candidate.sheets)
    && Array.isArray(candidate.planners)
    && Array.isArray(candidate.researchCollections)
    && Array.isArray(candidate.trash)
    && Array.isArray(candidate.changeHistory)
    && Array.isArray(candidate.conversation)
    && !!candidate.task
    && typeof candidate.task.objective === "string"
    && Array.isArray(candidate.task.constraints)
    && Array.isArray(candidate.task.steps);
}

function migrateWorkspace(value: unknown): WorkspaceSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.version !== 1 || !Array.isArray(legacy.documents) || !Array.isArray(legacy.sources) || !legacy.task) return null;
  const sources = legacy.sources as WorkspaceSnapshot["sources"];
  const createdAt = new Date().toISOString();
  return {
    version: 2,
    documents: legacy.documents as WorkspaceSnapshot["documents"],
    activeDocumentId: typeof legacy.activeDocumentId === "string" ? legacy.activeDocumentId : "",
    sheets: [], activeSheetId: null, planners: [], activePlannerId: null,
    sources,
    researchCollections: sources.length ? [{ id: "research-migrated", query: "Earlier research", summary: "", sourceIds: sources.map((source) => source.id), status: "complete", createdAt }] : [],
    selectedSourceId: typeof legacy.selectedSourceId === "string" ? legacy.selectedSourceId : null,
    selectedResearchCollectionId: sources.length ? "research-migrated" : null,
    task: legacy.task as WorkspaceSnapshot["task"], trash: [], changeHistory: [], conversation: [],
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function serializeWorkspace(workspace: WorkspaceSnapshot) {
  return JSON.stringify(workspace, null, 2);
}

export function parseWorkspaceExport(raw: string): WorkspaceSnapshot {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isWorkspace(parsed)) return parsed;
    const migrated = migrateWorkspace(parsed);
    if (!migrated) throw new Error("invalid_workspace_file");
    return migrated;
  } catch {
    throw new Error("invalid_workspace_file");
  }
}

export async function loadWorkspace(): Promise<WorkspaceSnapshot | null> {
  if (typeof indexedDB === "undefined") return null;
  const database = await openDatabase();
  return new Promise<WorkspaceSnapshot | null>((resolve, reject) => {
    const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(CURRENT_KEY);
    request.onsuccess = () => resolve(isWorkspace(request.result) ? request.result : migrateWorkspace(request.result));
    request.onerror = () => reject(request.error);
  }).finally(() => database.close());
}

export async function saveWorkspace(workspace: WorkspaceSnapshot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(workspace, CURRENT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  }).finally(() => database.close());
}
