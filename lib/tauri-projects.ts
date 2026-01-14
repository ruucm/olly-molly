import { isTauriRuntime } from "@/lib/tauri-board";

export type Project = {
  id: string;
  name: string;
  path: string;
  description?: string | null;
  is_active: number;
};

type ProjectStore = {
  projects: Project[];
  activeId: string | null;
};

const storageKey = "olly-projects";

function loadLocalProjects(): ProjectStore {
  if (typeof window === "undefined") {
    return { projects: [], activeId: null };
  }
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return { projects: [], activeId: null };
  try {
    return JSON.parse(raw) as ProjectStore;
  } catch {
    return { projects: [], activeId: null };
  }
}

function saveLocalProjects(store: ProjectStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(store));
}

export async function listProjects(): Promise<Project[]> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    const store = loadLocalProjects();
    return store.projects.sort((a, b) =>
      Number(b.is_active) - Number(a.is_active)
    );
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Project[]>("list_projects");
}

export async function createEmptyProject(input: {
  name: string;
  parentPath?: string;
}): Promise<Project> {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    const store = loadLocalProjects();
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? `prj-${crypto.randomUUID()}`
        : `prj-${Date.now()}`;
    const path = `${input.parentPath || "~/Projects"}/${input.name}`;
    const project: Project = {
      id,
      name: input.name,
      path,
      description: null,
      is_active: 1,
    };
    const projects = store.projects.map((p) => ({ ...p, is_active: 0 }));
    projects.unshift(project);
    saveLocalProjects({ projects, activeId: id });
    return project;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Project>("create_empty_project", {
    input: {
      name: input.name,
      parent_path: input.parentPath ?? null,
    },
  });
}

export async function setActiveProject(id: string) {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    const store = loadLocalProjects();
    const projects = store.projects.map((project) => ({
      ...project,
      is_active: project.id === id ? 1 : 0,
    }));
    saveLocalProjects({ projects, activeId: id });
    return;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("set_active_project", { id });
}

export async function deleteProject(id: string) {
  const tauriAvailable = await isTauriRuntime();
  if (!tauriAvailable) {
    const store = loadLocalProjects();
    const projects = store.projects.filter((project) => project.id !== id);
    const activeId =
      store.activeId && store.activeId === id ? null : store.activeId;
    saveLocalProjects({ projects, activeId });
    return;
  }

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("delete_project", { id });
}
