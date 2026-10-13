import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { BottomNav } from './BottomNav';
import { OfflineBanner } from './OfflineBanner';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/timetable': 'Timetable',
  '/attendance': 'Attendance',
  '/settings': 'Settings',
  '/notifications': 'Notifications',
  '/admin/publish': 'Publish Timetable',
};

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const title = titles[pathname] ?? 'UniFlow';

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0 lg:ml-64">
        <OfflineBanner />
        <TopBar onMenuClick={() => setSidebarOpen(true)} title={title} />
        {/* pb-24 ensures mobile content is not covered by the fixed bottom navigation bar */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 lg:pb-8">
          <Outlet />
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
