export type Member = {
  id: string;
  role: string;
  name: string;
  avatar?: string | null;
  profile_image?: string | null;
  system_prompt: string;
  is_default: number;
  can_generate_images: number;
  can_log_screenshots: number;
};

export type Ticket = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee_id?: string | null;
  project_id?: string | null;
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
    {
      id: "pm-001",
      role: "PM",
      name: "PM Agent",
      avatar: "PM",
      profile_image: null,
      system_prompt: "",
      is_default: 1,
      can_generate_images: 0,
      can_log_screenshots: 0,
    },
    {
      id: "fe-001",
      role: "FE_DEV",
      name: "Frontend Dev",
      avatar: "FE",
      profile_image: null,
      system_prompt: "",
      is_default: 1,
      can_generate_images: 1,
      can_log_screenshots: 1,
    },
    {
      id: "be-001",
      role: "BACKEND_DEV",
      name: "Backend Dev",
      avatar: "BE",
      profile_image: null,
      system_prompt: "",
      is_default: 1,
      can_generate_images: 0,
      can_log_screenshots: 0,
    },
    {
      id: "qa-001",
      role: "QA",
      name: "QA Engineer",
      avatar: "QA",
      profile_image: null,
      system_prompt: "",
      is_default: 1,
      can_generate_images: 1,
      can_log_screenshots: 1,
    },
    {
      id: "devops-001",
      role: "DEVOPS",
      name: "DevOps",
      avatar: "DO",
      profile_image: null,
      system_prompt: "",
      is_default: 1,
      can_generate_images: 0,
      can_log_screenshots: 0,
    },
    {
      id: "bughunter-001",
      role: "BUG_HUNTER",
      name: "Bug Hunter",
      avatar: "BH",
      profile_image: null,
      system_prompt: "",
      is_default: 1,
      can_generate_images: 0,
      can_log_screenshots: 0,
    }
  ],
  tickets: [
    {
      id: "TCK-001",
      title: "Design Kanban MVP layout",
      description: "Paper-like surface, bold typography, and clear columns.",
      status: "TODO",
      priority: "HIGH",
      assignee_id: "fe-001",
      project_id: null
    },
    {
      id: "TCK-002",
      title: "Define board schema mappings",
      description: "Use schema statuses and priority enums.",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      assignee_id: "pm-001",
      project_id: null
    },
    {
      id: "TCK-003",
      title: "Wire drag and drop",
      description: "Prepare hooks for dnd-kit without wiring logic.",
      status: "IN_REVIEW",
      priority: "LOW",
      assignee_id: "fe-001",
      project_id: null
    },
    {
      id: "TCK-004",
      title: "Create activity log stubs",
      description: "Log move actions with old/new status.",
      status: "NEED_FIX",
      priority: "CRITICAL",
      assignee_id: "be-001",
      project_id: null
    },
    {
      id: "TCK-005",
      title: "QA pass: Column counts",
      description: "Check counts update when tickets move.",
      status: "COMPLETE",
      priority: "MEDIUM",
      assignee_id: "qa-001",
      project_id: null
    },
    {
      id: "TCK-006",
      title: "Add project selector modal",
      description: "Local path input with recent list.",
      status: "ON_HOLD",
      priority: "LOW",
      assignee_id: "devops-001",
      project_id: null
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
      project_id: null,
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

export async function updateTicket(input: {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  assignee_id?: string | null;
}): Promise<Ticket> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    return {
      id: input.id,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      assignee_id: input.assignee_id ?? null,
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Ticket>("update_ticket", {
    input: {
      id: input.id,
      title: input.title,
      description: input.description ?? null,
      status: input.status,
      priority: input.priority,
      assignee_id: input.assignee_id ?? null,
    },
  });
}

export async function deleteTicket(id: string): Promise<void> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_ticket", { id });
}

export async function createMember(input: {
  role: string;
  name: string;
  avatar?: string | null;
  system_prompt: string;
  profile_image?: string | null;
  can_generate_images?: number;
  can_log_screenshots?: number;
}): Promise<Member> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `mem-${crypto.randomUUID()}`
        : `mem-${Date.now()}`;
    return {
      id,
      role: input.role,
      name: input.name,
      avatar: input.avatar ?? null,
      profile_image: input.profile_image ?? null,
      system_prompt: input.system_prompt,
      is_default: 0,
      can_generate_images: input.can_generate_images ?? 0,
      can_log_screenshots: input.can_log_screenshots ?? 0,
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Member>("create_member", {
    input: {
      role: input.role,
      name: input.name,
      avatar: input.avatar ?? null,
      profile_image: input.profile_image ?? null,
      system_prompt: input.system_prompt,
      can_generate_images: input.can_generate_images ?? 0,
      can_log_screenshots: input.can_log_screenshots ?? 0,
    },
  });
}

export async function updateMember(input: {
  id: string;
  role: string;
  name: string;
  avatar?: string | null;
  profile_image?: string | null;
  system_prompt: string;
  can_generate_images: number;
  can_log_screenshots: number;
  is_default: number;
}): Promise<Member> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    return {
      id: input.id,
      role: input.role,
      name: input.name,
      avatar: input.avatar ?? null,
      profile_image: input.profile_image ?? null,
      system_prompt: input.system_prompt,
      is_default: input.is_default,
      can_generate_images: input.can_generate_images,
      can_log_screenshots: input.can_log_screenshots,
    };
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Member>("update_member", {
    input: {
      id: input.id,
      role: input.role,
      name: input.name,
      avatar: input.avatar ?? null,
      profile_image: input.profile_image ?? null,
      system_prompt: input.system_prompt,
      can_generate_images: input.can_generate_images,
      can_log_screenshots: input.can_log_screenshots,
    },
  });
}

export async function deleteMember(id: string): Promise<void> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_member", { id });
}
