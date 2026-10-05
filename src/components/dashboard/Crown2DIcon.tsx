import React, { useId } from "react";

interface Crown2DIconProps {
  className?: string;
  fill?: string;
}

/**
 * Premium 2D Gold Crown Icon with rich metallic gradient and clean vector geometry.
 */
export function Crown2DIcon({
  className = "w-6 h-6",
  fill,
}: Crown2DIconProps) {
  const rawId = useId();
  const gradId = `crown-gold-${rawId.replace(/:/g, "")}`;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id={gradId}
          x1="3"
          y1="2"
          x2="21"
          y2="22"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFF275" />
          <stop offset="35%" stopColor="#FBBF24" />
          <stop offset="70%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>

      {/* 5 Tip Spheres */}
      <circle cx="3" cy="8" r="1.4" fill={fill || `url(#${gradId})`} />
      <circle cx="7.5" cy="6" r="1.4" fill={fill || `url(#${gradId})`} />
      <circle cx="12" cy="3.5" r="1.8" fill={fill || `url(#${gradId})`} />
      <circle cx="16.5" cy="6" r="1.4" fill={fill || `url(#${gradId})`} />
      <circle cx="21" cy="8" r="1.4" fill={fill || `url(#${gradId})`} />

      {/* Crown Body with 5 Peaks */}
      <path
        d="M3 9.5 L5.5 14 L7.5 7 L10 13 L12 4.5 L14 13 L16.5 7 L18.5 14 L21 9.5 L19.2 17.5 H4.8 L3 9.5 Z"
        fill={fill || `url(#${gradId})`}
      />

      {/* Bottom Royal Base Band */}
      <rect
        x="3.8"
        y="19"
        width="16.4"
        height="2.6"
        rx="1.3"
        fill={fill || `url(#${gradId})`}
      />

      {/* Sparkling Jewels Inset on Base Band */}
      <circle cx="7.5" cy="20.3" r="0.75" fill="#FFFBEB" opacity="0.9" />
      <circle cx="12" cy="20.3" r="0.9" fill="#FFFBEB" opacity="0.95" />
      <circle cx="16.5" cy="20.3" r="0.75" fill="#FFFBEB" opacity="0.9" />
    </svg>
  );
}
