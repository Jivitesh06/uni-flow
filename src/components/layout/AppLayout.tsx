import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { OfflineBanner } from './OfflineBanner';

const titles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/timetable': 'Class Timetable',
  '/subjects': 'Enrolled Subjects',
  '/attendance': 'Attendance Tracker',
  '/notifications': 'Notifications',
  '/email-sync': 'Gmail Sync',
  '/settings': 'Account Settings',
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
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
