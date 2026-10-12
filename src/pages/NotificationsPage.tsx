import { Bell, Check, Trash2, AlertTriangle, Calendar, Mail } from 'lucide-react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import toast from 'react-hot-toast';
import type { Notification } from '../types';

export function NotificationsPage() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: notifications } = useCollection<Notification>(`users/${uid}/notifications`);

  async function markRead(id: string) {
    try {
      await updateDoc(doc(db, `users/${uid}/notifications/${id}`), { read: true });
    } catch {
      toast.error('Failed to mark notification');
    }
  }

  async function deleteNotif(id: string) {
    try {
      await deleteDoc(doc(db, `users/${uid}/notifications/${id}`));
      toast.success('Notification removed');
    } catch {
      toast.error('Failed to delete notification');
    }
  }

  const sorted = [...notifications].sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  const typeConfig: Record<
    string,
    { label: string; variant: 'info' | 'warning' | 'danger' | 'success'; icon: typeof Bell }
  > = {
    class_reminder: { label: 'Class Reminder', variant: 'info', icon: Calendar },
    attendance_alert: { label: 'Attendance Warning', variant: 'warning', icon: AlertTriangle },
    timetable_revision: { label: 'Schedule Revision', variant: 'warning', icon: Calendar },
    sync_failure: { label: 'Sync Alert', variant: 'danger', icon: Mail },
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-gray-900 dark:text-white">Alerts & Notifications</h2>
        <p className="text-sm text-gray-500">
          Timetable updates, attendance alerts, and reminder feeds ({sorted.filter((n) => !n.read).length} unread)
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No notifications</h3>
          <p className="text-xs text-gray-400 mt-1">You are all caught up! Real-time alerts will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((n) => {
            const cfg = typeConfig[n.type] ?? { label: n.type, variant: 'info' as const, icon: Bell };
            const Icon = cfg.icon;

            return (
              <Card
                key={n.id}
                className={`transition-all ${
                  n.read
                    ? 'opacity-70 bg-gray-50/50 dark:bg-gray-900/40'
                    : 'border-l-4 border-l-blue-600 bg-white dark:bg-gray-900 shadow-sm'
                }`}
              >
                <CardContent className="p-4 flex items-start gap-4">
                  <div
                    className={`p-2.5 rounded-2xl flex-shrink-0 mt-0.5 ${
                      cfg.variant === 'warning'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600'
                        : cfg.variant === 'danger'
                        ? 'bg-red-50 dark:bg-red-950/40 text-red-600'
                        : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-sm text-gray-900 dark:text-white">{n.title}</p>
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                      {!n.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 leading-relaxed">{n.body}</p>
                    <p className="text-[11px] text-gray-400 mt-2">
                      {n.createdAt?.toDate ? format(n.createdAt.toDate(), 'MMM d, h:mm a') : 'Just now'}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    {!n.read && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => markRead(n.id)}
                        title="Mark as read"
                      >
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteNotif(n.id)}
                      title="Delete notification"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
