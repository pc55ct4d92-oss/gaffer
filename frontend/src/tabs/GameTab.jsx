import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { saveSession, clearSession, loadSession } from '../gameSession';

const BLOCK_DURATION = 8 * 60; // 8 minutes in seconds

export default function GameTab({ activeSeason, activeGame, setActiveGame, setActiveTab, planVersion }) {
  const [games, setGames] = useState([]);
  const [players, setPlayers] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [plan, setPlan] = useState(null);
  const [currentBlockIdx, setCurrentBlockIdx] = useState(0);
  const [timerSeconds, setTimerSeconds] = useState(BLOCK_DURATION);
  const [timerRunning, setTimerRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [blockStartTime, setBlockStartTime] = useState(null);
  const [halfStartTime, setHalfStartTime] = useState(null);
  const [playerMinutes, setPlayerMinutes] = useState({});
  const [halfTimerSeconds, setHalfTimerSeconds] = useState(0);
  const [halfTimerRunning, setHalfTimerRunning] = useState(false);
  const [isHalftime, setIsHalftime] = useState(false);
  const [halftimeSeconds, setHalftimeSeconds] = useState(300);
  const [arrivalSheet, setArrivalSheet] = useState(false);
  const [leaveSheet, setLeaveSheet] = useState(null); // { playerId, blockPlayerId, role }
  const [isGameOver, setIsGameOver] = useState(false);
  const [goals, setGoals] = useState([]);
  const [scorerSheet, setScorerSheet] = useState(false);
  const [subSheet, setSubSheet] = useState(null); // { playerId } — sitting player selected for emergency sub
  const [leaveSelectSheet, setLeaveSelectSheet] = useState(false);
  const [planExpanded, setPlanExpanded] = useState(false);
  const timerRef = useRef(null);
  const halfTimerRef = useRef(null);
  const halftimeRef = useRef(null);

  useEffect(() => {
    if (!activeSeason) return;
    Promise.all([
      api(`/api/seasons/${activeSeason.id}/games`).then((r) => r.json()),
      api(`/api/seasons/${activeSeason.id}/players`).then((r) => r.json()),
    ]).then(([g, p]) => {
      setGames(g);
      setPlayers(p);
      setSelectedGame(activeGame || null);
    });
  }, [activeSeason, activeGame]);

  useEffect(() => {
    if (!selectedGame) {
      setPlan(null);
      setIsGameOver(false);
      setCurrentBlockIdx(0);
      setTimerSeconds(BLOCK_DURATION);
      setTimerRunning(false);
      setIsHalftime(false);
      setBlockStartTime(null);
      setHalfStartTime(null);
      setHalfTimerRunning(false);
      setHalfTimerSeconds(0);
      return;
    }
    setLoading(true);
    api(`/api/games/${selectedGame.id}/plan`)
      .then((r) => r.json())
      .then((blocks) => {
        setPlan(blocks.length > 0 ? blocks : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    api(`/api/games/${selectedGame.id}/setup`)
      .then((r) => r.json())
      .then((data) => {
        const minutes = {};
        data.gamePlayers.forEach((gp) => {
          minutes[gp.playerId] = {
            totalMinutes: gp.totalMinutes || 0,
            offenseMinutes: gp.offenseMinutes || 0,
            defenseMinutes: gp.defenseMinutes || 0,
            gkMinutes: gp.gkMinutes || 0,
          };
        });
        setPlayerMinutes(minutes);
      })
      .catch(() => {});
    api(`/api/games/${selectedGame.id}/goals`)
      .then((r) => r.json())
      .then((data) => setGoals(data))
      .catch(() => {});
  }, [selectedGame, planVersion]);

  // Reload recovery — restore timer/block state from localStorage if session matches
  useEffect(() => {
    if (!selectedGame) return;
    const session = loadSession();
    if (!session || session.activeGameId !== selectedGame.id) return;

    setCurrentBlockIdx(session.currentBlockIndex);
    setIsHalftime(session.isHalftime);

    if (session.isHalftime) return;

    if (session.blockStartTime != null) {
      const elapsed = Math.floor((Date.now() - session.blockStartTime) / 1000);
      setTimerSeconds(Math.max(BLOCK_DURATION - elapsed, 0));
      setBlockStartTime(session.blockStartTime);
      setTimerRunning(true);
    }

    if (session.halfStartTime != null) {
      const halfElapsed = Math.floor((Date.now() - session.halfStartTime) / 1000);
      setHalfTimerSeconds(halfElapsed);
      setHalfStartTime(session.halfStartTime);
      setHalfTimerRunning(true);
    }
  }, [selectedGame]);

  // Half timer — counts up, never pauses
  useEffect(() => {
    if (halfTimerRunning) {
      halfTimerRef.current = setInterval(() => {
        setHalfTimerSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(halfTimerRef.current);
    }
    return () => clearInterval(halfTimerRef.current);
  }, [halfTimerRunning]);

  // Halftime countdown — resets to 300 and counts down while isHalftime is true
  useEffect(() => {
    if (isHalftime) {
      setHalftimeSeconds(300);
      halftimeRef.current = setInterval(() => {
        setHalftimeSeconds((s) => {
          if (s <= 1) { clearInterval(halftimeRef.current); return 0; }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(halftimeRef.current);
    }
    return () => clearInterval(halftimeRef.current);
  }, [isHalftime]);

  // Block timer logic
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => {
          if (s <= 1) {
            clearInterval(timerRef.current);
            setTimerRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  // Resync timers from absolute timestamps when app returns to foreground
  // (iOS Safari throttles setInterval when screen is locked or app is backgrounded)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (timerRunning && blockStartTime != null) {
        const elapsed = Math.floor((Date.now() - blockStartTime) / 1000);
        setTimerSeconds(Math.max(BLOCK_DURATION - elapsed, 0));
      }
      if (halfTimerRunning && halfStartTime != null) {
        const halfElapsed = Math.floor((Date.now() - halfStartTime) / 1000);
        setHalfTimerSeconds(halfElapsed);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [timerRunning, blockStartTime, halfTimerRunning, halfStartTime]);

  const advanceBlock = async () => {
    if (currentBlockIdx > 5) return;

    const elapsed = blockStartTime
      ? Math.min(Math.max(Math.round((Date.now() - blockStartTime) / 60000 * 10) / 10, 0), 8)
      : 8;

    const updated = { ...playerMinutes };
    if (currentBlock) {
      for (const bp of currentBlock.blockPlayers) {
        if (!bp.isOnField) continue;
        const prev = updated[bp.playerId] || { totalMinutes: 0, offenseMinutes: 0, defenseMinutes: 0, gkMinutes: 0 };
        const next = { ...prev, totalMinutes: prev.totalMinutes + elapsed };
        if (bp.role === 'offense') next.offenseMinutes = prev.offenseMinutes + elapsed;
        else if (bp.role === 'defense') next.defenseMinutes = prev.defenseMinutes + elapsed;
        else if (bp.role === 'goalkeeper') next.gkMinutes = prev.gkMinutes + elapsed;
        updated[bp.playerId] = next;
      }
    }

    setPlayerMinutes(updated);

    await api(`/api/games/${selectedGame.id}/minutes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        players: Object.entries(updated).map(([playerId, mins]) => ({
          playerId: parseInt(playerId),
          ...mins,
        })),
      }),
    });

    if (currentBlockIdx === 5) {
      setTimerRunning(false);
      setHalfTimerRunning(false);
      setIsGameOver(true);
      clearSession();
      return;
    }

    const nextBlockIdx = currentBlockIdx + 1;

    if (currentBlockIdx === 2) {
      setIsHalftime(true);
      setTimerRunning(false);
      setHalfTimerRunning(false);
      setHalfTimerSeconds(0);
      setBlockStartTime(null);
      setHalfStartTime(null);
      saveSession({
        activeGameId: selectedGame.id,
        currentBlockIndex: nextBlockIdx,
        currentHalf: 2,
        blockStartTime: null,
        halfStartTime: null,
        isHalftime: true,
      });
    } else {
      const now = Date.now();
      setBlockStartTime(now);
      setTimerRunning(true);
      saveSession({
        activeGameId: selectedGame.id,
        currentBlockIndex: nextBlockIdx,
        currentHalf: currentBlock?.half ?? 1,
        blockStartTime: now,
        halfStartTime: halfStartTime,
        isHalftime: false,
      });
    }
    setCurrentBlockIdx(nextBlockIdx);
    setTimerSeconds(BLOCK_DURATION);
  };

  const toggleRole = async (blockPlayerId, currentRole) => {
    if (currentRole === 'goalkeeper') return;
    const nextRole = currentRole === 'offense' ? 'defense' : 'offense';
    try {
      const res = await api(`/api/blockplayers/${blockPlayerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      const updated = await res.json();
      // Update local plan state
      setPlan((prev) =>
        prev.map((block) => ({
          ...block,
          blockPlayers: block.blockPlayers.map((bp) =>
            bp.id === blockPlayerId ? { ...bp, role: updated.role } : bp
          ),
        }))
      );
    } catch (e) {
      setError(e.message);
    }
  };

  const doLateArrival = async (playerId) => {
    // Persist the late player as sitting in the current block FIRST so that
    // generate-plan loads them as a locked-sitting player when it freezes the
    // current block. Without this, the consecutive-sit rule wouldn't fire and
    // the player could be assigned sitting again in the very next block.
    const currentBlockId = plan[currentBlockIdx]?.id;
    let savedBpId = null;
    if (currentBlockId) {
      const bpRes = await api(`/api/games/${selectedGame.id}/add-sitting-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: currentBlockId, playerId }),
      });
      const savedBp = await bpRes.json();
      savedBpId = savedBp.id;
    }

    // Regenerate future blocks with the new player included
    const res = await api(`/api/games/${selectedGame.id}/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPlayerId: playerId, fromBlockIndex: currentBlockIdx + 1, locks: [] }),
    });
    const newPlan = await res.json();

    setPlan((prev) => {
      const updated = [...prev];
      // Replace blocks from currentBlockIdx + 1 forward with regenerated plan
      for (let i = currentBlockIdx + 1; i < updated.length; i++) {
        const block = newPlan.find((b) => b.half === updated[i].half && b.blockNumber === updated[i].blockNumber);
        if (block) updated[i] = { ...block, blockPlayers: block.assignments };
      }
      // Add arriving player to current block as sitting with their real DB id
      const cur = updated[currentBlockIdx];
      if (!cur.blockPlayers.some((bp) => bp.playerId === playerId)) {
        updated[currentBlockIdx] = {
          ...cur,
          blockPlayers: [...cur.blockPlayers, { id: savedBpId, playerId, isOnField: false, role: null }],
        };
      }
      return updated;
    });

    setPlayerMinutes((prev) => ({
      ...prev,
      [playerId]: prev[playerId] || { totalMinutes: 0, offenseMinutes: 0, defenseMinutes: 0, gkMinutes: 0 },
    }));
    setArrivalSheet(false);
  };

  const doEmergencySub = async (outPlayerId) => {
    const inPlayerId = subSheet.playerId;
    const blockId = currentBlock.id;
    const outBp = onField.find((bp) => bp.playerId === outPlayerId);
    const role = outBp?.role ?? null;

    // Persist the sub for the current block
    await api(`/api/games/${selectedGame.id}/emergency-sub`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blockId, outPlayerId, inPlayerId, role }),
    });

    // Regenerate future blocks based on the updated current block lineup
    const regenRes = await api(`/api/games/${selectedGame.id}/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromBlockIndex: currentBlockIdx + 1, locks: [] }),
    });
    const newPlan = await regenRes.json();

    setPlan((prev) =>
      prev.map((block, i) => {
        if (i === currentBlockIdx) {
          // Update current block with the sub
          return {
            ...block,
            blockPlayers: block.blockPlayers.map((bp) => {
              if (bp.playerId === outPlayerId) return { ...bp, isOnField: false, role: null };
              if (bp.playerId === inPlayerId) return { ...bp, isOnField: true, role };
              return bp;
            }),
          };
        }
        // Replace future blocks with regenerated assignments
        const regenerated = newPlan.find((b) => b.half === block.half && b.blockNumber === block.blockNumber);
        if (regenerated) return { ...regenerated, blockPlayers: regenerated.assignments };
        return block;
      })
    );
    setSubSheet(null);
  };

  const doEarlyLeave = async () => {
    const { playerId } = leaveSheet;

    // Delete the player's BlockPlayer record from the current block so refresh reflects the removal
    const currentBp = currentBlock?.blockPlayers.find((bp) => bp.playerId === playerId);
    if (currentBp?.id) {
      await api(`/api/blockplayers/${currentBp.id}`, { method: 'DELETE' });
    }

    // Regenerate future blocks excluding the leaving player
    const regenRes = await api(`/api/games/${selectedGame.id}/generate-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removePlayerId: playerId, fromBlockIndex: currentBlockIdx + 1, locks: [] }),
    });
    const newPlan = await regenRes.json();

    // Remove player entirely from current block and replace future blocks
    setPlan((prev) =>
      prev.map((block, i) => {
        if (i < currentBlockIdx) return block;
        if (i === currentBlockIdx) {
          return {
            ...block,
            blockPlayers: block.blockPlayers.filter((bp) => bp.playerId !== playerId),
          };
        }
        const regenerated = newPlan.find((b) => b.half === block.half && b.blockNumber === block.blockNumber);
        if (regenerated) return { ...regenerated, blockPlayers: regenerated.assignments };
        return block;
      })
    );

    setLeaveSheet(null);
  };

  const formatTime = (s) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const playerName = (id) => {
    const p = players.find((pl) => pl.id === id);
    if (!p) return `#${id}`;
    const firstName = p.name.split(' ')[0];
    const hasDuplicate = players.some((pl) => pl.id !== p.id && pl.name.split(' ')[0] === firstName);
    if (hasDuplicate) {
      const lastName = p.name.split(' ')[1];
      return lastName ? `${firstName} ${lastName[0]}` : firstName;
    }
    return firstName;
  };

  if (!activeSeason) return <div className="loading">No active season</div>;
  if (loading) return <div className="loading">Loading plan…</div>;

  if (isGameOver) {
    const gameLabel = selectedGame
      ? `Game ${selectedGame.gameNumber}${selectedGame.date ? ` · ${new Date(selectedGame.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
      : 'Game';
    const summaryRows = Object.entries(playerMinutes)
      .map(([id, mins]) => ({ id: parseInt(id), ...mins }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
    return (
      <div>
        <h2 className="section-title">Game Over</h2>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>{gameLabel}</div>
          <table className="gameover-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Min</th>
                <th>Off</th>
                <th>Def</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.map((row) => (
                <tr key={row.id}>
                  <td>{playerName(row.id)}</td>
                  <td>{Math.round(row.totalMinutes)}</td>
                  <td>{Math.round(row.offenseMinutes)}</td>
                  <td>{Math.round(row.defenseMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="primary" style={{ width: '100%', marginTop: '1rem' }} onClick={() => {
            clearSession();
            setActiveGame(null);
            setIsGameOver(false);
            setActiveTab('season');
          }}>
            Done
          </button>
        </div>
        <style>{`
          .gameover-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
          .gameover-table th { text-align: left; padding: 0.3rem 0.5rem; border-bottom: 2px solid var(--border); font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; }
          .gameover-table td { padding: 0.35rem 0.5rem; border-bottom: 1px solid var(--border); }
          .gameover-table tr:last-child td { border-bottom: none; }
        `}</style>
      </div>
    );
  }

  const currentBlock = plan ? plan[currentBlockIdx] : null;
  const onField = currentBlock?.blockPlayers.filter((bp) => bp.isOnField) || [];
  const sitting = currentBlock?.blockPlayers.filter((bp) => !bp.isOnField) || [];
  const absentPlayers = players.filter((p) => !currentBlock?.blockPlayers.some((bp) => bp.playerId === p.id));

  return (
    <div>
      <h2 className="section-title">
        {selectedGame
          ? `Game ${selectedGame.gameNumber}${selectedGame.date ? ` · ${new Date(selectedGame.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
          : 'Game'}
      </h2>

      {error && <div className="error">{error}</div>}

      {!plan && (
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No game in progress. Go to Game Setup to start a game.
          </p>
        </div>
      )}

      {plan && currentBlock && (
        <>
          {/* Timer */}
          <div className="timer-card card">
            {currentBlock && !isHalftime && (
              <div className="block-label">H{currentBlock.half} · Block {currentBlock.blockNumber}</div>
            )}
            {isHalftime ? (
              <>
                <div className="halftime-heading">Halftime</div>
                <div className="halftime-countdown">{formatTime(halftimeSeconds)}</div>
                <button className="primary" style={{ width: '100%' }} onClick={() => {
                  const now = Date.now();
                  setIsHalftime(false);
                  setHalfTimerSeconds(0);
                  setHalfTimerRunning(true);
                  setBlockStartTime(now);
                  setHalfStartTime(now);
                  setTimerRunning(true);
                  saveSession({
                    activeGameId: selectedGame.id,
                    currentBlockIndex: currentBlockIdx,
                    currentHalf: 2,
                    blockStartTime: now,
                    halfStartTime: now,
                    isHalftime: false,
                  });
                }}>
                  Start 2nd Half
                </button>
              </>
            ) : (
              <>
                <div className={`timer-display ${timerSeconds <= 90 ? 'expired' : ''}`}>
                  {formatTime(timerSeconds)}
                </div>
                {halfTimerRunning && (
                  <div className="half-timer">Half: {formatTime(halfTimerSeconds)}</div>
                )}
                <div className="timer-btns">
                  <button
                    className={timerRunning ? 'secondary' : 'primary'}
                    onClick={() => {
                      if (!timerRunning && blockStartTime === null) {
                        const now = Date.now();
                        setBlockStartTime(now);
                        setHalfStartTime(now);
                        setHalfTimerRunning(true);
                        saveSession({
                          activeGameId: selectedGame.id,
                          currentBlockIndex: currentBlockIdx,
                          currentHalf: currentBlock?.half ?? 1,
                          blockStartTime: now,
                          halfStartTime: now,
                          isHalftime: false,
                        });
                      }
                      setTimerRunning((r) => !r);
                    }}
                  >
                    {timerRunning ? 'Pause' : timerSeconds === BLOCK_DURATION ? 'Start' : 'Resume'}
                  </button>
                  <button className="secondary" onClick={() => { setTimerSeconds(BLOCK_DURATION); setTimerRunning(false); }}>
                    Reset
                  </button>
                  <button className="primary" onClick={advanceBlock} disabled={isGameOver}>
                    Next Block →
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Score */}
          <div className="card">
            <div className="score-row">
              <span className="score-display">Us {goals.filter((g) => !g.isOpponent).length} · Them {goals.filter((g) => g.isOpponent).length}</span>
            </div>
            <div className="score-btns">
              <button className="primary" style={{ flex: 1 }} onClick={() => setScorerSheet(true)}>+ We Scored</button>
              <button className="secondary" style={{ flex: 1 }} onClick={async () => {
                const res = await api(`/api/games/${selectedGame.id}/goals`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ isOpponent: true }),
                });
                const goal = await res.json();
                setGoals((prev) => [...prev, goal]);
              }}>+ They Scored</button>
            </div>
            {goals.length > 0 && (
              <div className="goal-log">
                {[...goals].reverse().map((g) => (
                  <div key={g.id} className="goal-row">
                    <span>⚽ {g.isOpponent ? 'Opponent' : (g.player ? playerName(g.playerId) : 'Unknown')}</span>
                    <button className="goal-undo" onClick={async () => {
                      await api(`/api/games/${selectedGame.id}/goals/${g.id}`, { method: 'DELETE' });
                      setGoals((prev) => prev.filter((x) => x.id !== g.id));
                    }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Field */}
          <div className="card">
            <h3 className="subsection">On Field ({onField.length})</h3>
            <div className="player-grid">
              {onField.filter((bp) => bp.role !== 'goalkeeper').map((bp) => (
                <button
                  key={bp.id ?? bp.playerId}
                  className={`field-btn role-${bp.role || 'none'}`}
                  onClick={() => toggleRole(bp.id, bp.role)}
                >
                  <span className="field-name">{playerName(bp.playerId)}</span>
                  <span className="field-role">{bp.role || '—'}</span>
                </button>
              ))}
            </div>
            {onField.filter((bp) => bp.role === 'goalkeeper').map((bp) => (
              <div key={bp.id ?? bp.playerId} style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
                <div className="field-btn role-goalkeeper" style={{ width: '100%', flexDirection: 'row', justifyContent: 'center', gap: '0.5rem' }}>
                  <span className="field-name">{playerName(bp.playerId)}</span>
                  <span className="field-role">GOALKEEPER</span>
                </div>
              </div>
            ))}
          </div>

          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 className="subsection" style={{ margin: 0 }}>Sitting ({sitting.length})</h3>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                {sitting.length > 0 && (
                  <button className="add-arrival-btn" onClick={() => setLeaveSelectSheet(true)}>Remove</button>
                )}
                {absentPlayers.length > 0 && (
                  <button className="add-arrival-btn" onClick={() => setArrivalSheet(true)}>+ Add</button>
                )}
              </div>
            </div>
            <div className="sitting-list">
              {sitting.map((bp) => (
                <button
                  key={bp.id ?? bp.playerId}
                  className="sitting-player"
                  onClick={() => setSubSheet({ playerId: bp.playerId })}
                >
                  {playerName(bp.playerId)}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const nextBlock = !isHalftime && currentBlockIdx < 5 ? plan[currentBlockIdx + 1] : null;
            if (!nextBlock) return null;
            const comingOff = currentBlock.blockPlayers.filter((bp) =>
              bp.isOnField && nextBlock.blockPlayers.find((n) => n.playerId === bp.playerId && !n.isOnField)
            );
            if (comingOff.length === 0) return null;
            return (
              <div className="card">
                <h3 className="subsection">Coming Off</h3>
                <div className="sitting-list">
                  {comingOff.map((bp) => (
                    <div key={bp.playerId} className="sitting-player">{playerName(bp.playerId)}</div>
                  ))}
                </div>
              </div>
            );
          })()}
          {plan && (
            <div className="card" style={{ marginTop: '0.5rem' }}>
              <button className="plan-toggle-btn" onClick={() => setPlanExpanded((v) => !v)}>
                <h3 className="subsection" style={{ margin: 0 }}>Block Plan</h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{planExpanded ? 'Hide' : 'Show'}</span>
              </button>
              {planExpanded && (
                <div style={{ marginTop: '0.75rem' }}>
                  {[1, 2].map((half) => (
                    <div key={half} style={{ marginBottom: '0.75rem' }}>
                      <div className="plan-half-label">{half === 1 ? '1st Half' : '2nd Half'}</div>
                      <div className="plan-grid">
                        {[1, 2, 3].map((bn) => {
                          const bi = (half - 1) * 3 + (bn - 1);
                          const block = plan.find((b) => b.half === half && b.blockNumber === bn);
                          if (!block) return null;
                          const isCurrent = bi === currentBlockIdx;
                          const isPast = bi < currentBlockIdx;
                          const TIMES = ['0–8m', '8–16m', '16–24m'];
                          const gk = block.blockPlayers.find((bp) => bp.isOnField && bp.role === 'goalkeeper');
                          const field = block.blockPlayers.filter((bp) => bp.isOnField && bp.role !== 'goalkeeper');
                          const sitting = block.blockPlayers.filter((bp) => !bp.isOnField);
                          return (
                            <div key={bn} className={`plan-block${isCurrent ? ' plan-block-current' : ''}${isPast ? ' plan-block-past' : ''}`}>
                              <div className="plan-time">{TIMES[bn - 1]}</div>
                              {gk && <div className="plan-gk">{playerName(gk.playerId)}</div>}
                              {field.map((bp) => (
                                <div key={bp.playerId} className="plan-field">{playerName(bp.playerId)}</div>
                              ))}
                              {sitting.map((bp) => (
                                <div key={bp.playerId} className="plan-sit">↓ {playerName(bp.playerId)}</div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {arrivalSheet && (
            <>
              <div className="sheet-backdrop" onClick={() => setArrivalSheet(false)} />
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="sheet-title">Late Arrival</div>
                <div className="sheet-sub">Select a player who just arrived.</div>
                <div className="sheet-list">
                  {absentPlayers.map((p) => (
                    <button key={p.id} className="sheet-row" onClick={() => doLateArrival(p.id)}>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                    </button>
                  ))}
                </div>
                <button className="sheet-cancel" onClick={() => setArrivalSheet(false)}>Cancel</button>
              </div>
            </>
          )}

          {subSheet && (() => {
            const inPlayer = players.find((p) => p.id === subSheet.playerId);
            const fieldOptions = onField;
            return (
              <>
                <div className="sheet-backdrop" onClick={() => setSubSheet(null)} />
                <div className="sheet" onClick={(e) => e.stopPropagation()}>
                  <div className="sheet-title">Emergency Sub</div>
                  <div className="sheet-sub">Bringing on {inPlayer?.name?.split(' ')[0]}. Who is coming off?</div>
                  <div className="sheet-list">
                    {fieldOptions.map((bp) => (
                      <button key={bp.playerId} className="sheet-row" onClick={() => doEmergencySub(bp.playerId)}>
                        <span style={{ fontWeight: 600 }}>{playerName(bp.playerId)}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{bp.role || '—'}</span>
                      </button>
                    ))}
                  </div>
                  <button className="sheet-cancel" onClick={() => setSubSheet(null)}>Cancel</button>
                </div>
              </>
            );
          })()}

          {scorerSheet && (
            <>
              <div className="sheet-backdrop" onClick={() => setScorerSheet(false)} />
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="sheet-title">Who scored?</div>
                <div className="sheet-list">
                  {onField.filter((bp) => bp.role !== 'goalkeeper').map((bp) => (
                    <button key={bp.playerId} className="sheet-row" onClick={async () => {
                      const res = await api(`/api/games/${selectedGame.id}/goals`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ playerId: bp.playerId, isOpponent: false }),
                      });
                      const goal = await res.json();
                      setGoals((prev) => [...prev, goal]);
                      setScorerSheet(false);
                    }}>
                      <span style={{ fontWeight: 600 }}>{playerName(bp.playerId)}</span>
                    </button>
                  ))}
                </div>
                <button className="sheet-cancel" onClick={() => setScorerSheet(false)}>Cancel</button>
              </div>
            </>
          )}

          {leaveSelectSheet && (
            <>
              <div className="sheet-backdrop" onClick={() => setLeaveSelectSheet(false)} />
              <div className="sheet" onClick={(e) => e.stopPropagation()}>
                <div className="sheet-title">Remove Player</div>
                <div className="sheet-sub">Who is leaving?</div>
                <div className="sheet-list">
                  {sitting.map((bp) => (
                    <button key={bp.playerId} className="sheet-row" onClick={() => { setLeaveSelectSheet(false); setLeaveSheet({ playerId: bp.playerId }); }}>
                      <span style={{ fontWeight: 600 }}>{playerName(bp.playerId)}</span>
                    </button>
                  ))}
                </div>
                <button className="sheet-cancel" onClick={() => setLeaveSelectSheet(false)}>Cancel</button>
              </div>
            </>
          )}

          {leaveSheet && (() => {
            const leavingPlayer = players.find((p) => p.id === leaveSheet.playerId);
            return (
              <>
                <div className="sheet-backdrop" onClick={() => setLeaveSheet(null)} />
                <div className="sheet" onClick={(e) => e.stopPropagation()}>
                  <div className="sheet-title">Remove Player</div>
                  <div className="sheet-sub">
                    Remove {leavingPlayer?.name} from the rest of the game?
                  </div>
                  <button className="primary" style={{ width: '100%', marginBottom: '0.5rem' }} onClick={doEarlyLeave}>
                    Confirm Remove
                  </button>
                  <button className="sheet-cancel" onClick={() => setLeaveSheet(null)}>Cancel</button>
                </div>
              </>
            );
          })()}
        </>
      )}

      <style>{`
        .section-title { font-size: 1.1rem; font-weight: 700; margin-bottom: 1rem; }
        .subsection { font-size: 0.9rem; font-weight: 700; margin-bottom: 0.75rem; }
        .field-label { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.4rem; }
        .select { width: 100%; font-size: 1rem; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); color: var(--text); }
        .timer-card { text-align: center; }
        .block-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.5rem; }
        .timer-display { font-size: 3rem; font-weight: 700; font-variant-numeric: tabular-nums; margin-bottom: 0.25rem; color: #f0efe9; }
        .timer-display.expired { color: #e07070; }
        .half-timer { font-size: 0.85rem; color: var(--text-muted); font-variant-numeric: tabular-nums; margin-bottom: 1rem; }
        .halftime-heading { font-size: 1.1rem; font-weight: 700; margin-bottom: 0.4rem; }
        .halftime-countdown { font-size: 2.5rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--text-muted); margin-bottom: 1rem; }
        .timer-btns { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
        .timer-btns button { flex: 1; min-width: 80px; }
        .player-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }
        .field-btn { display: flex; flex-direction: column; align-items: center; padding: 0.4rem 0.5rem; min-height: 48px; border-radius: var(--radius); }
        .field-btn.role-offense { background: #162b3d; color: #90c4f0; }
        .field-btn.role-defense { background: #1a3520; color: #90d490; }
        .field-btn.role-goalkeeper { background: #3d3010; color: #f0c870; }
        .field-btn.role-none { background: #242422; color: #666663; }
        .field-name { font-weight: 600; font-size: 0.95rem; }
        .field-role { font-size: 0.7rem; margin-top: 2px; text-transform: uppercase; opacity: 0.8; }
        .sitting-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .sitting-player { background: #3d1818; color: #c07070; padding: 0.4rem 0.75rem; border-radius: var(--radius); font-size: 0.9rem; border: 1px dashed #5a2020; cursor: pointer; }
        .field-leave { position: absolute; top: 4px; right: 4px; font-size: 0.8rem; opacity: 0.6; line-height: 1; padding: 2px 4px; cursor: pointer; }
        .field-btn { position: relative; }
        .add-arrival-btn { font-size: 0.75rem; color: #5cb85c; background: none; border: none; padding: 0; min-height: unset; font-weight: 600; cursor: pointer; }
        .sheet-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 100; }
        .sheet { position: fixed; bottom: 0; left: 0; right: 0; background: #1c1c1a; border-radius: 16px 16px 0 0; padding: 1.25rem 1rem 2rem; z-index: 101; box-shadow: 0 -4px 24px rgba(0,0,0,0.5); }
        .sheet-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 0.2rem; }
        .sheet-sub { font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem; }
        .sheet-list { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 1rem; }
        .sheet-row { display: flex; align-items: center; padding: 0.75rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius); background: #242422; min-height: 48px; cursor: pointer; text-align: left; }
        .sheet-cancel { width: 100%; padding: 0.75rem; background: #2a2a28; color: #a8a79f; border: none; border-radius: var(--radius); font-size: 0.95rem; font-weight: 600; min-height: 48px; cursor: pointer; }
        .score-row { text-align: center; margin-bottom: 0.75rem; }
        .score-display { font-size: 1.4rem; font-weight: 700; }
        .score-btns { display: flex; gap: 0.5rem; margin-bottom: 0.75rem; }
        .goal-log { display: flex; flex-direction: column; gap: 0.25rem; border-top: 1px solid var(--border); padding-top: 0.6rem; }
        .goal-row { display: flex; align-items: center; justify-content: space-between; font-size: 0.9rem; padding: 0.15rem 0; }
        .goal-undo { background: none; border: none; color: var(--text-muted); font-size: 1rem; cursor: pointer; padding: 0 0.25rem; min-height: unset; line-height: 1; }
        .plan-toggle-btn { display: flex; width: 100%; background: none; border: none; cursor: pointer; align-items: center; justify-content: space-between; padding: 0; }
        .plan-half-label { font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.35rem; }
        .plan-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.35rem; }
        .plan-block { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.35rem; }
        .plan-block-current { background: #162b3d; border: 1.5px solid #4a90d4; }
        .plan-block-past { opacity: 0.4; }
        .plan-time { font-size: 0.6rem; font-weight: 700; color: var(--text-muted); margin-bottom: 3px; }
        .plan-gk { font-size: 0.7rem; font-weight: 700; color: #f0c870; background: #3d3010; border-radius: 3px; padding: 2px 4px; margin-bottom: 2px; }
        .plan-field { font-size: 0.7rem; color: #90d490; padding: 1px 0; }
        .plan-sit { font-size: 0.7rem; color: #c07070; padding: 1px 0; }
        .subs-list { display: flex; flex-direction: column; gap: 0.25rem; }
        .sub-row { font-size: 0.95rem; padding: 0.2rem 0; }
        .sub-off { color: #c07070; }
        .sub-on { color: #90d490; }
        .sub-arrow { color: var(--text-muted); }
      `}</style>
    </div>
  );
}
