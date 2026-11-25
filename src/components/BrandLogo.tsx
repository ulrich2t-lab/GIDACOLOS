import React from 'react';

interface BrandLogoProps {
  variant?: 'mark' | 'full';
  size?: 'sm' | 'md' | 'lg';
  inverted?: boolean;
  subtitle?: React.ReactNode;
}

const SIZE_MAP = {
  sm: { box: 'w-8 h-8 rounded-lg', icon: 'w-5 h-5', title: 'text-base', sub: 'text-[11px]' },
  md: { box: 'w-9 h-9 rounded-xl', icon: 'w-5 h-5', title: 'text-base sm:text-lg', sub: 'text-xs' },
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
      className={`${s.box} inline-flex items-center justify-center shrink-0 border transition-colors shadow-xs ${
        inverted
          ? 'bg-[#93A3FF] border-[#93A3FF]/50 text-[#0B1437]'
          : 'bg-[#0B1437] dark:bg-[#93A3FF] border-[#0B1437]/15 dark:border-[#93A3FF]/40 text-white dark:text-[#0B1437]'
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
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M7.5 13.5V25.5H24.5V13.5"
          stroke="currentColor"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13 25.5V18.5C13 17.4 13.9 16.5 15 16.5H17C18.1 16.5 19 17.4 19 18.5V25.5"
          stroke={inverted ? '#0B1437' : '#2DD4BF'}
          className={inverted ? '' : 'dark:stroke-[#0B1437]'}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="16"
          cy="11.5"
          r="1.6"
          fill={inverted ? '#0B1437' : '#2DD4BF'}
          className={inverted ? '' : 'dark:fill-[#0B1437]'}
        />
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
            inverted ? 'text-white' : 'text-[#0B1437] dark:text-white'
          }`}
        >
          Gida<span className={inverted ? 'text-[#93A3FF]' : 'text-teal-700 dark:text-[#93A3FF]'}>Colocs</span>
        </span>
        {subtitle && (
          <span
            className={`${s.sub} font-medium mt-0.5 whitespace-nowrap ${
              inverted ? 'text-indigo-200' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
