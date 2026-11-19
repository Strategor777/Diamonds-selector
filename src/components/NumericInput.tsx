import React, { useEffect, useState } from 'react';

export interface NumericInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    'type' | 'value' | 'onChange'
  > {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  emptyValue?: number;
  allowNegative?: boolean;
  integerOnly?: boolean;
}

function formatCleanNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Number(n.toFixed(6)));
}

export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onValueChange,
  min,
  max,
  emptyValue,
  allowNegative = false,
  integerOnly = false,
  onFocus,
  onBlur,
  ...rest
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [text, setText] = useState(() => formatCleanNumber(value));

  useEffect(() => {
    if (!isFocused) {
      setText(formatCleanNumber(value));
    }
  }, [value, isFocused]);

  const clampValue = (n: number): number => {
    let result = integerOnly ? Math.round(n) : n;
    if (typeof min === 'number' && result < min) result = min;
    if (typeof max === 'number' && result > max) result = max;
    return result;
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    if (e.currentTarget.value === '0') {
      e.currentTarget.select();
    }
    onFocus?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const normalized = e.target.value.replace(',', '.');

    const pattern = integerOnly
      ? allowNegative
        ? /^-?\d*$/
        : /^\d*$/
      : allowNegative
        ? /^-?\d*\.?\d*$/
        : /^\d*\.?\d*$/;

    if (!pattern.test(normalized)) {
      return;
    }

    setText(normalized);

    if (normalized === '') {
      if (typeof emptyValue === 'number') {
        onValueChange(emptyValue);
      }
      return;
    }

    if (
      normalized === '-' ||
      normalized === '.' ||
      normalized === '-.' ||
      normalized.endsWith('.')
    ) {
      return;
    }

    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      onValueChange(integerOnly ? Math.round(parsed) : parsed);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const trimmed = text.trim();
    const fallback =
      typeof emptyValue === 'number'
        ? emptyValue
        : typeof min === 'number'
          ? min
          : 0;

    let nextValue: number;
    if (
      trimmed === '' ||
      trimmed === '-' ||
      trimmed === '.' ||
      trimmed === '-.'
    ) {
      nextValue = clampValue(fallback);
    } else {
      const parsed = Number(trimmed);
      nextValue = Number.isFinite(parsed)
        ? clampValue(parsed)
        : clampValue(fallback);
    }

    if (nextValue !== value) {
      onValueChange(nextValue);
    }
    setText(formatCleanNumber(nextValue));
    onBlur?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode={integerOnly ? 'numeric' : 'decimal'}
      value={text}
      onFocus={handleFocus}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
};
