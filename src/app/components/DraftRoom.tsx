import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { TEAMS } from '../store';
import { useDraft } from '../../hooks/useDraft';
import { fetchLeague } from '../../hooks/useLeague';
import { isLotteryComplete, isLotteryPhase } from '../../lib/leagueFlow';
import type { DraftType, League, LeagueMember } from '../../types/index';
import { ChevronDown, Clock, Users, Trophy, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';
import confetti from 'canvas-confetti';

export const DraftRoom = () => {
  const { id: leagueId } = useParams();
  const navigate = useNavigate();
  const {
    draftState,
    picks,
    members,
    isMyTurn,
    makePick,
    autoDraftTimeoutPick,
    refreshDraft,
    loading,
    error,
  } = useDraft(leagueId ?? '');

  const [league, setLeague] = useState<League | null>(null);
  const [draftType, setDraftType] = useState<DraftType>('untimed');
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedGroup, setSelectedGroup] = useState<string>('All');
  const [picking, setPicking] = useState(false);
  const [pickingTeamId, setPickingTeamId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [expandedPreviousRounds, setExpandedPreviousRounds] = useState<Set<number>>(new Set());
  const autoPickAttemptedRef = useRef<number | null>(null);

  const TOTAL_PICKS = 48;
  const memberCount = members.length;
  const PICKS_PER_PLAYER = memberCount > 0 ? TOTAL_PICKS / memberCount : 0;
  const isDraftComplete = draftState?.is_complete ?? false;
  const currentPicker = members.find((m) => m.user_id === draftState?.current_user_id);

  const pickedTeamIds = new Set(picks.map((p) => p.teamId));
  const availableTeams = TEAMS.filter((team) => !pickedTeamIds.has(team.id));

  const groups = Array.from(new Set(TEAMS.map((t) => t.group))).sort();
  const displayTeams = selectedGroup === 'All'
    ? TEAMS
    : TEAMS.filter((t) => t.group === selectedGroup);

  const availableInGroup = (group: string) =>
    TEAMS.filter((t) => t.group === group && !pickedTeamIds.has(t.id)).length;

  const rankedTeams = [...TEAMS].sort((a, b) => a.fifaRanking - b.fifaRanking);

  const currentRound = draftState?.current_round ?? 1;

  const getPickForMember = useCallback((round: number, member: LeagueMember) => {
    const count = members.length;
    if (count === 0) return undefined;
    const isReverse = round % 2 === 0;
    const pos = member.draft_position - 1;
    const idx = isReverse ? count - 1 - pos : pos;
    const pickNumber = (round - 1) * count + idx + 1;
    return picks.find((p) => p.pickNumber === pickNumber);
  }, [members, picks]);

  const getMembersInRoundOrder = useCallback((round: number) => {
    const sorted = [...members].sort((a, b) => a.draft_position - b.draft_position);
    return round % 2 === 0 ? [...sorted].reverse() : sorted;
  }, [members]);

  const currentRoundPickedCount = getMembersInRoundOrder(currentRound)
    .map((member) => getPickForMember(currentRound, member))
    .filter(Boolean).length;

  const previousRounds = Array.from(
    { length: Math.max(0, currentRound - 1) },
    (_, i) => currentRound - 1 - i,
  );

  useEffect(() => {
    if (!leagueId) return;

    fetchLeague(leagueId)
      .then(({ league: fetchedLeague }) => {
        if (fetchedLeague.draft_status === 'pending') {
          navigate(`/league/${leagueId}`);
          return;
        }

        if (
          isLotteryPhase(fetchedLeague.draft_status) &&
          !isLotteryComplete(fetchedLeague.draft_status)
        ) {
          navigate(`/league/${leagueId}/lottery`);
          return;
        }

        setLeague(fetchedLeague);
        setDraftType(fetchedLeague.draft_type);
      })
      .catch(() => {});
  }, [leagueId, navigate]);

  useEffect(() => {
    if (isDraftComplete || draftType === 'untimed') return;

    const initialTime = draftType === '2min' ? 120 : 300;
    setTimeLeft(initialTime);

    const interval = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [draftState?.current_user_id, draftType, isDraftComplete]);

  const handlePick = useCallback(async (teamId: string) => {
    if (!isMyTurn || picking || isDraftComplete) return;
    if (pickedTeamIds.has(teamId)) return;

    setPicking(true);
    setPickingTeamId(teamId);
    setPickError(null);
    try {
      await makePick(teamId);
    } catch (err) {
      autoPickAttemptedRef.current = null;
      setPickError(err instanceof Error ? err.message : 'Failed to make pick');
      refreshDraft();
    } finally {
      setPicking(false);
      setPickingTeamId(null);
    }
  }, [isMyTurn, picking, isDraftComplete, makePick, pickedTeamIds, refreshDraft]);

  useEffect(() => {
    autoPickAttemptedRef.current = null;
  }, [draftState?.current_pick]);

  useEffect(() => {
    if (
      draftType === 'untimed' ||
      isDraftComplete ||
      picking ||
      timeLeft > 0 ||
      availableTeams.length === 0
    ) {
      return;
    }

    const currentPick = draftState?.current_pick;
    if (!currentPick || autoPickAttemptedRef.current === currentPick) {
      return;
    }

    const randomTeam = availableTeams[Math.floor(Math.random() * availableTeams.length)];
    autoPickAttemptedRef.current = currentPick;

    const runTimeoutPick = async () => {
      setPicking(true);
      setPickError(null);
      try {
        await autoDraftTimeoutPick(randomTeam.id);
      } catch (err) {
        autoPickAttemptedRef.current = null;
        const message = err instanceof Error ? err.message : 'Failed to auto-draft';
        if (!message.toLowerCase().includes('already')) {
          setPickError(message);
        }
        refreshDraft();
      } finally {
        setPicking(false);
      }
    };

    runTimeoutPick();
  }, [
    timeLeft,
    picking,
    isDraftComplete,
    draftType,
    availableTeams,
    draftState?.current_pick,
    autoDraftTimeoutPick,
    refreshDraft,
  ]);

  useEffect(() => {
    if (isDraftComplete) {
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
    }
  }, [isDraftComplete]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button onClick={() => navigate('/')} className="text-emerald-500 hover:underline">Return Home</button>
      </div>
    );
  }

  if (!members.length) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <button onClick={() => navigate('/')} className="text-emerald-500 hover:underline">Return Home</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-neutral-900/80 backdrop-blur-xl border-b border-neutral-800 px-6 py-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center gap-4">
          <Trophy className="text-emerald-500 w-8 h-8" />
          <div>
            <h1 className="text-xl font-black uppercase italic tracking-tight">Draft Room</h1>
            <p className="text-xs text-neutral-400">{league?.name} • Pick {Math.min(draftState?.current_pick ?? 1, TOTAL_PICKS)} of {TOTAL_PICKS} • Round {Math.min(draftState?.current_round ?? 1, PICKS_PER_PLAYER)}</p>
          </div>
        </div>

        {!isDraftComplete && currentPicker && (
          <div className="flex items-center gap-6 bg-neutral-950 border border-neutral-800 rounded-full px-6 py-2 shadow-inner">
            {isMyTurn ? (
              <span className="text-sm font-bold text-emerald-500 uppercase tracking-widest">YOUR TURN</span>
            ) : (
              <span className="text-sm font-semibold text-neutral-400 uppercase tracking-widest">
                Waiting for {currentPicker.username}...
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className={twMerge("w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md", currentPicker.color)}>
                {currentPicker.username.charAt(0).toUpperCase()}
              </div>
              <span className="font-bold text-lg">{currentPicker.username}</span>
            </div>

            {draftType !== 'untimed' && (
              <div className={twMerge(
                "flex items-center gap-2 font-mono text-xl ml-4 px-3 py-1 rounded-md",
                timeLeft < 30 ? "bg-red-500/20 text-red-500 animate-pulse" : "bg-emerald-500/20 text-emerald-500"
              )}>
                <Clock className="w-5 h-5" />
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
        )}

        {isDraftComplete && (
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-4 md:mt-0">
            <div className="bg-emerald-500/20 text-emerald-500 font-bold px-6 py-2 rounded-full border border-emerald-500/30">
              Draft Complete!
            </div>
            <button
              onClick={() => navigate(`/league/${leagueId}/dashboard`)}
              className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold px-6 py-2 rounded-full transition-transform hover:scale-105"
            >
              Go to Dashboard
            </button>
          </div>
        )}
      </header>

      {pickError && (
        <div className="px-6 py-2 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm text-center">
          {pickError}
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Main Draft Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 scroll-smooth">

          {/* Filters */}
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2 hide-scrollbar w-full whitespace-nowrap">
            <button
              onClick={() => setSelectedGroup('All')}
              className={twMerge(
                "px-4 py-2 rounded-full font-bold text-sm transition-colors border flex-shrink-0",
                selectedGroup === 'All'
                  ? "bg-emerald-500 border-emerald-500 text-neutral-950"
                  : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
              )}
            >
              All ({availableTeams.length}/{TEAMS.length})
            </button>
            {groups.map(g => (
              <button
                key={g}
                onClick={() => setSelectedGroup(g)}
                className={twMerge(
                  "px-4 py-2 rounded-full font-bold text-sm transition-colors border flex-shrink-0",
                  selectedGroup === g
                    ? "bg-emerald-500 border-emerald-500 text-neutral-950"
                    : "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-neutral-200"
                )}
              >
                Group {g} ({availableInGroup(g)}/4)
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-4 pb-20 lg:pb-0">
              {displayTeams.map((team) => {
                const pick = picks.find(p => p.teamId === team.id);
                const isDrafted = !!pick;
                const draftedBy = isDrafted ? members.find(m => m.user_id === pick.playerId) : null;

                return (
                  <button
                    key={team.id}
                    onClick={() => handlePick(team.id)}
                    disabled={isDrafted || isDraftComplete || picking || !isMyTurn}
                    className={twMerge(
                      "relative rounded-lg overflow-hidden h-24 border-2 transition-colors group flex flex-col items-center justify-center p-2",
                      isDrafted
                        ? "border-neutral-700 bg-neutral-900 cursor-not-allowed"
                        : !isMyTurn
                          ? "border-neutral-800 bg-neutral-950 opacity-70 cursor-not-allowed"
                          : "border-neutral-800 bg-neutral-950 hover:border-emerald-500 hover:shadow-[0_0_15px_-5px_rgba(16,185,129,0.3)] cursor-pointer"
                    )}
                  >
                    <div className="absolute inset-0 z-0">
                      <img
                        src={`https://flagcdn.com/w320/${team.flagCode}.png`}
                        alt={`${team.name} flag`}
                        className={twMerge(
                          "object-cover w-full h-full transition-all duration-300",
                          isDrafted
                            ? "opacity-20 grayscale"
                            : "opacity-40 group-hover:opacity-50",
                        )}
                      />
                      <div className={twMerge(
                        "absolute inset-0",
                        isDrafted ? "bg-neutral-950/85" : "bg-neutral-950/60",
                      )} />
                    </div>

                    <div className={twMerge(
                      "relative z-10 flex flex-col items-center justify-center text-center w-full px-2 transition-opacity",
                      isDrafted && "opacity-40",
                    )}>
                      <span className="text-[10px] text-emerald-400 font-bold tracking-widest uppercase mb-1">Group {team.group}</span>
                      <span className="font-bold text-base whitespace-nowrap overflow-hidden text-ellipsis w-full drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{team.name}</span>
                    </div>

                    {pickingTeamId === team.id && (
                      <div className="absolute inset-0 bg-neutral-950/60 flex items-center justify-center z-20">
                        <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
                      </div>
                    )}

                    {isDrafted && draftedBy && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 z-20 gap-1">
                        <div className={twMerge(
                          "w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold shadow-lg ring-2 ring-neutral-950",
                          draftedBy.color,
                        )}>
                          {draftedBy.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[10px] font-bold text-neutral-300 truncate max-w-full px-1">
                          {draftedBy.username}
                        </span>
                        <span className="text-[9px] text-neutral-500">#{pick.pickNumber}</span>
                      </div>
                    )}
                  </button>
                );
              })}
          </div>
        </main>

        {/* Middle Sidebar: Ranked Teams */}
        <aside className="w-full lg:w-64 bg-neutral-900 border-t lg:border-t-0 lg:border-l border-neutral-800 flex flex-col h-[40vh] lg:h-auto z-30 relative">
          <div className="p-4 border-b border-neutral-800 bg-neutral-950">
            <h2 className="font-bold flex items-center gap-2 uppercase tracking-wide text-neutral-400 text-sm">
              <Trophy className="w-4 h-4 text-emerald-500" /> FIFA Rankings
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-1 space-y-1 scroll-smooth hide-scrollbar custom-scrollbar">
            {rankedTeams.map((team) => {
              const pick = picks.find(p => p.teamId === team.id);
              const isDrafted = !!pick;
              const draftedBy = isDrafted ? members.find(m => m.user_id === pick.playerId) : null;
              const isAvailable = availableTeams.some((t) => t.id === team.id);

              return (
                <button
                  key={`rank-${team.id}`}
                  onClick={() => handlePick(team.id)}
                  disabled={isDrafted || isDraftComplete || picking || !isAvailable}
                  className={twMerge(
                    "w-full flex items-center justify-between px-3 py-1.5 rounded bg-transparent transition-all text-left group",
                    isDrafted
                      ? "opacity-30 cursor-not-allowed"
                      : !isMyTurn
                        ? "opacity-50 pointer-events-none"
                        : "hover:bg-neutral-800 cursor-pointer"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={twMerge(
                      "font-mono text-xs w-5 text-left font-bold",
                      team.fifaRanking <= 10 ? "text-emerald-500" : "text-neutral-500"
                    )}>
                      {team.fifaRanking}
                    </span>
                    <span className="text-sm font-semibold truncate max-w-[130px]">{team.name}</span>
                  </div>

                  {isDrafted && draftedBy && (
                    <div className={twMerge("w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0", draftedBy.color)}>
                      {draftedBy.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Right Sidebar: Rosters */}
        <aside className="w-full lg:w-72 bg-neutral-900 border-t lg:border-t-0 lg:border-l border-neutral-800 flex flex-col h-[40vh] lg:h-auto z-40 relative">
          <div className="p-4 border-b border-neutral-800 bg-neutral-950">
            <h2 className="font-bold flex items-center gap-2 uppercase tracking-wide text-neutral-400 text-sm">
              <Users className="w-4 h-4" /> Team Rosters
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-sm">Round {currentRound}</h3>
                <span className="text-xs font-semibold text-emerald-500 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                  {currentRoundPickedCount} of {memberCount} picked
                </span>
              </div>

              <div className="space-y-2">
                {getMembersInRoundOrder(currentRound).map((member) => {
                  const pick = getPickForMember(currentRound, member);
                  const team = pick ? TEAMS.find((t) => t.id === pick.teamId) : null;
                  const isOnClock = !pick && member.user_id === draftState?.current_user_id && !isDraftComplete;

                  return (
                    <div
                      key={member.user_id}
                      className={twMerge(
                        'rounded-lg border px-3 py-2 flex items-center gap-3 transition-all',
                        isOnClock
                          ? 'border-emerald-500/50 bg-emerald-500/10'
                          : 'border-neutral-800 bg-neutral-950/50',
                        !pick && !isOnClock && 'opacity-40',
                      )}
                    >
                      <div className={twMerge(
                        'w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
                        member.color,
                      )}>
                        {member.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-semibold block truncate">{member.username}</span>
                        {pick && team ? (
                          <div className="flex items-center gap-2 mt-0.5">
                            <img
                              src={`https://flagcdn.com/w20/${team.flagCode}.png`}
                              className="w-4 h-3 object-cover rounded-sm shrink-0"
                              alt=""
                            />
                            <span className="text-xs font-medium truncate">{team.name}</span>
                          </div>
                        ) : isOnClock ? (
                          <span className="text-xs text-emerald-500 animate-pulse">On the clock...</span>
                        ) : (
                          <span className="text-xs text-neutral-600">Waiting...</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {previousRounds.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2">
                  Previous rounds
                </p>
                <div className="space-y-2">
                  {previousRounds.map((round) => {
                    const roundMembers = getMembersInRoundOrder(round);
                    const roundPickCount = roundMembers
                      .map((m) => getPickForMember(round, m))
                      .filter(Boolean).length;
                    const isExpanded = expandedPreviousRounds.has(round);

                    return (
                      <div key={round} className="rounded-lg border border-neutral-800 bg-neutral-950/50 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedPreviousRounds((prev) => {
                              const next = new Set(prev);
                              if (next.has(round)) next.delete(round);
                              else next.add(round);
                              return next;
                            });
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-neutral-900/50 transition-colors text-left"
                        >
                          <span className="text-xs font-semibold text-neutral-300 shrink-0">
                            Round {round} — {roundPickCount} picks
                          </span>
                          <div className="flex -space-x-1.5 flex-1 justify-end mr-1">
                            {roundMembers.map((member) => (
                              <div
                                key={member.user_id}
                                className={twMerge(
                                  'w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold border border-neutral-900',
                                  member.color,
                                )}
                              >
                                {member.username.charAt(0).toUpperCase()}
                              </div>
                            ))}
                          </div>
                          <ChevronDown
                            className={twMerge(
                              'w-4 h-4 text-neutral-500 shrink-0 transition-transform',
                              isExpanded && 'rotate-180',
                            )}
                          />
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 space-y-2 border-t border-neutral-800 pt-2">
                            {roundMembers.map((member) => {
                              const pick = getPickForMember(round, member);
                              const team = pick ? TEAMS.find((t) => t.id === pick.teamId) : null;

                              return (
                                <div
                                  key={member.user_id}
                                  className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2 flex items-center gap-3"
                                >
                                  <div className={twMerge(
                                    'w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                                    member.color,
                                  )}>
                                    {member.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <span className="text-sm font-semibold block truncate">{member.username}</span>
                                    {pick && team && (
                                      <div className="flex items-center gap-2 mt-0.5">
                                        <img
                                          src={`https://flagcdn.com/w20/${team.flagCode}.png`}
                                          className="w-4 h-3 object-cover rounded-sm shrink-0"
                                          alt=""
                                        />
                                        <span className="text-xs font-medium truncate">{team.name}</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
