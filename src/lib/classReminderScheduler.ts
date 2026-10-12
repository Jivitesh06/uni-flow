import { collection, addDoc, serverTimestamp, setDoc, doc } from 'firebase/firestore';
import { db } from './firebase.ts';
import { isSlotApplicableToStudent } from './collegeEmail.ts';
import type { TimetableSlot, UserProfile } from '../types';

export interface NextClassReminderResult {
  nextSlot: TimetableSlot | null;
  minutesUntilStart: number | null;
  isWithin10MinWindow: boolean;
  reminderTriggerTime: Date | null;
  formattedCountdown: string;
  todaySlotsCount: number;
}

/**
 * Formats a Date object to YYYY-MM-DD for stable daily deduplication keys
 */
export function getLocalDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Builds a deterministic storage key for class reminders
 */
export function buildReminderStorageKey(slot: TimetableSlot, date = new Date()): string {
  const dateKey = getLocalDateKey(date);
  const identifier = slot.id || slot.subjectCode || 'class';
  return `uniflow_reminder_sent_${dateKey}_${identifier}_${slot.startTime}`;
}

/**
 * Checks whether a reminder for this class slot has already been dispatched today
 */
export function hasReminderBeenSent(slot: TimetableSlot, date = new Date()): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const key = buildReminderStorageKey(slot, date);
  return localStorage.getItem(key) !== null;
}

/**
 * Marks that a reminder has been sent today for this class slot
 */
export function markReminderSent(slot: TimetableSlot, date = new Date()): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const key = buildReminderStorageKey(slot, date);
  localStorage.setItem(key, new Date().toISOString());
}

/**
 * Synthesizes a melodic reminder chime using Web Audio API
 * Generates an audible chime even if device notification sounds are muted or blocked
 */
export function playReminderChime(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // First tone: 659.25 Hz (E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.3, now + 0.03);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.25);

    // Second tone: 880.00 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, now + 0.15);
    gain2.gain.setValueAtTime(0.001, now + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.35, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);

    // Clean up audio context
    setTimeout(() => {
      try {
        ctx.close().catch(() => {});
      } catch {
        // ignore
      }
    }, 1000);
  } catch (err) {
    console.warn('Web Audio chime playback error:', err);
  }
}

/**
 * Calculates the next upcoming class for today and evaluates the 10-minute reminder window.
 * Strictly respects student group (G1, G2, ALL) and filters out classes from other groups
 * or classes that have already started.
 */
export function calculateNextClassReminder(
  slots: TimetableSlot[],
  studentGroup: 'G1' | 'G2' | 'ALL' | null | undefined,
  now = new Date()
): NextClassReminderResult {
  const currentDay = now.getDay();

  // 1. Filter slots for today and applicable to student's group
  const todayApplicableSlots = slots
    .filter((s) => s.dayOfWeek === currentDay && s.isActive !== false)
    .filter((s) => isSlotApplicableToStudent(s.group, studentGroup))
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  if (todayApplicableSlots.length === 0) {
    return {
      nextSlot: null,
      minutesUntilStart: null,
      isWithin10MinWindow: false,
      reminderTriggerTime: null,
      formattedCountdown: '',
      todaySlotsCount: 0,
    };
  }

  // 2. Find the earliest slot whose start time is strictly in the future
  for (const slot of todayApplicableSlots) {
    const [h, m] = slot.startTime.split(':').map(Number);
    const slotStartDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      h,
      m,
      0,
      0
    );

    const diffMs = slotStartDate.getTime() - now.getTime();
    if (diffMs > 0) {
      const diffMinutes = diffMs / 60000;
      const roundedMinutes = Math.ceil(diffMinutes);

      // Trigger window: exactly 10 minutes before class (diffMinutes <= 10.0 and diffMinutes > 0)
      const isWithin10MinWindow = diffMinutes <= 10.0 && diffMinutes > 0;

      // The ideal reminder timestamp is T - 10 minutes
      const reminderTriggerTime = new Date(slotStartDate.getTime() - 10 * 60 * 1000);

      // Format countdown text
      const totalSec = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      let formattedCountdown = '';
      if (hours > 0) {
        formattedCountdown = `${hours}h ${mins}m ${secs}s`;
      } else {
        formattedCountdown = `${mins}m ${secs}s`;
      }

      return {
        nextSlot: slot,
        minutesUntilStart: roundedMinutes,
        isWithin10MinWindow,
        reminderTriggerTime,
        formattedCountdown,
        todaySlotsCount: todayApplicableSlots.length,
      };
    }
  }

  // All classes for today have already started or concluded
  return {
    nextSlot: null,
    minutesUntilStart: null,
    isWithin10MinWindow: false,
    reminderTriggerTime: null,
    formattedCountdown: '',
    todaySlotsCount: todayApplicableSlots.length,
  };
}

