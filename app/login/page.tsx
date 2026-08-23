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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">

      {/* WALLPAPER */}

      <div className="absolute inset-0">

        <Image
          src="/login-wallpaper.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />

      </div>

      {/* DARK OVERLAY */}

      <div className="absolute inset-0 bg-slate-950/55" />

      {/* EXTRA CENTER GRADIENT FOR READABILITY */}

      <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 via-slate-950/40 to-slate-950/80" />

      {/* LOGIN CONTENT */}

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md items-center justify-center px-4 py-8 sm:px-6">

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
                className="rounded-3xl shadow-2xl shadow-black/50"
              />

            </div>

            <h1 className="text-4xl font-black tracking-tight drop-shadow-lg sm:text-5xl">
              Spread Wars
            </h1>

            <p className="mt-2 text-sm font-black uppercase tracking-[0.22em] text-cyan-300 drop-shadow">
              College Football
            </p>

            <p className="mt-3 font-bold text-white/90 drop-shadow">
              Geoff vs. General
            </p>

          </div>

          {/* LOGIN CARD */}

          <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-2xl shadow-black/50 backdrop-blur-md sm:p-8">

            <div>

              <h2 className="text-2xl font-black">
                Sign In
              </h2>

              <p className="mt-2 text-sm text-slate-300">
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
                  className="mb-2 block text-sm font-bold text-slate-200"
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
                  className="w-full rounded-xl border border-white/15 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
                />

              </div>

              {/* PASSWORD */}

              <div>

                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-bold text-slate-200"
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
                  className="w-full rounded-xl border border-white/15 bg-white px-4 py-3 text-base text-slate-950 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-60"
                />

              </div>

              {/* ERROR */}

              {message && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-800/70 bg-red-950/70 p-4 text-sm text-red-200"
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

          <p className="mt-6 text-center text-xs font-medium text-white/60 drop-shadow">
            DraftKings spreads · College Football only
          </p>

        </div>

      </div>

    </main>
  )
}