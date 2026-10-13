import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  BarChart2,
  Settings,
  GraduationCap,
  Moon,
  Sun,
  LogOut,
  X,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { IOSInstallModal } from '../pwa/IOSInstallModal';
import { cn } from '../../lib/utils';

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const primaryNav = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/timetable', icon: Calendar, label: 'Timetable' },
  { to: '/attendance', icon: BarChart2, label: 'Attendance' },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  const { logout, userProfile } = useAuth();
  const { isAdmin, isPublisher } = useAdminAuth();
  const { theme, toggleTheme } = useTheme();
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
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
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-transform duration-300',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white text-base leading-tight">UniFlow</p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">Academic Planner</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {primaryNav.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}

          {(isAdmin || isPublisher) && (
            <NavLink
              to="/admin/publish"
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-bold'
                    : 'text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/20'
                )
              }
            >
              <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Publish Timetable
            </NavLink>
          )}
        </nav>

        {/* Bottom Actions & Profile */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1.5">
          {/* Install PWA Button */}
          {!isInstalled && (isInstallable || isIOS) && (
            <button
              onClick={handleInstallClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
            >
              <Download className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Install App
            </button>
          )}

          {/* User profile row */}
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-gray-50/80 dark:bg-gray-800/40">
            <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                {userProfile?.displayName?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                {userProfile?.displayName || 'Student'}
              </p>
              <p className="text-[10px] text-gray-500 truncate">
                {userProfile?.semester ? `Sem ${userProfile.semester}` : ''} {userProfile?.section ? `• Sec ${userProfile.section}` : ''}
              </p>
            </div>
          </div>

          {/* Settings link */}
          <NavLink
            to="/settings"
            onClick={onClose}
            className={({ isActive }) =>
              cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-semibold'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              )
            }
          >
            <Settings className="w-3.5 h-3.5" />
            Account Settings
          </NavLink>

          {/* Dark / Light Toggle */}
          <button
            onClick={toggleTheme}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>

          {/* Sign Out */}
          <button
            onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <IOSInstallModal open={showIOSModal} onClose={() => setShowIOSModal(false)} />
    </>
  );
}
