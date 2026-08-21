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

        icon: '/icon-192.png',

        badge: '/icon-192.png',

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