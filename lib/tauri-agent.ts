import { isTauriRuntime } from "@/lib/tauri-board";
import type { Conversation, ConversationMessage } from "@/lib/db";

export type AgentProvider = "opencode" | "claude" | "codex";

export type StartAgentJobInput = {
  ticketId: string;
  provider?: AgentProvider;
  feedback?: string;
};

export type StartAgentJobResult = {
  success: boolean;
  job_id: string;
  conversation_id: string;
  ticket_status: string;
};

export type RunningJob = {
  id: string;
  conversation_id: string;
  ticket_id: string;
  agent_id: string;
  agent_name: string;
  provider: AgentProvider;
  status: "running" | "completed" | "failed" | "cancelled";
  output: string;
  started_at: string;
};

export type AgentStatusResponse = {
  jobs: RunningJob[];
  job?: RunningJob | null;
  output?: string | null;
};

export async function startAgentJob(
  input: StartAgentJobInput
): Promise<StartAgentJobResult> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    throw new Error("Tauri backend is not available.");
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<StartAgentJobResult>("start_agent_job", {
    input: {
      ticket_id: input.ticketId,
      provider: input.provider ?? null,
      feedback: input.feedback ?? null,
    },
  });
}

export async function getAgentStatus(input?: {
  ticketId?: string;
  jobId?: string;
}): Promise<AgentStatusResponse> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    return { jobs: [] };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<AgentStatusResponse>("get_agent_status", {
    ticketId: input?.ticketId ?? null,
    jobId: input?.jobId ?? null,
  });
}

export async function cancelAgentJob(jobId: string): Promise<boolean> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("cancel_agent_job", { jobId });
}

export async function listConversations(ticketId: string): Promise<Conversation[]> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{ conversations: Conversation[] }>("list_conversations", {
    ticketId,
  });
  return res.conversations || [];
}

export async function getConversation(id: string): Promise<{
  conversation: Conversation;
  messages: ConversationMessage[];
}> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    throw new Error("Tauri backend is not available.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<{ conversation: Conversation; messages: ConversationMessage[] }>(
    "get_conversation",
    { id }
  );
}
