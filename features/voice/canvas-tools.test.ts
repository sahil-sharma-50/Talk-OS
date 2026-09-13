import { expect, it } from "vitest";
import { executeCanvasTool } from "./canvas-tools";
import { createWorkspace } from "@/features/workspace/workspace-model";

it("lays out an agent-created branched flow with separated, readable nodes", async () => {
  let workspace = createWorkspace();
  await executeCanvasTool({ type: "tool.call", call_id: "diagram", name: "create_canvas", arguments: { title: "Release decision", operations: [
    { op: "add_node", id: "start", role: "process", text: "Review the release", x: 0, y: 0 },
    { op: "add_node", id: "gate", role: "decision", text: "All checks passed?", x: 0, y: 0 },
    { op: "add_node", id: "ship", role: "process", text: "Ship the release", x: 0, y: 0 },
    { op: "add_node", id: "fix", role: "process", text: "Resolve issues and run the complete verification again", x: 0, y: 0 },
    { op: "connect", id: "a", sourceId: "start", targetId: "gate" },
    { op: "connect", id: "b", sourceId: "gate", targetId: "ship", label: "Yes" },
    { op: "connect", id: "c", sourceId: "gate", targetId: "fix", label: "No" },
  ] } }, { getWorkspace: () => workspace, setWorkspace: (next) => { workspace = next; } });
  const nodes = workspace.canvases[0].elements.filter((item) => item.type !== "arrow");
  expect(nodes).toHaveLength(4);
  for (const node of nodes) for (const other of nodes) if (node.id !== other.id) expect(node.x + node.width <= other.x || other.x + other.width <= node.x || node.y + node.height <= other.y || other.y + other.height <= node.y).toBe(true);
  expect(nodes.find((item) => item.id === "fix")?.height).toBeGreaterThan(88);
  expect(nodes.find((item) => item.id === "gate")?.fill).toBe("#fef3c7");
});
