const CrosshairSVG = ({ size = 48, className = "" }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <circle cx="24" cy="24" r="18" stroke="currentColor" strokeWidth="0.75" />
    <circle cx="24" cy="24" r="10" stroke="currentColor" strokeWidth="0.5" />
    <circle cx="24" cy="24" r="2" fill="currentColor" opacity="0.4" />
    <line x1="24" y1="2" x2="24" y2="14" stroke="currentColor" strokeWidth="0.5" />
    <line x1="24" y1="34" x2="24" y2="46" stroke="currentColor" strokeWidth="0.5" />
    <line x1="2" y1="24" x2="14" y2="24" stroke="currentColor" strokeWidth="0.5" />
    <line x1="34" y1="24" x2="46" y2="24" stroke="currentColor" strokeWidth="0.5" />
    {/* Globe lines */}
    <ellipse cx="24" cy="24" rx="18" ry="8" stroke="currentColor" strokeWidth="0.4" />
    <ellipse cx="24" cy="24" rx="8" ry="18" stroke="currentColor" strokeWidth="0.4" />
  </svg>
);

export default CrosshairSVG;
