import { useState, useEffect, useCallback, useRef } from 'react';
import {
  calculateNextClassReminder,
  dispatchClassReminderNotification,
  hasReminderBeenSent,
  playReminderChime,
  requestClassNotificationPermission,
  scheduleTimestampTriggerIfSupported,
  type NextClassReminderResult,
} from '../lib/classReminderScheduler.ts';
import type { TimetableSlot, UserProfile } from '../types/index.ts';
import toast from 'react-hot-toast';

export const TEST_SOUND_TOAST_ID = 'uniflow-test-sound';

export interface UseClassReminderReturn {
  permission: NotificationPermission | 'unsupported';
  isEnabled: boolean;
  isTestingSound?: boolean;
  nextReminderState: NextClassReminderResult;
  requestPermission: () => Promise<NotificationPermission>;
  toggleEnabled: () => void;
  sendTestReminder: () => Promise<void>;
}

export function useClassReminder(
  slots: TimetableSlot[],
  userProfile?: UserProfile | null
): UseClassReminderReturn {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
    return Notification.permission;
  });

  const [isTestingSound, setIsTestingSound] = useState(false);
  const isTestingSoundRef = useRef(false);
  const soundCooldownTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  // Clean up any pending cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (soundCooldownTimerRef.current) {
        clearTimeout(soundCooldownTimerRef.current as NodeJS.Timeout);
      }
    };
  }, []);

  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('uniflow_reminders_enabled');
    return stored === null ? true : stored === 'true';
  });

  const [nextReminderState, setNextReminderState] = useState<NextClassReminderResult>(() => {
    return calculateNextClassReminder(slots, userProfile?.studentGroup, new Date());
  });

  const scheduledSlotsRef = useRef<Set<string>>(new Set());

  // Update current reminder state
  const checkAndTick = useCallback(() => {
    const now = new Date();
    const result = calculateNextClassReminder(slots, userProfile?.studentGroup, now);
    setNextReminderState(result);

    // If notifications are granted, enabled, and class is within 10-minute window
    if (
      permission === 'granted' &&
      isEnabled &&
      result.nextSlot &&
      result.isWithin10MinWindow
    ) {
      if (!hasReminderBeenSent(result.nextSlot, now, userProfile?.uid)) {
        dispatchClassReminderNotification(
          result.nextSlot,
          result.minutesUntilStart || 10,
          userProfile?.uid
        ).then(() => {
          console.log(
            `[UniFlow] Dispatched 10-min reminder for ${result.nextSlot?.subjectName}`
          );
        });
      }
    }

    // Attempt native Notification Triggers scheduling if supported
    if (
      permission === 'granted' &&
      isEnabled &&
      result.nextSlot &&
      result.reminderTriggerTime &&
      !result.isWithin10MinWindow
    ) {
      const slotKey = `${result.nextSlot.id || result.nextSlot.subjectCode}-${result.nextSlot.startTime}`;
      if (!scheduledSlotsRef.current.has(slotKey)) {
        scheduledSlotsRef.current.add(slotKey);
        scheduleTimestampTriggerIfSupported(result.nextSlot, result.reminderTriggerTime);
      }
    }
  }, [slots, userProfile?.studentGroup, userProfile?.uid, permission, isEnabled]);

  // Run ticker every 15 seconds + on tab visibility change or focus
  useEffect(() => {
    checkAndTick();
    const interval = setInterval(checkAndTick, 15000);

    const handleWakeup = () => {
      if (!document.hidden) {
        checkAndTick();
      }
    };

    window.addEventListener('visibilitychange', handleWakeup);
    window.addEventListener('focus', handleWakeup);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleWakeup);
      window.removeEventListener('focus', handleWakeup);
    };
  }, [checkAndTick]);

  const requestPermission = useCallback(async () => {
    const perm = await requestClassNotificationPermission(userProfile?.uid);
    setPermission(perm);
    if (perm === 'granted') {
      setIsEnabled(true);
      toast.success('Class reminder notifications enabled!');
      checkAndTick();
    } else if (perm === 'denied') {
      toast.error('Notification permission was blocked in your browser settings.');
    }
    return perm;
  }, [userProfile?.uid, checkAndTick]);

  const toggleEnabled = useCallback(() => {
    setIsEnabled((prev) => {
      const next = !prev;
      localStorage.setItem('uniflow_reminders_enabled', String(next));
      if (next) {
        toast.success('Reminders turned on');
      } else {
        toast('Reminders paused', { icon: '🔕' });
      }
      return next;
    });
  }, []);

  const sendTestReminder = useCallback(async () => {
    // Throttle duplicate rapid clicks to prevent AudioContext and toast stacking
    if (isTestingSoundRef.current) {
      return;
    }
    isTestingSoundRef.current = true;
    setIsTestingSound(true);

    const testSlot: TimetableSlot = {
      id: 'test-reminder-slot',
      uid: userProfile?.uid || 'test-user',
      subjectId: 'test-sub-1',
      subjectName: 'Test Class: Cloud Computing',
      subjectCode: 'CS402',
      faculty: 'Dr. Test Professor',
      room: 'LH-302',
      dayOfWeek: new Date().getDay(),
      startTime: '10:00',
      endTime: '11:00',
      color: '#2563eb',
      isActive: true,
    };

    try {
      if (permission === 'granted') {
        // dispatchClassReminderNotification handles playReminderChime() internally
        await dispatchClassReminderNotification(testSlot, 10, userProfile?.uid);
        toast.success('Test reminder sent with sound!', {
          id: TEST_SOUND_TOAST_ID,
          icon: '🔔',
        });
      } else {
        const audioPlayed = playReminderChime();
        if (audioPlayed) {
          toast(
            permission === 'denied'
              ? 'Played test audio chime. Notifications are blocked in browser settings.'
              : 'Played test audio chime. Enable notifications to receive visual alerts.',
            {
              id: TEST_SOUND_TOAST_ID,
              icon: '🔔',
            }
          );
        } else {
          toast.error('Audio chime playback was blocked or is unsupported by browser.', {
            id: TEST_SOUND_TOAST_ID,
          });
        }
      }
    } catch (err: unknown) {
      toast.error('Failed to trigger test sound reminder.', {
        id: TEST_SOUND_TOAST_ID,
      });
    } finally {
      if (soundCooldownTimerRef.current) {
        clearTimeout(soundCooldownTimerRef.current as NodeJS.Timeout);
      }
      soundCooldownTimerRef.current = setTimeout(() => {
        isTestingSoundRef.current = false;
        setIsTestingSound(false);
      }, 600);
    }
  }, [permission, userProfile?.uid]);

  return {
    permission,
    isEnabled,
    isTestingSound,
    nextReminderState,
    requestPermission,
    toggleEnabled,
    sendTestReminder,
  };
}
