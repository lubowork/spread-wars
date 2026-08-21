'use client'

import { useEffect, useState } from 'react'

function urlBase64ToUint8Array(
  base64String: string
) {
  const padding =
    '='.repeat(
      (4 - (base64String.length % 4)) % 4
    )

  const base64 =
    (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/')

  const rawData =
    window.atob(base64)

  return Uint8Array.from(
    [...rawData].map(
      (character) =>
        character.charCodeAt(0)
    )
  )
}

export default function NotificationButton() {
  const [supported, setSupported] =
    useState(true)

  const [enabled, setEnabled] =
    useState(false)

  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  // --------------------------------------------------
  // SAVE SUBSCRIPTION TO SUPABASE
  // --------------------------------------------------

  async function saveSubscription(
    subscription: PushSubscription
  ) {
    const response =
      await fetch(
        '/api/push/subscribe',
        {
          method: 'POST',

          credentials: 'include',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify(
            subscription.toJSON()
          ),
        }
      )

    const responseText =
      await response.text()

    let data: any

    try {
      data =
        JSON.parse(responseText)
    } catch {
      throw new Error(
        `Push subscription server returned an unexpected response (${response.status}).`
      )
    }

    if (
      !response.ok ||
      !data.success
    ) {
      throw new Error(
        data.error ||
          'Unable to save push subscription.'
      )
    }

    return data
  }

  // --------------------------------------------------
  // CHECK EXISTING BROWSER SUBSCRIPTION
  //
  // IMPORTANT:
  // If the browser already has a subscription,
  // send it to Supabase again.
  // --------------------------------------------------

  useEffect(() => {
    const canPush =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window

    setSupported(canPush)

    if (!canPush) {
      return
    }

    async function syncExistingSubscription() {
      try {
        if (
          Notification.permission !==
          'granted'
        ) {
          return
        }

        setLoading(true)

        const registration =
          await navigator.serviceWorker.register(
            '/sw.js'
          )

        await navigator.serviceWorker.ready

        const subscription =
          await registration.pushManager.getSubscription()

        if (!subscription) {
          setEnabled(false)
          return
        }

        const data =
          await saveSubscription(
            subscription
          )

        setEnabled(true)

        setMessage(
          `Notifications enabled for ${data.player}.`
        )
      } catch (error) {
        console.error(
          'Unable to sync push subscription:',
          error
        )

        setEnabled(false)

        setMessage(
          error instanceof Error
            ? error.message
            : 'Unable to sync notification subscription.'
        )
      } finally {
        setLoading(false)
      }
    }

    syncExistingSubscription()
  }, [])

  // --------------------------------------------------
  // ENABLE NOTIFICATIONS
  // --------------------------------------------------

  async function enableNotifications() {
    try {
      setLoading(true)
      setMessage('')

      if (
        !('serviceWorker' in navigator)
      ) {
        throw new Error(
          'Service workers are not supported on this device.'
        )
      }

      if (
        !('PushManager' in window)
      ) {
        throw new Error(
          'Push notifications are not supported in this browser.'
        )
      }

      if (
        !('Notification' in window)
      ) {
        throw new Error(
          'Notifications are not supported in this browser.'
        )
      }

      // -----------------------------------------------
      // REGISTER SERVICE WORKER
      // -----------------------------------------------

      const registration =
        await navigator.serviceWorker.register(
          '/sw.js'
        )

      await navigator.serviceWorker.ready

      // -----------------------------------------------
      // REQUEST PERMISSION
      // -----------------------------------------------

      const permission =
        await Notification.requestPermission()

      if (
        permission === 'denied'
      ) {
        throw new Error(
          'Notifications are blocked. Allow them in your browser settings and try again.'
        )
      }

      if (
        permission !== 'granted'
      ) {
        throw new Error(
          'Notification permission was not granted.'
        )
      }

      // -----------------------------------------------
      // PUBLIC VAPID KEY
      // -----------------------------------------------

      const publicKey =
        process.env
          .NEXT_PUBLIC_VAPID_PUBLIC_KEY

      if (!publicKey) {
        throw new Error(
          'VAPID public key is missing.'
        )
      }

      // -----------------------------------------------
      // GET OR CREATE SUBSCRIPTION
      // -----------------------------------------------

      let subscription =
        await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription =
          await registration.pushManager.subscribe(
            {
              userVisibleOnly:
                true,

              applicationServerKey:
                urlBase64ToUint8Array(
                  publicKey
                ),
            }
          )
      }

      // -----------------------------------------------
      // SAVE IT TO SUPABASE
      // -----------------------------------------------

      const data =
        await saveSubscription(
          subscription
        )

      setEnabled(true)

      setMessage(
        `Notifications enabled for ${data.player}.`
      )
    } catch (error) {
      console.error(
        'Enable notifications error:',
        error
      )

      setEnabled(false)

      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to enable notifications.'
      )
    } finally {
      setLoading(false)
    }
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  if (!supported) {
    return (
      <div className="text-sm text-slate-500">
        Push notifications are not supported in this browser.
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={
          enableNotifications
        }
        disabled={
          loading || enabled
        }
        className={`rounded-xl px-4 py-3 text-sm font-bold ${
          enabled
            ? 'bg-emerald-950 text-emerald-400'
            : 'bg-emerald-500 text-slate-950'
        } disabled:opacity-70`}
      >
        {loading
          ? 'Setting Up...'
          : enabled
          ? '✓ Notifications Enabled'
          : 'Enable Notifications'}
      </button>

      {message && (
        <div className="mt-2 max-w-sm text-xs text-slate-400">
          {message}
        </div>
      )}
    </div>
  )
}