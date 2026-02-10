'use client';

import type { MarketAgent } from '@/lib/client-db';

interface AgentMarketCardProps {
  agent: MarketAgent;
  onAddToTeam: (agent: MarketAgent) => void;
  isInTeam?: boolean;
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  management: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  development: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  testing: { bg: 'bg-green-500/20', text: 'text-green-400' },
  operations: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  custom: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
};

const categoryLabels: Record<string, string> = {
  management: '관리',
  development: '개발',
  testing: '테스트',
  operations: '운영',
  custom: '커스텀',
};

const providerBadge: Record<string, { emoji: string; label: string; bg: string; text: string }> = {
  claude: { emoji: '🟠', label: 'Claude', bg: 'bg-indigo-500/20', text: 'text-indigo-400' },
  codex: { emoji: '🔵', label: 'Codex', bg: 'bg-orange-500/20', text: 'text-orange-400' },
  opencode: { emoji: '⚪️', label: 'OpenCode', bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
};

export function AgentMarketCard({ agent, onAddToTeam, isInTeam }: AgentMarketCardProps) {
  const colors = categoryColors[agent.category] || categoryColors.custom;

  return (
    <div className="p-4 bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg hover:border-[var(--accent-primary)] transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="w-12 h-12 flex items-center justify-center text-2xl bg-[var(--bg-tertiary)] rounded-lg shrink-0">
          {agent.avatar}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-[var(--text-primary)] truncate">{agent.name}</h3>
            {agent.is_builtin === 1 && (
              <span className="px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] rounded">
                기본
              </span>
            )}
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-2 line-clamp-2">
            {agent.description}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 text-xs rounded ${colors.bg} ${colors.text}`}>
              {categoryLabels[agent.category]}
            </span>
            {agent.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 text-xs rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]"
              >
                {tag}
              </span>
            ))}
            {agent.tags.length > 2 && (
              <span className="text-xs text-[var(--text-muted)]">
                +{agent.tags.length - 2}
              </span>
            )}
          </div>
        </div>

        {/* Add Button */}
        <button
          onClick={() => onAddToTeam(agent)}
          disabled={isInTeam}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors shrink-0 ${
            isInTeam
              ? 'bg-[var(--bg-tertiary)] text-[var(--text-muted)] cursor-not-allowed'
              : 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-secondary)]'
          }`}
        >
          {isInTeam ? '추가됨' : '+ 추가'}
        </button>
      </div>

      {/* Capabilities & Provider */}
      {(agent.can_generate_images === 1 || agent.can_log_screenshots === 1 || agent.preferred_provider) && (
        <div className="mt-3 pt-3 border-t border-[var(--border-primary)] flex gap-3 text-xs text-[var(--text-muted)]">
          {agent.preferred_provider && (() => {
            const badge = providerBadge[agent.preferred_provider] || providerBadge.claude;
            return (
              <span className={`px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}>
                {badge.emoji} {badge.label}
              </span>
            );
          })()}
          {agent.can_generate_images === 1 && (
            <span>🎨 이미지 생성</span>
          )}
          {agent.can_log_screenshots === 1 && (
            <span>📸 스크린샷</span>
          )}
        </div>
      )}
    </div>
  );
}
