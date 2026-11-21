import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  // Authentication State
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // 3-Mode Script Display: 'assist' (Stacked Romaji) | 'kana' (Hover/Tap Peek) | 'native' (Pure Japanese)
  const [scriptMode, setScriptMode] = useState(() => {
    return localStorage.getItem('nihongo_script_mode') || 'assist';
  });

  const [xp, setXp] = useState(0);
  const [streak, setStreak] = useState(0);

  // Navigation & Data
  // activeView: 'roadmap' | 'kana' | 'study_deck' | 'exercises' | 'weak_gym' | 'bank'
  const [activeView, setActiveView] = useState('roadmap');
  const [roadmap, setRoadmap] = useState([]);
  const [activeUnit, setActiveUnit] = useState(null);
  const [dueItems, setDueItems] = useState([]);
  const [bankItems, setBankItems] = useState([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [notification, setNotification] = useState(null);

  // Persist script mode
  useEffect(() => {
    localStorage.setItem('nihongo_script_mode', scriptMode);
  }, [scriptMode]);

  // Toast notification
  const showToast = useCallback((msg, type = "info") => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 4000);
  }, []);

  // Fetch Notion Auto-Sync Status
  const fetchSyncStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/sync/status');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }, []);

  // Authenticated fetch wrapper
  const authFetch = useCallback(async (url, options = {}) => {
    const token = localStorage.getItem('nihongo_token');
    const headers = {
      ...(options.headers || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      localStorage.removeItem('nihongo_token');
      setUser(null);
      setRoadmap([]);
      setBankItems([]);
      setDueItems([]);
      setActiveUnit(null);
    }
    return res;
  }, []);

  // Check existing session on boot
  useEffect(() => {
    const initAuth = async () => {
      const savedToken = localStorage.getItem('nihongo_token');
      if (!savedToken) {
        setAuthLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${savedToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          if (data.user.xp !== undefined) setXp(data.user.xp);
          if (data.user.streak !== undefined) setStreak(data.user.streak);
        } else {
          localStorage.removeItem('nihongo_token');
          setUser(null);
        }
      } catch (err) {
        console.error('Session check error:', err);
        localStorage.removeItem('nihongo_token');
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
  }, []);

  // Fetch Roadmap
  const fetchRoadmap = useCallback(async () => {
    try {
      const res = await authFetch('/api/roadmap');
      if (res.ok) {
        const data = await res.json();
        setRoadmap(data.roadmap || []);
      }
    } catch (err) {
      console.error('Failed to fetch roadmap:', err);
    }
  }, [authFetch]);

  // Fetch Due Items
  const fetchDueItems = useCallback(async () => {
    try {
      const res = await authFetch('/api/review/due');
      if (res.ok) {
        const data = await res.json();
        setDueItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch due items:', err);
    }
  }, [authFetch]);

  // Fetch Vocab & Grammar Bank
  const fetchBank = useCallback(async () => {
    setBankLoading(true);
    try {
      const res = await authFetch('/api/bank');
      if (res.ok) {
        const data = await res.json();
        setBankItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch vocab bank:', err);
    } finally {
      setBankLoading(false);
    }
  }, [authFetch]);

  // Load user data whenever user logs in or session is restored
  useEffect(() => {
    if (user) {
      fetchRoadmap();
      fetchDueItems();
      fetchBank();
      fetchSyncStatus();
      const syncInterval = setInterval(fetchSyncStatus, 30000);
      return () => clearInterval(syncInterval);
    }
  }, [user, fetchRoadmap, fetchDueItems, fetchBank, fetchSyncStatus]);

  // Auth Operations
  const login = async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }
    localStorage.setItem('nihongo_token', data.token);
    setUser(data.user);
    if (data.user.xp !== undefined) setXp(data.user.xp);
    if (data.user.streak !== undefined) setStreak(data.user.streak);
    showToast(`Welcome back, ${data.user.name}!`, "success");
    return data.user;
  };

  const register = async (email, name, password) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    localStorage.setItem('nihongo_token', data.token);
    setUser(data.user);
    if (data.user.xp !== undefined) setXp(data.user.xp);
    if (data.user.streak !== undefined) setStreak(data.user.streak);
    showToast(`Account created! Welcome, ${data.user.name} Sensei!`, "success");
    return data.user;
  };

  const loginWithGoogle = async (credential) => {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Google login failed');
    }
    localStorage.setItem('nihongo_token', data.token);
    setUser(data.user);
    if (data.user.xp !== undefined) setXp(data.user.xp);
    if (data.user.streak !== undefined) setStreak(data.user.streak);
    showToast(`Signed in with Google! Welcome, ${data.user.name}!`, "success");
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem('nihongo_token');
    setUser(null);
    setRoadmap([]);
    setBankItems([]);
    setDueItems([]);
    setActiveUnit(null);
    setActiveView('roadmap');
    showToast("Signed out cleanly. またね！ (See you!)", "info");
  };

  // Script Mode Cycler
  const cycleScriptMode = useCallback(() => {
    setScriptMode(prev => {
      if (prev === 'assist') return 'kana';
      if (prev === 'kana') return 'native';
      return 'assist';
    });
  }, []);

  // Backwards compatibility for legacy showRomaji boolean
  const showRomaji = scriptMode !== 'native';
  const setShowRomaji = useCallback((val) => {
    setScriptMode(val ? 'assist' : 'native');
  }, []);

  // Derived counts for Vocab and Kana
  const vocabCount = useMemo(() => {
    return (bankItems || []).filter(item => (item.item_type || '').toUpperCase() !== 'KANA').length;
  }, [bankItems]);

  const learnedKanaCount = useMemo(() => {
    // Hiragana range: [\u3040-\u309F]
    return (bankItems || []).filter(item => {
      if ((item.item_type || '').toUpperCase() !== 'KANA') return false;
      const text = (item.kana_only || item.japanese || '').trim();
      return /[\u3040-\u309F]/.test(text);
    }).length;
  }, [bankItems]);

  // Global Keyboard Shortcuts (Guard: Do NOT trigger when typing in inputs/textareas)
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();

      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) ||
        e.target?.isContentEditable
      ) {
        return;
      }

      // 'R' or 'r': Cycle script display modes
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        cycleScriptMode();
      }
      // 'Space': Replay audio in active drill/card
      else if (e.code === 'Space') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('nihongo-replay-audio'));
      }
      // '1' - '4': Select drill option
      else if (['1', '2', '3', '4'].includes(e.key)) {
        window.dispatchEvent(
          new CustomEvent('drill-select-option', {
            detail: { index: parseInt(e.key, 10) - 1 }
          })
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cycleScriptMode]);

  // Sync with Notion + Build
  const syncNotion = async () => {
    setSyncing(true);
    try {
      showToast("Connecting to Notion hub & scanning daily classes...", "info");
      const syncRes = await authFetch('/api/sync/notion', { method: 'POST' });
      const syncData = await syncRes.json();

      if (syncRes.status === 409 || syncData.status === 'already_syncing') {
        showToast("Notion auto-sync is already in progress. Please wait a moment.", "info");
        await fetchSyncStatus();
        return;
      }

      if (!syncRes.ok) {
        throw new Error(syncData.error || "Notion sync failed.");
      }

      showToast("Generating multimodal curriculum & synthesizing audio...", "info");
      const buildRes = await authFetch('/api/build-units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      });
      const buildData = await buildRes.json();

      if (buildRes.status === 409 || buildData.status === 'already_syncing') {
        showToast("Unit build is already in progress. Please wait a moment.", "info");
        await fetchSyncStatus();
        return;
      }

      if (!buildRes.ok) {
        throw new Error(buildData.error || "Unit build failed.");
      }

      await fetchRoadmap();
      await fetchDueItems();
      await fetchBank();
      await fetchSyncStatus();
      showToast(`🎉 Sync complete! ${buildData.built_units_count} units ready.`, "success");
    } catch (err) {
      showToast(`❌ Error: ${err.message}`, "error");
    } finally {
      setSyncing(false);
    }
  };

  // Open a specific unit
  const openUnit = async (unitNumber, viewType = 'study_deck') => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/units/${unitNumber}`);
      if (res.ok) {
        const data = await res.json();
        setActiveUnit(data);
        setActiveView(viewType);
      } else {
        showToast(`Could not load Unit ${unitNumber}`, "error");
      }
    } catch (err) {
      showToast(`Error opening Unit ${unitNumber}: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  // Submit Progress & SM-2 Grades
  const submitProgress = async (unitNumber, isCompleted, grades = [], earnedXp = 50, accuracy = 1.0) => {
    try {
      const res = await authFetch('/api/progress/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unit_number: unitNumber,
          is_completed: isCompleted,
          grades: grades || [],
          earned_xp: earnedXp,
          accuracy: accuracy,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const totalXp = data.total_xp !== undefined ? data.total_xp : data.user_xp;
        const streakVal = data.streak !== undefined ? data.streak : data.user_streak;

        if (totalXp !== undefined) {
          setXp(totalXp);
          setUser(prev => (prev ? { ...prev, xp: totalXp } : prev));
        }
        if (streakVal !== undefined) {
          setStreak(streakVal);
          setUser(prev => (prev ? { ...prev, streak: streakVal } : prev));
        }

        await fetchRoadmap();
        await fetchDueItems();
        await fetchBank();
        return data;
      } else {
        const errText = await res.text();
        let errMsg = `Server returned status ${res.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) errMsg = errJson.error;
        } catch (_) {}
        console.error('Progress submission failed:', res.status, errMsg);
        showToast(`Failed to save progress: ${errMsg}`, 'error');
      }
    } catch (err) {
      console.error('Network or execution error submitting progress:', err);
      showToast(`Error submitting progress: ${err.message}`, 'error');
    }
    return null;
  };

  // Grade individual SM-2 item
  const gradeReviewItem = async (itemId, quality) => {
    const res = await authFetch('/api/review/grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: itemId, quality }),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to update review grade');
  };

  const addXp = (amount) => {
    setXp(prev => prev + amount);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        authLoading,
        login,
        register,
        loginWithGoogle,
        logout,
        authFetch,
        scriptMode,
        setScriptMode,
        cycleScriptMode,
        showRomaji,
        setShowRomaji,
        xp,
        streak,
        addXp,
        activeView,
        setActiveView,
        roadmap,
        activeUnit,
        dueItems,
        bankItems,
        vocabCount,
        learnedKanaCount,
        bankLoading,
        loading,
        syncing,
        syncStatus,
        fetchSyncStatus,
        notification,
        showToast,
        syncNotion,
        openUnit,
        submitProgress,
        gradeReviewItem,
        fetchRoadmap,
        fetchDueItems,
        fetchBank,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
