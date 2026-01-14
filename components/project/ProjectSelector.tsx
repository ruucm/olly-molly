"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import {
  createEmptyProject,
  deleteProject,
  listProjects,
  setActiveProject,
  type Project,
} from "@/lib/tauri-projects";

interface ProjectSelectorProps {
  onProjectChange?: (project: Project | null) => void;
}

type TabType = "empty" | "existing";

export function ProjectSelector({ onProjectChange }: ProjectSelectorProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("empty");

  const [emptyName, setEmptyName] = useState("");
  const [emptyParentPath, setEmptyParentPath] = useState("");
  const [emptyCreating, setEmptyCreating] = useState(false);
  const [emptyError, setEmptyError] = useState<string | null>(null);

  useEffect(() => {
    void refreshProjects();
  }, []);

  const refreshProjects = async () => {
    try {
      const data = await listProjects();
      setProjects(data);
      const active = data.find((project) => project.is_active) || null;
      setActiveProjectState(active);
      onProjectChange?.(active);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const handleCreateEmptyProject = async () => {
    if (!emptyName.trim()) return;

    setEmptyCreating(true);
    setEmptyError(null);

    try {
      const project = await createEmptyProject({
        name: emptyName.trim(),
        parentPath: emptyParentPath.trim() || undefined,
      });
      setEmptyName("");
      setEmptyParentPath("");
      await refreshProjects();
      setActiveProjectState(project);
      onProjectChange?.(project);
      setIsModalOpen(false);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create project";
      setEmptyError(message);
    } finally {
      setEmptyCreating(false);
    }
  };

  const handleSelectProject = async (id: string) => {
    try {
      await setActiveProject(id);
      await refreshProjects();
    } catch (error) {
      console.error("Failed to select project:", error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await deleteProject(id);
      await refreshProjects();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink)] shadow-sm"
      >
        <span>📁</span>
        <span className="text-[var(--muted)]">
          {activeProject ? activeProject.name : "프로젝트 선택"}
        </span>
        {activeProject ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Active" />
        ) : null}
      </button>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="📁 프로젝트 관리"
        size="lg"
      >
        <div className="space-y-4">
          <div className="flex gap-1 rounded-2xl bg-[var(--paper)] p-1">
            <button
              onClick={() => setActiveTab("empty")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeTab === "empty"
                  ? "bg-white text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)]"
              }`}
            >
              🗂️ 새 빈 프로젝트
            </button>
            <button
              onClick={() => setActiveTab("existing")}
              className={`flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition ${
                activeTab === "existing"
                  ? "bg-white text-[var(--ink)] shadow-sm"
                  : "text-[var(--muted)]"
              }`}
            >
              📂 기존 프로젝트
            </button>
          </div>

          {activeTab === "empty" ? (
            <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--muted)]">
                빈 프로젝트 폴더를 생성하고 등록합니다.
              </p>
              <Input
                placeholder="my-new-project"
                value={emptyName}
                onChange={(event) =>
                  setEmptyName(event.target.value.replace(/[^a-zA-Z0-9-_]/g, "-"))
                }
                label="프로젝트 이름"
              />
              <Input
                placeholder="~/Projects (선택사항)"
                value={emptyParentPath}
                onChange={(event) => setEmptyParentPath(event.target.value)}
                label="부모 경로"
              />
              <p className="text-xs text-[var(--muted)]">
                📍 경로: {emptyParentPath.trim() || "~/Projects"}/
                {emptyName || "project-name"}
              </p>
              {emptyError ? (
                <p className="text-sm text-rose-500">{emptyError}</p>
              ) : null}
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateEmptyProject}
                disabled={!emptyName.trim() || emptyCreating}
              >
                {emptyCreating ? "생성 중..." : "📁 빈 프로젝트 생성"}
              </Button>
            </div>
          ) : null}

          {activeTab === "existing" ? (
            <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-white p-4">
              <p className="text-xs text-[var(--muted)]">
                등록된 프로젝트를 선택하거나 삭제합니다.
              </p>
              {projects.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  등록된 프로젝트가 없습니다.
                </p>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.id}
                    className={`rounded-2xl border px-3 py-2 ${
                      project.is_active
                        ? "border-[var(--accent)] bg-[var(--paper)]"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--ink)]">
                          {project.name}
                        </p>
                        <p className="truncate text-xs text-[var(--muted)]">
                          {project.path}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!project.is_active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSelectProject(project.id)}
                          >
                            선택
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-500"
                          onClick={() => handleDeleteProject(project.id)}
                        >
                          삭제
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  );
}
