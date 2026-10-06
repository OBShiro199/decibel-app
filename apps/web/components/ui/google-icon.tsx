// The Google "G" in its four brand colours. Brand marks are shown as they are, never recoloured.
export function GoogleIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={className}>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.300-2.100 3.500-5.200 3.500-8.700Z" />
      <path fill="#34A853" d="M12 24c3.200 0 6-1.100 8-2.900l-3.900-3c-1.100.7-2.500 1.200-4.100 1.200a7.200 7.200 0 0 1-6.700-4.900h-4v3.100A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.300 14.300a7.200 7.200 0 0 1 0-4.600V6.600h-4a12 12 0 0 0 0 10.800l4-3.100Z" />
      <path fill="#EA4335" d="M12 4.800c1.800 0 3.300.6 4.600 1.800L20 3.100A12 12 0 0 0 1.300 6.600l4 3.100A7.200 7.200 0 0 1 12 4.800Z" />
    </svg>
  );
}
