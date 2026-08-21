'use client'

import { useState } from 'react'

export default function TestNotificationButton() {
  const [loading, setLoading] =
    useState(false)

  const [message, setMessage] =
    useState('')

  async function sendTest() {
    try {
      setLoading(true)
      setMessage('')

      const response =
        await fetch(
          '/api/push/test',
          {
            method: 'POST',
          }
        )

      const data =
        await response.json()

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
            'Unable to send test notification.'
        )
      }

      setMessage(
        `Test sent to ${data.sent} device(s).`
      )
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to send test notification.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={sendTest}
        disabled={loading}
        className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-50"
      >
        {loading
          ? 'Sending...'
          : 'Send Test Notification'}
      </button>

      {message && (
        <div className="mt-2 text-xs text-slate-400">
          {message}
        </div>
      )}
    </div>
  )
}