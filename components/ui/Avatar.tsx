'use client';

interface AvatarProps {
    src?: string | null;
    name: string;
    size?: 'sm' | 'md' | 'lg';
    emoji?: string | null;
    badge?: string | null;
}

export function Avatar({ src, name, size = 'md', emoji, badge }: AvatarProps) {
    const sizes = {
        sm: 'w-6 h-6 text-xs',
        md: 'w-8 h-8 text-sm',
        lg: 'w-12 h-12 text-lg',
    };

    const badgeSizes = {
        sm: 'w-3 h-3 text-[8px]',
        md: 'w-4 h-4 text-[10px]',
        lg: 'w-6 h-6 text-sm',
    };

    // Get initials from name
    const initials = name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);

    // Generate consistent color based on name
    const colors = [
        'from-violet-500 to-purple-600',
        'from-blue-500 to-indigo-600',
        'from-emerald-500 to-teal-600',
        'from-amber-500 to-orange-600',
        'from-rose-500 to-pink-600',
    ];
    const colorIndex = name.charCodeAt(0) % colors.length;

    const Badge = () => {
        if (!badge) return null;
        return (
            <div className={`
        absolute -bottom-1 -right-1
        ${badgeSizes[size]} rounded-full flex items-center justify-center
        bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700
      `}>
                <span>{badge}</span>
            </div>
        );
    };

    if (src) {
        return (
            <div className="relative inline-block">
                <img
                    src={src}
                    alt={name}
                    className={`${sizes[size]} rounded-full object-cover bg-white`}
                />
                <Badge />
            </div>
        );
    }

    if (emoji) {
        return (
            <div className="relative inline-block">
                <div className={`
          ${sizes[size]} rounded-full flex items-center justify-center
          bg-gradient-to-br ${colors[colorIndex]}
        `}>
                    <span className={size === 'lg' ? 'text-2xl' : size === 'md' ? 'text-lg' : 'text-base'}>
                        {emoji}
                    </span>
                </div>
                <Badge />
            </div>
        );
    }

    return (
        <div className="relative inline-block">
            <div className={`
        ${sizes[size]} rounded-full flex items-center justify-center font-medium text-white
        bg-gradient-to-br ${colors[colorIndex]}
      `}>
                {initials}
            </div>
            <Badge />
        </div>
    );
}
