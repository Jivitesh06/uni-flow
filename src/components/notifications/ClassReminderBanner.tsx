import { useState } from 'react';
import { Bell, BellOff, BellRing, Volume2, ShieldAlert, X } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import type { UseClassReminderReturn } from '../../hooks/useClassReminder';

interface ClassReminderBannerProps {
  reminder: UseClassReminderReturn;
  variant?: 'banner' | 'card';
}

export function ClassReminderBanner({ reminder, variant = 'banner' }: ClassReminderBannerProps) {
  const {
    permission,
    isEnabled,
    isTestingSound,
    nextReminderState,
    requestPermission,
    toggleEnabled,
    sendTestReminder,
  } = reminder;

  const { nextSlot, formattedCountdown, isWithin10MinWindow } = nextReminderState;

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('uniflow_dismiss_reminder_prompt') === 'true';
  });

  // Actionable alert: Reminders are blocked in the browser
  if (permission === 'denied') {
    return (
      <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900 dark:text-amber-200">
              Class Reminders are blocked in your browser
            </p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
              To receive 10-minute class alerts, tap the lock icon in your address bar and set <strong>Notifications to Allow</strong>.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={sendTestReminder}
          disabled={isTestingSound}
          className="whitespace-nowrap font-semibold border-amber-300 text-amber-800 dark:text-amber-300 h-8 text-xs shrink-0"
        >
          <Volume2 className="w-3.5 h-3.5 mr-1.5" /> Test Sound Only
        </Button>
      </div>
    );
  }

  // Permission not yet requested: show non-intrusive dismissible prompt if not dismissed
  if (permission === 'default') {
    if (variant === 'banner' && dismissed) {
      return null;
    }

    return (
      <div className="relative p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-blue-950 dark:text-blue-100 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
        <div className="flex items-start gap-3 pr-6 sm:pr-0">
          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center flex-shrink-0">
            <BellRing className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs sm:text-sm text-blue-900 dark:text-white">
              Get Class Reminders
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5 max-w-lg leading-relaxed">
              Receive a melodic chime and notification 10 minutes before every scheduled class.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={requestPermission}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs h-8 whitespace-nowrap shadow-sm"
          >
            <Bell className="w-3.5 h-3.5 mr-1.5" /> Turn On
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sendTestReminder}
            disabled={isTestingSound}
            className="border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 font-semibold text-xs h-8 whitespace-nowrap"
            title="Preview the audio chime without permissions"
          >
            <Volume2 className="w-3.5 h-3.5 mr-1" /> Test Sound
          </Button>

          {variant === 'banner' && (
            <button
              type="button"
              onClick={() => {
                setDismissed(true);
                localStorage.setItem('uniflow_dismiss_reminder_prompt', 'true');
              }}
              className="absolute top-2.5 right-2.5 sm:static p-1 rounded-lg text-blue-400 hover:text-blue-700 dark:hover:text-blue-200"
              aria-label="Dismiss reminder prompt"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Permission is GRANTED:
  // Inside Settings (variant === 'card'), show settings management card.
  // On the Dashboard (variant === 'banner'), DO NOT show a permanent banner!
  if (variant === 'card') {
    return (
      <Card className="border-emerald-100 dark:border-emerald-950/60 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-bold text-gray-900 dark:text-white">
                Class Reminders Active
              </span>
            </div>
            <Badge variant={isEnabled ? 'success' : 'default'}>
              {isEnabled ? 'Sound & Push Enabled' : 'Paused'}
            </Badge>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            UniFlow alerts you 10 minutes before every class slot according to your section and group schedule.
          </p>

          {nextSlot ? (
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-800 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-gray-500 font-medium">Next scheduled alert:</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                  {isWithin10MinWindow ? 'Active Window!' : `in ${formattedCountdown}`}
                </span>
              </div>
              <p className="font-bold text-gray-900 dark:text-white mt-1 truncate">
                {nextSlot.subjectName} ({nextSlot.startTime})
              </p>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">No more classes scheduled for today.</p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={sendTestReminder}
              disabled={isTestingSound}
              className="flex-1 text-xs font-semibold"
            >
              <Volume2 className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Send Test Reminder
            </Button>
            <Button
              variant={isEnabled ? 'ghost' : 'outline'}
              size="sm"
              onClick={toggleEnabled}
              className="text-xs font-semibold"
            >
              {isEnabled ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
              {isEnabled ? 'Pause' : 'Resume'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // When granted and variant === 'banner', return null to prevent permanent clutter on the dashboard
  return null;
}
