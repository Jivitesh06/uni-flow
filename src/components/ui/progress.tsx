import { cn } from '../../lib/utils';

interface ProgressProps {
  value: number;
  className?: string;
  color?: string;
}

export function Progress({ value, className, color }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = color ?? (pct >= 75 ? 'bg-green-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500');
  return (
    <div className={cn('h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden', className)}>
      <div
        className={cn('h-full rounded-full transition-all duration-500', barColor)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
