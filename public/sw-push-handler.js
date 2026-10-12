// Service Worker Push & Notification Handler for UniFlow
// Imported via Workbox in service worker build

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'UniFlow — Class Reminder';
  const options = {
    body: data.body || 'You have an upcoming class scheduled in 10 minutes.',
    icon: data.icon || '/icons/icon-192x192.png',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || `uniflow-reminder-${Date.now()}`,
    renotify: true,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: true,
    data: {
      url: data.url || '/dashboard',
      classId: data.classId || null,
      startTime: data.startTime || null,
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
