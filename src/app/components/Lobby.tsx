import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useStore, DraftType } from '../store';
import { joinLeague, fetchLeague } from '../../hooks/useLeague';
import { supabase } from '../../lib/supabase';
import type { League, LeagueMember } from '../../types/index';
import { Share2, Users, Settings2, Play, UserPlus, Copy, Check, Loader2 } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const Lobby = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { draftType, setDraftType } = useStore();

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);

  const inviteLink = `${window.location.origin}/league/${id}`;
  const maxMembers = league?.max_members ?? 0;
  const isFull = members.length >= maxMembers;
  const isMember = members.some((m) => m.user_id === currentUserId);
  const isHost = league?.host_user_id === currentUserId;

  useEffect(() => {
    if (!id) return;

    let isMounted = true;
    let pollInterval: ReturnType<typeof setInterval> | null = null;

    const pollDraftStatus = async () => {
      try {
        const data = await fetchLeague(id);
        if (!isMounted) return;

        if (data.league.draft_status === 'active') {
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
          navigate(`/league/${id}/lottery`);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to check draft status');
        }
      }
    };

    const loadLeague = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError) {
          throw new Error(`Failed to get current user: ${authError.message}`);
        }

        if (!user) {
          throw new Error('You must be signed in to view the lobby');
        }

        const data = await fetchLeague(id);

        if (!isMounted) return;

        setCurrentUserId(user.id);
        setLeague(data.league);
        setMembers(data.members);

        if (data.league.draft_status === 'active') {
          navigate(`/league/${id}/lottery`);
        } else if (!pollInterval) {
          pollInterval = setInterval(pollDraftStatus, 3000);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to load league');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadLeague();

    const membersChannel = supabase
      .channel(`league_members:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'league_members',
          filter: `league_id=eq.${id}`,
        },
        async () => {
          try {
            const data = await fetchLeague(id);
            if (isMounted) {
              setLeague(data.league);
              setMembers(data.members);
            }
          } catch (err) {
            if (isMounted) {
              setError(err instanceof Error ? err.message : 'Failed to refresh league');
            }
          }
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
      supabase.removeChannel(membersChannel);
    };
  }, [id, navigate]);

  useEffect(() => {
    if (league?.draft_type) {
      setDraftType(league.draft_type);
    }
  }, [league?.draft_type, setDraftType]);

  const handleDraftTypeChange = async (type: DraftType) => {
    setDraftType(type);
    if (!id || !isHost) return;

    const { error: updateError } = await supabase
      .from('leagues')
      .update({ draft_type: type })
      .eq('id', id);

    if (updateError) {
      setError(`Failed to update draft settings: ${updateError.message}`);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = async () => {
    if (!league || isFull || isMember || joining) return;

    setJoining(true);
    setError(null);

    try {
      await joinLeague(league.invite_code);
      const data = await fetchLeague(id!);
      setLeague(data.league);
      setMembers(data.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  const handleStartDraft = async () => {
    if (!id || !isFull) return;

    const { error: updateError } = await supabase
      .from('leagues')
      .update({ draft_status: 'active' })
      .eq('id', id);

    if (updateError) {
      setError(`Failed to start draft: ${updateError.message}`);
      return;
    }

    navigate(`/league/${id}/lottery`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 p-6 flex flex-col items-center">
      <div className="max-w-4xl w-full">
        <header className="flex justify-between items-center py-6 mb-8 border-b border-neutral-800">
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tight flex items-center gap-3">
              <Users className="text-emerald-500" /> League Lobby
            </h1>
            <p className="text-neutral-400 mt-1">League ID: <span className="text-emerald-400 font-mono">{id}</span></p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="text-neutral-400 hover:text-white transition-colors"
          >
            Leave
          </button>
        </header>

        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-8">
          {/* Main Area: Players */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                  Waiting Room <span className="bg-emerald-500/20 text-emerald-500 text-sm px-2 py-1 rounded-full">{members.length}/{maxMembers}</span>
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {members.map((m) => (
                  <div key={m.id} className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col items-center gap-3 relative overflow-hidden group">
                    <div className={twMerge("w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg", m.color)}>
                      {m.username.charAt(0).toUpperCase()}
                    </div>
                    <span className="font-semibold truncate w-full text-center">{m.username}</span>
                  </div>
                ))}

                {Array.from({ length: maxMembers - members.length }).map((_, i) => (
                  <div key={`empty-${i}`} className="bg-neutral-950/50 border border-neutral-800 border-dashed rounded-xl p-4 flex flex-col items-center justify-center gap-3 opacity-50">
                    <div className="w-16 h-16 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                      <UserPlus className="text-neutral-600 w-6 h-6" />
                    </div>
                    <span className="text-neutral-500 text-sm font-medium">Waiting...</span>
                  </div>
                ))}
              </div>
            </div>

            {!isFull && !isMember && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
                <h3 className="font-bold mb-4">Join League</h3>
                <div className="flex gap-4">
                  <button
                    onClick={handleJoin}
                    disabled={joining}
                    className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold px-6 py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Join League
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar: Settings & Invite */}
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
              <h3 className="font-bold flex items-center gap-2 mb-4">
                <Share2 className="w-5 h-5 text-emerald-500" /> Invite Friends
              </h3>
              <p className="text-sm text-neutral-400 mb-4">Share this link with {maxMembers - 1} friends to fill your league.</p>
              <div className="flex bg-neutral-950 border border-neutral-800 rounded-lg p-1">
                <input
                  type="text"
                  readOnly
                  value={inviteLink}
                  className="bg-transparent flex-1 px-3 text-sm text-neutral-300 outline-none w-full"
                />
                <button
                  onClick={handleCopy}
                  className="bg-neutral-800 hover:bg-neutral-700 p-2 rounded-md transition-colors"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6">
              <h3 className="font-bold flex items-center gap-2 mb-4">
                <Settings2 className="w-5 h-5 text-emerald-500" /> Draft Settings
              </h3>
              <div className="space-y-3">
                <label className="flex flex-col gap-1 cursor-pointer group">
                  <span className="text-sm text-neutral-400 group-hover:text-neutral-200 transition-colors">Draft Speed</span>
                  <select
                    value={draftType}
                    onChange={(e) => handleDraftTypeChange(e.target.value as DraftType)}
                    disabled={!isHost}
                    className="bg-neutral-950 border border-neutral-800 rounded-lg p-3 outline-none focus:border-emerald-500 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="untimed">Untimed (Relaxed)</option>
                    <option value="2min">2 Minutes per pick (Fast)</option>
                    <option value="5min">5 Minutes per pick</option>
                  </select>
                </label>
              </div>
            </div>

            {isHost && (
              <div className="pt-4">
                <button
                  disabled={!isFull}
                  onClick={handleStartDraft}
                  className={twMerge(
                    "w-full flex items-center justify-center gap-2 font-bold text-lg py-4 px-6 rounded-xl transition-all shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]",
                    isFull
                      ? "bg-emerald-500 hover:bg-emerald-400 text-neutral-950 hover:scale-[1.02] active:scale-95 cursor-pointer"
                      : "bg-neutral-800 text-neutral-500 cursor-not-allowed shadow-none"
                  )}
                >
                  <Play className="fill-current w-5 h-5" />
                  {isFull ? "Start Draft Lottery" : `Waiting for ${maxMembers} Players...`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
