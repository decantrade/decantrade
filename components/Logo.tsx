export function Logo({ className }: { className?: string }) {
  // Decant mark — a funnel decanting clear amber liquid off its sediment.
  return (
    <svg
      viewBox="0 0 96 96"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="decant-amber"
          x1="20"
          y1="20"
          x2="76"
          y2="60"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#f4cf6a" />
          <stop offset="1" stopColor="#e8b84b" />
        </linearGradient>
        <linearGradient
          id="decant-amber-stem"
          x1="48"
          y1="58"
          x2="48"
          y2="86"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#e8b84b" />
          <stop offset="1" stopColor="#d9a73a" />
        </linearGradient>
      </defs>
      <path d="M27 30 L69 30 L58.5 45.5 L37.5 45.5 Z" fill="url(#decant-amber)" />
      <path
        d="M22 24 H74 L54 53 V67 H42 V53 Z"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M48 72 C52 78 54 81 54 84 a6 6 0 0 1 -12 0 C42 81 44 78 48 72 Z"
        fill="url(#decant-amber-stem)"
      />
      <circle cx="33.5" cy="40" r="2" fill="#6fcf97" />
    </svg>
  );
}
