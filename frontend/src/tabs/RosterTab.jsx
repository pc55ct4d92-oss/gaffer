import { useState, useEffect } from 'react';
import { api } from '../api';

export default function RosterTab({ activeSeason }) {
  const [players, setPlayers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!activeSeason) return;
    setLoading(true);

    Promise.all([
      api(`/api/seasons/${activeSeason.id}/players`).then((r) => r.json()),
      api(`/api/seasons/${activeSeason.id}/stats`).then((r) => r.json()),
    ])
      .then(([players, stats]) => {
        setPlayers(players);
        setStats(stats);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [activeSeason]);

  if (!activeSeason) return <div className="loading">No active season</div>;
  if (loading) return <div className="loading">Loading roster…</div>;
  if (error) return <div className="error">{error}</div>;

  const sortedStats = stats
    ? [...stats.players].sort((a, b) => b.debt - a.debt)
    : [];

  return (
    <div>
      <h2 className="section-title">Roster</h2>
      <p className="section-sub">{activeSeason.name} · {players.length} players</p>

      {stats && (
        <div className="card">
          <table className="stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>MIN</th>
                <th>OFF</th>
                <th>DEF</th>
                <th>DEBT</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((s) => (
                <tr key={s.playerId}>
                  <td>
                    {s.name}
                    {s.isGKEligible && <span className="gk-badge">GK</span>}
                  </td>
                  <td>{Math.round(s.totalMinutes)}</td>
                  <td>{Math.round(s.offenseMinutes)}</td>
                  <td>{Math.round(s.defenseMinutes)}</td>
                  <td className={s.debt > 0 ? 'debt-pos' : s.debt < 0 ? 'debt-neg' : ''}>
                    {s.debt > 0 ? '+' : ''}{s.debt.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .section-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.25rem; }
        .section-sub { color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem; }
        .stats-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
        .stats-table th, .stats-table td { padding: 0.4rem 0.5rem; text-align: right; border-bottom: 1px solid var(--border); }
        .stats-table th:first-child, .stats-table td:first-child { text-align: left; }
        .gk-badge { display: inline-block; font-size: 0.65rem; font-weight: 700; background: #cfe2ff; color: #084298; border-radius: 3px; padding: 0 3px; margin-left: 4px; vertical-align: middle; }
        .debt-pos { color: #dc3545; font-weight: 600; }
        .debt-neg { color: #198754; font-weight: 600; }
      `}</style>
    </div>
  );
}
