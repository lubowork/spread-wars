'use client'

import { useEffect, useState } from 'react'

type Player = {
  id: string
  name: string
}

type Week = {
  id: string
  week_number: number
  status: string
}

type Vote = {
  player_id: string
  vote: string
}

type Adjustment = {
  id: string
  target_player_id: string
  requested_by_player_id: string
  wins_delta: number
  losses_delta: number
  pushes_delta: number
  reason: string
  status: string
  created_at: string
  adjustment_votes: Vote[]
}

export default function AdminPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [week, setWeek] = useState<Week | null>(null)
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])

  const [targetPlayerId, setTargetPlayerId] = useState('')
  const [requestedByPlayerId, setRequestedByPlayerId] = useState('')

  const [winsDelta, setWinsDelta] = useState(0)
  const [lossesDelta, setLossesDelta] = useState(0)
  const [pushesDelta, setPushesDelta] = useState(0)

  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)

  async function loadData() {
    try {
      const response = await fetch('/api/admin/data', {
        cache: 'no-store',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(
          data.error || 'Unable to load admin data.'
        )
      }

      const loadedPlayers: Player[] = data.players ?? []

      setPlayers(loadedPlayers)
      setWeek(data.week ?? null)
      setAdjustments(data.adjustments ?? [])

      if (loadedPlayers.length > 0) {
        setTargetPlayerId((current) =>
          current || loadedPlayers[0].id
        )

        setRequestedByPlayerId((current) =>
          current || loadedPlayers[0].id
        )
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to load admin data.'
      )
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  async function runAction(
    url: string,
    method: 'GET' | 'POST' = 'GET'
  ) {
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(url, {
        method,
      })

      const text = await response.text()

      let data

      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(
          `Server returned an unexpected response: ${text}`
        )
      }

      if (!response.ok) {
        throw new Error(
          data.error || `Action failed with status ${response.status}`
        )
      }

      setMessage(
        JSON.stringify(
          data,
          null,
          2
        )
      )

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Action failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function submitAdjustment() {
    if (!week) {
      setMessage('No active week was found.')
      return
    }

    if (!targetPlayerId) {
      setMessage('Please select the player to adjust.')
      return
    }

    if (!requestedByPlayerId) {
      setMessage(
        'Please select who is requesting the adjustment.'
      )
      return
    }

    if (!reason.trim()) {
      setMessage('Please enter a reason for the adjustment.')
      return
    }

    setLoading(true)
    setMessage('Submitting adjustment...')

    try {
      const response = await fetch(
        '/api/admin/adjustments',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            weekId: week.id,
            targetPlayerId,
            requestedByPlayerId,
            winsDelta,
            lossesDelta,
            pushesDelta,
            reason: reason.trim(),
          }),
        }
      )

      const text = await response.text()

      let data

      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(
          `Server returned an unexpected response: ${text}`
        )
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Request failed with status ${response.status}`
        )
      }

      setMessage('Adjustment request created successfully.')

      setWinsDelta(0)
      setLossesDelta(0)
      setPushesDelta(0)
      setReason('')

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Unable to create adjustment.'
      )
    } finally {
      setLoading(false)
    }
  }

  async function vote(
    adjustmentId: string,
    playerId: string,
    voteValue: 'yes' | 'no'
  ) {
    setLoading(true)
    setMessage('')

    try {
      const response = await fetch(
        '/api/admin/vote',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            adjustmentId,
            playerId,
            vote: voteValue,
          }),
        }
      )

      const text = await response.text()

      let data

      try {
        data = JSON.parse(text)
      } catch {
        throw new Error(
          `Server returned an unexpected response: ${text}`
        )
      }

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Vote failed with status ${response.status}`
        )
      }

      setMessage(
        `Vote recorded. Status: ${data.status}`
      )

      await loadData()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Vote failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  function playerName(id: string) {
    return (
      players.find(
        (player) => player.id === id
      )?.name ?? 'Unknown'
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">

        <a
          href="/"
          className="text-sm text-cyan-400 hover:text-cyan-300"
        >
          ← Back to Spread Wars
        </a>

        <div className="mt-4">
          <h1 className="text-4xl font-black">
            Spread Wars Admin
          </h1>

          <p className="mt-2 text-slate-400">
            Week {week?.week_number ?? '—'} ·{' '}
            {week?.status ?? '—'}
          </p>
        </div>

        <section className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-bold">
            System Actions
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Run data syncs and weekly management tasks.
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">

            <button
              type="button"
              disabled={loading}
              onClick={() =>
                runAction('/api/sync')
              }
              className="rounded-xl bg-cyan-600 px-5 py-4 font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Sync DraftKings Odds
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() =>
                runAction('/api/automatic-picks')
              }
              className="rounded-xl bg-indigo-600 px-5 py-4 font-bold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Refresh Automatic Picks
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() =>
                runAction('/api/results')
              }
              className="rounded-xl bg-emerald-600 px-5 py-4 font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Check Results
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() =>
                runAction(
                  '/api/rollover',
                  'POST'
                )
              }
              className="rounded-xl bg-amber-600 px-5 py-4 font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Finalize Week
            </button>

          </div>
        </section>

        {message && (
          <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
            <pre className="whitespace-pre-wrap text-sm text-slate-300">
              {message}
            </pre>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-bold">
            Request Record Adjustment
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Both players must approve before the adjustment counts.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">

            <label>
              <div className="text-sm text-slate-400">
                Adjust Player
              </div>

              <select
                value={targetPlayerId}
                onChange={(event) =>
                  setTargetPlayerId(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-white p-3 text-slate-900"
              >
                {players.map((player) => (
                  <option
                    key={player.id}
                    value={player.id}
                    className="bg-white text-slate-900"
                  >
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="text-sm text-slate-400">
                Requested By
              </div>

              <select
                value={requestedByPlayerId}
                onChange={(event) =>
                  setRequestedByPlayerId(
                    event.target.value
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-white p-3 text-slate-900"
              >
                {players.map((player) => (
                  <option
                    key={player.id}
                    value={player.id}
                    className="bg-white text-slate-900"
                  >
                    {player.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <div className="text-sm text-slate-400">
                Wins Change
              </div>

              <input
                type="number"
                value={winsDelta}
                onChange={(event) =>
                  setWinsDelta(
                    Number(
                      event.target.value
                    )
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
              />
            </label>

            <label>
              <div className="text-sm text-slate-400">
                Losses Change
              </div>

              <input
                type="number"
                value={lossesDelta}
                onChange={(event) =>
                  setLossesDelta(
                    Number(
                      event.target.value
                    )
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
              />
            </label>

            <label>
              <div className="text-sm text-slate-400">
                Pushes Change
              </div>

              <input
                type="number"
                value={pushesDelta}
                onChange={(event) =>
                  setPushesDelta(
                    Number(
                      event.target.value
                    )
                  )
                }
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"
              />
            </label>

          </div>

          <label className="mt-4 block">
            <div className="text-sm text-slate-400">
              Reason
            </div>

            <textarea
              value={reason}
              onChange={(event) =>
                setReason(
                  event.target.value
                )
              }
              rows={3}
              placeholder="Explain why the weekly record should be adjusted..."
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white placeholder:text-slate-600"
            />
          </label>

          <button
            type="button"
            disabled={
              loading ||
              !reason.trim() ||
              !targetPlayerId ||
              !requestedByPlayerId
            }
            onClick={submitAdjustment}
            className="mt-5 rounded-lg bg-cyan-600 px-5 py-3 font-bold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading
              ? 'Submitting...'
              : 'Submit Adjustment Request'}
          </button>

        </section>

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">

          <h2 className="text-xl font-bold">
            Adjustment Requests
          </h2>

          <div className="mt-5 space-y-4">

            {adjustments.length === 0 ? (
              <div className="text-sm text-slate-500">
                No adjustment requests yet.
              </div>
            ) : (
              adjustments.map(
                (adjustment) => {

                  return (
                    <div
                      key={adjustment.id}
                      className="rounded-xl border border-slate-700 bg-slate-950 p-5"
                    >

                      <div className="flex flex-wrap items-center justify-between gap-4">

                        <div>
                          <div className="font-bold">
                            {playerName(
                              adjustment.target_player_id
                            )}
                          </div>

                          <div className="text-sm text-slate-400">
                            Requested by{' '}
                            {playerName(
                              adjustment.requested_by_player_id
                            )}
                          </div>
                        </div>

                        <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-bold uppercase">
                          {adjustment.status}
                        </span>

                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-3">

                        <div className="rounded-lg bg-slate-900 p-3">
                          <div className="text-xs text-slate-500">
                            Wins
                          </div>

                          <div className="font-bold">
                            {adjustment.wins_delta > 0
                              ? '+'
                              : ''}
                            {adjustment.wins_delta}
                          </div>
                        </div>

                        <div className="rounded-lg bg-slate-900 p-3">
                          <div className="text-xs text-slate-500">
                            Losses
                          </div>

                          <div className="font-bold">
                            {adjustment.losses_delta > 0
                              ? '+'
                              : ''}
                            {adjustment.losses_delta}
                          </div>
                        </div>

                        <div className="rounded-lg bg-slate-900 p-3">
                          <div className="text-xs text-slate-500">
                            Pushes
                          </div>

                          <div className="font-bold">
                            {adjustment.pushes_delta > 0
                              ? '+'
                              : ''}
                            {adjustment.pushes_delta}
                          </div>
                        </div>

                      </div>

                      <p className="mt-4 text-sm text-slate-300">
                        {adjustment.reason}
                      </p>

                      <div className="mt-5 space-y-3">

                        {players.map((player) => {
                          const existingVote =
                            adjustment.adjustment_votes?.find(
                              (item) =>
                                item.player_id ===
                                player.id
                            )

                          return (
                            <div
                              key={player.id}
                              className="flex items-center justify-between rounded-lg bg-slate-900 p-3"
                            >

                              <span>
                                {player.name}
                              </span>

                              {existingVote ? (
                                <strong
                                  className={
                                    existingVote.vote === 'yes'
                                      ? 'text-emerald-400'
                                      : 'text-red-400'
                                  }
                                >
                                  {existingVote.vote.toUpperCase()}
                                </strong>
                              ) : adjustment.status ===
                                'pending' ? (
                                <div className="flex gap-2">

                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() =>
                                      vote(
                                        adjustment.id,
                                        player.id,
                                        'yes'
                                      )
                                    }
                                    className="rounded bg-emerald-700 px-3 py-1 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
                                  >
                                    YES
                                  </button>

                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() =>
                                      vote(
                                        adjustment.id,
                                        player.id,
                                        'no'
                                      )
                                    }
                                    className="rounded bg-red-700 px-3 py-1 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40"
                                  >
                                    NO
                                  </button>

                                </div>
                              ) : (
                                <span className="text-slate-500">
                                  —
                                </span>
                              )}

                            </div>
                          )
                        })}

                      </div>

                    </div>
                  )
                }
              )
            )}

          </div>

        </section>

      </div>
    </main>
  )
}