import { NextResponse } from 'next/server'
import { createClient } from '../../../../lib/supabase-server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export async function POST(
  request: Request
) {
  try {
    const authSupabase =
      await createClient()

    const {
      data: { user },
      error: userError,
    } =
      await authSupabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        {
          success: false,
          error:
            'You must be signed in.',
        },
        { status: 401 }
      )
    }

    const supabase =
      createAdminClient()

    const {
      data: requestingPlayer,
      error: playerError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name
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

    if (!requestingPlayer) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your login is not linked to a Spread Wars player.',
        },
        { status: 403 }
      )
    }

    const body =
      await request.json()

    const {
      weekId,
      targetPlayerId,
      amount,
    } = body

    const buyBackAmount =
      Number(amount)

    if (
      !weekId ||
      !targetPlayerId ||
      !Number.isInteger(
        buyBackAmount
      ) ||
      buyBackAmount <= 0
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Player and a positive whole-number Buy Back amount are required.',
        },
        { status: 400 }
      )
    }

    const {
      data: week,
      error: weekError,
    } = await supabase
      .from('weeks')
      .select(`
        id,
        season_id,
        status
      `)
      .eq(
        'id',
        weekId
      )
      .eq(
        'status',
        'active'
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
            'The active week was not found.',
        },
        { status: 404 }
      )
    }

    const {
      data: targetPlayer,
      error: targetError,
    } = await supabase
      .from('players')
      .select(`
        id,
        name
      `)
      .eq(
        'id',
        targetPlayerId
      )
      .maybeSingle()

    if (targetError) {
      throw new Error(
        targetError.message
      )
    }

    if (!targetPlayer) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Buy Back player was not found.',
        },
        { status: 404 }
      )
    }

    const {
      data: buyBack,
      error: buyBackError,
    } = await supabase
      .from('result_adjustments')
      .insert({
        week_id:
          week.id,

        target_player_id:
          targetPlayer.id,

        requested_by_player_id:
          requestingPlayer.id,

        wins_delta:
          buyBackAmount,

        losses_delta:
          0,

        pushes_delta:
          0,

        reason:
          `BUYBACK: ${buyBackAmount}`,

        status:
          'approved',
      })
      .select(`
        id,
        week_id,
        target_player_id,
        requested_by_player_id,
        wins_delta,
        reason,
        status,
        created_at
      `)
      .single()

    if (buyBackError) {
      throw new Error(
        buyBackError.message
      )
    }

    return NextResponse.json({
      success: true,

      message:
        `${targetPlayer.name} Buy Back +${buyBackAmount} was added to the Overall Tally only.`,

      buyBack,
    })
  } catch (error) {
    console.error(
      'POST /api/admin/buy-back error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to add Buy Back.',
      },
      { status: 500 }
    )
  }
}
