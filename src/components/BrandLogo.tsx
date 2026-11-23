import React from 'react';

interface BrandLogoProps {
  variant?: 'mark' | 'full';
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
  subtitle?: string;
}

const SIZE_MAP = {
  sm: { box: 'w-8 h-8 rounded-lg', icon: 'w-5 h-5', title: 'text-base', sub: 'text-[10px]' },
  md: { box: 'w-9 h-9 rounded-xl', icon: 'w-5 h-5', title: 'text-base sm:text-lg', sub: 'text-[11px]' },
  lg: { box: 'w-12 h-12 rounded-2xl', icon: 'w-7 h-7', title: 'text-xl', sub: 'text-xs' },
} as const;

export function BrandLogo({
  variant = 'full',
  size = 'md',
  inverted = false,
  subtitle,
}: BrandLogoProps) {
  const s = SIZE_MAP[size];

  const mark = (
    <span
      className={`${s.box} inline-flex items-center justify-center shrink-0 border transition-colors ${
        inverted
          ? 'bg-teal-500/15 border-teal-400/35 text-teal-300'
          : 'bg-[#0A2540] dark:bg-teal-600 border-[#0A2540]/15 dark:border-teal-500/40 text-white'
      }`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={s.icon}
      >
        {/* Architectural roof & twin colocation doorways */}
        <path
          d="M4.5 14.5L16 5.5L27.5 14.5"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 13.5V25.5H24.5V13.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 25.5V18.5C13 17.4 13.9 16.5 15 16.5H17C18.1 16.5 19 17.4 19 18.5V25.5"
          stroke={inverted ? '#5EEAD4' : '#2DD4BF'}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="16" cy="11.5" r="1.5" fill={inverted ? '#5EEAD4' : '#2DD4BF'} />
      </svg>
    </span>
  );

  if (variant === 'mark') return mark;

  return (
    <span className="inline-flex items-center gap-2.5 shrink-0">
      {mark}
      <span className="flex flex-col leading-none">
        <span
          className={`${s.title} font-extrabold tracking-tight font-display whitespace-nowrap ${
            inverted ? 'text-white' : 'text-[#0A2540] dark:text-white'
          }`}
        >
          Gida<span className={inverted ? 'text-teal-300' : 'text-teal-700 dark:text-teal-400'}>Colocs</span>
        </span>
        {subtitle && (
          <span
            className={`${s.sub} font-medium mt-0.5 whitespace-nowrap ${
              inverted ? 'text-teal-300/90' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
