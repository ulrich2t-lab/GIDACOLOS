import { useState } from 'react';
import { getInitials } from '../lib/formatters';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  const dims =
    size === 'sm'
      ? 'w-7 h-7 text-[11px]'
      : size === 'lg'
        ? 'w-10 h-10 text-sm'
        : 'w-8 h-8 text-xs';

  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setImgError(true)}
        className={`${dims} rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      className={`${dims} rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold flex items-center justify-center shrink-0 select-none border border-slate-300/60 dark:border-slate-700`}
    >
      {getInitials(name)}
    </div>
  );
}
