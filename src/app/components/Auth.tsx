import React, { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  Trophy,
  Star,
  Flame,
  Zap,
  Target,
  Rocket,
  Sword,
  Medal,
  Mail,
  Globe2,
  Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

const COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-orange-500',
] as const;

const ICONS = ['Trophy', 'Star', 'Flame', 'Zap', 'Target', 'Rocket', 'Sword', 'Medal'] as const;

const iconMap = {
  Trophy,
  Star,
  Flame,
  Zap,
  Target,
  Rocket,
  Sword,
  Medal,
} as const;

type IconName = (typeof ICONS)[number];

interface AuthProps {
  onComplete: () => void;
}

export const Auth = ({ onComplete }: AuthProps) => {
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [checkingProfile, setCheckingProfile] = useState(true);

  const [username, setUsername] = useState('');
  const [selectedColor, setSelectedColor] = useState<string>(COLORS[0]);
  const [selectedIcon, setSelectedIcon] = useState<IconName>(ICONS[0]);
  const [profileLoading, setProfileLoading] = useState(false);

  const checkProfile = async (session: Session | null) => {
    if (!session?.user) {
      setUser(null);
      setCheckingProfile(false);
      return;
    }

    setUser(session.user);
    setCheckingProfile(true);

    const { data, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', session.user.id)
      .maybeSingle();

    if (profileError) {
      setError(profileError.message);
      setCheckingProfile(false);
      return;
    }

    if (data) {
      onComplete();
      return;
    }

    setCheckingProfile(false);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      checkProfile(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setEmailSent(false);
      checkProfile(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    setEmailSent(true);
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !username.trim()) return;

    setProfileLoading(true);
    setError(null);

    const { error: insertError } = await supabase.from('profiles').insert({
      id: user.id,
      username: username.trim(),
      color: selectedColor,
      icon: selectedIcon,
    });

    setProfileLoading(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    onComplete();
  };

  if (checkingProfile) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center py-16 px-4">
        <div className="max-w-md w-full">
          <div className="flex justify-center mb-6">
            <Globe2 className="w-16 h-16 text-emerald-500" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white mb-2 uppercase italic text-center">
            Set Up Your <span className="text-emerald-500">Profile</span>
          </h1>
          <p className="text-neutral-400 text-center mb-8">
            Choose a username, color, and icon to join the draft.
          </p>

          <form
            onSubmit={handleProfileSubmit}
            className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 space-y-6"
          >
            <div className="space-y-2">
              <label htmlFor="username" className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                required
                className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-50 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Color</span>
              <div className="grid grid-cols-4 gap-3">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(color)}
                    className={`w-full aspect-square rounded-xl ${color} transition-all ${
                      selectedColor === color
                        ? 'ring-2 ring-emerald-500 ring-offset-2 ring-offset-neutral-900 scale-105'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Icon</span>
              <div className="grid grid-cols-4 gap-3">
                {ICONS.map((iconName) => {
                  const Icon = iconMap[iconName];
                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setSelectedIcon(iconName)}
                      className={`flex items-center justify-center aspect-square rounded-xl border transition-all ${
                        selectedIcon === iconName
                          ? 'border-emerald-500 bg-emerald-500/20 text-emerald-500'
                          : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-neutral-200 hover:border-neutral-600'
                      }`}
                      aria-label={iconName}
                    >
                      <Icon className="w-6 h-6" />
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            <button
              type="submit"
              disabled={profileLoading || !username.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-950 font-bold text-lg py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
            >
              {profileLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Saving...
                </span>
              ) : (
                'Continue'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (emailSent) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center py-16 px-4">
        <div className="max-w-md w-full text-center">
          <div className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-8 space-y-4">
            <div className="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black uppercase italic tracking-tight text-white">
              Check your email!
            </h1>
            <p className="text-neutral-400">
              We sent a magic link to <span className="text-emerald-400 font-semibold">{email}</span>.
              Click the link to sign in.
            </p>
            <button
              type="button"
              onClick={() => setEmailSent(false)}
              className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 flex flex-col items-center justify-center py-16 px-4">
      <div className="max-w-md w-full">
        <div className="flex justify-center mb-6">
          <Globe2 className="w-16 h-16 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-white mb-2 uppercase italic text-center">
          World Cup <span className="text-emerald-500">Draft</span>
        </h1>
        <p className="text-neutral-400 text-center mb-8">
          Sign in with your email to get started.
        </p>

        <form
          onSubmit={handleEmailSubmit}
          className="bg-neutral-900/50 border border-neutral-800 rounded-2xl p-6 space-y-4"
        >
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 text-neutral-50 placeholder:text-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-neutral-950 font-bold text-lg py-3 px-6 rounded-xl transition-all hover:scale-[1.02] active:scale-95"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Sending...
              </span>
            ) : (
              'Send Magic Link'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
