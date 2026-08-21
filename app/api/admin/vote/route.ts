import { NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-admin'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const {
      adjustmentId,
      playerId,
      vote,
    } = body

    if (
      !adjustmentId ||
      !playerId ||
      !['yes', 'no'].includes(vote)
    ) {
      return NextResponse.json(
        { error: 'Invalid vote.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    const { data: adjustment } =
      await supabase
        .from('result_adjustments')
        .select('id, status')
        .eq('id', adjustmentId)
        .single()

    if (!adjustment) {
      return NextResponse.json(
        { error: 'Adjustment not found.' },
        { status: 404 }
      )
    }

    if (adjustment.status !== 'pending') {
      return NextResponse.json(
        {
          error:
            'This adjustment is already closed.',
        },
        { status: 400 }
      )
    }

    const { error: voteError } =
      await supabase
        .from('adjustment_votes')
        .upsert(
          {
            adjustment_id: adjustmentId,
            player_id: playerId,
            vote,
            voted_at: new Date().toISOString(),
          },
          {
            onConflict:
              'adjustment_id,player_id',
          }
        )

    if (voteError) {
      throw new Error(voteError.message)
    }

    const { data: votes, error: readError } =
      await supabase
        .from('adjustment_votes')
        .select('player_id, vote')
        .eq(
          'adjustment_id',
          adjustmentId
        )

    if (readError) {
      throw new Error(readError.message)
    }

    let newStatus = 'pending'

    // Any NO rejects the request.
    if (
      votes?.some(
        (item) => item.vote === 'no'
      )
    ) {
      newStatus = 'rejected'
    }

    // Two YES votes approve.
    if (
      votes?.length === 2 &&
      votes.every(
        (item) => item.vote === 'yes'
      )
    ) {
      newStatus = 'approved'
    }

    if (newStatus !== 'pending') {
      const updateData =
        newStatus === 'approved'
          ? {
              status: newStatus,
              applied_at:
                new Date().toISOString(),
            }
          : {
              status: newStatus,
            }

      const { error: updateError } =
        await supabase
          .from('result_adjustments')
          .update(updateData)
          .eq('id', adjustmentId)

      if (updateError) {
        throw new Error(
          updateError.message
        )
      }
    }

    return NextResponse.json({
      success: true,
      status: newStatus,
      votes,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error',
      },
      { status: 500 }
    )
  }
}