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
          error: 'You must be signed in.',
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
      winsDelta,
      lossesDelta,
      pushesDelta,
      reason,
    } = body

    if (
      !weekId ||
      !targetPlayerId ||
      !reason?.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Week, player, and reason are required.',
        },
        { status: 400 }
      )
    }

    const wins =
      Number(winsDelta) || 0

    const losses =
      Number(lossesDelta) || 0

    const pushes =
      Number(pushesDelta) || 0

    if (
      !Number.isInteger(wins) ||
      !Number.isInteger(losses) ||
      !Number.isInteger(pushes)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Record adjustments must use whole numbers.',
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
        status,
        week_number
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
            'Target player was not found.',
        },
        { status: 404 }
      )
    }

    const {
      data: adjustment,
      error: adjustmentError,
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
          wins,

        losses_delta:
          losses,

        pushes_delta:
          pushes,

        reason:
          reason.trim(),

        status:
          'pending',
      })
      .select(`
        id,
        week_id,
        target_player_id,
        requested_by_player_id,
        wins_delta,
        losses_delta,
        pushes_delta,
        reason,
        status,
        created_at
      `)
      .single()

    if (adjustmentError) {
      throw new Error(
        adjustmentError.message
      )
    }

    // Requester automatically votes YES.
    const {
      error: voteError,
    } = await supabase
      .from('adjustment_votes')
      .upsert(
        {
          adjustment_id:
            adjustment.id,

          player_id:
            requestingPlayer.id,

          vote:
            'yes',

          voted_at:
            new Date().toISOString(),
        },
        {
          onConflict:
            'adjustment_id,player_id',
        }
      )

    if (voteError) {
      throw new Error(
        voteError.message
      )
    }

    return NextResponse.json({
      success: true,

      message:
        `${requestingPlayer.name} requested an adjustment for ${targetPlayer.name}.`,

      adjustment,
    })
  } catch (error) {
    console.error(
      'POST /api/admin/adjustments error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to create adjustment.',
      },
      { status: 500 }
    )
  }
}