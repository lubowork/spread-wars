const ODDS_API_URL =
  'https://api.the-odds-api.com/v4/sports/americanfootball_ncaaf/odds'

export type TeamSpread = {
  team: string
  point: number
  price: number
}

export type CollegeGame = {
  id: string
  homeTeam: string
  awayTeam: string
  commenceTime: string
  spreads: TeamSpread[]
}

export async function getCollegeFootballOdds(): Promise<CollegeGame[]> {
  const apiKey = process.env.ODDS_API_KEY

  if (!apiKey) {
    throw new Error('ODDS_API_KEY is not configured')
  }

  const url = new URL(ODDS_API_URL)

  url.searchParams.set('apiKey', apiKey)
  url.searchParams.set('bookmakers', 'draftkings')
  url.searchParams.set('markets', 'spreads')
  url.searchParams.set('oddsFormat', 'american')

  const response = await fetch(url.toString(), {
    next: {
      revalidate: 60,
    },
  })

  if (!response.ok) {
    const message = await response.text()

    throw new Error(
      `Odds API error ${response.status}: ${message}`
    )
  }

  const games = await response.json()

  return games
    .map((game: any) => {
      const draftKings = game.bookmakers?.find(
        (bookmaker: any) =>
          bookmaker.key === 'draftkings'
      )

      const spreadMarket = draftKings?.markets?.find(
        (market: any) =>
          market.key === 'spreads'
      )

      if (!spreadMarket) {
        return null
      }

      const spreads = spreadMarket.outcomes
        .filter(
          (outcome: any) =>
            outcome.point !== undefined
        )
        .map((outcome: any) => ({
          team: outcome.name,
          point: outcome.point,
          price: outcome.price,
        }))

      return {
        id: game.id,
        homeTeam: game.home_team,
        awayTeam: game.away_team,
        commenceTime: game.commence_time,
        spreads,
      }
    })
    .filter(Boolean)
}