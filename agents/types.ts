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
  preferred_provider?: 'claude' | 'opencode' | 'codex';
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
    BUG_HUNTER: {
      description: '코드베이스에서 버그를 찾아 수정하는 버그 헌터입니다.',
      category: 'testing',
      tags: ['debugging', 'bug-fixing', 'code-review'],
    },
    UI_ARCHITECT: {
      description: 'Tailwind CSS 전문가로 index.html만 작성하는 UI/UX 아키텍트입니다.',
      category: 'development',
      tags: ['html', 'tailwind', 'css', 'ui', 'markup'],
    },
    INTERACTION_DEV: {
      description: 'client.js 전담 클라이언트 사이드 JavaScript 개발자입니다.',
      category: 'development',
      tags: ['javascript', 'client', 'dom', 'frontend'],
    },
    VERCEL_AGENT: {
      description: 'Vercel 배포 자동화 및 최적화를 담당하는 에이전트입니다.',
      category: 'operations',
      tags: ['vercel', 'deployment', 'hosting', 'ci-cd'],
    },
    SIMPLE_BACKEND: {
      description: 'server.js 전담 Node.js 백엔드 개발자입니다.',
      category: 'development',
      tags: ['node.js', 'express', 'backend', 'api', 'server'],
    },
    GITHUB_AGENT: {
      description: 'GitHub 레포지토리 관리 및 동기화를 담당하는 에이전트입니다.',
      category: 'operations',
      tags: ['github', 'git', 'repository', 'sync', 'version-control'],
    },
    RECIPE: {
      description: '15분 내외 초간단 레시피를 md 파일과 썸네일 이미지로 정리해주는 요리 전문가입니다.',
      category: 'custom',
      tags: ['recipe', 'cooking', 'food', 'markdown', 'image-generation'],
    },
    DYSTOPIA_DIARY: {
      description: '사용자의 하루를 디스토피아 SF 세계관의 소설 로그로 변환하는 기록 에이전트입니다.',
      category: 'custom',
      tags: ['writing', 'sf', 'diary', 'story', 'creative', 'image-generation'],
    },
    INSTAGRAM_ANALYST: {
      description: '인스타그램 광고 소재의 훅, 카피, 비주얼, CTA를 체계적으로 분석하는 퍼포먼스 마케팅 애널리스트입니다.',
      category: 'custom',
      tags: ['instagram', 'ad-analysis', 'marketing', 'creative', 'performance'],
    },
    AD_CREATOR: {
      description: '분석 데이터 기반으로 전환율 높은 광고 카피, 비주얼 시안, 크리에이티브 이미지를 제작하는 광고 콘텐츠 제작자입니다.',
      category: 'custom',
      tags: ['ad-creative', 'copywriting', 'visual-design', 'marketing', 'image-generation'],
    },
    TOSSPAYMENTS: {
      description: '토스페이먼츠 결제위젯 연동을 전문적으로 도와주는 결제 시스템 전문가입니다.',
      category: 'development',
      tags: ['tosspayments', 'payment', 'checkout', 'widget', 'fintech', 'e-commerce'],
    },
    REACT_SINGLE: {
      description: 'CDN 기반 React와 Tailwind CSS로 index.html 단일 파일만으로 완전한 SPA를 개발하는 전문가입니다.',
      category: 'development',
      tags: ['react', 'spa', 'tailwind', 'javascript', 'frontend', 'single-file'],
    },
    AUTH_SINGLE: {
      description: 'Express 기반 로그인/회원가입 API를 server.js 단일 파일로 구축하는 인증 시스템 전문가입니다.',
      category: 'development',
      tags: ['express', 'authentication', 'login', 'jwt', 'bcrypt', 'single-file'],
    },
    GOOGLE_LOGIN: {
      description: 'Google Identity Services(GIS)를 활용한 Google 로그인 OAuth 연동 전문가입니다.',
      category: 'development',
      tags: ['google', 'oauth', 'login', 'gis', 'authentication', 'vercel'],
    },
    IOS_PUSH: {
      description: 'iOS PWA 웹 푸시 알림 구현 및 Vercel 서버리스 환경 배포를 전문으로 하는 에이전트입니다.',
      category: 'development',
      tags: ['ios', 'pwa', 'push-notification', 'service-worker', 'vercel', 'web-push'],
    },
    IOS_PWA_LAYOUT: {
      description: 'iOS Safari/PWA의 뷰포트, Safe Area, 레이아웃 문제를 해결하는 전문가입니다.',
      category: 'development',
      tags: ['ios', 'pwa', 'layout', 'viewport', 'safe-area', 'css', 'mobile'],
    },
    KAKAO_LOGIN: {
      description: '카카오 OAuth 2.0 REST API를 활용한 카카오 로그인 연동 전문가입니다.',
      category: 'development',
      tags: ['kakao', 'oauth', 'login', 'authentication', 'vercel', 'korean'],
    },
    SUPABASE_UPLOAD: {
      description: 'Supabase Storage와 multer를 활용한 파일/이미지 업로드 기능 구현 전문가입니다.',
      category: 'development',
      tags: ['supabase', 'storage', 'upload', 'multer', 'file', 'image', 's3'],
    },
  };

  return metadata[role] || {
    description: '사용자 정의 에이전트입니다.',
    category: 'custom',
    tags: [],
  };
}
