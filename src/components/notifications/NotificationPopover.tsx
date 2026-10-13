import { useState, useRef, useEffect } from 'react';
import { Bell, Check, Trash2, Calendar, AlertTriangle, Mail, X } from 'lucide-react';
import { doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection } from '../../hooks/useFirestore';
import { Badge } from '../ui/badge';
import toast from 'react-hot-toast';
import type { Notification } from '../../types';

export function NotificationPopover() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: notifications } = useCollection<Notification>(`users/${uid}/notifications`);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const sorted = [...notifications].sort((a, b) => {
    const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
    const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
    return timeB - timeA;
  });

  const unreadCount = sorted.filter((n) => !n.read).length;

  async function markRead(id: string) {
    if (!uid) return;
    try {
      await updateDoc(doc(db, `users/${uid}/notifications/${id}`), { read: true });
    } catch {
      toast.error('Failed to update notification');
    }
  }

  async function markAllRead() {
    if (!uid) return;
    try {
      const batch = writeBatch(db);
      const unreadList = sorted.filter((n) => !n.read);
      unreadList.forEach((n) => {
        batch.update(doc(db, `users/${uid}/notifications/${n.id}`), { read: true });
      });
      await batch.commit();
      toast.success('Marked all as read');
    } catch {
      toast.error('Failed to update notifications');
    }
  }

  async function deleteNotif(id: string) {
    if (!uid) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/notifications/${id}`));
      toast.success('Notification removed');
    } catch {
      toast.error('Failed to remove notification');
    }
  }

  const typeConfig: Record<
    string,
    { label: string; variant: 'info' | 'warning' | 'danger' | 'success'; icon: typeof Bell }
  > = {
    class_reminder: { label: 'Class Reminder', variant: 'info', icon: Calendar },
    attendance_alert: { label: 'Attendance Alert', variant: 'warning', icon: AlertTriangle },
    timetable_revision: { label: 'Schedule Revision', variant: 'warning', icon: Calendar },
    sync_failure: { label: 'Sync Alert', variant: 'danger', icon: Mail },
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
        aria-expanded={isOpen}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600" />
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed inset-x-3 top-16 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-80 md:w-96 max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900 dark:text-white">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline px-1 py-0.5"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label="Close notifications"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="overflow-y-auto max-h-[60vh] divide-y divide-gray-100 dark:divide-gray-800">
            {sorted.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">No notifications</p>
                <p className="text-[11px] text-gray-400 mt-0.5">You're all caught up with your classes!</p>
              </div>
            ) : (
              sorted.slice(0, 15).map((n) => {
                const cfg = typeConfig[n.type] ?? {
                  label: n.type,
                  variant: 'info' as const,
                  icon: Bell,
                };
                const Icon = cfg.icon;

                return (
                  <div
                    key={n.id}
                    className={`p-3.5 flex items-start gap-3 transition-colors ${
                      n.read
                        ? 'opacity-65 bg-white dark:bg-gray-900'
                        : 'bg-blue-50/40 dark:bg-blue-950/20'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${
                        cfg.variant === 'warning'
                          ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300'
                          : cfg.variant === 'danger'
                          ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                          : 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="font-bold text-xs text-gray-900 dark:text-white truncate">
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600" />
                        )}
                      </div>
                      <p className="text-[11px] text-gray-600 dark:text-gray-300 mt-0.5 line-clamp-2 leading-relaxed">
                        {n.body}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {n.createdAt?.toDate
                          ? format(n.createdAt.toDate(), 'MMM d, h:mm a')
                          : 'Just now'}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="p-1 rounded text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                          title="Mark read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteNotif(n.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-500"
                        title="Delete notification"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
