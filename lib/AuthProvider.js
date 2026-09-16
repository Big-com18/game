'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext({ user: null, profile: null, loading: true, guestName: '', setGuestName: () => {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guestName, setGuestNameState] = useState('');

  useEffect(() => {
    setGuestNameState(localStorage.getItem('pg_guest_name') || '');

    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) { setProfile(null); return; }
    supabase.from('profiles').select('*').eq('id', user.id).single()
      .then(({ data }) => setProfile(data || null));
  }, [user]);

  function setGuestName(name) {
    localStorage.setItem('pg_guest_name', name);
    setGuestNameState(name);
  }

  const displayName = profile?.username || guestName || 'Tamu';
  const avatarColor = profile?.avatar_color || '#6C5CE7';

  return (
    <AuthContext.Provider value={{ user, profile, loading, guestName, setGuestName, displayName, avatarColor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
