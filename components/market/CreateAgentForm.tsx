'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import type { AgentCategory } from '@/agents';

interface CreateAgentFormProps {
  onSave: (data: {
    role: string;
    name: string;
    avatar: string;
    system_prompt: string;
    description: string;
    category: AgentCategory;
    tags: string[];
    can_generate_images: boolean;
    can_log_screenshots: boolean;
    preferred_provider: 'claude' | 'opencode' | 'codex';
  }) => void;
  onCancel: () => void;
}

type AgentProvider = 'claude' | 'opencode' | 'codex';

const providerOptions: { value: AgentProvider; label: string; emoji: string; activeColor: string }[] = [
  { value: 'claude', label: 'Claude', emoji: '🟠', activeColor: 'bg-indigo-500 text-white' },
  { value: 'codex', label: 'Codex', emoji: '🔵', activeColor: 'bg-orange-500 text-white' },
  { value: 'opencode', label: 'OpenCode', emoji: '⚪️', activeColor: 'bg-emerald-500 text-white' },
];

const categoryOptions: { value: AgentCategory; label: string; emoji: string }[] = [
  { value: 'management', label: '관리', emoji: '📋' },
  { value: 'development', label: '개발', emoji: '💻' },
  { value: 'testing', label: '테스트', emoji: '🧪' },
  { value: 'operations', label: '운영', emoji: '🔧' },
  { value: 'custom', label: '커스텀', emoji: '✨' },
];

export function CreateAgentForm({ onSave, onCancel }: CreateAgentFormProps) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<AgentCategory>('custom');
  const [tags, setTags] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [canGenerateImages, setCanGenerateImages] = useState(false);
  const [canLogScreenshots, setCanLogScreenshots] = useState(false);
  const [preferredProvider, setPreferredProvider] = useState<AgentProvider>('claude');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim() || !description.trim()) return;

    onSave({
      role: name.toUpperCase().replace(/\s+/g, '_'),
      name: name.trim(),
      avatar: avatar.trim() || '🤖',
      system_prompt: systemPrompt.trim(),
      description: description.trim(),
      category,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      can_generate_images: canGenerateImages,
      can_log_screenshots: canLogScreenshots,
      preferred_provider: preferredProvider,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          label="이름 *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: 코드 리뷰어"
        />
        <Input
          label="아바타 (이모지)"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          placeholder="🤖"
          maxLength={2}
        />
      </div>

      <Input
        label="설명 *"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="이 에이전트가 무엇을 하는지 간단히 설명해주세요"
      />

      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          카테고리
        </label>
        <div className="flex flex-wrap gap-2">
          {categoryOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setCategory(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                category === opt.value
                  ? 'bg-[var(--accent-primary)] text-white border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:border-[var(--accent-primary)]'
              }`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          기본 Provider
        </label>
        <div className="flex gap-2">
          {providerOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPreferredProvider(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-md font-medium transition-all ${
                preferredProvider === opt.value
                  ? opt.activeColor
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-primary)] hover:border-[var(--accent-primary)]'
              }`}
            >
              {opt.emoji} {opt.label}
            </button>
          ))}
        </div>
      </div>

      <Input
        label="태그 (콤마로 구분)"
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="예: react, typescript, frontend"
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
          <input
            type="checkbox"
            id="createCanGenerateImages"
            checked={canGenerateImages}
            onChange={(e) => setCanGenerateImages(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
          />
          <label htmlFor="createCanGenerateImages" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
            🎨 이미지 생성 도구 허용
          </label>
        </div>
        <div className="flex items-center gap-2 p-3 bg-[var(--bg-tertiary)] rounded-lg">
          <input
            type="checkbox"
            id="createCanLogScreenshots"
            checked={canLogScreenshots}
            onChange={(e) => setCanLogScreenshots(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)]"
          />
          <label htmlFor="createCanLogScreenshots" className="text-sm font-medium text-[var(--text-primary)] cursor-pointer select-none">
            📸 스크린샷 로깅 허용
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
          시스템 프롬프트 *
        </label>
        <Textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={8}
          placeholder="이 AI 에이전트의 역할과 책임을 설명하는 시스템 프롬프트를 입력하세요..."
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-[var(--border-primary)]">
        <Button type="button" variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || !systemPrompt.trim() || !description.trim()}
        >
          마켓에 등록
        </Button>
      </div>
    </form>
  );
}
