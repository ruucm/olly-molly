'use client';

import { useState, useMemo } from 'react';
import { Modal } from '@/components/ui/Modal';
import { AgentMarketCard } from './AgentMarketCard';
import { CreateAgentForm } from './CreateAgentForm';
import type { MarketAgent, Member } from '@/lib/client-db';
import type { AgentCategory } from '@/agents';

type TabType = 'browse' | 'my-agents' | 'create';

interface AgentMarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketAgents: MarketAgent[];
  members: Member[];
  onAddToTeam: (agentId: string) => void;
  onCreateMarketAgent: (data: {
    role: string;
    name: string;
    avatar: string;
    system_prompt: string;
    description: string;
    category: AgentCategory;
    tags: string[];
    can_generate_images: boolean;
    can_log_screenshots: boolean;
  }) => void;
  onDeleteMarketAgent: (id: string) => void;
}

const categoryFilters: { value: AgentCategory | 'all'; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'management', label: '관리' },
  { value: 'development', label: '개발' },
  { value: 'testing', label: '테스트' },
  { value: 'operations', label: '운영' },
  { value: 'custom', label: '커스텀' },
];

export function AgentMarketModal({
  isOpen,
  onClose,
  marketAgents,
  members,
  onAddToTeam,
  onCreateMarketAgent,
  onDeleteMarketAgent,
}: AgentMarketModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('browse');
  const [categoryFilter, setCategoryFilter] = useState<AgentCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Get IDs of agents already in team
  const teamAgentIds = useMemo(() => {
    return new Set(members.map((m) => m.source_market_agent_id).filter(Boolean));
  }, [members]);

  // Filter agents based on category and search
  const filteredAgents = useMemo(() => {
    return marketAgents.filter((agent) => {
      if (categoryFilter !== 'all' && agent.category !== categoryFilter) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          agent.name.toLowerCase().includes(query) ||
          agent.description.toLowerCase().includes(query) ||
          agent.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      }
      return true;
    });
  }, [marketAgents, categoryFilter, searchQuery]);

  // Separate builtin and user-created agents
  const builtinAgents = filteredAgents.filter((a) => a.is_builtin === 1);
  const userAgents = marketAgents.filter((a) => a.is_builtin === 0);

  const handleAddToTeam = (agent: MarketAgent) => {
    onAddToTeam(agent.id);
  };

  const handleCreateAgent = (data: Parameters<typeof onCreateMarketAgent>[0]) => {
    onCreateMarketAgent(data);
    setActiveTab('my-agents');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Agent Market" size="4xl">
      {/* Tabs */}
      <div className="flex gap-1 p-1 mb-4 bg-[var(--bg-tertiary)] rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('browse')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'browse'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          🏪 브라우즈
        </button>
        <button
          onClick={() => setActiveTab('my-agents')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'my-agents'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          📦 내 에이전트
          {userAgents.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-[var(--accent-primary)] text-white rounded-full">
              {userAgents.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('create')}
          className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'create'
              ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          ➕ 새 에이전트
        </button>
      </div>

      {/* Browse Tab */}
      {activeTab === 'browse' && (
        <div>
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="에이전트 검색..."
              className="flex-1 px-3 py-2 text-sm bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-md text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
            />
            <div className="flex gap-1 overflow-x-auto pb-1">
              {categoryFilters.map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setCategoryFilter(filter.value)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    categoryFilter === filter.value
                      ? 'bg-[var(--accent-primary)] text-white'
                      : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agent Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
            {builtinAgents.map((agent) => (
              <AgentMarketCard
                key={agent.id}
                agent={agent}
                onAddToTeam={handleAddToTeam}
                isInTeam={teamAgentIds.has(agent.id)}
              />
            ))}
          </div>

          {filteredAgents.length === 0 && (
            <div className="py-12 text-center text-[var(--text-muted)]">
              검색 결과가 없습니다
            </div>
          )}
        </div>
      )}

      {/* My Agents Tab */}
      {activeTab === 'my-agents' && (
        <div>
          {userAgents.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-[var(--text-muted)] mb-4">
                아직 생성한 에이전트가 없습니다
              </p>
              <button
                onClick={() => setActiveTab('create')}
                className="px-4 py-2 text-sm bg-[var(--accent-primary)] text-white rounded-md hover:bg-[var(--accent-secondary)] transition-colors"
              >
                ➕ 새 에이전트 만들기
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {userAgents.map((agent) => (
                <div key={agent.id} className="relative group">
                  <AgentMarketCard
                    agent={agent}
                    onAddToTeam={handleAddToTeam}
                    isInTeam={teamAgentIds.has(agent.id)}
                  />
                  <button
                    onClick={() => {
                      if (confirm(`"${agent.name}" 에이전트를 마켓에서 삭제하시겠습니까?`)) {
                        onDeleteMarketAgent(agent.id);
                      }
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-red-500/10 text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/20"
                    title="삭제"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Tab */}
      {activeTab === 'create' && (
        <CreateAgentForm
          onSave={handleCreateAgent}
          onCancel={() => setActiveTab('browse')}
        />
      )}
    </Modal>
  );
}
