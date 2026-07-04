self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  const options = {
    body: data.body || 'A new draft is ready for review.',
    icon: '/icon.png',
    badge: '/icon.png',
    data, // keep postId, token, apiBase, url for the click handler
    requireInteraction: true,
  };

  // One-tap action buttons (Android + desktop Chrome; iOS ignores these and
  // falls back to opening the app on tap).
  if (Array.isArray(data.actions) && data.postId && data.token) {
    options.actions = data.actions;
  }

  event.waitUntil(self.registration.showNotification(data.title || 'ZH Agent', options));
});

// Fire the approve/reject call in the background and confirm with a follow-up
// notification, since the app is never opened.
async function runPostAction(data, action) {
  const base = data.apiBase || '';
  const url = `${base}/api/post-actions/${action}?token=${encodeURIComponent(data.token)}`;

  let message;
  try {
    const res = await fetch(url, { method: 'POST' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      message = '⚠️ Action failed — open the app to review';
    } else if (action === 'approve') {
      message = body.ok === false ? '⚠️ Publish failed — open the app' : '✅ Post published to Facebook';
    } else {
      message = body.already && body.status !== 'rejected' ? '⚠️ Already published — can’t reject' : '🗑️ Draft rejected';
    }
  } catch {
    message = '⚠️ Network error — open the app to review';
  }

  await self.registration.showNotification('ZH Agent', {
    body: message,
    icon: '/icon.png',
    badge: '/icon.png',
  });
}

self.addEventListener('notificationclick', (event) => {
  const data = event.notification.data || {};
  event.notification.close();

  // Action button tapped → act without opening the app.
  if (event.action === 'approve' || event.action === 'reject') {
    event.waitUntil(runPostAction(data, event.action));
    return;
  }

  // Body tap → open/focus the dashboard.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(data.url || '/');
    })
  );
});
