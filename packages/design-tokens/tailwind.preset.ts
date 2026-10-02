// Decibels Tailwind preset (PRD section 12.6)
const preset = {
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: {
        100: 'var(--color-white-100)',
        200: 'var(--color-white-200)',
        300: 'var(--color-white-300)',
        400: 'var(--color-white-400)',
        500: 'var(--color-white-500)',
        800: 'var(--color-white-800)',
        900: 'var(--color-white-900)',
      },
      black: {
        0: 'var(--color-black-0)',
        200: 'var(--color-black-200)',
        300: 'var(--color-black-300)',
        400: 'var(--color-black-400)',
        500: 'var(--color-black-500)',
        700: 'var(--color-black-700)',
      },
      accent: {
        50: 'var(--color-accent-050)',
        100: 'var(--color-accent-100)',
        500: 'var(--color-accent-500)',
        600: 'var(--color-accent-600)',
        700: 'var(--color-accent-700)',
      },
      success: { 100: 'var(--color-success-100)', 500: 'var(--color-success-500)', 700: 'var(--color-success-700)' },
      warning: { 100: 'var(--color-warning-100)', 500: 'var(--color-warning-500)', 700: 'var(--color-warning-700)' },
      danger: {
        100: 'var(--color-danger-100)',
        500: 'var(--color-danger-500)',
        600: 'var(--color-danger-600)',
        700: 'var(--color-danger-700)',
      },
      page: 'var(--color-page-background)',
      canvas: 'var(--color-canvas)',
      overlay: 'var(--color-overlay)',
      panel: 'var(--color-panel-2)',
      rule: 'var(--color-rule-soft)',
      faint: 'var(--color-faint)',
      btnborder: 'var(--color-btn-border)',
    },
    fontFamily: {
      sans: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
      display: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
      // No monospace face in the product. Numbers use Geist with tabular figures instead.
      mono: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
    },
    borderRadius: { none: '0', sm: '0', md: '0', lg: '0', card: '9px', full: '999px' },
    zIndex: {
      0: '0',
      10: '10',
      20: '20',
      navOverlay: '90',
      navContent: '91',
      header: '92',
      menu: '93',
      dialogOverlay: '100',
      dialog: '101',
      toast: '110',
    },
    boxShadow: { none: 'none', popover: '0 4px 12px rgba(0,0,0,0.06)' },
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px' },
  },
};

export default preset;
