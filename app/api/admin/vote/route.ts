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
      data: votingPlayer,
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

    if (!votingPlayer) {
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
      adjustmentId,
      vote,
    } = body

    if (
      !adjustmentId ||
      !['yes', 'no'].includes(
        vote
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Adjustment and YES/NO vote are required.',
        },
        { status: 400 }
      )
    }

    const {
      data: adjustment,
      error: adjustmentError,
    } = await supabase
      .from('result_adjustments')
      .select(`
        id,
        status
      `)
      .eq(
        'id',
        adjustmentId
      )
      .maybeSingle()

    if (adjustmentError) {
      throw new Error(
        adjustmentError.message
      )
    }

    if (!adjustment) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Adjustment was not found.',
        },
        { status: 404 }
      )
    }

    if (
      adjustment.status !==
      'pending'
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'This adjustment is no longer pending.',
        },
        { status: 400 }
      )
    }

    const {
      error: voteError,
    } = await supabase
      .from('adjustment_votes')
      .upsert(
        {
          adjustment_id:
            adjustment.id,

          player_id:
            votingPlayer.id,

          vote,

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

    const {
      data: votes,
      error: votesError,
    } = await supabase
      .from('adjustment_votes')
      .select(`
        player_id,
        vote
      `)
      .eq(
        'adjustment_id',
        adjustment.id
      )

    if (votesError) {
      throw new Error(
        votesError.message
      )
    }

    const hasNoVote =
      (votes ?? []).some(
        (item) =>
          item.vote === 'no'
      )

    const yesVotes =
      (votes ?? []).filter(
        (item) =>
          item.vote === 'yes'
      ).length

    let newStatus =
      'pending'

    if (hasNoVote) {
      newStatus =
        'rejected'
    } else if (
      yesVotes >= 2
    ) {
      newStatus =
        'approved'
    }

    if (
      newStatus !==
      'pending'
    ) {
      const {
        error: statusError,
      } = await supabase
        .from(
          'result_adjustments'
        )
        .update({
          status:
            newStatus,

          applied_at:
            newStatus ===
            'approved'
              ? new Date()
                  .toISOString()
              : null,
        })
        .eq(
          'id',
          adjustment.id
        )

      if (statusError) {
        throw new Error(
          statusError.message
        )
      }
    }

    return NextResponse.json({
      success: true,

      message:
        `${votingPlayer.name} voted ${vote.toUpperCase()}.`,

      status:
        newStatus,
    })
  } catch (error) {
    console.error(
      'POST /api/admin/vote error:',
      error
    )

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to record vote.',
      },
      { status: 500 }
    )
  }
}