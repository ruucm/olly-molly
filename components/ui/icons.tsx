import type { LucideIcon, LucideProps } from 'lucide-react';

type IconProps = Omit<LucideProps, 'ref'> & {
  icon: LucideIcon;
  className?: string;
};

/**
 * Design-system icon wrapper.
 * Keeps icon sizing/styling consistent across the app.
 */
export function Icon({ icon: IconCmp, className = 'w-4 h-4', ...rest }: IconProps) {
  const ariaLabel = rest['aria-label'];
  return <IconCmp className={className} aria-hidden={ariaLabel ? undefined : true} {...rest} />;
}

