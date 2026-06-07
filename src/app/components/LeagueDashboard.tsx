import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { TEAMS } from '../store';
import { fetchLeague } from '../../hooks/useLeague';
import { calculatePoints } from '../../lib/pointsService';
import { supabase } from '../../lib/supabase';
import type { DraftPick, League, LeagueMember, Match } from '../../types/index';
import { Trophy, Calendar, Clock, Star, Medal, TrendingUp, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type DraftPickRow = {
  user_id: string;
  team_code: string;
  pick_number: number;
};

type MatchRow = {
  id: string;
  match_id: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: 'scheduled' | 'live' | 'finished';
  match_date: string;
  round: string;
};

function toDraftPick(row: DraftPickRow): DraftPick {
  return {
    teamId: row.team_code,
    playerId: row.user_id,
    pickNumber: row.pick_number,
  };
}

function toMatch(row: MatchRow): Match {
  return {
    id: row.id,
    match_id: row.match_id,
    home_team: row.home_team,
    away_team: row.away_team,
    home_score: row.home_score,
    away_score: row.away_score,
    status: row.status,
    match_date: row.match_date,
    round: row.round,
  };
}

function getTeamPoints(teamId: string, finishedMatches: Match[]): number {
  let pts = 0;

  for (const match of finishedMatches) {
    if (match.status !== 'finished' || match.home_score === null || match.away_score === null) {
      continue;
    }

    const isHome = match.home_team === teamId;
    const isAway = match.away_team === teamId;
    if (!isHome && !isAway) continue;

    if (match.home_score === match.away_score) {
      pts += 1;
    } else if (isHome && match.home_score > match.away_score) {
      pts += 3;
    } else if (isAway && match.away_score > match.home_score) {
      pts += 3;
    }
  }

  return pts;
}

function findMemberForTeam(
  teamCode: string,
  picks: DraftPick[],
  members: LeagueMember[],
): LeagueMember | undefined {
  const pick = picks.find((p) => p.teamId === teamCode);
  return pick ? members.find((m) => m.user_id === pick.playerId) : undefined;
}

function findCinderellaWinner(
  round: string,
  allMatches: Match[],
  picks: DraftPick[],
  members: LeagueMember[],
): { team: (typeof TEAMS)[number]; member: LeagueMember } | null {
  const roundMatches = allMatches.filter((m) => m.round === round);
  if (roundMatches.length === 0) return null;

  const teamCodes = new Set<string>();
  for (const m of roundMatches) {
    teamCodes.add(m.home_team);
    teamCodes.add(m.away_team);
  }

  let worstTeam: (typeof TEAMS)[number] | null = null;
  for (const code of teamCodes) {
    const team = TEAMS.find((t) => t.id === code);
    if (!team) continue;
    if (!worstTeam || team.fifaRanking > worstTeam.fifaRanking) {
      worstTeam = team;
    }
  }

  if (!worstTeam) return null;

  const member = findMemberForTeam(worstTeam.id, picks, members);
  if (!member) return null;

  return { team: worstTeam, member };
}

export const LeagueDashboard = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [picks, setPicks] = useState<DraftPick[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [scheduledMatches, setScheduledMatches] = useState<Match[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'standings' | 'roster'>('standings');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!id) return;

    let isMounted = true;

    const loadData = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) {
          throw new Error(`Failed to get current user: ${authError.message}`);
        }

        const [leagueData, picksResult, matchesResult] = await Promise.all([
          fetchLeague(id),
          supabase
            .from('draft_picks')
            .select('user_id, team_code, pick_number')
            .eq('league_id', id)
            .order('pick_number', { ascending: true }),
          supabase
            .from('matches')
            .select('id, match_id, home_team, away_team, home_score, away_score, status, match_date, round'),
        ]);

        if (picksResult.error) {
          throw new Error(`Failed to fetch draft picks: ${picksResult.error.message}`);
        }
        if (matchesResult.error) {
          throw new Error(`Failed to fetch matches: ${matchesResult.error.message}`);
        }

        if (!isMounted) return;

        const fetchedMatches = (matchesResult.data ?? []).map((row) => toMatch(row as MatchRow));
        const finishedMatches = fetchedMatches.filter((m) => m.status === 'finished');

        setLeague(leagueData.league);
        setMembers(leagueData.members);
        setPicks((picksResult.data ?? []).map((row) => toDraftPick(row as DraftPickRow)));
        setMatches(finishedMatches);
        setAllMatches(fetchedMatches);
        setScheduledMatches(fetchedMatches.filter((m) => m.status === 'scheduled'));
        setSelectedPlayerId((prev) => prev || user?.id || leagueData.members[0]?.user_id || '');
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    const channel = supabase
      .channel(`league_members:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'league_members',
          filter: `league_id=eq.${id}`,
        },
        async () => {
          try {
            const leagueData = await fetchLeague(id);
            if (isMounted) {
              setMembers(leagueData.members);
            }
          } catch (err) {
            if (isMounted) {
              setError(err instanceof Error ? err.message : 'Failed to refresh members');
            }
          }
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [id]);

  const pointsMap = useMemo(() => calculatePoints(picks, matches), [picks, matches]);

  const playerStats = useMemo(() => {
    return members
      .map((member) => {
        const memberTeams = picks
          .filter((p) => p.playerId === member.user_id)
          .map((p) => TEAMS.find((t) => t.id === p.teamId))
          .filter(Boolean) as (typeof TEAMS)[number][];

        const totalPoints = pointsMap.get(member.user_id) ?? 0;
        return { player: member, teams: memberTeams, totalPoints };
      })
      .sort((a, b) => b.totalPoints - a.totalPoints);
  }, [members, picks, pointsMap]);

  const hasFinishedMatches = matches.length > 0;
  const pointsLeader = playerStats[0];

  const finalMatch = matches.find((m) => m.round === 'Final');
  let worldCupWinnerTeam: string | null = null;
  if (finalMatch && finalMatch.home_score !== null && finalMatch.away_score !== null) {
    if (finalMatch.home_score > finalMatch.away_score) {
      worldCupWinnerTeam = finalMatch.home_team;
    } else if (finalMatch.away_score > finalMatch.home_score) {
      worldCupWinnerTeam = finalMatch.away_team;
    }
  }
  const worldCupWinnerMember = worldCupWinnerTeam
    ? findMemberForTeam(worldCupWinnerTeam, picks, members)
    : undefined;
  const worldCupWinnerTeamInfo = worldCupWinnerTeam
    ? TEAMS.find((t) => t.id === worldCupWinnerTeam)
    : undefined;

  const cinderellaR32 = findCinderellaWinner('Round of 32', allMatches, picks, members);
  const cinderellaR16 = findCinderellaWinner('Round of 16', allMatches, picks, members);

  const selectedPlayerStats = playerStats.find((p) => p.player.user_id === selectedPlayerId);

  const formatMatchDate = (isoString: string) => {
    const date = new Date(isoString);
    return {
      dateStr: date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      timeStr: date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
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
      <header className="bg-neutral-900 border-b border-neutral-800 px-6 py-6 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tight flex items-center gap-3">
              <Trophy className="text-emerald-500 w-8 h-8" /> League Dashboard
            </h1>
            <p className="text-neutral-400 mt-1">League Name: <span className="text-emerald-400 font-mono">{league?.name}</span></p>
          </div>
          
          <div className="flex bg-neutral-950 p-1 rounded-xl border border-neutral-800">
            <button
              onClick={() => setActiveTab('standings')}
              className={twMerge(
                "px-6 py-2 rounded-lg font-bold transition-all text-sm",
                activeTab === 'standings' ? "bg-neutral-800 text-emerald-500 shadow-sm" : "text-neutral-400 hover:text-white"
              )}
            >
              Standings & Prizes
            </button>
            <button
              onClick={() => setActiveTab('roster')}
              className={twMerge(
                "px-6 py-2 rounded-lg font-bold transition-all text-sm",
                activeTab === 'roster' ? "bg-neutral-800 text-emerald-500 shadow-sm" : "text-neutral-400 hover:text-white"
              )}
            >
              My Teams
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto space-y-8">
          
          {activeTab === 'standings' && (
            <div className="space-y-8">
              {/* Prize Categories */}
              <div className="grid md:grid-cols-3 gap-6">
                {/* Pot 1: Most Points */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center text-center relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <TrendingUp className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">Most Points</h3>
                  <p className="text-sm text-neutral-400 mb-4">Wins 1/3 of the pot</p>
                  <div className="mt-auto pt-4 border-t border-neutral-800 w-full">
                    <span className="text-xs text-neutral-500 block mb-1">Current Leader</span>
                    {hasFinishedMatches && pointsLeader ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className={twMerge("w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold", pointsLeader.player.color)}>
                          {pointsLeader.player.username.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-bold text-lg">{pointsLeader.player.username}</span>
                        <span className="text-emerald-500 font-bold ml-2">{pointsLeader.totalPoints} pts</span>
                      </div>
                    ) : (
                      <span className="font-bold text-lg text-neutral-500">TBD</span>
                    )}
                  </div>
                </div>

                {/* Pot 2: World Cup Winner */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center text-center relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <Star className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">World Cup Winner</h3>
                  <p className="text-sm text-neutral-400 mb-4">Wins 1/3 of the pot</p>
                  <div className="mt-auto pt-4 border-t border-neutral-800 w-full">
                    <span className="text-xs text-neutral-500 block mb-1">Current Leader</span>
                    {worldCupWinnerMember && worldCupWinnerTeamInfo ? (
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center justify-center gap-2">
                          <div className={twMerge("w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold", worldCupWinnerMember.color)}>
                            {worldCupWinnerMember.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-bold text-lg">{worldCupWinnerMember.username}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-sm text-neutral-400">
                          <img src={`https://flagcdn.com/w20/${worldCupWinnerTeamInfo.flagCode}.png`} alt="" className="w-4 h-3 object-cover rounded-sm" />
                          {worldCupWinnerTeamInfo.name}
                        </div>
                      </div>
                    ) : (
                      <span className="font-bold text-lg text-neutral-500">TBD</span>
                    )}
                  </div>
                </div>

                {/* Pot 3: Cinderella Prize */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center text-center relative overflow-hidden group hover:border-emerald-500/50 transition-colors">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
                    <Medal className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-lg font-bold mb-1">Cinderella Prize</h3>
                  <p className="text-sm text-neutral-400 mb-4">Wins 1/3 of the pot (split 50/50)</p>
                  <div className="mt-auto pt-4 border-t border-neutral-800 w-full space-y-4">
                    <div>
                      <span className="text-xs text-neutral-500 block mb-1">Round of 32 — 50%</span>
                      {cinderellaR32 ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center justify-center gap-2">
                            <div className={twMerge("w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold", cinderellaR32.member.color)}>
                              {cinderellaR32.member.username.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold">{cinderellaR32.member.username}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <img src={`https://flagcdn.com/w20/${cinderellaR32.team.flagCode}.png`} alt="" className="w-4 h-3 object-cover rounded-sm" />
                            {cinderellaR32.team.name} (#{cinderellaR32.team.fifaRanking})
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold text-neutral-500">TBD</span>
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-neutral-500 block mb-1">Round of 16 — 50%</span>
                      {cinderellaR16 ? (
                        <div className="flex flex-col items-center gap-1">
                          <div className="flex items-center justify-center gap-2">
                            <div className={twMerge("w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold", cinderellaR16.member.color)}>
                              {cinderellaR16.member.username.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-bold">{cinderellaR16.member.username}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-neutral-400">
                            <img src={`https://flagcdn.com/w20/${cinderellaR16.team.flagCode}.png`} alt="" className="w-4 h-3 object-cover rounded-sm" />
                            {cinderellaR16.team.name} (#{cinderellaR16.team.fifaRanking})
                          </div>
                        </div>
                      ) : (
                        <span className="font-bold text-neutral-500">TBD</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Total Points Leaderboard */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden">
                <div className="p-6 border-b border-neutral-800">
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <Medal className="text-emerald-500" /> Points Leaderboard
                  </h2>
                  <p className="text-sm text-neutral-400 mt-1">Group Stage Win = 2pts, Tie = 1pt | Bracket Win = 2pts</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-950 text-neutral-400 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-4 font-medium">Rank</th>
                        <th className="px-6 py-4 font-medium">Player</th>
                        <th className="px-6 py-4 font-medium">Roster (Points)</th>
                        <th className="px-6 py-4 font-medium text-right">Total Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {playerStats.map((stat, idx) => (
                        <tr key={stat.player.user_id} className="hover:bg-neutral-800/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className={twMerge(
                              "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm",
                              idx === 0 ? "bg-yellow-500/20 text-yellow-500" : 
                              idx === 1 ? "bg-neutral-400/20 text-neutral-400" :
                              idx === 2 ? "bg-orange-500/20 text-orange-500" : "text-neutral-500"
                            )}>
                              {idx + 1}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className={twMerge("w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold", stat.player.color)}>
                                {stat.player.username.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-bold">{stat.player.username}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              {stat.teams.map(t => (
                                <span key={t.id} className="text-xs bg-neutral-950 border border-neutral-800 px-2 py-1 rounded flex items-center gap-1.5">
                                  <img src={`https://flagcdn.com/w20/${t.flagCode}.png`} alt="" className="w-3 h-2.5 object-cover rounded-sm" />
                                  {t.name} <span className="text-emerald-500 font-bold">{getTeamPoints(t.id, matches)}</span>
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span className="text-xl font-bold text-emerald-500">{stat.totalPoints}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roster' && selectedPlayerStats && (
            <div className="space-y-6">
              {/* Roster Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-neutral-900 border border-neutral-800 p-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="text-neutral-400 font-medium">Viewing Team:</span>
                  <select 
                    value={selectedPlayerId}
                    onChange={(e) => setSelectedPlayerId(e.target.value)}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2 font-bold focus:border-emerald-500 outline-none"
                  >
                    {members.map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.username}'s Roster</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-neutral-400 flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Times shown in <span className="text-emerald-500 font-medium">{localTimeZone}</span>
                </div>
              </div>

              {/* Roster Grid */}
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {selectedPlayerStats.teams.map(team => {
                  const teamMatches = scheduledMatches
                    .filter(m => m.home_team === team.id || m.away_team === team.id)
                    .sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime());

                  const teamPoints = getTeamPoints(team.id, matches);

                  return (
                    <div key={team.id} className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden flex flex-col">
                      <div className="p-4 border-b border-neutral-800 relative bg-neutral-950">
                        <div className="absolute right-4 top-4 flex flex-col items-end gap-1">
                          <span className="bg-emerald-500/20 text-emerald-500 text-xs font-bold px-2 py-0.5 rounded">
                            {hasFinishedMatches ? `${teamPoints} pts` : 'TBD'}
                          </span>
                          <span className="text-[10px] text-neutral-500">Group {team.group}</span>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-2">
                          <img src={`https://flagcdn.com/w40/${team.flagCode}.png`} alt="" className="w-8 h-6 object-cover rounded shadow-sm" />
                          <h3 className="font-bold text-lg">{team.name}</h3>
                        </div>
                        
                      </div>
                      
                      <div className="p-4 flex-1 bg-neutral-900">
                        <h4 className="text-xs text-neutral-500 uppercase tracking-wider font-bold mb-3 flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5" /> Match Schedule
                        </h4>
                        
                        <div className="space-y-3">
                          {teamMatches.map(match => {
                            const isHome = match.home_team === team.id;
                            const opponentId = isHome ? match.away_team : match.home_team;
                            const opponent = TEAMS.find(t => t.id === opponentId)!;
                            const { dateStr, timeStr } = formatMatchDate(match.match_date);
                            
                            return (
                              <div key={match.id} className="bg-neutral-950 rounded-lg p-3 border border-neutral-800/50 text-sm">
                                <div className="flex justify-between items-center text-neutral-400 text-[10px] mb-2 font-medium uppercase tracking-wider">
                                  <span>{dateStr}</span>
                                  <span>{timeStr}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-neutral-300">vs</span>
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">{opponent.name}</span>
                                    <img src={`https://flagcdn.com/w20/${opponent.flagCode}.png`} alt="" className="w-4 h-3 object-cover rounded-sm" />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {teamMatches.length === 0 && (
                            <p className="text-sm text-neutral-500 italic">No matches scheduled yet.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};
