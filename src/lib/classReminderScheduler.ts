import { collection, addDoc, serverTimestamp, setDoc, doc, getDoc } from 'firebase/firestore';
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

const DISMISSED_KEY_PREFIX = 'uniflow_dismissed_notifications_';
const inFlightDispatches = new Set<string>();

/**
 * Formats a Date object to YYYY-MM-DD for stable daily deduplication keys
 */
export function getLocalDateKey(date: Date | string = new Date()): string {
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    const parsed = new Date(date);
    if (!isNaN(parsed.getTime())) {
      date = parsed;
    } else {
      return date;
    }
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Constructs a canonical deterministic notification document ID.
 * Prevents duplicate document creation across StrictMode, multiple listeners,
 * re-renders, or multi-tab instances.
 */
export function buildDeterministicNotificationId(
  uid: string,
  slot: TimetableSlot,
  date: Date | string = new Date(),
  type = 'class_reminder',
  offsetMinutes = 10
): string {
  const dateKey = getLocalDateKey(date);
  const rawId = slot.id || slot.subjectCode || 'class';
  const cleanSlotId = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanUid = uid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const cleanTime = (slot.startTime || 'time').replace(/[^a-zA-Z0-9_-]/g, '');
  return `${cleanUid}_${cleanSlotId}_${dateKey}_${cleanTime}_${type}_${offsetMinutes}m`;
}

function getSafeLocalStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) return (globalThis as any).localStorage;
  return null;
}

/**
 * Retrieves the set of dismissed/deleted notification IDs for the given user.
 */
export function getDismissedNotificationIds(uid?: string): Set<string> {
  const storage = getSafeLocalStorage();
  if (!storage || !uid) return new Set();
  try {
    const raw = storage.getItem(`${DISMISSED_KEY_PREFIX}${uid}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/**
 * Records that a notification was deleted or dismissed so that the background scheduler
 * or subsequent page visits will never recreate or redeliver it.
 */
export function markNotificationDismissed(notificationId: string, uid?: string): void {
  const storage = getSafeLocalStorage();
  if (!storage || !uid || !notificationId) return;
  try {
    const ids = getDismissedNotificationIds(uid);
    ids.add(notificationId);
    const arr = Array.from(ids).slice(-200);
    storage.setItem(`${DISMISSED_KEY_PREFIX}${uid}`, JSON.stringify(arr));
  } catch {
    // ignore quota
  }
}

/**
 * Checks whether a notification with this ID has been dismissed or deleted.
 */
export function isNotificationDismissedOrDeleted(notificationId: string, uid?: string): boolean {
  if (!uid || !notificationId) return false;
  return getDismissedNotificationIds(uid).has(notificationId);
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
export function hasReminderBeenSent(slot: TimetableSlot, date = new Date(), uid?: string): boolean {
  if (uid) {
    const detId = buildDeterministicNotificationId(uid, slot, date, 'class_reminder', 10);
    if (isNotificationDismissedOrDeleted(detId, uid)) return true;
  }
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
export function playReminderChime(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return false;
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

    // Clean up audio context when tones complete
    const cleanup = () => {
      try {
        if (ctx.state !== 'closed') {
          ctx.close().catch(() => {});
        }
      } catch {
        // ignore
      }
    };
    osc2.onended = cleanup;
    setTimeout(cleanup, 1000);

    return true;
  } catch (err) {
    console.warn('Web Audio chime playback error:', err);
    return false;
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
  const deterministicId = uid
    ? buildDeterministicNotificationId(uid, slot, new Date(), 'class_reminder', minutesLeft)
    : `local_${slot.id || slot.subjectCode}_${getLocalDateKey()}_${slot.startTime}_${minutesLeft}m`;

  // 1. Check if user has previously dismissed or deleted this notification
  if (uid && isNotificationDismissedOrDeleted(deterministicId, uid)) {
    return false;
  }

  // 2. Prevent concurrent duplicate dispatches
  if (inFlightDispatches.has(deterministicId)) {
    return false;
  }
  inFlightDispatches.add(deterministicId);

  try {
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

    // 4. Log reminder in Firestore user notifications subcollection with deterministic ID (idempotent write)
    if (uid) {
      try {
        const notifRef = doc(db, 'users', uid, 'notifications', deterministicId);
        const existingSnap = await getDoc(notifRef);
        if (!existingSnap.exists()) {
          await setDoc(notifRef, {
            uid,
            type: 'class_reminder',
            title,
            body,
            read: false,
            slotId: slot.id || null,
            subjectCode: slot.subjectCode || null,
            classDate: getLocalDateKey(),
            reminderOffset: minutesLeft,
            createdAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.warn('Failed to record notification in Firestore:', err);
      }
    }

    return notificationShown;
  } finally {
    // Release in-flight lock after brief debounce window to absorb strict mode/multi-component renders
    setTimeout(() => {
      inFlightDispatches.delete(deterministicId);
    }, 4000);
  }
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
