import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

export default function ThreePeopleIcon({ size = 18, width, height, ...props }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Centre person */}
      <circle cx="12" cy="7" r="2.5" />
      <path d="M8 21v-2a4 4 0 0 1 4-4 4 4 0 0 1 4 4v2" />
      {/* Left person */}
      <circle cx="4.5" cy="8.5" r="2" />
      <path d="M1 21v-1.5a3.5 3.5 0 0 1 3.5-3.5H5" />
      {/* Right person */}
      <circle cx="19.5" cy="8.5" r="2" />
      <path d="M23 21v-1.5A3.5 3.5 0 0 0 19.5 16H19" />
    </svg>
  );
}
