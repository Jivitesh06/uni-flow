import React from 'react';
import { Bell, BellOff, BellRing, Volume2, ShieldAlert, Sparkles, Check } from 'lucide-react';
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
    nextReminderState,
    requestPermission,
    toggleEnabled,
    sendTestReminder,
  } = reminder;

  const { nextSlot, formattedCountdown, minutesUntilStart, isWithin10MinWindow } = nextReminderState;

  if (permission === 'denied') {
    return (
      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-900 dark:text-amber-200">
              Class Reminders are blocked in your browser
            </p>
            <p className="text-amber-700 dark:text-amber-400 mt-0.5 leading-relaxed">
              To receive 10-minute class alerts with sound, tap the <strong>site info/lock icon</strong> in your browser address bar and set <strong>Notifications to Allow</strong>.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={sendTestReminder}
          className="whitespace-nowrap font-semibold border-amber-300 text-amber-800 dark:text-amber-300"
        >
          <Volume2 className="w-3.5 h-3.5 mr-1.5" /> Test Sound Only
        </Button>
      </div>
    );
  }

  if (permission === 'default') {
    return (
      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center flex-shrink-0">
            <BellRing className="w-5 h-5 text-white animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-sm">Smart Class Reminders</h4>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-white/25">
                10 Mins Before
              </span>
            </div>
            <p className="text-xs text-blue-100 mt-1 max-w-lg">
              Receive a phone chime and notification 10 minutes before every scheduled class, even when the tab is in the background.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={requestPermission}
            className="bg-white text-blue-600 hover:bg-blue-50 font-bold whitespace-nowrap shadow-sm"
          >
            <Bell className="w-3.5 h-3.5 mr-1.5 text-blue-600" /> Enable Reminders
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={sendTestReminder}
            className="border-white/30 text-white hover:bg-white/10 font-semibold whitespace-nowrap"
            title="Preview the audio chime without permissions"
          >
            <Volume2 className="w-3.5 h-3.5 mr-1.5" /> Test Sound
          </Button>
        </div>
      </div>
    );
  }

  // Permission is GRANTED
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

  // Default compact banner when granted
  return (
    <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-900 dark:text-emerald-200">
              10-Minute Class Reminders Active
            </span>
            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-200/60 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
              Chime + Push
            </span>
          </div>
          {nextSlot ? (
            <p className="text-emerald-700 dark:text-emerald-400 mt-0.5">
              Next alert for <strong>{nextSlot.subjectName}</strong> ({nextSlot.startTime}) in{' '}
              <strong className="font-mono">{formattedCountdown}</strong>
            </p>
          ) : (
            <p className="text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
              All classes completed for today. Tomorrow's classes will alert on schedule.
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 self-end sm:self-auto">
        <Button
          variant="outline"
          size="sm"
          onClick={sendTestReminder}
          className="text-xs font-semibold border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/50"
        >
          <Volume2 className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> Send Test Reminder
        </Button>
      </div>
    </div>
  );
}
