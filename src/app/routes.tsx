import React, { useEffect, useState } from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { PENDING_LEAGUE_PATH_KEY } from './components/JoinLeague';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Home } from './components/Home';
import { Lobby } from './components/Lobby';
import { Lottery } from './components/Lottery';
import { DraftRoom } from './components/DraftRoom';
import { LeagueDashboard } from './components/LeagueDashboard';

function ProtectedRoute() {
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (isMounted) {
        setHasSession(!!session);
        setChecking(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!hasSession) {
    sessionStorage.setItem(PENDING_LEAGUE_PATH_KEY, location.pathname);
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

export const router = createBrowserRouter([
  { path: '/', Component: Home },
  {
    path: '/league/:id',
    element: <ProtectedRoute />,
    children: [
      { index: true, Component: Lobby },
      { path: 'lottery', Component: Lottery },
      { path: 'draft', Component: DraftRoom },
      { path: 'dashboard', Component: LeagueDashboard },
    ],
  },
]);
