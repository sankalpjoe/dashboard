/**
 * Shared design tokens — single source of truth for the dashboard UI.
 * Replaces the per-page `T` objects previously duplicated in Intel.tsx,
 * Intelligence.tsx, etc. Polished-light palette.
 */

export const T = {
  // ── Surfaces ──
  bg:          '#ffffff',
  bgPage:      '#fafafa',   // page backdrop, slightly off-white
  bgPanel:     '#f7f7f5',   // sidebars / secondary panels
  bgHover:     '#f1f1ef',
  bgSelected:  '#ededeb',

  // ── Lines ──
  border:       '#e7e7e4',
  borderStrong: '#c9c9c5',

  // ── Text ──
  text:    '#111111',
  textMid: '#3d3d3a',
  textDim: '#71716d',

  // ── Severity (unchanged semantics) ──
  critical: '#dc2626',
  high:     '#ea580c',
  medium:   '#ca8a04',
  low:      '#16a34a',
  info:     '#2563eb',

  // ── Shape & depth ──
  radius:   6,
  radiusSm: 4,
  shadowSm: '0 1px 2px rgba(0,0,0,0.04)',
  shadow:   '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08)',

  // ── Type ──
  fontBody: "'Inter', sans-serif",
  fontMono: "'IBM Plex Mono', monospace",
} as const;

/** Severity → color */
export function sevColor(level: string): string {
  switch (level) {
    case 'critical': return T.critical;
    case 'high':     return T.high;
    case 'medium':   return T.medium;
    case 'info':     return T.info;
    default:         return T.low;
  }
}

/** Tinted background for severity chips (8% alpha of the severity color). */
export function sevTint(level: string): string {
  return `${sevColor(level)}14`;
}

export default T;
