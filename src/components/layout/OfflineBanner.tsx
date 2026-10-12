import { WifiOff, CheckCircle2 } from 'lucide-react';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';

export function OfflineBanner() {
  const { isOnline, reconnected } = useNetworkStatus();

  if (isOnline && !reconnected) {
    return null;
  }

  if (reconnected) {
    return (
      <div className="bg-emerald-600 text-white text-xs px-4 py-2 flex items-center justify-center gap-2 font-semibold shadow-sm transition-all duration-300">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>Connection Restored — UniFlow is back online.</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-600 dark:bg-amber-700 text-white text-xs px-4 py-2 flex items-center justify-center gap-2 font-medium shadow-sm transition-all duration-300">
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" />
      <span>
        <strong>Offline Mode:</strong> Viewing cached app shell. Live timetable sync & attendance logging require an active connection.
      </span>
    </div>
  );
}
