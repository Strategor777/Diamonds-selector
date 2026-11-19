import React from 'react';

interface DualRangeSliderProps {
  min: number;
  max: number;
  step: number;
  valueMin: number;
  valueMax: number;
  onChangeMin: (nextMin: number) => void;
  onChangeMax: (nextMax: number) => void;
  ariaLabelMin: string;
  ariaLabelMax: string;
}

/**
 * Accessible dual-thumb range slider that lets users drag both minimum and maximum
 * bounds independently on a single unified track.
 */
export const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  step,
  valueMin,
  valueMax,
  onChangeMin,
  onChangeMax,
  ariaLabelMin,
  ariaLabelMax,
}) => {
  const safeMax = Math.max(min + step, max);
  const clampedMin = Math.min(Math.max(valueMin, min), safeMax);
  const clampedMax = Math.max(Math.min(valueMax, safeMax), clampedMin);

  const span = safeMax - min || 1;
  const leftPct = Math.min(100, Math.max(0, ((clampedMin - min) / span) * 100));
  const rightPct = Math.min(100, Math.max(0, ((clampedMax - min) / span) * 100));

  // Elevate the min thumb when it is close to the top end so users can always drag it back down
  const minThumbOnTop = leftPct > 90;

  return (
    <div className="relative h-6 flex items-center select-none">
      {/* Background Rail */}
      <div className="w-full h-1 rounded-full bg-[#E4E6EB]" />

      {/* Active Selected Range Bar */}
      <div
        aria-hidden="true"
        className="absolute h-1 rounded-full bg-[#1B365D] pointer-events-none"
        style={{
          left: `${leftPct}%`,
          width: `${Math.max(0, rightPct - leftPct)}%`,
        }}
      />

      {/* Minimum Thumb */}
      <input
        type="range"
        min={min}
        max={safeMax}
        step={step}
        value={clampedMin}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChangeMin(Math.min(next, clampedMax));
        }}
        aria-label={ariaLabelMin}
        className={`dual-range-input absolute inset-0 w-full h-full m-0 ${
          minThumbOnTop ? 'z-30' : 'z-10'
        }`}
      />

      {/* Maximum Thumb */}
      <input
        type="range"
        min={min}
        max={safeMax}
        step={step}
        value={clampedMax}
        onChange={(e) => {
          const next = Number(e.target.value);
          onChangeMax(Math.max(next, clampedMin));
        }}
        aria-label={ariaLabelMax}
        className="dual-range-input absolute inset-0 w-full h-full m-0 z-20"
      />
    </div>
  );
};
