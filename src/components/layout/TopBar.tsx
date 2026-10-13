import { useState } from 'react';
import { Menu, Download, WifiOff, LayoutDashboard, Calendar, BarChart2, Settings, Bell, ShieldCheck, GraduationCap } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useAuth } from '../../contexts/AuthContext';
import { IOSInstallModal } from '../pwa/IOSInstallModal';
import { NotificationPopover } from '../notifications/NotificationPopover';
import { Button } from '../ui/button';

interface TopBarProps {
  onMenuClick: () => void;
  title: string;
}

export function TopBar({ onMenuClick, title }: TopBarProps) {
  const { userProfile } = useAuth();
  const { pathname } = useLocation();
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

  const userInitial = userProfile?.displayName?.[0]?.toUpperCase() || 'U';

  const isDashboard = pathname === '/dashboard' || pathname === '/';

  // Specific icon for current page
  let PageIcon = LayoutDashboard;
  if (pathname.startsWith('/timetable')) PageIcon = Calendar;
  else if (pathname.startsWith('/attendance')) PageIcon = BarChart2;
  else if (pathname.startsWith('/settings')) PageIcon = Settings;
  else if (pathname.startsWith('/notifications')) PageIcon = Bell;
  else if (pathname.startsWith('/admin')) PageIcon = ShieldCheck;

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 lg:hidden transition-colors shrink-0"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {isDashboard ? (
            <Link to="/dashboard" className="flex items-center gap-2 select-none group">
              <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-xs shrink-0 group-hover:bg-blue-700 transition-colors">
                <GraduationCap className="w-4 h-4 text-white" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-lg sm:text-xl font-black text-gray-900 dark:text-white tracking-tight">
                  UniFlow
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 hidden sm:inline">
                  Academic Planner
                </span>
              </div>
            </Link>
          ) : (
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                <PageIcon className="w-4 h-4" />
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                {title}
              </h1>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Offline indicator pill */}
          {!isOnline && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <WifiOff className="w-3 h-3" /> Offline
            </span>
          )}

          {/* Quick Install App button if available and not yet installed */}
          {!isInstalled && (isInstallable || isIOS) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleInstallClick}
              className="hidden sm:inline-flex text-xs font-semibold text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 h-8"
            >
              <Download className="w-3.5 h-3.5 mr-1 text-blue-600 dark:text-blue-400" />
              Install
            </Button>
          )}

          {/* Compact Notification Popover */}
          <NotificationPopover />

          {/* Direct Avatar Link to Settings */}
          <Link
            to="/settings"
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shadow-sm hover:ring-2 hover:ring-blue-400 transition-all select-none"
            aria-label="Go to settings"
            title="Settings & Profile"
          >
            {userInitial}
          </Link>
        </div>
      </header>

      <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </>
  );
}
