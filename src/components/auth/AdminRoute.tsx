import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { Button } from '../ui/button';
import { Card, CardContent } from '../ui/card';
import toast from 'react-hot-toast';

export function AdminRoute() {
  const { isAdmin, isPublisher, loading, authError, currentUid, currentEmail, refresh } = useAdminAuth();
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function handleCopyUid() {
    if (!currentUid) return;
    try {
      await navigator.clipboard.writeText(currentUid);
      setCopied(true);
      toast.success('User UID copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy UID');
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
    toast.success('Refreshed publisher authorization');
  }

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
      <div className="max-w-xl mx-auto py-8 px-4">
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

            {/* Account Details Box */}
            <div className="p-4 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-left space-y-3 text-xs shadow-sm">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Signed In Account</span>
                <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{currentEmail || 'Not signed in'}</p>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Your User UID</span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 font-mono text-[11px] text-blue-600 dark:text-blue-400 break-all select-all">
                    {currentUid}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCopyUid}
                    className="shrink-0 text-xs gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>

            {/* Firestore Rule Permission Error Notice */}
            {authError && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-left space-y-1 text-xs">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Firestore Permission Check Note</span>
                </div>
                <p className="text-amber-700 dark:text-amber-400 text-[11px] leading-relaxed">
                  Notice: <code>{authError}</code>. If you haven't published <code>firestore.rules</code> to the Firebase Console yet, paste them into Firebase Console &rarr; Firestore &rarr; <strong>Rules</strong> tab and click <strong>Publish</strong>.
                </p>
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-white dark:bg-gray-900 border border-red-100 dark:border-red-900/30 text-[11px] text-gray-500 text-left space-y-1">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Server Authorization Policy:</p>
              <p>&bull; The document ID in <code>authorizedPublishers</code> must match your User UID above.</p>
              <p>&bull; Student accounts cannot grant themselves publishing or admin rights from the browser.</p>
            </div>

            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                loading={refreshing}
                className="font-semibold"
              >
                <RefreshCw className="w-4 h-4 mr-1.5" /> Re-check Access
              </Button>
              <Link to="/timetable">
                <Button variant="ghost" size="sm" className="font-semibold">
                  <ArrowLeft className="w-4 h-4 mr-1.5" /> Return to Timetable
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
