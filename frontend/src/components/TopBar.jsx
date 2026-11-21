import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Map,
  Dumbbell,
  BookOpen,
  Mic,
  Sparkles,
  Flame,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Layers,
  LogOut,
  User as UserIcon,
} from 'lucide-react';

export default function TopBar() {
  const {
    user,
    logout,
    activeView,
    setActiveView,
    scriptMode,
    cycleScriptMode,
    xp,
    streak,
    dueItems,
    bankItems,
    vocabCount,
    learnedKanaCount,
    syncNotion,
    syncing,
    syncStatus,
    notification,
  } = useApp();

  const scriptModeLabels = {
    assist: { label: "Assist", desc: "Stacked Kana + Romaji", color: "text-[#2B4C7E] bg-[#F5F3EF] border-[#E5E0D8]" },
    kana: { label: "Kana", desc: "Kana only (Hover for Romaji)", color: "text-[#233E2B] bg-[#EDF5EF] border-[#C5DEC9]" },
    native: { label: "Native", desc: "Pure Japanese only", color: "text-stone-800 bg-[#F5F3EF] border-[#E5E0D8]" },
  };

  const currentModeInfo = scriptModeLabels[scriptMode] || scriptModeLabels.assist;

  return (
    <>
      <header className="sticky top-0 z-30 h-16 w-full bg-white/95 backdrop-blur-md border-b border-[#E5E0D8] px-4 sm:px-6 transition-colors shadow-xs">
        <div className="h-full max-w-6xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Brand Logo & Title */}
          <div
            onClick={() => setActiveView('roadmap')}
            className="flex items-center gap-2.5 cursor-pointer group select-none flex-shrink-0"
          >
            {/* Japanese Inkan / Hanko Seal style badge */}
            <div className="w-9 h-9 rounded-xl bg-[#FDF2EF] border border-[#F5C6BC] flex items-center justify-center text-[#D94E34] font-japanese font-black text-sm shadow-xs group-hover:scale-105 transition-transform">
              先生
            </div>
            <div className="flex flex-col">
              <span className="font-japanese font-extrabold text-stone-900 text-sm tracking-tight leading-none group-hover:text-[#2B4C7E] transition-colors">
                日本語先生
              </span>
              <span className="text-[11px] font-sans font-medium text-stone-500 tracking-wider">
                Nihongo Sensei
              </span>
            </div>
          </div>

          {/* Center: Navigation Tabs (Desktop / Tablet) */}
          <nav className="hidden md:flex items-center gap-1 bg-[#F5F3EF] p-1 rounded-xl border border-[#E5E0D8] shrink-0 whitespace-nowrap">
            <button
              type="button"
              onClick={() => setActiveView('roadmap')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeView === 'roadmap'
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
              }`}
            >
              <Map size={14} className={activeView === 'roadmap' ? 'text-[#2B4C7E]' : ''} />
              <span>Roadmap</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveView('kana')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative ${
                activeView === 'kana'
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
              }`}
            >
              <span className={`w-4 h-4 rounded text-[10px] font-japanese font-black flex items-center justify-center leading-none ${
                activeView === 'kana' ? 'bg-[#4A7C59] text-white' : 'bg-stone-200 text-stone-700'
              }`}>
                あ
              </span>
              <span>Kana</span>
              {learnedKanaCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-[#4A7C59]/10 text-[#4A7C59] border border-[#4A7C59]/20">
                  {learnedKanaCount}/46
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('weak_gym')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative ${
                activeView === 'weak_gym'
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
              }`}
            >
              <Dumbbell size={14} className={activeView === 'weak_gym' ? 'text-[#D94E34]' : ''} />
              <span>Review</span>
              {dueItems && dueItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-extrabold bg-[#D94E34] text-white">
                  {dueItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('bank')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative ${
                activeView === 'bank'
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
              }`}
            >
              <BookOpen size={14} className={activeView === 'bank' ? 'text-[#2B4C7E]' : ''} />
              <span>Bank</span>
              {(vocabCount ?? bankItems?.length) > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#2B4C7E]/10 text-[#2B4C7E] border border-[#2B4C7E]/20">
                  {vocabCount ?? bankItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveView('live')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all relative ${
                activeView === 'live'
                  ? 'bg-white text-stone-900 shadow-xs border border-[#E5E0D8]'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
              }`}
            >
              <Mic size={14} className={activeView === 'live' ? 'text-[#D94E34]' : 'text-stone-500'} />
              <span>Live</span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4A7C59] animate-pulse"></span>
            </button>
          </nav>

          {/* Right: Controls & High-Contrast Buttons */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 whitespace-nowrap">
            {/* Script Mode Pill Switcher */}
            <button
              type="button"
              onClick={cycleScriptMode}
              title={`Switch Script Display Mode (Shortcut: [R])\nCurrent: ${currentModeInfo.desc}`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold shadow-xs transition-all active:scale-95 ${currentModeInfo.color}`}
            >
              <Layers size={13} />
              <span>{currentModeInfo.label}</span>
              <span className="hidden sm:inline font-mono text-[10px] opacity-70 px-1 py-0.2 rounded bg-black/5">
                R
              </span>
            </button>

            {/* Streak Counter */}
            <div
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FDF2EF] border border-[#F5C6BC] text-[#D94E34] text-xs font-bold"
              title={`Current Streak: ${streak} days`}
            >
              <Flame size={14} className="fill-[#D94E34]" />
              <span>{streak}</span>
            </div>

            {/* XP Counter */}
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FCF8ED] border border-[#F2DEAF] text-[#936D1C] text-xs font-bold"
              title={`Total Experience: ${xp} XP`}
            >
              <Sparkles size={14} className="fill-[#C9972C]" />
              <span>{xp} XP</span>
            </div>

            {/* Primary Notion Sync Button (Admin Only) */}
            {user?.role === 'admin' && (() => {
              const isCurrentlySyncing = syncing || syncStatus?.is_syncing;
              const syncTooltip = syncStatus?.last_synced_at
                ? `Auto-sync active (Last synced: ${new Date(syncStatus.last_synced_at).toLocaleTimeString()}). Click for instant sync.`
                : 'Auto-sync active. Click for instant sync.';
              return (
                <button
                  type="button"
                  disabled={isCurrentlySyncing}
                  onClick={syncNotion}
                  title={syncTooltip}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-all active:scale-95 ${
                    isCurrentlySyncing
                      ? 'bg-stone-200 text-stone-500 border-stone-300 cursor-not-allowed'
                      : 'bg-[#2B4C7E] hover:bg-[#1E3A63] text-white border-[#2B4C7E] shadow-sm'
                  }`}
                >
                  <RefreshCw size={13} className={isCurrentlySyncing ? 'animate-spin' : ''} />
                  <span className="hidden sm:inline">{isCurrentlySyncing ? 'Syncing...' : 'Sync Notion'}</span>
                </button>
              );
            })()}

            {/* User Profile Pill & Role Badge */}
            {user && (
              <div className="flex items-center gap-2 pl-1 border-l border-[#E5E0D8]">
                <div className="flex items-center gap-2 py-1 px-2 rounded-xl bg-[#F5F3EF] border border-[#E5E0D8]">
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name}
                      className="w-6 h-6 rounded-full object-cover border border-[#E5E0D8]"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-[#2B4C7E] text-white flex items-center justify-center text-[10px] font-bold font-mono">
                      {(user.name || 'U')[0].toUpperCase()}
                    </div>
                  )}

                  <div className="hidden lg:flex flex-col">
                    <span className="text-xs font-bold text-stone-900 leading-tight max-w-[100px] truncate">
                      {user.name}
                    </span>
                    <span className="text-[10px] font-semibold text-stone-500 leading-none">
                      {user.role === 'admin' ? 'Sensei Admin' : 'Student'}
                    </span>
                  </div>

                  {/* Compact Role Badge for md screens */}
                  <span
                    className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border ${
                      user.role === 'admin'
                        ? 'bg-[#FDF2EF] text-[#D94E34] border-[#F5C6BC]'
                        : 'bg-[#EDF5EF] text-[#233E2B] border-[#C5DEC9]'
                    }`}
                  >
                    {user.role === 'admin' ? 'Admin' : 'Student'}
                  </span>
                </div>

                {/* Sign Out Button */}
                <button
                  type="button"
                  onClick={logout}
                  title="Sign Out (ログアウト)"
                  className="p-2 rounded-xl bg-white border border-[#E5E0D8] text-stone-500 hover:text-[#D94E34] hover:bg-[#FDF2EF] hover:border-[#F5C6BC] transition-colors shadow-2xs"
                >
                  <LogOut size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Floating Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-4 z-50 animate-bounce transition-all">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg border text-sm font-semibold ${
              notification.type === 'error'
                ? 'bg-[#FDF2EF] text-[#9A2E1A] border-[#F5C6BC]'
                : notification.type === 'success'
                ? 'bg-[#EDF5EF] text-[#233E2B] border-[#C5DEC9]'
                : 'bg-white text-stone-900 border-[#E5E0D8]'
            }`}
          >
            {notification.type === 'error' ? (
              <AlertCircle size={18} className="text-[#D94E34]" />
            ) : (
              <CheckCircle2 size={18} className="text-[#4A7C59]" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}
    </>
  );
}
