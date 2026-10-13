// The LinkedIn mark in LinkedIn blue (brand colours stay as they are, like the Google icon).
export function LinkedinLogo({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <rect width="24" height="24" rx="4" fill="#0A66C2" />
      <path
        fill="#fff"
        d="M7.1 9.5H4.6V19h2.5V9.5zM5.85 5A1.45 1.45 0 1 0 5.85 7.9 1.45 1.45 0 0 0 5.85 5zM19.4 13.6c0-2.55-.55-4.3-3.5-4.3-1.42 0-2.37.78-2.76 1.52h-.04V9.5h-2.4V19h2.5v-4.7c0-1.24.24-2.44 1.77-2.44 1.51 0 1.53 1.42 1.53 2.52V19h2.5l.4-5.4z"
      />
    </svg>
  );
}
