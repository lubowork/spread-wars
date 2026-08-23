'use client'

import Image from 'next/image'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase-browser'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [message, setMessage] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  async function handleLogin(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault()

    setLoading(true)
    setMessage('')

    const { error } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      })

    if (error) {
      setMessage(
        'Unable to sign in. Check your email and password.'
      )

      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white">

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center justify-center">

        <div className="w-full">

          {/* BRANDING */}

          <div className="mb-6 text-center">

            <div className="mx-auto mb-5 flex justify-center">

              <Image
                src="/icon-192.png"
                alt="Spread Wars"
                width={112}
                height={112}
                priority
                className="rounded-3xl shadow-2xl shadow-black/40"
              />

            </div>

            <h1 className="text-4xl font-black tracking-tight">
              Spread Wars
            </h1>

            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-cyan-400">
              College Football
            </p>

            <p className="mt-3 text-slate-400">
              Geoff vs. General
            </p>

          </div>

          {/* LOGIN CARD */}

          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">

            <div>

              <h2 className="text-2xl font-black">
                Sign In
              </h2>

              <p className="mt-2 text-sm text-slate-400">
                Enter your Spread Wars account to continue.
              </p>

            </div>

            <form
              onSubmit={handleLogin}
              className="mt-7 space-y-5"
            >

              {/* EMAIL */}

              <div>

                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-bold text-slate-300"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
                />

              </div>

              {/* PASSWORD */}

              <div>

                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-bold text-slate-300"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-700 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
                />

              </div>

              {/* ERROR */}

              {message && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-900 bg-red-950/40 p-4 text-sm text-red-300"
                >
                  {message}
                </div>
              )}

              {/* SIGN IN */}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3.5 text-base font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? 'Signing in...'
                  : 'Sign In'}
              </button>

            </form>

          </div>

          <p className="mt-6 text-center text-xs text-slate-600">
            DraftKings spreads · College Football only
          </p>

        </div>

      </div>

    </main>
  )
}