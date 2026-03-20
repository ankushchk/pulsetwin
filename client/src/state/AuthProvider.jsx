import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { auth } from '../lib/firebase.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      try {
        setAuthError(null);
        if (!nextUser) {
          const cred = await signInAnonymously(auth);
          setUser(cred.user);
        } else {
          setUser(nextUser);
        }
      } catch (e) {
        setUser(null);
        setAuthError(e?.message || 'Anonymous auth failed');
        // Also surface in UI toast system.
        window.dispatchEvent(
          new CustomEvent('pulse-toast', {
            detail: {
              type: 'error',
              message: `Firebase auth error: ${e?.message || 'Anonymous auth failed'}`
            }
          })
        );
      } finally {
        setAuthLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, authLoading, authError }), [user, authLoading, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

