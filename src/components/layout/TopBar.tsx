import { useState } from 'react';
import { Menu, Bell, Download, WifiOff } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { IOSInstallModal } from '../pwa/IOSInstallModal';
import { Button } from '../ui/button';

interface TopBarProps {
  onMenuClick: () => void;
  title: string;
}

export function TopBar({ onMenuClick, title }: TopBarProps) {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const { isOnline } = useNetworkStatus();
  const [showIOSModal, setShowIOSModal] = useState(false);

  function handleInstallClick() {
    if (isInstallable) {
      promptInstall();
    } else if (isIOS) {
      setShowIOSModal(true);
    }
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between px-6 py-4 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Offline indicator pill */}
          {!isOnline && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}

          {/* Quick Install App button if available and not yet installed */}
          {!isInstalled && (isInstallable || isIOS) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallClick}
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            >
              <Download className="w-3.5 h-3.5 mr-1 text-blue-600 dark:text-blue-400" />
              Install App
            </Button>
          )}

          <NavLink
            to="/notifications"
            className="p-2.5 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors relative"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
          </NavLink>
        </div>
      </header>

      <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </>
  );
}
