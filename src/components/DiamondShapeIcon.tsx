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
  }
};
