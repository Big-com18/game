'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/AuthProvider';

export default function Topbar() {
  const router = useRouter();
  const { displayName, avatarColor, user } = useAuth();
  const initial = (displayName || '?')[0]?.toUpperCase();

  return (
    <div className="topbar">
      <div className="brand" onClick={() => router.push('/')}>🐺 <span>Party</span>Games</div>
      <div className="user-chip" onClick={() => router.push(user ? '/profile' : '/auth')}>
        <span className="avatar" style={{ background: avatarColor }}>{initial}</span>
        {displayName}
      </div>
    </div>
  );
}
