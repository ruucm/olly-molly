import { isTauriRuntime } from "@/lib/tauri-board";

export type AgentProvider = "opencode" | "claude";

export type ExecuteAgentInput = {
  ticketId: string;
  title: string;
  description?: string | null;
  provider: AgentProvider;
  feedback?: string;
  projectId?: string | null;
};

export type ExecuteAgentResult = {
  success: boolean;
  output: string;
};

export async function executeAgent(
  input: ExecuteAgentInput
): Promise<ExecuteAgentResult> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    return {
      success: false,
      output: "Tauri backend is not available.",
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<ExecuteAgentResult>("execute_agent", {
    input: {
      ticket_id: input.ticketId,
      title: input.title,
      description: input.description ?? null,
      provider: input.provider,
      feedback: input.feedback ?? null,
      project_id: input.projectId ?? null,
    },
  });
}
