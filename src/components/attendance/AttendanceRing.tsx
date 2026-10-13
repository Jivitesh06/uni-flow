import React from 'react';
import { cn } from '../../lib/utils';
import type { AttendanceHealthStatus } from '../../lib/attendanceCalculations';

interface AttendanceRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  target?: number; // e.g. 75
  status?: AttendanceHealthStatus;
  showPercentage?: boolean;
  showTargetIndicator?: boolean;
  label?: string;
  subText?: string;
  className?: string;
}

export function AttendanceRing({
  percentage,
  size = 76,
  strokeWidth = 7,
  target = 75,
  status,
  showPercentage = true,
  showTargetIndicator = true,
  label,
  subText,
  className,
}: AttendanceRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, isNaN(percentage) ? 0 : percentage));
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;

  // Determine status color palette
  const resolvedStatus: AttendanceHealthStatus =
    status ||
    (clampedPct === 0 ? 'no_data' : clampedPct >= target ? (clampedPct === target ? 'borderline' : 'safe') : 'shortage');

  let strokeColor = 'stroke-emerald-500 dark:stroke-emerald-400';
  let trackColor = 'stroke-emerald-100 dark:stroke-emerald-950/40';
  let textColor = 'text-emerald-600 dark:text-emerald-400';
  let glowColor = 'drop-shadow-[0_0_6px_rgba(16,185,129,0.25)]';

  if (resolvedStatus === 'borderline') {
    strokeColor = 'stroke-amber-500 dark:stroke-amber-400';
    trackColor = 'stroke-amber-100 dark:stroke-amber-950/40';
    textColor = 'text-amber-600 dark:text-amber-400';
    glowColor = 'drop-shadow-[0_0_6px_rgba(245,158,11,0.25)]';
  } else if (resolvedStatus === 'shortage') {
    strokeColor = 'stroke-rose-500 dark:stroke-rose-400';
    trackColor = 'stroke-rose-100 dark:stroke-rose-950/40';
    textColor = 'text-rose-600 dark:text-rose-400';
    glowColor = 'drop-shadow-[0_0_6px_rgba(244,63,94,0.25)]';
  } else if (resolvedStatus === 'no_data') {
    strokeColor = 'stroke-slate-300 dark:stroke-slate-700';
    trackColor = 'stroke-slate-100 dark:stroke-slate-800';
    textColor = 'text-slate-400 dark:text-slate-500';
    glowColor = '';
  }

  // Calculate target notch angle (starting from top, which is -90deg)
  const targetAngle = (target / 100) * 360 - 90;
  const targetRad = (targetAngle * Math.PI) / 180;
  const notchX = size / 2 + radius * Math.cos(targetRad);
  const notchY = size / 2 + radius * Math.sin(targetRad);

  return (
    <div
      className={cn('relative inline-flex flex-col items-center justify-center select-none', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clampedPct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label || `Attendance: ${clampedPct.toFixed(1)}%`}
    >
      <svg
        width={size}
        height={size}
        className={cn('rotate-[-90deg] transform', glowColor)}
        aria-hidden="true"
      >
        {/* Background Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn('fill-none transition-colors duration-300', trackColor)}
          strokeWidth={strokeWidth}
        />

        {/* Foreground Progress Arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn('fill-none transition-all duration-700 ease-out', strokeColor)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />

        {/* 75% Target Notch Indicator */}
        {showTargetIndicator && target > 0 && target < 100 && (
          <circle
            cx={notchX}
            cy={notchY}
            r={strokeWidth / 2.5}
            className="fill-slate-900 dark:fill-white opacity-80"
          />
        )}
      </svg>

      {/* Center Percentage Display */}
      {showPercentage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span
            className={cn('font-black tracking-tight leading-none', textColor)}
            style={{
              fontSize: size >= 110 ? '1.75rem' : size >= 80 ? '1.15rem' : size >= 65 ? '0.95rem' : '0.8rem',
            }}
          >
            {clampedPct > 0 ? `${clampedPct.toFixed(clampedPct >= 99.9 || clampedPct % 1 === 0 ? 0 : 1)}%` : '0%'}
          </span>
          {subText && (
            <span
              className="text-[9px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5"
              style={{ fontSize: size >= 110 ? '10px' : '8px' }}
            >
              {subText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
