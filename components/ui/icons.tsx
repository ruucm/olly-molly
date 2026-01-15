import type { LucideIcon } from 'lucide-react';

type IconProps = {
  icon: LucideIcon;
  className?: string;
  title?: string;
  'aria-label'?: string;
};

/**
 * Design-system icon wrapper.
 * Keeps icon sizing/styling consistent across the app.
 */
export function Icon({ icon: IconCmp, className = 'w-4 h-4', title, ...rest }: IconProps) {
  return <IconCmp className={className} title={title} aria-hidden={title ? undefined : true} {...rest} />;
}

