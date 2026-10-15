// The platform's mark: a mortarboard set in the brand gradient.
//
// A server component, and shared on purpose. The sign-in screen and the
// console header are the two places anyone sees platform branding, and when
// the mark lived only inside login-form.js the console header had no logo at
// all -- which is most of why it read as an unfinished prototype next to the
// school panel.
export default function PlatformMark({ size = 44, radius = '0.9rem', glow = true }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center text-white"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--brand-grad)',
        // The glow is what stops the mark reading as a flat sticker on a dark
        // header. Off for small sizes, where it only muddies the edge.
        boxShadow: glow ? '0 8px 24px -10px rgb(124 58 237 / 0.9)' : undefined,
      }}
      aria-hidden="true"
    >
      <svg
        width={Math.round(size * 0.52)}
        height={Math.round(size * 0.52)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2.5 9 12 4.5 21.5 9 12 13.5z" />
        <path d="M6.5 11.2v4.3c0 1.3 2.5 2.3 5.5 2.3s5.5-1 5.5-2.3v-4.3" />
        <path d="M21.5 9v5.2" />
      </svg>
    </span>
  )
}
