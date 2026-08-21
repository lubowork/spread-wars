import { getCollegeFootballOdds } from '../../lib/odds-api'

export default async function OddsTestPage() {
  try {
    const games = await getCollegeFootballOdds()

    return (
      <main
        style={{
          padding: '40px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <h1>DraftKings College Football Test</h1>

        <p>
          Games returned: <strong>{games.length}</strong>
        </p>

        {games.length === 0 ? (
          <p>
            No DraftKings college football games are
            currently available.
          </p>
        ) : (
          <div style={{ marginTop: '30px' }}>
            {games.map((game) => (
              <div
                key={game.id}
                style={{
                  marginBottom: '20px',
                  padding: '20px',
                  border: '1px solid #ddd',
                  borderRadius: '10px',
                }}
              >
                <h2>
                  {game.awayTeam} @ {game.homeTeam}
                </h2>

                <p>
                  {new Date(
                    game.commenceTime
                  ).toLocaleString()}
                </p>

                <h3>DraftKings Spread</h3>

                {game.spreads.map((spread) => (
                  <div key={spread.team}>
                    <strong>{spread.team}</strong>{' '}
                    {spread.point > 0
                      ? `+${spread.point}`
                      : spread.point}{' '}
                    ({spread.price})
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    )
  } catch (error) {
    return (
      <main
        style={{
          padding: '40px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <h1>Odds API Error</h1>

        <pre>
          {error instanceof Error
            ? error.message
            : 'Unknown error'}
        </pre>
      </main>
    )
  }
}