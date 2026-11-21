import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import BentoDrawer from '../components/BentoDrawer';
import {
  Check,
  Lock,
  Play,
  BookOpen,
  Trophy,
  Sparkles,
  Dumbbell,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function RoadmapView() {
  const { roadmap, openUnit, dueItems, bankItems, vocabCount, learnedKanaCount, setActiveView } = useApp();
  const [selectedUnit, setSelectedUnit] = useState(null);

  // Fallback if roadmap is empty
  if (!roadmap || roadmap.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-4">
        <div className="w-20 h-20 rounded-3xl bg-white border border-[#E5E0D8] flex items-center justify-center text-4xl mb-4 shadow-sm">
          🌸
        </div>
        <h2 className="text-2xl font-black text-stone-900 mb-2">No Units Found Yet</h2>
        <p className="text-stone-600 max-w-md text-sm mb-6 leading-relaxed">
          Connect your Notion Hub page and sync your daily class notes using the "Sync Notion" button above.
        </p>
      </div>
    );
  }

  // Ensure full 5-Unit journey is visible (Unit 01 through Unit 05 Boss Checkpoint)
  const fullJourney = [...roadmap];
  const knownUnitNumbers = new Set(roadmap.map((u) => u.unit_number));

  if (!knownUnitNumbers.has(3)) {
    fullJourney.push({
      id: 'placeholder-3',
      unit_number: 3,
      title: 'Class 03: Food, Dining & Directions',
      notes_summary: 'Ordering at restaurants, demonstratives (これ/それ/あれ), and asking directions.',
      unit_type: 'DAILY',
      is_completed: false,
      is_locked: true,
      mastery_item_count: 20,
    });
  }

  if (!knownUnitNumbers.has(4)) {
    fullJourney.push({
      id: 'placeholder-4',
      unit_number: 4,
      title: 'Class 04: Daily Activities & Verb Stems',
      notes_summary: 'Introduction to verb conjugations, time particles, and daily routine conversations.',
      unit_type: 'DAILY',
      is_completed: false,
      is_locked: true,
      mastery_item_count: 22,
    });
  }

  if (!knownUnitNumbers.has(5)) {
    fullJourney.push({
      id: 'placeholder-5',
      unit_number: 5,
      title: 'Unit 05: Cumulative Boss Trial (Units 01–05)',
      notes_summary: 'Cumulative mastery checkpoint testing rapid phonetic distinction, time telling, and politeness hierarchy.',
      unit_type: 'BOSS_5',
      is_completed: false,
      is_locked: true,
      mastery_item_count: 35,
    });
  }

  // Sort by unit number
  fullJourney.sort((a, b) => a.unit_number - b.unit_number);

  const completedCount = roadmap.filter((u) => u.is_completed).length;
  const bossTarget = 5;
  const bossProgress = Math.min(100, Math.round((completedCount / bossTarget) * 100));

  // Node position helper (alternating left / right / center)
  // Index 0: Left, Index 1: Right, Index 2: Left, Index 3: Right, Index 4 (Boss): Center
  const getNodePosition = (index, total) => {
    if (index === total - 1) return 'center'; // Boss is center
    return index % 2 === 0 ? 'left' : 'right';
  };

  return (
    <div className="py-8 px-4 sm:px-6">
      {/* 2-Column Responsive Layout: Left Winding Roadmap, Right Sticky Sensei Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: True Winding Visual Roadmap (7-8 cols on lg) */}
        <div className="lg:col-span-7 xl:col-span-8">
          {/* Header */}
          <div className="mb-10 text-center sm:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EDF5EF] border border-[#C5DEC9] text-[#233E2B] text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles size={13} /> Custom Class Curriculum
            </div>
            <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight font-japanese">
              学習の道 <span className="text-stone-500 font-sans text-xl font-normal block sm:inline sm:ml-2">Learning Journey</span>
            </h1>
            <p className="text-stone-600 text-sm mt-1 max-w-xl">
              Follow the winding path strictly aligned with your real class notes, preserving Marathi phonetic traps and spaced repetition memory.
            </p>
          </div>

          {/* Winding Path Journey Container */}
          <div className="relative py-4 max-w-xl mx-auto sm:mx-0">
            {fullJourney.map((unit, index) => {
              const isBoss = unit.unit_type === 'BOSS_5';
              const isCompleted = unit.is_completed;
              const isLocked = unit.is_locked;
              const isCurrent = !isLocked && !isCompleted;
              const position = getNodePosition(index, fullJourney.length);

              // Connector SVG curve from this node to next node
              const hasNext = index < fullJourney.length - 1;
              const nextPos = hasNext ? getNodePosition(index + 1, fullJourney.length) : null;

              return (
                <div key={unit.id} className="relative mb-20 last:mb-6">
                  {/* S-Curve SVG connecting to next node */}
                  {hasNext && (
                    <div className="absolute top-20 left-0 right-0 h-28 pointer-events-none z-0">
                      <svg
                        className="w-full h-full"
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        fill="none"
                      >
                        <path
                          d={
                            position === 'left' && nextPos === 'right'
                              ? 'M 25 0 C 25 65, 75 35, 75 100'
                              : position === 'right' && nextPos === 'left'
                              ? 'M 75 0 C 75 65, 25 35, 25 100'
                              : position === 'right' && nextPos === 'center'
                              ? 'M 75 0 C 75 60, 50 40, 50 100'
                              : position === 'left' && nextPos === 'center'
                              ? 'M 25 0 C 25 60, 50 40, 50 100'
                              : 'M 50 0 L 50 100'
                          }
                          stroke={isCompleted ? '#4A7C59' : isCurrent ? '#2B4C7E' : '#CBD5E1'}
                          strokeWidth="4"
                          strokeDasharray={isCompleted ? 'none' : '7 7'}
                          className="transition-colors duration-500"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Node Row (Alternates Left / Right / Center) */}
                  <div
                    className={`relative z-10 flex flex-col sm:flex-row items-center gap-4 ${
                      position === 'left'
                        ? 'sm:justify-start sm:pl-4'
                        : position === 'right'
                        ? 'sm:justify-end sm:pr-4 sm:flex-row-reverse'
                        : 'justify-center text-center'
                    }`}
                  >
                    {/* 1. Large Tactile Milestone Node Button */}
                    <div className="relative flex-shrink-0">
                      {/* Pulsing ring for Active Current Unit */}
                      {isCurrent && (
                        <div className="absolute -inset-3 rounded-full bg-[#D94E34]/25 animate-pulse pointer-events-none" />
                      )}

                      {/* Bouncing START Pill Badge */}
                      {isCurrent && (
                        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#D94E34] text-white font-black text-[11px] tracking-wider uppercase shadow-md animate-bounce z-20 whitespace-nowrap">
                          START
                        </span>
                      )}

                      {/* BOSS Pill Badge */}
                      {isBoss && (
                        <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-stone-900 text-[#C9972C] font-black text-[10px] tracking-wider uppercase shadow-md z-20 whitespace-nowrap">
                          BOSS TRIAL
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={() => !isLocked && setSelectedUnit(unit)}
                        className={`group relative flex items-center justify-center transition-all duration-300 active:scale-95 shadow-md ${
                          isBoss
                            ? 'w-24 h-24 rounded-3xl'
                            : 'w-20 h-20 rounded-full'
                        } ${
                          isCompleted
                            ? 'bg-[#4A7C59] text-white ring-4 ring-[#4A7C59]/20 hover:scale-105'
                            : isCurrent
                            ? 'bg-[#2B4C7E] text-white ring-4 ring-[#D94E34]/30 hover:scale-105 shadow-xl'
                            : isBoss
                            ? 'bg-[#C9972C] text-white ring-4 ring-[#C9972C]/20 opacity-80'
                            : 'bg-stone-200 text-stone-500 border-2 border-stone-300 opacity-70 cursor-not-allowed'
                        }`}
                        title={isLocked ? 'Complete earlier units to unlock' : `Unit ${unit.unit_number}: ${unit.title}`}
                      >
                        {isCompleted ? (
                          <Check size={36} className="stroke-[3]" />
                        ) : isBoss ? (
                          <Trophy size={42} className="text-white animate-pulse" />
                        ) : isCurrent ? (
                          <Play size={32} className="fill-white ml-1 text-white" />
                        ) : (
                          <Lock size={26} />
                        )}
                      </button>
                    </div>

                    {/* 2. Milestone Info Card with 3 Clickable Pill Badges */}
                    <div
                      onClick={() => !isLocked && setSelectedUnit(unit)}
                      className={`w-full sm:w-72 bg-white border border-[#E5E0D8] rounded-2xl p-4 shadow-sm transition-all ${
                        isLocked
                          ? 'opacity-60 cursor-not-allowed'
                          : 'cursor-pointer hover:border-[#2B4C7E] hover:shadow-md'
                      } ${position === 'right' ? 'sm:text-right' : 'sm:text-left'} text-center`}
                    >
                      <div
                        className={`flex items-center gap-2 mb-1 justify-center ${
                          position === 'right' ? 'sm:justify-end' : 'sm:justify-start'
                        }`}
                      >
                        <span
                          className={`text-xs font-bold uppercase tracking-wider ${
                            isCompleted ? 'text-[#4A7C59]' : isCurrent ? 'text-[#2B4C7E]' : 'text-stone-500'
                          }`}
                        >
                          Unit {unit.unit_number.toString().padStart(2, '0')}
                        </span>
                        {isCompleted && (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-[#EDF5EF] text-[#233E2B] border border-[#C5DEC9]">
                            Mastered ✓
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm sm:text-base font-bold text-stone-900 leading-snug line-clamp-2">
                        {unit.title.replace(/^Unit \d+:\s*/i, '').replace(/^Class \d+:\s*/i, '')}
                      </h3>

                      {/* 3 Clickable Action Pill Badges */}
                      <div
                        className={`mt-3 pt-3 border-t border-[#E5E0D8] flex items-center gap-1.5 flex-wrap justify-center ${
                          position === 'right' ? 'sm:justify-end' : 'sm:justify-start'
                        }`}
                      >
                        {/* Pill 1: Study Cards */}
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isLocked) openUnit(unit.unit_number, 'study_deck');
                          }}
                          title="Open Study Cards"
                          className="px-2.5 py-1 rounded-lg bg-[#F5F3EF] hover:bg-[#EAE6DF] disabled:opacity-50 border border-[#E5E0D8] text-stone-800 text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <BookOpen size={12} className="text-[#2B4C7E]" />
                          <span>Cards</span>
                        </button>

                        {/* Pill 2: Traps & Marathi */}
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isLocked) setSelectedUnit(unit);
                          }}
                          title="View Phonetic Traps in Bento Drawer"
                          className="px-2.5 py-1 rounded-lg bg-[#FDF2EF] hover:bg-[#FCE5E0] disabled:opacity-50 border border-[#F5C6BC] text-[#9A2E1A] text-[11px] font-semibold flex items-center gap-1 transition-colors"
                        >
                          <AlertCircle size={12} className="text-[#D94E34]" />
                          <span>Traps</span>
                        </button>

                        {/* Pill 3: Drills */}
                        <button
                          type="button"
                          disabled={isLocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isLocked) openUnit(unit.unit_number, 'exercises');
                          }}
                          title="Jump directly to 15 Exercises"
                          className="px-2.5 py-1 rounded-lg bg-[#2B4C7E] hover:bg-[#1E3A63] disabled:opacity-50 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors shadow-xs"
                        >
                          <Play size={10} className="fill-white" />
                          <span>Drills</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Sticky Sensei Sidebar (4-5 cols on lg) */}
        <aside className="lg:col-span-5 xl:col-span-4 space-y-5 lg:sticky lg:top-24">
          {/* Sensei Marathi Phonetic Guide Widget */}
          <div className="p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-[#FDF2EF] border border-[#F5C6BC] text-[#D94E34] flex items-center justify-center font-bold text-sm">
                क
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900">Sensei's Marathi Insight</h3>
                <span className="text-[11px] text-stone-500">Phonetic Traps in Your Notes</span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-stone-700 leading-relaxed">
              <div className="p-3 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC]">
                <span className="font-bold text-[#9A2E1A] block mb-0.5">Unaspirated 'क' vs 'ख'</span>
                <span>
                  Japanese <strong>か/き/く/け/こ</strong> are soft and unaspirated, matching Marathi <strong>क</strong>, never aspirated <strong>ख</strong>.
                </span>
              </div>

              <div className="p-3 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8]">
                <span className="font-bold text-[#2B4C7E] block mb-0.5">Particle 'は' Pronounced 'wa'</span>
                <span>
                  In greetings like <strong>こんにちは</strong> and <strong>こんばんは</strong>, the final <strong>は</strong> is the topic particle and always read as <em>wa</em>.
                </span>
              </div>
            </div>
          </div>

          {/* Due Reviews / Weak Words Gym Widget */}
          <div className="p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Dumbbell size={18} className="text-[#D94E34]" />
                <h3 className="text-sm font-bold text-stone-900">Weak Words Gym</h3>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-[#FDF2EF] text-[#D94E34] border border-[#F5C6BC]">
                {dueItems?.length || 0} due
              </span>
            </div>

            <p className="text-xs text-stone-600 mb-4 leading-relaxed">
              Target items with low retention scores using SM-2 spaced repetition to keep your recall sharp.
            </p>

            <button
              type="button"
              onClick={() => setActiveView('weak_gym')}
              className="w-full py-2.5 px-4 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold text-xs shadow-sm transition-all flex items-center justify-center gap-2"
            >
              <Dumbbell size={14} /> Start Review Session
            </button>
          </div>

          {/* 5-Unit Boss Checkpoint Widget */}
          <div className="p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Trophy size={18} className="text-[#C9972C]" />
                <h3 className="text-sm font-bold text-stone-900">Boss Checkpoint</h3>
              </div>
              <span className="text-xs font-extrabold text-[#936D1C]">
                {completedCount} / {bossTarget} Units
              </span>
            </div>

            <p className="text-xs text-stone-500 mb-3">
              Unlocks every 5 units. Cumulative review testing cross-unit mastery and phone/time rules.
            </p>

            <div className="w-full h-2.5 bg-[#F5F3EF] rounded-full overflow-hidden border border-[#E5E0D8]">
              <div
                className="h-full bg-gradient-to-r from-[#C9972C] to-amber-400 transition-all duration-500 rounded-full"
                style={{ width: `${bossProgress}%` }}
              />
            </div>
          </div>

          {/* Kana Chart Quick Access */}
          <div className="p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded text-[10px] font-japanese font-black flex items-center justify-center bg-[#4A7C59] text-white">
                  あ
                </span>
                <span className="text-xs font-bold text-stone-900">Kana Chart</span>
              </div>
              <span className="text-[11px] text-stone-500 block mt-0.5">
                {learnedKanaCount || 10} / 46 Gojūon learned
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('kana')}
              className="px-3 py-1.5 rounded-xl bg-[#EDF5EF] hover:bg-[#DDF0E1] border border-[#C5DEC9] text-xs font-semibold text-[#233E2B] transition-colors"
            >
              Open Chart →
            </button>
          </div>

          {/* Vocab Bank Quick Access */}
          <div className="p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-stone-900 block">Vocab & Grammar Bank</span>
              <span className="text-[11px] text-stone-500">
                {vocabCount ?? (bankItems?.length || 0)} master items indexed
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveView('bank')}
              className="px-3 py-1.5 rounded-xl bg-[#F5F3EF] hover:bg-[#EAE6DF] border border-[#E5E0D8] text-xs font-semibold text-[#2B4C7E] transition-colors"
            >
              Open Bank →
            </button>
          </div>
        </aside>
      </div>

      {/* Slide-over BentoDrawer for Selected Unit */}
      <AnimatePresence>
        {selectedUnit && (
          <BentoDrawer
            unit={selectedUnit}
            onClose={() => setSelectedUnit(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
