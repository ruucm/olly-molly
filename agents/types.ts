export interface AgentDefinition {
  id: string;
  role: string;
  name: string;
  avatar: string;
  profile_image: string | null;
  system_prompt: string;
  is_default: number;
  can_generate_images: number;
  can_log_screenshots: number;
}

export type AgentCategory = 'management' | 'development' | 'testing' | 'operations' | 'custom';

export interface MarketAgentDefinition extends AgentDefinition {
  description: string;
  category: AgentCategory;
  tags: string[];
  is_builtin: number;
}

// Helper to get default metadata for built-in agents
export function getAgentMetadata(role: string): { description: string; category: AgentCategory; tags: string[] } {
  const metadata: Record<string, { description: string; category: AgentCategory; tags: string[] }> = {
    PM: {
      description: '프로젝트 관리와 티켓 생성을 담당하는 PM 에이전트입니다.',
      category: 'management',
      tags: ['project-management', 'planning', 'coordination'],
    },
    FE_DEV: {
      description: 'React, TypeScript, CSS를 전문으로 하는 프론트엔드 개발자입니다.',
      category: 'development',
      tags: ['frontend', 'react', 'typescript', 'css', 'ui'],
    },
    BACKEND_DEV: {
      description: 'API, 데이터베이스, 서버 로직을 담당하는 백엔드 개발자입니다.',
      category: 'development',
      tags: ['backend', 'api', 'database', 'node.js'],
    },
    QA: {
      description: '테스트 작성과 버그 검증을 담당하는 QA 엔지니어입니다.',
      category: 'testing',
      tags: ['testing', 'quality-assurance', 'test-automation'],
    },
    DEVOPS: {
      description: '배포, CI/CD, 인프라를 관리하는 DevOps 엔지니어입니다.',
      category: 'operations',
      tags: ['devops', 'ci-cd', 'deployment', 'infrastructure'],
    },
    BUG_HUNTER: {
      description: '코드베이스에서 버그를 찾아 수정하는 버그 헌터입니다.',
      category: 'testing',
      tags: ['debugging', 'bug-fixing', 'code-review'],
    },
  };

  return metadata[role] || {
    description: '사용자 정의 에이전트입니다.',
    category: 'custom',
    tags: [],
  };
}
