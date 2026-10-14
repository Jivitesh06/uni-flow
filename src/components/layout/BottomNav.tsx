import { useLocation, NavLink } from 'react-router-dom';
import { Home, Calendar, BarChart2, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import { scrollToTop } from '../../lib/scrollUtils';

const navItems = [
  { to: '/dashboard', icon: Home, label: 'Home' },
  { to: '/timetable', icon: Calendar, label: 'Timetable' },
  { to: '/attendance', icon: BarChart2, label: 'Attendance' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function BottomNav() {
  const location = useLocation();

  const handleTabClick = (e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
    // If user is already on this tab, smoothly scroll the active page to the top
    if (location.pathname === to) {
      e.preventDefault();
      scrollToTop({ smooth: true });
    }
  };

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-t border-gray-200/80 dark:border-gray-800/80 lg:hidden px-3 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-lg"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around max-w-md mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isCurrentActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              onClick={(e) => handleTabClick(e, to)}
              aria-current={isCurrentActive ? 'page' : undefined}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all select-none min-w-[56px] min-h-[44px]',
                  isActive
                    ? 'text-blue-600 dark:text-blue-400 font-semibold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={cn(
                      'p-1 rounded-lg transition-transform',
                      isActive && 'bg-blue-50 dark:bg-blue-950/40 scale-105'
                    )}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] tracking-tight mt-0.5">{label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
