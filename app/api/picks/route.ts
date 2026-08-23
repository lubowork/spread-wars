import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '../../../lib/supabase-server'
import { createAdminClient } from '../../../lib/supabase-admin'

function configureWebPush() {
  const subject =
    process.env.VAPID_SUBJECT

  const publicKey =
    process.env
      .NEXT_PUBLIC_VAPID_PUBLIC_KEY

  const privateKey =
    process.env
      .VAPID_PRIVATE_KEY

  if (
    !subject ||
    !publicKey ||
    !privateKey
  ) {
    throw new Error(
      'Push notification VAPID configuration is incomplete.'
    )
  }

  webpush.setVapidDetails(
    subject,
    publicKey,
    privateKey
  )
}

export async function POST(
  request: Request
) {
  try {
    // --------------------------------------------------
    // 1. VERIFY LOGGED-IN USER
    // --------------------------------------------------

    const authSupabase =
      await createClient()

    const {
      data: { user },
      error: userError,
    } =
      await authSupabase.auth.getUser()

    if (
      userError ||
      !user
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You must be signed in to make a pick.',
        },
        {
          status: 401,
        }
      )
    }

    const supabase =
      createAdminClient()

    // --------------------------------------------------
    // 2. FIND LOGGED-IN PLAYER
    // --------------------------------------------------

    const {
      data: loggedInPlayer,
      error: playerError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name,
        auth_user_id
      `)
      .eq(
        'auth_user_id',
        user.id
      )
      .maybeSingle()

    if (playerError) {
      throw new Error(
        playerError.message
      )
    }

    if (!loggedInPlayer) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your account is not linked to a Spread Wars player.',
        },
        {
          status: 403,
        }
      )
    }

    // --------------------------------------------------
    // 3. READ REQUEST
    // --------------------------------------------------

    const body =
      await request.json()

    const {
      weekId,
      playerId,
      gameId,
      team,
    } = body

    if (
      !weekId ||
      !gameId ||
      !team
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'weekId, gameId, and team are required.',
        },
        {
          status: 400,
        }
      )
    }

    // --------------------------------------------------
    // 4. DO NOT ALLOW IMPERSONATION
    // --------------------------------------------------

    if (
      playerId &&
      playerId !==
        loggedInPlayer.id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `You are signed in as ${loggedInPlayer.name}. You cannot submit a pick for another player.`,
        },
        {
          status: 403,
        }
      )
    }

    // --------------------------------------------------
    // 5. GET WEEK
    // --------------------------------------------------

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        first_picker_id,
        status
      `)
      .eq(
        'id',
        weekId
      )
      .maybeSingle()

    if (weekError) {
      throw new Error(
        weekError.message
      )
    }

    if (!week) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Week not found.',
        },
        {
          status: 404,
        }
      )
    }

    if (
      week.status !==
      'active'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This week is not currently active.',
        },
        {
          status: 400,
        }
      )
    }

    // --------------------------------------------------
    // 6. GET BOTH PLAYERS
    // --------------------------------------------------

    const {
      data: players,
      error: playersError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name
      `)
      .order('name')

    if (playersError) {
      throw new Error(
        playersError.message
      )
    }

    if (
      !players ||
      players.length !== 2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Spread Wars requires exactly two players.',
        },
        {
          status: 500,
        }
      )
    }

    const firstPicker =
      players.find(
        (player) =>
          player.id ===
          week.first_picker_id
      )

    const secondPicker =
      players.find(
        (player) =>
          player.id !==
          week.first_picker_id
      )

    if (
      !firstPicker ||
      !secondPicker
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Unable to determine draft order.',
        },
        {
          status: 500,
        }
      )
    }

    // --------------------------------------------------
    // 7. GET GAME
    // --------------------------------------------------

    const {
      data: game,
      error: gameError,
    } = await supabase
      .from('games')
      .select(`
        id,
        home_team,
        away_team,
        start_time,
        completed
      `)
      .eq(
        'id',
        gameId
      )
      .maybeSingle()

    if (gameError) {
      throw new Error(
        gameError.message
      )
    }

    if (!game) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Game not found.',
        },
        {
          status: 404,
        }
      )
    }

    // --------------------------------------------------
    // 8. BLOCK PICKS AFTER KICKOFF
    // --------------------------------------------------

    const kickoff =
      new Date(
        game.start_time
      ).getTime()

    if (
      Number.isNaN(
        kickoff
      ) ||
      kickoff <=
        Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This game has already started and can no longer be drafted.',
        },
        {
          status: 400,
        }
      )
    }

    if (game.completed) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This game has already been completed.',
        },
        {
          status: 400,
        }
      )
    }

    // --------------------------------------------------
    // 9. VERIFY TEAM BELONGS TO GAME
    // --------------------------------------------------

    if (
      team !==
        game.home_team &&
      team !==
        game.away_team
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The selected team does not belong to this game.',
        },
        {
          status: 400,
        }
      )
    }

    // --------------------------------------------------
    // 10. GET EXISTING PICKS
    // --------------------------------------------------

    const {
      data: existingPicks,
      error: picksError,
    } = await supabase
      .from('picks')
      .select(`
        id,
        pick_number,
        player_id,
        game_id,
        is_automatic
      `)
      .eq(
        'week_id',
        week.id
      )
      .order(
        'pick_number'
      )

    if (picksError) {
      throw new Error(
        picksError.message
      )
    }

    const picks =
      existingPicks ?? []

    // --------------------------------------------------
    // 11. GAME CAN ONLY BE USED ONCE
    // --------------------------------------------------

    const gameAlreadyPicked =
      picks.some(
        (pick) =>
          pick.game_id ===
          game.id
      )

    if (
      gameAlreadyPicked
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This game has already been drafted.',
        },
        {
          status: 409,
        }
      )
    }

    // --------------------------------------------------
    // 12. AUTOMATIC PICKS MUST EXIST FIRST
    // --------------------------------------------------

    const automaticPicks =
      picks.filter(
        (pick) =>
          pick.is_automatic
      )

    if (
      automaticPicks.length <
      2
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The automatic Penn State and Miami picks must be created before normal drafting begins.',
        },
        {
          status: 400,
        }
      )
    }

    // --------------------------------------------------
    // 13. DETERMINE WHOSE TURN IT IS
    // --------------------------------------------------

    const normalPicks =
      picks.filter(
        (pick) =>
          !pick.is_automatic
      )

    const nextPickNumber =
      normalPicks.length +
      3

    const expectedPlayer =
      normalPicks.length %
        2 ===
      0
        ? firstPicker
        : secondPicker

    if (
      loggedInPlayer.id !==
      expectedPlayer.id
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            `It is ${expectedPlayer.name}'s turn. You are signed in as ${loggedInPlayer.name}.`,
        },
        {
          status: 403,
        }
      )
    }

    // --------------------------------------------------
    // 14. GET LATEST DRAFTKINGS SPREAD
    // --------------------------------------------------

    const {
      data: latestOdds,
      error: oddsError,
    } = await supabase
      .from('odds')
      .select(`
        spread,
        price,
        fetched_at
      `)
      .eq(
        'game_id',
        game.id
      )
      .eq(
        'team',
        team
      )
      .eq(
        'sportsbook',
        'DraftKings'
      )
      .eq(
        'market',
        'spreads'
      )
      .order(
        'fetched_at',
        {
          ascending: false,
        }
      )
      .limit(1)
      .maybeSingle()

    if (oddsError) {
      throw new Error(
        oddsError.message
      )
    }

    if (!latestOdds) {
      return NextResponse.json(
        {
          success: false,
          error:
            'A current DraftKings spread could not be found for this team.',
        },
        {
          status: 400,
        }
      )
    }

    const lockedSpread =
      Number(
        latestOdds.spread
      )

    if (
      Number.isNaN(
        lockedSpread
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'The current DraftKings spread is invalid.',
        },
        {
          status: 500,
        }
      )
    }

    // --------------------------------------------------
    // 15. SAVE PICK
    // --------------------------------------------------

    const now =
      new Date()
        .toISOString()

    const {
      data: newPick,
      error: insertError,
    } = await supabase
      .from('picks')
      .insert({
        week_id:
          week.id,

        player_id:
          loggedInPlayer.id,

        game_id:
          game.id,

        pick_number:
          nextPickNumber,

        team,

        spread:
          lockedSpread,

        sportsbook:
          'DraftKings',

        is_automatic:
          false,

        result:
          'pending',

        lock_time:
          now,

        locked_spread:
          lockedSpread,

        line_locked:
          true,

        locked_at:
          now,
      })
      .select(`
        id,
        week_id,
        player_id,
        game_id,
        pick_number,
        team,
        spread,
        sportsbook,
        is_automatic,
        result,
        locked_spread,
        line_locked,
        lock_time
      `)
      .single()

    if (insertError) {
      if (
        insertError.code ===
        '23505'
      ) {
        return NextResponse.json(
          {
            success: false,
            error:
              'That pick was already taken. Refresh the draft board.',
          },
          {
            status: 409,
          }
        )
      }

      throw new Error(
        insertError.message
      )
    }

    // --------------------------------------------------
    // 16. DETERMINE NEXT PLAYER
    // --------------------------------------------------

    const nextPlayer =
      expectedPlayer.id ===
      firstPicker.id
        ? secondPicker
        : firstPicker

    // --------------------------------------------------
    // 17. SEND PUSH NOTIFICATION
    //
    // VAPID is configured HERE, at runtime.
    //
    // Push failure must NEVER undo a valid pick.
    // --------------------------------------------------

    let pushSent = 0
    let pushFailed = 0

    try {
      const {
        data: subscriptions,
        error:
          subscriptionError,
      } = await supabase
        .from(
          'push_subscriptions'
        )
        .select(`
          id,
          endpoint,
          p256dh,
          auth
        `)
        .eq(
          'player_id',
          nextPlayer.id
        )

      if (
        subscriptionError
      ) {
        console.error(
          'Unable to load push subscriptions:',
          subscriptionError.message
        )
      } else if (
        subscriptions &&
        subscriptions.length >
          0
      ) {
        // Configure VAPID only if
        // there is actually a push to send.
        configureWebPush()

        const spreadText =
          lockedSpread > 0
            ? `+${lockedSpread}`
            : `${lockedSpread}`

        const payload =
          JSON.stringify({
            title:
              'Spread Wars',

            body:
              `${loggedInPlayer.name} picked ${team} ${spreadText}. ${nextPlayer.name}, you're on the clock.`,

            url:
              '/',
          })

        for (
          const subscription of
          subscriptions
        ) {
          try {
            await webpush
              .sendNotification(
                {
                  endpoint:
                    subscription.endpoint,

                  keys: {
                    p256dh:
                      subscription.p256dh,

                    auth:
                      subscription.auth,
                  },
                },
                payload
              )

            pushSent++
          } catch (
            pushError: any
          ) {
            pushFailed++

            console.error(
              'Push notification failed:',
              pushError
            )

            if (
              pushError?.statusCode ===
                404 ||
              pushError?.statusCode ===
                410
            ) {
              await supabase
                .from(
                  'push_subscriptions'
                )
                .delete()
                .eq(
                  'id',
                  subscription.id
                )
            }
          }
        }
      }
    } catch (pushError) {
      console.error(
        'Push notification system error:',
        pushError
      )
    }

    // --------------------------------------------------
    // 18. RESPONSE
    // --------------------------------------------------

    const spreadText =
      lockedSpread > 0
        ? `+${lockedSpread}`
        : `${lockedSpread}`

    return NextResponse.json({
      success: true,

      message:
        `${loggedInPlayer.name} drafted ${team} ${spreadText}`,

      pick:
        newPick,

      nextPlayer: {
        id:
          nextPlayer.id,

        name:
          nextPlayer.name,
      },

      push: {
        sent:
          pushSent,

        failed:
          pushFailed,
      },
    })
  } catch (error) {
    console.error(
      'POST /api/picks error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unknown error while making pick.',
      },
      {
        status: 500,
      }
    )
  }
}