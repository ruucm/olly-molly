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
