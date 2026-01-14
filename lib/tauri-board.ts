export type Member = {
  id: string;
  role: string;
  name: string;
  avatar?: string | null;
};

export type Ticket = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee_id?: string | null;
};

export type BoardData = {
  members: Member[];
  tickets: Ticket[];
};

export type BoardLoadResult = {
  data: BoardData;
  source: "tauri" | "seed";
  error?: string;
};

export type CreateTicketInput = {
  title: string;
  description?: string;
  priority?: string;
  assignee_id?: string;
};

export const seedBoard: BoardData = {
  members: [
    { id: "pm-001", role: "PM", name: "PM Agent", avatar: "PM" },
    { id: "fe-001", role: "FE_DEV", name: "Frontend Dev", avatar: "FE" },
    { id: "be-001", role: "BACKEND_DEV", name: "Backend Dev", avatar: "BE" },
    { id: "qa-001", role: "QA", name: "QA Engineer", avatar: "QA" },
    { id: "devops-001", role: "DEVOPS", name: "DevOps", avatar: "DO" },
    { id: "bughunter-001", role: "BUG_HUNTER", name: "Bug Hunter", avatar: "BH" }
  ],
  tickets: [
    {
      id: "TCK-001",
      title: "Design Kanban MVP layout",
      description: "Paper-like surface, bold typography, and clear columns.",
      status: "TODO",
      priority: "HIGH",
      assignee_id: "fe-001"
    },
    {
      id: "TCK-002",
      title: "Define board schema mappings",
      description: "Use schema statuses and priority enums.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      assignee_id: "pm-001"
    },
    {
      id: "TCK-003",
      title: "Wire drag and drop",
      description: "Prepare hooks for dnd-kit without wiring logic.",
      status: "IN_REVIEW",
      priority: "LOW",
      assignee_id: "fe-001"
    },
    {
      id: "TCK-004",
      title: "Create activity log stubs",
      description: "Log move actions with old/new status.",
      status: "NEED_FIX",
      priority: "CRITICAL",
      assignee_id: "be-001"
    },
    {
      id: "TCK-005",
      title: "QA pass: Column counts",
      description: "Check counts update when tickets move.",
      status: "COMPLETE",
      priority: "MEDIUM",
      assignee_id: "qa-001"
    },
    {
      id: "TCK-006",
      title: "Add project selector modal",
      description: "Local path input with recent list.",
      status: "ON_HOLD",
      priority: "LOW",
      assignee_id: "devops-001"
    }
  ]
};

export async function isTauriRuntime() {
  if (typeof window === "undefined") return false;
  if ("__TAURI__" in window || "__TAURI_INTERNALS__" in window) return true;

  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    return isTauri();
  } catch {
    return false;
  }
}

export async function loadBoardData(): Promise<BoardLoadResult> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    return { data: seedBoard, source: "seed" };
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<BoardData>("get_board_data");
    return { data, source: "tauri" };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load Tauri data";
    return { data: seedBoard, source: "seed", error: message };
  }
}

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `tck-${Date.now()}`;

    return {
      id,
      title: input.title,
      description: input.description ?? null,
      status: "TODO",
      priority: input.priority ?? "MEDIUM",
      assignee_id: input.assignee_id ?? null,
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Ticket>("create_ticket", {
    input: {
      title: input.title,
      description: input.description ?? null,
      priority: input.priority ?? null,
      assigneeId: input.assignee_id ?? null,
    },
  });
}
