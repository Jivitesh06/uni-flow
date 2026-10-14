import { useEffect, useState, useRef } from 'react';
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
  attended?: number;
  conducted?: number;
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
  attended,
  conducted,
  className,
}: AttendanceRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPct = Math.min(100, Math.max(0, isNaN(percentage) ? 0 : percentage));

  // State to drive smooth mount animation from 0% -> actual percentage
  const [animatedPct, setAnimatedPct] = useState(0);
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setAnimatedPct(clampedPct);
      return;
    }

    if (isInitialMount.current) {
      isInitialMount.current = false;
      // Trigger animation on next frame for gentle ease-out from 0%
      const frame = requestAnimationFrame(() => {
        setAnimatedPct(clampedPct);
      });
      return () => cancelAnimationFrame(frame);
    } else {
      setAnimatedPct(clampedPct);
    }
  }, [clampedPct]);

  const strokeDashoffset = circumference - (animatedPct / 100) * circumference;

  // Determine status color palette
  const resolvedStatus: AttendanceHealthStatus =
    status ||
    (clampedPct === 0 ? 'no_data' : clampedPct >= target ? (clampedPct === target ? 'borderline' : 'safe') : 'shortage');

  const isFull100 = clampedPct >= 99.9;

  let strokeColor = 'stroke-emerald-500 dark:stroke-emerald-400';
  let trackColor = 'stroke-emerald-100/60 dark:stroke-emerald-950/40';
  let textColor = 'text-slate-900 dark:text-white';
  let glowFilter = 'drop-shadow(0px 3px 8px rgba(16, 185, 129, 0.22))';

  if (isFull100) {
    strokeColor = 'stroke-purple-500 dark:stroke-purple-400';
    trackColor = 'stroke-purple-100/60 dark:stroke-purple-950/40';
    glowFilter = 'drop-shadow(0px 3px 8px rgba(168, 85, 247, 0.25))';
  } else if (resolvedStatus === 'shortage') {
    strokeColor = 'stroke-rose-500 dark:stroke-rose-400';
    trackColor = 'stroke-rose-100/60 dark:stroke-rose-950/40';
    glowFilter = 'drop-shadow(0px 3px 8px rgba(244, 63, 94, 0.22))';
  } else if (resolvedStatus === 'borderline') {
    strokeColor = 'stroke-amber-500 dark:stroke-amber-400';
    trackColor = 'stroke-amber-100/60 dark:stroke-amber-950/40';
    glowFilter = 'drop-shadow(0px 3px 8px rgba(245, 158, 11, 0.22))';
  } else if (resolvedStatus === 'no_data') {
    strokeColor = 'stroke-slate-300 dark:stroke-slate-700';
    trackColor = 'stroke-slate-100 dark:stroke-slate-800/60';
    glowFilter = 'none';
    textColor = 'text-slate-400 dark:text-slate-500';
  }

  // Calculate target notch angle (starting from top, which is -90deg)
  const targetAngle = (target / 100) * 360 - 90;
  const targetRad = (targetAngle * Math.PI) / 180;
  const notchX = size / 2 + radius * Math.cos(targetRad);
  const notchY = size / 2 + radius * Math.sin(targetRad);

  return (
    <div
      className={cn('relative inline-flex flex-col items-center justify-center select-none shrink-0', className)}
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
        className="rotate-[-90deg] transform overflow-visible"
        aria-hidden="true"
      >
        {/* Background Track with rounded clean finish */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn('fill-none transition-colors duration-300', trackColor)}
          strokeWidth={strokeWidth}
        />

        {/* Foreground Progress Arc with smooth ease-out animation (1000ms) and rounded ends */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className={cn('fill-none transition-[stroke-dashoffset] duration-1000 ease-out', strokeColor)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ filter: glowFilter }}
        />

        {/* Target Notch Indicator */}
        {showTargetIndicator && target > 0 && target < 100 && (
          <circle
            cx={notchX}
            cy={notchY}
            r={strokeWidth / 2.5}
            className="fill-slate-900 dark:fill-white opacity-80"
          />
        )}
      </svg>

      {/* Center Percentage Display: Percentage, attended / delivered count, and classes label */}
      {showPercentage && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none select-none px-1">
          <span
            className={cn('font-black tracking-tight leading-none', textColor)}
            style={{
              fontSize: size >= 110 ? '1.5rem' : size >= 95 ? '1.25rem' : size >= 80 ? '1.1rem' : '0.85rem',
            }}
          >
            {clampedPct > 0 ? `${clampedPct.toFixed(clampedPct >= 99.9 || clampedPct % 1 === 0 ? 0 : 1)}%` : '0%'}
          </span>

          {attended !== undefined && conducted !== undefined ? (
            <div className="flex flex-col items-center mt-1">
              <span
                className="font-bold text-slate-700 dark:text-slate-300 leading-tight"
                style={{ fontSize: size >= 95 ? '11px' : '9.5px' }}
              >
                {attended} / {conducted}
              </span>
              <span
                className="text-slate-400 dark:text-slate-500 font-medium leading-none mt-0.5"
                style={{ fontSize: size >= 95 ? '9.5px' : '8px' }}
              >
                classes
              </span>
            </div>
          ) : subText ? (
            <span
              className="font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mt-0.5"
              style={{ fontSize: size >= 90 ? '9px' : '7.5px' }}
            >
              {subText}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
