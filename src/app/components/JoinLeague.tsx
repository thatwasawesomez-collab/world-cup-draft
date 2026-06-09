import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Globe2, Link2, Loader2 } from 'lucide-react';
import { joinLeague, joinLeagueById, parseLeagueInput } from '../../hooks/useLeague';

const PENDING_LEAGUE_PATH_KEY = 'pendingLeaguePath';

interface JoinLeagueProps {
  showSkip?: boolean;
  onSkip?: () => void;
  variant?: 'page' | 'embedded';
}

export const JoinLeague = ({ showSkip = false, onSkip, variant = 'page' }: JoinLeagueProps) => {
  const navigate = useNavigate();
  const [leagueUrl, setLeagueUrl] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pendingPath = sessionStorage.getItem(PENDING_LEAGUE_PATH_KEY);
    if (!pendingPath) return;

    const idMatch = pendingPath.match(/\/league\/([a-f0-9-]+)/i);
    if (idMatch) {
      setLeagueUrl(`${window.location.origin}/league/${idMatch[1]}`);
    }
  }, []);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leagueUrl.trim() || joining) return;

    setJoining(true);
    setError(null);

    try {
      const parsed = parseLeagueInput(leagueUrl);
      if (!parsed) {
        throw new Error('Enter a valid league link, league ID, or invite code');
      }

      const league = parsed.type === 'id'
        ? await joinLeagueById(parsed.value)
        : await joinLeague(parsed.value);

      sessionStorage.removeItem(PENDING_LEAGUE_PATH_KEY);
      navigate(`/league/${league.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join league');
    } finally {
      setJoining(false);
    }
  };

  const handleSkip = () => {
    sessionStorage.removeItem(PENDING_LEAGUE_PATH_KEY);
    onSkip?.();
  };

  const isEmbedded = variant === 'embedded';

  const content = (
    <>
      {!isEmbedded && (
        <div className="flex justify-center mb-6">
          <Globe2 className="w-16 h-16 text-emerald-500" />
        </div>
      )}
      <h2 className={`font-black tracking-tight text-white mb-2 uppercase italic text-center ${isEmbedded ? 'text-xl' : 'text-3xl'}`}>
        Join a <span className="text-emerald-500">League</span>
      </h2>
      <p className={`text-neutral-400 text-center ${isEmbedded ? 'text-sm mb-4' : 'mb-8'}`}>
        Paste the invite link your friend shared to join their draft league.
      </p>

      <form
        onSubmit={handleJoin}
        className={`bg-neutral-900/50 border border-neutral-800 rounded-2xl space-y-4 ${isEmbedded ? 'p-4' : 'p-6'}`}
      >
          <div className="space-y-2">
            <label htmlFor="league-url" className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
              League Link
            </label>
            <div className="relative">
              <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
              <input
                id="league-url"
                type="text"
                value={leagueUrl}
                onChange={(e) => setLeagueUrl(e.target.value)}
                placeholder="https://.../league/abc-123 or invite code"
                required
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-11 pr-4 py-3 text-neutral-50 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>
            <p className="text-xs text-neutral-500">
              Paste the full invite URL, league ID, or 6-character invite code.
            </p>
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={joining || !leagueUrl.trim()}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-950 font-bold text-lg py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
          >
            {joining ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Joining...
              </span>
            ) : (
              'Join League'
            )}
          </button>

          {showSkip && (
            <button
              type="button"
              onClick={handleSkip}
              className="w-full text-neutral-500 hover:text-neutral-300 text-sm transition-colors py-2"
            >
              Skip — I&apos;ll create my own league
            </button>
          )}
      </form>
    </>
  );

  if (isEmbedded) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center py-16 px-4">
      <div className="max-w-md w-full">{content}</div>
    </div>
  );
};

export { PENDING_LEAGUE_PATH_KEY };
