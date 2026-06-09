import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Trophy, Users, Globe2, Dices, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { createLeague } from '../../hooks/useLeague';
import type { DraftType } from '../../types/index';
import { Auth } from './Auth';
import { JoinLeague } from './JoinLeague';

export const Home = () => {
  const navigate = useNavigate();
  const [leagueName, setLeagueName] = useState('');
  const [leagueSize, setLeagueSize] = useState<2 | 6 | 8>(2);
  const [draftType, setDraftType] = useState<DraftType>('untimed');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState<boolean | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setAuthReady(false);
        return;
      }
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle();
      setAuthReady(!!data);
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleCreateLeague = async () => {
    if (!leagueName.trim() || creating) return;

    setCreating(true);
    setCreateError(null);

    try {
      const league = await createLeague(leagueName.trim(), leagueSize, draftType);
      navigate(`/league/${league.id}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create league');
    } finally {
      setCreating(false);
    }
  };

  if (authReady === null) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!authReady) {
    return <Auth onComplete={() => setAuthReady(true)} />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center py-16 px-4">
      <div className="max-w-4xl w-full text-center space-y-8">
        <div className="flex justify-center mb-6">
          <Globe2 className="w-24 h-24 text-emerald-500" />
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight text-white mb-4 uppercase italic">
          World Cup <span className="text-emerald-500">Draft</span>
        </h1>
        <p className="text-xl text-neutral-400 max-w-2xl mx-auto">
          Create your own league, invite {leagueSize - 1} friends, and draft the ultimate World Cup roster. Will your teams take you to glory?
        </p>

        <div className="max-w-md mx-auto w-full mb-8">
          <JoinLeague variant="embedded" />
        </div>

        <div className="max-w-md mx-auto flex items-center gap-4 py-2">
          <div className="flex-1 h-px bg-neutral-800" />
          <span className="text-neutral-500 text-sm font-semibold uppercase tracking-wider">or create a league</span>
          <div className="flex-1 h-px bg-neutral-800" />
        </div>

        <div className="max-w-md mx-auto space-y-4 py-4">
          <div className="flex flex-col gap-2 text-left">
            <label htmlFor="league-name" className="text-neutral-400 font-semibold uppercase tracking-wider text-sm">
              League Name
            </label>
            <input
              id="league-name"
              type="text"
              placeholder="My World Cup League"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              className="w-full bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 text-neutral-50 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex justify-center items-center gap-4 py-4">
          <span className="text-neutral-400 font-semibold uppercase tracking-wider text-sm">Draft Speed:</span>
          <select
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as DraftType)}
            className="bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-2 font-bold focus:outline-none focus:border-emerald-500 transition-colors"
          >
            <option value="untimed">Untimed</option>
            <option value="2min">2 Minutes</option>
            <option value="5min">5 Minutes</option>
          </select>
        </div>

        <div className="flex justify-center items-center gap-4 py-4">
          <span className="text-neutral-400 font-semibold uppercase tracking-wider text-sm">League Size:</span>
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-1 flex items-center">
          <button
              onClick={() => setLeagueSize(2)}
              className={`px-4 py-2 rounded-md font-bold transition-all ${leagueSize === 2 ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              2 Players
            </button>
            <button
              onClick={() => setLeagueSize(6)}
              className={`px-4 py-2 rounded-md font-bold transition-all ${leagueSize === 6 ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              6 Players
            </button>
            <button
              onClick={() => setLeagueSize(8)}
              className={`px-4 py-2 rounded-md font-bold transition-all ${leagueSize === 8 ? 'bg-emerald-500 text-neutral-950' : 'text-neutral-500 hover:text-neutral-300'}`}
            >
              8 Players
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 py-12">
          <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">1. Form a League</h3>
            <p className="text-neutral-400">Invite exactly {leagueSize - 1} friends to join your private group using a unique invite code.</p>
          </div>
          
          <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <Dices className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">2. Draft Lottery</h3>
            <p className="text-neutral-400">Once {leagueSize} players have joined, watch the animated lottery to determine your snake draft order.</p>
          </div>

          <div className="bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold mb-2">3. Draft Teams</h3>
            <p className="text-neutral-400">Take turns drafting from all 48 World Cup teams until everyone has {48 / leagueSize} countries each.</p>
          </div>
        </div>

        {createError && (
          <p className="text-red-400 text-sm">{createError}</p>
        )}

        <button 
          onClick={handleCreateLeague}
          disabled={!leagueName.trim() || creating}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-neutral-950 font-bold text-xl py-4 px-12 rounded-full transition-all hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]"
        >
          {creating ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Creating...
            </span>
          ) : (
            'Start Your League'
          )}
        </button>
      </div>
    </div>
  );
};
