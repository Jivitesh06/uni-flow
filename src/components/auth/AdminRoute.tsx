import { Outlet, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';

export function AdminRoute() {
  const { isAdmin, isPublisher, loading } = useAdminAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-3">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-blue-600 border-t-transparent" />
        <p className="text-xs text-gray-500 font-medium">Verifying timetable publisher credentials...</p>
      </div>
    );
  }

  if (!isAdmin && !isPublisher) {
    return (
      <div className="max-w-xl mx-auto py-12 px-4">
        <Card className="border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 shadow-sm overflow-hidden">
          <CardContent className="p-8 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-900/40 text-red-600 flex items-center justify-center mx-auto shadow-inner">
              <ShieldAlert className="w-8 h-8" />
            </div>

            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                403 — Publisher Access Required
              </h2>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">
                Publishing official shared timetables and approving student schedule change requests is restricted to authorized departmental administrators and publishers.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-red-100 dark:border-red-900/30 text-[11px] text-gray-500 text-left space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Server Authorization Policy:</p>
              <p>&bull; Student accounts cannot grant themselves publishing or admin rights.</p>
              <p>&bull; Global shared timetable modifications are enforced by Cloud Firestore security rules.</p>
              <p>&bull; If you are a designated timetable coordinator, contact your university administrator to add your UID to <code>authorizedPublishers</code>.</p>
            </div>

            <div className="pt-2">
              <Link to="/timetable">
                <Button variant="outline" size="sm" className="font-semibold">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Return to My Timetable
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
