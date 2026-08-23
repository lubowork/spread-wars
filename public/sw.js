self.addEventListener('push', function (event) {
  let data = {
    title: 'Spread Wars',
    body: 'You have a new Spread Wars notification.',
    url: '/',
  }

  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data.body = event.data.text()
    }
  }

  event.waitUntil(
    self.registration.showNotification(
      data.title || 'Spread Wars',
      {
        body:
          data.body ||
          'You have a new Spread Wars notification.',

        // Full-color icon shown inside
        // the expanded notification.
        icon: '/icon-192.png',

        // Transparent monochrome icon used
        // by Android in the status bar.
        badge: '/icon-badge.png',

        tag: 'spread-wars-turn',

        data: {
          url: data.url || '/',
        },
      }
    )
  )
})

self.addEventListener(
  'notificationclick',
  function (event) {
    event.notification.close()

    const targetUrl =
      event.notification.data?.url || '/'

    event.waitUntil(
      clients
        .matchAll({
          type: 'window',
          includeUncontrolled: true,
        })
        .then(function (clientList) {
          for (const client of clientList) {
            if (
              client.url.includes(targetUrl) &&
              'focus' in client
            ) {
              return client.focus()
            }
          }

          if (clients.openWindow) {
            return clients.openWindow(targetUrl)
          }
        })
    )
  }
)