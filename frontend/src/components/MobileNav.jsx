import React from 'react';
import { useApp } from '../context/AppContext';
import { Map, Dumbbell, BookOpen, Layers, Mic } from 'lucide-react';

export default function MobileNav() {
  const {
    activeView,
    setActiveView,
    dueItems,
    bankItems,
    vocabCount,
    learnedKanaCount,
    scriptMode,
    cycleScriptMode,
  } = useApp();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E5E0D8] px-2 py-2 flex items-center justify-around shadow-lg">
      <button
        type="button"
        onClick={() => setActiveView('roadmap')}
        className={`flex flex-col items-center gap-1 text-[11px] font-bold ${
          activeView === 'roadmap' ? 'text-[#2B4C7E]' : 'text-stone-500'
        }`}
      >
        <Map size={18} />
        <span>Roadmap</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveView('kana')}
        className={`flex flex-col items-center gap-1 text-[11px] font-bold relative ${
          activeView === 'kana' ? 'text-[#4A7C59]' : 'text-stone-500'
        }`}
      >
        <div className="relative">
          <span className={`w-5 h-5 rounded flex items-center justify-center font-japanese font-black text-xs leading-none ${
            activeView === 'kana' ? 'bg-[#4A7C59] text-white' : 'bg-[#F5F3EF] text-stone-700 border border-[#E5E0D8]'
          }`}>
            あ
          </span>
          {learnedKanaCount > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 text-[9px] font-extrabold bg-[#4A7C59] text-white rounded-full">
              {learnedKanaCount}
            </span>
          )}
        </div>
        <span>Kana</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveView('weak_gym')}
        className={`flex flex-col items-center gap-1 text-[11px] font-bold relative ${
          activeView === 'weak_gym' ? 'text-[#D94E34]' : 'text-stone-500'
        }`}
      >
        <div className="relative">
          <Dumbbell size={18} />
          {dueItems && dueItems.length > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 text-[9px] font-extrabold bg-[#D94E34] text-white rounded-full">
              {dueItems.length}
            </span>
          )}
        </div>
        <span>Review</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveView('bank')}
        className={`flex flex-col items-center gap-1 text-[11px] font-bold relative ${
          activeView === 'bank' ? 'text-[#2B4C7E]' : 'text-stone-500'
        }`}
      >
        <div className="relative">
          <BookOpen size={18} />
          {(vocabCount ?? bankItems?.length) > 0 && (
            <span className="absolute -top-1.5 -right-2 px-1 text-[9px] font-bold bg-[#2B4C7E]/10 text-[#2B4C7E] border border-[#2B4C7E]/20 rounded-full">
              {vocabCount ?? bankItems.length}
            </span>
          )}
        </div>
        <span>Bank</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveView('live')}
        className={`flex flex-col items-center gap-1 text-[11px] font-bold relative ${
          activeView === 'live' ? 'text-[#D94E34]' : 'text-stone-500'
        }`}
      >
        <div className="relative">
          <Mic size={18} />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#4A7C59] animate-pulse"></span>
        </div>
        <span>Live</span>
      </button>

      <button
        type="button"
        onClick={cycleScriptMode}
        className="flex flex-col items-center gap-1 text-[11px] font-bold text-stone-600"
      >
        <Layers size={20} />
        <span className="capitalize">{scriptMode}</span>
      </button>
    </nav>
  );
}