/**
 * Creates and displays a system push / web notification with sound
 */
export async function dispatchClassReminderNotification(
  slot: TimetableSlot,
  minutesLeft: number,
  uid?: string
): Promise<boolean> {
  // Always play the Web Audio chime for instant audible feedback
  playReminderChime();

  const title = `Class in ${minutesLeft} mins: ${slot.subjectName}`;
  const body = `${slot.startTime} – ${slot.endTime} | Room: ${slot.room || 'TBA'}${
    slot.faculty ? ` | Faculty: ${slot.faculty}` : ''
  }`;

  const options = {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/favicon.svg',
    tag: `uniflow-class-reminder-${slot.id || slot.subjectCode}-${slot.startTime}`,
    renotify: true,
    requireInteraction: true,
    data: {
      url: '/dashboard',
      classId: slot.id,
      startTime: slot.startTime,
      subjectCode: slot.subjectCode,
    },
  } as NotificationOptions & { renotify?: boolean };

  let notificationShown = false;

  // 1. Try displaying via Service Worker registration
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(title, options);
        notificationShown = true;
      }
    } catch (err) {
      console.warn('Service worker showNotification failed, trying fallback:', err);
    }
  }

  // 2. Fallback to standard Notification constructor if service worker wasn't ready
  if (!notificationShown && typeof window !== 'undefined' && 'Notification' in window) {
    try {
      if (Notification.permission === 'granted') {
        const notif = new Notification(title, options);
        notif.onclick = () => {
          window.focus();
          window.location.href = '/dashboard';
          notif.close();
        };
        notificationShown = true;
      }
    } catch (err) {
      console.warn('Fallback Notification constructor failed:', err);
    }
  }

  // 3. Mark reminder as sent locally to avoid duplicates today
  markReminderSent(slot);

  // 4. Log reminder in Firestore user notifications subcollection for cross-device history
  if (uid) {
    try {
      await addDoc(collection(db, 'users', uid, 'notifications'), {
        uid,
        type: 'class_reminder',
        title,
        body,
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Failed to record notification in Firestore:', err);
    }
  }

  return notificationShown;
}

/**
 * Registers Chromium Notification Trigger (TimestampTrigger) when supported by the browser.
 * This native API allows the browser engine to fire scheduled reminders even when the tab is closed!
 */
export async function scheduleTimestampTriggerIfSupported(
  slot: TimetableSlot,
  targetTime: Date
): Promise<boolean> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  // Check if TimestampTrigger is supported
  const hasTrigger =
    'showTrigger' in Notification.prototype &&
    'TimestampTrigger' in window;

  if (!hasTrigger || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    const TimestampTriggerClass = (window as unknown as { TimestampTrigger: new (ts: number) => unknown }).TimestampTrigger;

    const title = `Class in 10 mins: ${slot.subjectName}`;
    const body = `${slot.startTime} – ${slot.endTime} | Room: ${slot.room || 'TBA'}${
      slot.faculty ? ` | Faculty: ${slot.faculty}` : ''
    }`;

    await reg.showNotification(title, {
      body,
      icon: '/icons/icon-192x192.png',
      badge: '/favicon.svg',
      tag: `uniflow-scheduled-${slot.id || slot.subjectCode}-${slot.startTime}`,
      data: {
        url: '/dashboard',
        classId: slot.id,
        startTime: slot.startTime,
      },
      // @ts-expect-error Chromium experimental Notification Triggers API
      showTrigger: new TimestampTriggerClass(targetTime.getTime()),
    });

    return true;
  } catch (err) {
    console.warn('TimestampTrigger registration failed:', err);
    return false;
  }
}

/**
 * Stores Web Push subscription endpoint and keys in Cloud Firestore
 */
export async function savePushSubscriptionToFirestore(
  uid: string,
  subscription: PushSubscription
): Promise<void> {
  try {
    const subJson = subscription.toJSON();
    const endpointHash = btoa(subscription.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(-32);
    const subRef = doc(db, 'users', uid, 'pushSubscriptions', endpointHash);

    await setDoc(
      subRef,
      {
        uid,
        endpoint: subscription.endpoint,
        keys: subJson.keys || null,
        userAgent: navigator.userAgent,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Failed to store push subscription in Firestore:', err);
  }
}

/**
 * Requests notification permission from user and subscribes to push manager if available
 */
export async function requestClassNotificationPermission(uid?: string): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }

  const permission = await Notification.requestPermission();

  if (permission === 'granted') {
    localStorage.setItem('uniflow_reminders_enabled', 'true');

    // Subscribe to push manager if service worker is available
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && uid) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if ('pushManager' in reg) {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await savePushSubscriptionToFirestore(uid, sub);
          }
        }
      } catch (err) {
        console.warn('Push manager subscription check error:', err);
      }
    }
  }

  return permission;
}
