import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import { fetchLeague } from '../../hooks/useLeague';
import { supabase } from '../../lib/supabase';
import type { League, LeagueMember } from '../../types/index';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { Loader2, Play } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

export const Lottery = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [positionsSaved, setPositionsSaved] = useState(false);

  const isHost = league?.host_user_id === currentUserId;

  const [stage, setStage] = useState<'intro' | 'bouncing' | 'dispensing' | 'done'>('intro');
  const [shuffledMembers, setShuffledMembers] = useState<LeagueMember[]>([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [ballPositions, setBallPositions] = useState<{ x: number; y: number }[]>([]);

  const stageRef = useRef(stage);
  stageRef.current = stage;
  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  const maxMembers = league?.max_members ?? 0;
  const memberCount = shuffledMembers.length || maxMembers;

  const saveDraftPositions = useCallback(async (order: LeagueMember[]) => {
    if (!id) return false;

    const results = await Promise.all(
      order.map((member, index) =>
        supabase
          .from('league_members')
          .update({ draft_position: index + 1 })
          .eq('league_id', id)
          .eq('user_id', member.user_id),
      ),
    );

    const failures = results
      .map((result, index) => ({ result, member: order[index], index }))
      .filter(({ result }) => result.error);

    if (failures.length > 0) {
      failures.forEach(({ result, member, index }) => {
        console.error(
          `Failed to save draft_position ${index + 1} for ${member.username} (${member.user_id}):`,
          result.error,
        );
      });
      return false;
    }

    return true;
  }, [id]);

  const applySyncedOrder = useCallback((
    ordered: LeagueMember[],
    options?: { jumpToDone?: boolean },
  ) => {
    setMembers(ordered);
    setShuffledMembers(ordered);
    setBallPositions(
      ordered.map(() => ({
        x: Math.random() * 200 - 100,
        y: Math.random() * 150 - 75,
      })),
    );

    if (options?.jumpToDone) {
      setStage('done');
      setRevealedCount(ordered.length);
      return;
    }

    if (stageRef.current === 'intro' || stageRef.current === 'bouncing') {
      setStage('dispensing');
      setRevealedCount(0);
    }
  }, []);

  const handleLotteryStatus = useCallback(async (status: string) => {
    if (!id) return;

    const { league: fetchedLeague, members: fetchedMembers } = await fetchLeague(id);
    setLeague(fetchedLeague);
    const ordered = [...fetchedMembers].sort((a, b) => a.draft_position - b.draft_position);

    if (status === 'lottery') {
      if (stageRef.current === 'intro') {
        setStage('bouncing');
        setRevealedCount(0);
      }
      return;
    }

    if (status === 'lottery_order') {
      if (isHostRef.current) return;
      applySyncedOrder(ordered);
      return;
    }

    if (status === 'lottery_complete') {
      if (isHostRef.current && stageRef.current === 'done') return;
      applySyncedOrder(ordered, { jumpToDone: true });
    }
  }, [id, applySyncedOrder]);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    Promise.all([fetchLeague(id), supabase.auth.getUser()])
      .then(([{ league: fetchedLeague, members: fetchedMembers }, { data: { user } }]) => {
        setLeague(fetchedLeague);
        setMembers(fetchedMembers);
        setShuffledMembers(fetchedMembers);
        setCurrentUserId(user?.id ?? '');

        if (fetchedLeague.draft_status === 'lottery') {
          setStage('bouncing');
        } else if (fetchedLeague.draft_status === 'lottery_order') {
          const ordered = [...fetchedMembers].sort((a, b) => a.draft_position - b.draft_position);
          setShuffledMembers(ordered);
          setBallPositions(
            ordered.map(() => ({
              x: Math.random() * 200 - 100,
              y: Math.random() * 150 - 75,
            })),
          );
          setStage('dispensing');
          setRevealedCount(0);
        } else if (fetchedLeague.draft_status === 'lottery_complete') {
          const ordered = [...fetchedMembers].sort((a, b) => a.draft_position - b.draft_position);
          setShuffledMembers(ordered);
          setStage('done');
          setRevealedCount(ordered.length);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || loading) return;

    const leaguesChannel = supabase
      .channel(`leagues_lottery:${id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'leagues',
          filter: `id=eq.${id}`,
        },
        (payload) => {
          const updated = payload.new as { draft_status?: string };
          if (updated.draft_status) {
            handleLotteryStatus(updated.draft_status);
          }
        },
      )
      .subscribe();

    const pollInterval = setInterval(async () => {
      try {
        const { league: fetchedLeague } = await fetchLeague(id);
        if (
          fetchedLeague.draft_status === 'lottery' ||
          fetchedLeague.draft_status === 'lottery_order' ||
          fetchedLeague.draft_status === 'lottery_complete'
        ) {
          await handleLotteryStatus(fetchedLeague.draft_status);
        }
      } catch {
        // polling is a fallback for realtime
      }
    }, 2000);

    return () => {
      supabase.removeChannel(leaguesChannel);
      clearInterval(pollInterval);
    };
  }, [id, loading, handleLotteryStatus]);

  useEffect(() => {
    if (loading) return;
    if (league && members.length !== league.max_members) {
      navigate(`/`);
    }
  }, [loading, league, members, navigate]);

  const handleStartLottery = async () => {
    if (!id) return;

    const { error } = await supabase
      .from('leagues')
      .update({ draft_status: 'lottery' })
      .eq('id', id);

    if (error) {
      console.error('Failed to start lottery:', error);
      return;
    }

    setLeague((prev) => (prev ? { ...prev, draft_status: 'lottery' } : prev));
    setStage('bouncing');
  };

  useEffect(() => {
    if (!isHost || stage !== 'bouncing') return;

    const finalOrder = [...members].sort(() => Math.random() - 0.5);
    setShuffledMembers(finalOrder);

    const positions = finalOrder.map(() => ({
      x: Math.random() * 200 - 100,
      y: Math.random() * 150 - 75,
    }));
    setBallPositions(positions);

    const timeout = setTimeout(() => {
      setStage('dispensing');
      setRevealedCount(0);
    }, 3000);

    return () => clearTimeout(timeout);
  }, [stage, members, isHost]);

  useEffect(() => {
    if (!isHost || stage !== 'dispensing' || positionsSaved || shuffledMembers.length === 0) return;

    saveDraftPositions(shuffledMembers).then(async (success) => {
      if (success) {
        setPositionsSaved(true);
        const { error } = await supabase
          .from('leagues')
          .update({ draft_status: 'lottery_order' })
          .eq('id', id);

        if (error) {
          console.error('Failed to broadcast lottery order:', error);
        } else {
          setLeague((prev) => (prev ? { ...prev, draft_status: 'lottery_order' } : prev));
        }
      }
    });
  }, [stage, isHost, positionsSaved, shuffledMembers, saveDraftPositions, id]);

  useEffect(() => {
    if (stage !== 'dispensing' || revealedCount >= memberCount) return;

    const timeout = setTimeout(() => {
      setRevealedCount((c) => c + 1);
    }, 2000);

    return () => clearTimeout(timeout);
  }, [stage, revealedCount, memberCount]);

  useEffect(() => {
    if (stage !== 'dispensing' || revealedCount < memberCount) return;

    setStage('done');
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#10b981', '#34d399', '#ffffff'],
    });
  }, [stage, revealedCount, memberCount]);

  useEffect(() => {
    if (!isHost || stage !== 'done' || !id) return;

    supabase
      .from('leagues')
      .update({ draft_status: 'lottery_complete' })
      .eq('id', id)
      .then(({ error }) => {
        if (error) {
          console.error('Failed to broadcast lottery complete:', error);
        } else {
          setLeague((prev) => (prev ? { ...prev, draft_status: 'lottery_complete' } : prev));
        }
      });
  }, [stage, isHost, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  const showLotteryUI = stage === 'bouncing' || stage === 'dispensing' || stage === 'done';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 p-6 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.1),transparent_50%)] pointer-events-none" />

      <div className="max-w-4xl w-full z-10 flex flex-col items-center">
        <h1 className="text-4xl md:text-6xl font-black uppercase italic tracking-tight text-center mb-12">
          Draft <span className="text-emerald-500">Lottery</span>
        </h1>

        {stage === 'intro' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center"
          >
            <p className="text-xl text-neutral-400 mb-8 text-center max-w-xl">
              {isHost
                ? 'The draft lottery randomly determines the order you pick teams. Who will secure the first overall pick?'
                : 'Waiting for the host to run the draft lottery...'}
            </p>
            {isHost && (
              <button
                onClick={handleStartLottery}
                className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold text-2xl py-4 px-12 rounded-full transition-transform hover:scale-105 active:scale-95 shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]"
              >
                Start Lottery
              </button>
            )}
            {!isHost && (
              <div className="flex items-center gap-3 text-neutral-400">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                <span>Watching for lottery to begin...</span>
              </div>
            )}
          </motion.div>
        )}

        {showLotteryUI && (
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl relative flex flex-col items-center">

            {!isHost && stage === 'bouncing' && (
              <p className="text-sm text-emerald-400 mb-4 text-center">
                Host is shuffling the draft order...
              </p>
            )}

            {/* Gumball Machine */}
            <div className="mb-8 relative w-96 h-[500px] flex flex-col items-center justify-start">

              {/* Glass Globe/Dome */}
              <div className="relative w-80 h-80 flex items-center justify-center">
                {/* Glass globe background */}
                <div className="absolute inset-0 rounded-full border-8 border-neutral-700/60 bg-gradient-to-br from-neutral-800/40 to-neutral-900/60 backdrop-blur-sm overflow-hidden"
                  style={{
                    boxShadow: 'inset 0 10px 30px rgba(0,0,0,0.3), 0 0 40px rgba(16,185,129,0.1), inset -10px -10px 20px rgba(255,255,255,0.05)'
                  }}
                >
                  {/* Glass shine effect */}
                  <div className="absolute top-8 left-8 w-24 h-24 rounded-full bg-white/10 blur-xl" />
                </div>

                {/* Bouncing soccer balls inside the globe */}
                <div className="absolute inset-12 overflow-hidden rounded-full">
                  <AnimatePresence>
                    {(stage === 'bouncing' ? members : shuffledMembers).map((member, index) => {
                      if (stage === 'dispensing' && index < revealedCount) return null;
                      if (stage === 'done') return null;

                      return (
                        <motion.div
                          key={member.user_id}
                          className="absolute top-1/2 left-1/2"
                          animate={{
                            x: Array.from({ length: 20 }, (_, i) =>
                              Math.cos((i / 20) * Math.PI * 2 + index) * (60 + index * 8)
                            ),
                            y: Array.from({ length: 20 }, (_, i) =>
                              Math.sin((i / 20) * Math.PI * 2 + index) * (50 + index * 6)
                            ),
                            rotate: [0, 360]
                          }}
                          transition={{
                            duration: 2.5,
                            repeat: Infinity,
                            ease: "linear",
                            delay: index * 0.1
                          }}
                        >
                          {/* Soccer Ball */}
                          <div className="relative w-12 h-12">
                            <div className={twMerge(
                              "absolute inset-0 rounded-full shadow-xl",
                              member.color
                            )}
                              style={{
                                boxShadow: '0 4px 15px rgba(0,0,0,0.5), inset -3px -3px 6px rgba(0,0,0,0.4), inset 3px 3px 6px rgba(255,255,255,0.3)'
                              }}
                            />

                            <div className="absolute inset-0 rounded-full overflow-hidden">
                              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-900/60 rotate-0"
                                style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                              />
                              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                                style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                              />
                              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                                style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                              />
                              <div className="absolute top-1/2 left-1 -translate-y-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                                style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                              />
                              <div className="absolute top-1/2 right-1 -translate-y-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                                style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                              />
                            </div>

                            <div className="absolute inset-0 rounded-full flex items-center justify-center">
                              <span className="text-xs font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] z-10">
                                {member.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              </div>

              {/* Neck/Tube */}
              <div className="relative w-16 h-16 bg-gradient-to-b from-neutral-700 to-neutral-800 border-x-4 border-neutral-600"
                style={{
                  boxShadow: 'inset 0 4px 10px rgba(0,0,0,0.5)'
                }}
              />

              {/* Base with flap */}
              <div className="relative w-32 h-24 bg-gradient-to-b from-neutral-800 to-neutral-900 rounded-b-3xl border-4 border-neutral-700"
                style={{
                  boxShadow: '0 10px 30px rgba(0,0,0,0.5), inset 0 2px 10px rgba(0,0,0,0.3)'
                }}
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-14 h-3 bg-neutral-950 rounded-t-sm border-x-2 border-neutral-600" />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-20 h-2 bg-gradient-to-r from-neutral-500 via-neutral-300 to-neutral-500 rounded-full" />
              </div>

              {/* Ball being dispensed */}
              <AnimatePresence>
                {stage === 'dispensing' && revealedCount > 0 && revealedCount <= memberCount && (
                  <motion.div
                    key={`dispensing-${revealedCount - 1}`}
                    initial={{ y: 0, x: 0, opacity: 1, scale: 1 }}
                    animate={{
                      y: [0, 180, 220, 280, 360, 450],
                      x: 0,
                      opacity: [1, 1, 1, 1, 1, 0],
                      scale: [1, 1, 1, 1.1, 1.2, 1.3]
                    }}
                    transition={{
                      duration: 1.8,
                      times: [0, 0.2, 0.35, 0.5, 0.7, 1],
                      ease: [0.4, 0, 0.6, 1]
                    }}
                    className="absolute top-0 left-1/2 -translate-x-1/2"
                  >
                    <div className="relative w-12 h-12 ring-4 ring-emerald-500/50 rounded-full">
                      <div className={twMerge(
                        "absolute inset-0 rounded-full shadow-2xl",
                        shuffledMembers[revealedCount - 1]?.color
                      )}
                        style={{
                          boxShadow: '0 6px 20px rgba(0,0,0,0.6), inset -3px -3px 6px rgba(0,0,0,0.4), inset 3px 3px 6px rgba(255,255,255,0.3)'
                        }}
                      />

                      <div className="absolute inset-0 rounded-full overflow-hidden">
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-neutral-900/60 rotate-0"
                          style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                        />
                        <div className="absolute top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                          style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                        />
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                          style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                        />
                        <div className="absolute top-1/2 left-1 -translate-y-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                          style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                        />
                        <div className="absolute top-1/2 right-1 -translate-y-1/2 w-2.5 h-2.5 bg-neutral-900/60"
                          style={{ clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }}
                        />
                      </div>

                      <div className="absolute inset-0 rounded-full flex items-center justify-center">
                        <span className="text-xs font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] z-10">
                          {shuffledMembers[revealedCount - 1]?.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {stage === 'done' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mb-6"
              >
                <button
                  onClick={() => navigate(`/league/${id}/draft`)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-neutral-950 font-bold px-8 py-4 rounded-full flex items-center gap-2 shadow-lg transition-transform hover:scale-105 active:scale-95"
                >
                  Enter Draft Room <Play className="fill-current w-5 h-5" />
                </button>
              </motion.div>
            )}

            <div className="space-y-4 w-full">
              <AnimatePresence>
                {(stage === 'bouncing' ? members : shuffledMembers).map((member, index) => {
                  const isRevealed = stage === 'done' || (stage === 'dispensing' && index < revealedCount);
                  const displayIndex = stage === 'bouncing' ? index : index;

                  return (
                    <motion.div
                      key={member.user_id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className={twMerge(
                        "flex items-center gap-4 p-4 rounded-2xl border transition-all duration-500",
                        isRevealed
                          ? "bg-neutral-800 border-neutral-700"
                          : "bg-neutral-950/50 border-neutral-800/50 grayscale opacity-50 blur-[2px]"
                      )}
                    >
                      <div className="w-12 text-center">
                        <span className={twMerge(
                          "text-2xl font-black italic",
                          displayIndex === 0 && isRevealed ? "text-emerald-500" : "text-neutral-500"
                        )}>
                          {stage === 'bouncing' ? '?' : `#${displayIndex + 1}`}
                        </span>
                      </div>

                      {isRevealed ? (
                        <div className="flex items-center gap-4 flex-1">
                          <div className={twMerge("w-12 h-12 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md", member.color)}>
                            {member.username.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-xl font-bold">{member.username}</span>

                          {displayIndex === 0 && stage !== 'bouncing' && (
                            <span className="ml-auto bg-emerald-500/20 text-emerald-500 text-sm font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                              1st Pick
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-4 flex-1 opacity-20">
                          <div className="w-12 h-12 rounded-full bg-neutral-700 animate-pulse" />
                          <div className="h-6 w-32 bg-neutral-700 rounded animate-pulse" />
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
