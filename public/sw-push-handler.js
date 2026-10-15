// Service Worker Push & Notification Handler for UniFlow
// Imported via Workbox in service worker build

self.addEventListener('push', (event) => {
  let raw = {};
  if (event.data) {
    try {
      raw = event.data.json();
    } catch {
      raw = { body: event.data.text() };
    }
  }

  // Support both FCM payload structure (notification + data) and flat Web Push payloads
  const notif = raw.notification || {};
  const customData = raw.data || {};

  const title = notif.title || customData.title || raw.title || 'UniFlow — Class Reminder';
  const body = notif.body || customData.body || raw.body || 'You have an upcoming class scheduled in 10 minutes.';
  const icon = notif.icon || customData.icon || raw.icon || '/icons/icon-192x192.png';
  const badge = notif.badge || customData.badge || raw.badge || '/favicon.svg';

  const slotIdentifier = customData.slotId || customData.subjectCode || 'class';
  const startIdentifier = customData.startTime ? customData.startTime.replace(/[^a-zA-Z0-9]/g, '') : 'time';
  const tag = customData.tag || raw.tag || `uniflow-reminder-${slotIdentifier}-${startIdentifier}`;

  const targetPath = customData.url || raw.url || notif.click_action || '/dashboard';

  const options = {
    body,
    icon,
    badge,
    tag,
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: {
      url: targetPath,
      slotId: customData.slotId || null,
      classId: customData.classId || customData.slotId || null,
      startTime: customData.startTime || null,
      subjectCode: customData.subjectCode || null,
      timestamp: Date.now(),
    },
    actions: [
      { action: 'open_dashboard', title: 'Open Dashboard' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const targetPath = (event.notification.data && event.notification.data.url) || '/dashboard';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it and navigate if needed
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url === targetUrl || client.url.startsWith(self.location.origin)) {
            client.focus();
            if ('navigate' in client && client.url !== targetUrl) {
              return client.navigate(targetUrl);
            }
            return client;
          }
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('notificationclose', (_event) => {
  // Can be used to track dismissed notifications if needed
});
