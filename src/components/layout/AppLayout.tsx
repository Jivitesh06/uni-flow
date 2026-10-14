import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/timetable': 'Timetable',
  '/academic-calendar': 'Academic Calendar',
  '/attendance': 'Attendance',
  '/settings': 'Settings',
  '/notifications': 'Notifications',
  '/admin/publish': 'Publish Timetable',
};

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'UniFlow';

  // Reset scroll position to top on page navigation
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const mainEl = document.getElementById('main-content');
    if (mainEl && mainEl.scrollTop > 0) {
      mainEl.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [pathname]);

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col lg:flex-row lg:h-screen lg:overflow-hidden bg-gray-50 dark:bg-gray-950 no-scrollbar">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 lg:ml-64 min-h-screen min-h-[100dvh] lg:min-h-0 no-scrollbar">
        <OfflineBanner />
        <TopBar onMenuClick={() => setSidebarOpen(true)} title={title} />
        {/* pb-28 ensures mobile content is not covered by the fixed bottom navigation bar and allows fluid upward swipe */}
        <main
          id="main-content"
          className="flex-1 p-4 md:p-6 lg:p-8 pb-28 lg:pb-8 lg:overflow-y-auto overscroll-y-contain no-scrollbar"
        >
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
