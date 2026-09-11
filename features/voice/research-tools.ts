import { createDecisionBrief, vendorEvidence } from "@/features/demo/vendor-evidence";
import type { SessionEvent } from "@/features/session/session.types";

export interface ResearchToolCall {
  type: "tool.call";
  call_id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface FunctionTool {
  type: "function";
  name: string;
  description: string;
  execution_mode: "interactive";
  timeout_seconds: number;
  parameters: Record<string, unknown>;
}

export interface ResearchToolExecution {
  events: SessionEvent[];
  result: Record<string, unknown>;
  isError?: boolean;
}

export const researchTools: FunctionTool[] = [
  {
    type: "function",
    name: "search_sources",
    description: "Search the read-only TalkOS vendor evidence set. Use this before opening sources.",
    execution_mode: "interactive",
    timeout_seconds: 8,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "A focused vendor research query." },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "open_source",
    description: "Open one official vendor source in the visible TalkOS research workspace.",
    execution_mode: "interactive",
    timeout_seconds: 8,
    parameters: {
      type: "object",
      properties: {
        source_id: { type: "string", enum: vendorEvidence.map((item) => item.id) },
      },
      required: ["source_id"],
    },
  },
  {
    type: "function",
    name: "capture_finding",
    description: "Capture a verified finding from an official source into the evidence stack.",
    execution_mode: "interactive",
    timeout_seconds: 8,
    parameters: {
      type: "object",
      properties: {
        source_id: { type: "string", enum: vendorEvidence.map((item) => item.id) },
      },
      required: ["source_id"],
    },
  },
  {
    type: "function",
    name: "write_decision_brief",
    description: "Write the read-only vendor recommendation after official pricing and compliance findings are captured.",
    execution_mode: "interactive",
    timeout_seconds: 8,
    parameters: { type: "object", properties: {} },
  },
];

export function executeResearchTool(call: ResearchToolCall): ResearchToolExecution {
  const at = new Date().toISOString();
  const sourceId = typeof call.arguments.source_id === "string" ? call.arguments.source_id : "";
  const evidence = vendorEvidence.find((item) => item.id === sourceId);

  if (call.name === "search_sources") {
    return {
      events: [{ type: "ACTION_COMPLETED", actionId: call.call_id, detail: "4 official sources available", at }],
      result: {
        sources: vendorEvidence.map(({ id, provider, category, sourceLabel }) => ({ id, provider, category, sourceLabel })),
        demo_data: true,
      },
    };
  }

  if ((call.name === "open_source" || call.name === "capture_finding") && evidence) {
    return {
      events: [
        { type: "EVIDENCE_ADDED", evidence, at },
        { type: "ACTION_COMPLETED", actionId: call.call_id, detail: evidence.sourceLabel, at },
      ],
      result: {
        source_id: evidence.id,
        captured: true,
        provider: evidence.provider,
        category: evidence.category,
        finding: evidence.finding,
        source_url: evidence.sourceUrl,
        demo_data: true,
      },
    };
  }

  if (call.name === "write_decision_brief") {
    const brief = createDecisionBrief(at);
    return {
      events: [
        { type: "BRIEF_WRITTEN", brief, at },
        { type: "ACTION_COMPLETED", actionId: call.call_id, detail: "Decision brief ready", at },
      ],
      result: { written: true, recommendation: brief.recommendation, cited_sources: brief.evidenceIds.length },
    };
  }

  return {
    events: [{ type: "ACTION_FAILED", actionId: call.call_id, detail: "Unsupported research request", at }],
    result: { error: "unsupported_research_tool" },
    isError: true,
  };
}
