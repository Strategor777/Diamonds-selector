import React from 'react';
import { DiamondShape } from '../types/diamond';

interface DiamondShapeIconProps {
  shape: DiamondShape;
  className?: string;
  filled?: boolean;
}

export const DiamondShapeIcon: React.FC<DiamondShapeIconProps> = ({
  shape,
  className = 'w-6 h-6',
  filled = false,
}) => {
  const fill = filled ? 'currentColor' : 'none';
  const fillOpacity = filled ? 0.08 : 0;

  switch (shape) {
    case 'Round':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,9 28,14 31,20 28,26 20,31 12,26 9,20 12,14" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M20 5V9M20 31V35M5 20H9M31 20H35M9.5 9.5L12 14M30.5 9.5L28 14M9.5 30.5L12 26M30.5 30.5L28 26" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Oval':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <ellipse cx="20" cy="20" rx="11.5" ry="15.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <ellipse cx="20" cy="20" rx="6.5" ry="9.5" stroke="currentColor" strokeWidth="1" opacity="0.65" />
          <path d="M20 4.5V10.5M20 29.5V35.5M8.5 20H13.5M26.5 20H31.5M12 10L15.5 13.5M28 10L24.5 13.5M12 30L15.5 26.5M28 30L24.5 26.5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Emerald':
    case 'Octagon':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="12,5 28,5 32,9 32,31 28,35 12,35 8,31 8,9" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="14,9 26,9 28,11 28,29 26,31 14,31 12,29 12,11" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <rect x="15" y="13" width="10" height="14" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
          <path d="M8 9L15 13M32 9L25 13M8 31L15 27M32 31L25 27" stroke="currentColor" strokeWidth="0.9" opacity="0.5" />
        </svg>
      );
    case 'Princess':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <rect x="7" y="7" width="26" height="26" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <rect x="12" y="12" width="16" height="16" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M7 7L33 33M33 7L7 33M20 7V12M20 28V33M7 20H12M28 20H33" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Asscher':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="12,6 28,6 34,12 34,28 28,34 12,34 6,28 6,12" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="14,10 26,10 30,14 30,26 26,30 14,30 10,26 10,14" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <rect x="14.5" y="14.5" width="11" height="11" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
          <path d="M6 12L14.5 14.5M34 12L25.5 14.5M6 28L14.5 25.5M34 28L25.5 25.5" stroke="currentColor" strokeWidth="0.9" opacity="0.5" />
        </svg>
      );
    case 'Cushion':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <rect x="7" y="7" width="26" height="26" rx="7.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <rect x="12.5" y="12.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M9.5 9.5L13.5 13.5M30.5 9.5L26.5 13.5M9.5 30.5L13.5 26.5M30.5 30.5L26.5 26.5M20 7V12.5M20 27.5V33M7 20H12.5M27.5 20H33" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Pear':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M20 4C20 4 31.5 16.5 31.5 24.5C31.5 31 26.5 36 20 36C13.5 36 8.5 31 8.5 24.5C8.5 16.5 20 4 20 4Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <path d="M20 10C20 10 26.5 18.5 26.5 24C26.5 28 23.6 31 20 31C16.4 31 13.5 28 13.5 24C13.5 18.5 20 10 20 10Z" stroke="currentColor" strokeWidth="1" opacity="0.65" />
          <path d="M20 4V36M9.5 24H30.5" stroke="currentColor" strokeWidth="0.8" opacity="0.45" />
        </svg>
      );
    case 'Radiant':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="12,5 28,5 32,9 32,31 28,35 12,35 8,31 8,9" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="14.5,11 25.5,11 27.5,13 27.5,27 25.5,29 14.5,29 12.5,27 12.5,13" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M8 9L27.5 27M32 9L12.5 27M20 5V35M8 20H32" stroke="currentColor" strokeWidth="0.85" opacity="0.5" />
        </svg>
      );
    case 'Marquise':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M20 3.5C27.5 11.5 30.5 16.5 30.5 20C30.5 23.5 27.5 28.5 20 36.5C12.5 28.5 9.5 23.5 9.5 20C9.5 16.5 12.5 11.5 20 3.5Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <path d="M20 9.5C24.5 14.5 26 17.5 26 20C26 22.5 24.5 25.5 20 30.5C15.5 25.5 14 22.5 14 20C14 17.5 15.5 14.5 20 9.5Z" stroke="currentColor" strokeWidth="1" opacity="0.65" />
          <path d="M20 3.5V36.5M9.5 20H30.5" stroke="currentColor" strokeWidth="0.85" opacity="0.5" />
        </svg>
      );
    case 'Heart':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M20 34.5C20 34.5 6 24.5 6 15.5C6 10.5 9.8 7 14.2 7C17 7 19 8.6 20 10.6C21 8.6 23 7 25.8 7C30.2 7 34 10.5 34 15.5C34 24.5 20 34.5 20 34.5Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <path d="M20 28.5C20 28.5 11 22 11 16C11 13.5 12.8 11.5 15 11.5C17 11.5 19 13 20 15C21 13 23 11.5 25 11.5C27.2 11.5 29 13.5 29 16C29 22 20 28.5 20 28.5Z" stroke="currentColor" strokeWidth="1" opacity="0.65" />
        </svg>
      );
    case 'Trilliant':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M20 6C24 6 33.5 23 33.5 29C33.5 32.5 26 34 20 34C14 34 6.5 32.5 6.5 29C6.5 23 16 6 20 6Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,13 28,28 12,28" stroke="currentColor" strokeWidth="1" opacity="0.65" />
          <path d="M20 6V13M6.5 29L12 28M33.5 29L28 28" stroke="currentColor" strokeWidth="0.9" opacity="0.5" />
        </svg>
      );
    case 'Baguette':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <rect x="12" y="5" width="16" height="30" rx="1" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <rect x="15.5" y="9" width="9" height="22" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M12 5L15.5 9M28 5L24.5 9M12 35L15.5 31M28 35L24.5 31" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Cabochon':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <ellipse cx="20" cy="20" rx="12" ry="15.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <path d="M14 12C15.5 9.5 18 8.5 20.5 8.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
        </svg>
      );
    case 'Old Mine':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <rect x="8.5" y="6" width="23" height="28" rx="7.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <rect x="14.5" y="13" width="11" height="14" rx="2.5" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <circle cx="20" cy="20" r="2.2" stroke="currentColor" strokeWidth="1" opacity="0.85" />
          <path d="M11 8.5L15 13.5M29 8.5L25 13.5M11 31.5L15 26.5M29 31.5L25 26.5M20 6V13M20 27V34M8.5 20H14.5M25.5 20H31.5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Old European':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="15" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,12 26,15.5 27.5,20 26,24.5 20,28 14,24.5 12.5,20 14,15.5" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <circle cx="20" cy="20" r="2.4" stroke="currentColor" strokeWidth="1.1" opacity="0.85" />
          <path d="M20 5V12M20 28V35M5 20H12.5M27.5 20H35M9.5 9.5L14 15.5M30.5 9.5L26 15.5M9.5 30.5L14 24.5M30.5 30.5L26 24.5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Antique Cushion':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <rect x="7.5" y="6.5" width="25" height="27" rx="8.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,11.5 27.5,20 20,28.5 12.5,20" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <circle cx="20" cy="20" r="1.8" stroke="currentColor" strokeWidth="1" opacity="0.8" />
          <path d="M10.5 9.5L15.5 15.5M29.5 9.5L24.5 15.5M10.5 30.5L15.5 24.5M29.5 30.5L24.5 24.5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Rose Cut':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="14.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,10 28.5,15 28.5,25 20,30 11.5,25 11.5,15" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M20 20L20 5.5M20 20L32.5 12.5M20 20L32.5 27.5M20 20L20 34.5M20 20L7.5 27.5M20 20L7.5 12.5" stroke="currentColor" strokeWidth="0.95" opacity="0.6" />
        </svg>
      );
    case 'Moval':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M20 4C26.5 8 29.5 13.5 29.5 20C29.5 26.5 26.5 32 20 36C13.5 32 10.5 26.5 10.5 20C10.5 13.5 13.5 8 20 4Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <ellipse cx="20" cy="20" rx="5.5" ry="10.5" stroke="currentColor" strokeWidth="1" opacity="0.65" />
          <path d="M20 4V9.5M20 30.5V36M10.5 20H14.5M25.5 20H29.5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Shield':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="10,7 30,7 33,15 20,35 7,15" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="13,11 27,11 28.5,16 20,28.5 11.5,16" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M10 7L13 11M30 7L27 11M33 15L28.5 16M7 15L11.5 16M20 28.5V35" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Kite':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="20,4 32,15.5 20,36 8,15.5" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,10 27,16.5 20,29 13,16.5" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M20 4V36M8 15.5H32" stroke="currentColor" strokeWidth="0.85" opacity="0.5" />
        </svg>
      );
    case 'Hexagon':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="20,4 31,11 31,29 20,36 9,29 9,11" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,9.5 26.5,14 26.5,26 20,30.5 13.5,26 13.5,14" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M20 4V9.5M31 11L26.5 14M31 29L26.5 26M20 36V30.5M9 29L13.5 26M9 11L13.5 14" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Lozenge':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="20,4 32,20 20,36 8,20" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="20,10 27,20 20,30 13,20" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M20 4V36M8 20H32" stroke="currentColor" strokeWidth="0.85" opacity="0.5" />
        </svg>
      );
    case 'Half Moon':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M5 28A15 17 0 0 1 35 28Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <path d="M10.5 25A9.5 10.5 0 0 1 29.5 25Z" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M20 11V28M5 28L10.5 25M35 28L29.5 25M12 16L15.5 19M28 16L24.5 19" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Trapezoid':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="12,8 28,8 34,32 6,32" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="15,12.5 25,12.5 29,27.5 11,27.5" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M12 8L15 12.5M28 8L25 12.5M34 32L29 27.5M6 32L11 27.5" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Cadillac':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <polygon points="10,7 30,7 34,20 20,34 6,20" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <polygon points="13.5,11.5 26.5,11.5 29,20 20,28.5 11,20" stroke="currentColor" strokeWidth="1" opacity="0.7" />
          <path d="M10 7L13.5 11.5M30 7L26.5 11.5M34 20H29M6 20H11M20 28.5V34" stroke="currentColor" strokeWidth="0.9" opacity="0.55" />
        </svg>
      );
    case 'Briolette':
      return (
        <svg viewBox="0 0 40 40" className={className} fill="none" aria-hidden="true">
          <path d="M20 4C26 11 30 18 30 24.5C30 30.8 25.5 35.5 20 35.5C14.5 35.5 10 30.8 10 24.5C10 18 14 11 20 4Z" stroke="currentColor" strokeWidth="1.4" fill={fill} fillOpacity={fillOpacity} />
          <path d="M20 4V35.5M12 18L28 18M10.5 25.5L29.5 25.5M14 12L26 25.5M26 12L14 25.5" stroke="currentColor" strokeWidth="0.85" opacity="0.55" />
        </svg>
      );
  }
};
