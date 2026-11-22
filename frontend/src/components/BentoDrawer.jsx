import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import JpText from './JpText';
import AudioButton from './AudioButton';
import SvgIcon from './SvgIcon';
import {
  X,
  BookOpen,
  Play,
  AlertTriangle,
  ChevronRight,
  Trophy,
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function BentoDrawer({ unit, onClose }) {
  const { openUnit, authFetch } = useApp();
  const [unitData, setUnitData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!unit) return;
    let isMounted = true;
    setLoading(true);

    authFetch(`/api/units/${unit.unit_number}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data) {
          setUnitData(data);
        }
      })
      .catch((err) => console.error("Failed to load unit details for drawer:", err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [unit]);

  if (!unit) return null;

  const isBoss = unit.unit_type === 'BOSS_5';
  const studyCards = unitData?.study_cards || [];
  const exercises = unitData?.exercises || [];
  const traps = studyCards.filter((c) => c.phonetic_trap || c.trap_note || c.pronunciation_tip);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* 1. Backdrop: Clean dark-tinted overlay with zero bleed-through */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity z-40"
      />

      {/* 2. Slide-over drawer: 100% solid bg-white, high z-index */}
      <div className="fixed inset-y-0 right-0 max-w-full flex z-50">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          className="w-screen max-w-xl bg-white border-l border-[#E5E0D8] shadow-2xl flex flex-col h-full overflow-hidden"
        >
          {/* Header */}
          <div className="p-6 border-b border-[#E5E0D8] bg-[#F5F3EF] flex items-start justify-between gap-4 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm border ${
                  isBoss
                    ? 'bg-[#FCF8ED] border-[#F2DEAF] text-[#936D1C]'
                    : unit.is_completed
                    ? 'bg-[#4A7C59] text-white border-[#4A7C59]'
                    : 'bg-[#2B4C7E] text-white border-[#2B4C7E]'
                }`}
              >
                {isBoss ? '👑' : unit.unit_number.toString().padStart(2, '0')}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2B4C7E]">
                    {isBoss ? '5-Unit Cumulative Boss Trial' : `Unit ${unit.unit_number.toString().padStart(2, '0')}`}
                  </span>
                  {unit.is_completed && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#4A7C59] text-white">
                      Mastered ✓
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-black text-stone-900 tracking-tight mt-0.5">
                  {unit.title.replace(/^Unit \d+:\s*/i, '')}
                </h2>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-[#EAE6DF] border border-transparent hover:border-[#E5E0D8] transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content Body: 100% solid white surface */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-white">
            {/* 3-Track Skill Bento Strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] text-center shadow-xs">
                <span className="text-xs font-bold text-stone-500 block">Cards</span>
                <span className="text-xl font-black text-[#2B4C7E]">
                  {studyCards.length || unit.mastery_item_count || 15}
                </span>
                <span className="text-[10px] text-stone-600 block">Kana & Vocab</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-center shadow-xs">
                <span className="text-xs font-bold text-[#9A2E1A] block">Phonetic Traps</span>
                <span className="text-xl font-black text-[#D94E34]">
                  {traps.length > 0 ? traps.length : "Key Rules"}
                </span>
                <span className="text-[10px] text-[#9A2E1A]/80 block">Marathi Context</span>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#EDF5EF] border border-[#C5DEC9] text-center shadow-xs">
                <span className="text-xs font-bold text-[#233E2B] block">Drills</span>
                <span className="text-xl font-black text-[#4A7C59]">
                  {exercises.length || 15}
                </span>
                <span className="text-[10px] text-[#233E2B]/80 block">Interactive</span>
              </div>
            </div>

            {/* Phonetic Traps Alert (if present) */}
            {traps.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC]">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold uppercase tracking-wider text-[#9A2E1A]">
                  <AlertTriangle size={15} className="text-[#D94E34]" /> Marathi Phonetic Trap Alert
                </div>
                <div className="space-y-2">
                  {traps.slice(0, 3).map((trap, idx) => (
                    <div key={idx} className="p-3 rounded-xl bg-white border border-[#F5C6BC] text-xs text-stone-800 shadow-xs">
                      <div className="flex items-center gap-2 font-bold mb-1">
                        <JpText japanese={trap.japanese || trap.kana_only} romaji={trap.romaji} kana={trap.kana_only} size="sm" />
                        <span className="text-stone-400">•</span>
                        <span className="font-marathi text-[#D94E34] font-semibold">
                          {trap.marathi_meaning || trap.marathi || trap.english_meaning}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-600 font-sans leading-relaxed">
                        {trap.trap_note || trap.pronunciation_tip || "Watch for unaspirated consonants and particle reading rules."}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vocab Preview Strip with Clean Kana Stamps */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500">
                  Key Vocabulary Preview
                </h3>
                <span className="text-[11px] font-semibold text-stone-500">
                  {studyCards.length} items
                </span>
              </div>

              {loading ? (
                <div className="p-8 text-center text-stone-500 text-xs font-semibold animate-pulse">
                  Loading unit contents...
                </div>
              ) : studyCards.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {studyCards.slice(0, 6).map((card, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-white border border-[#E5E0D8] hover:border-[#2B4C7E] transition-all flex items-center justify-between gap-3 shadow-xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Kana Stamp or SvgIcon */}
                        <SvgIcon
                          svgMarkup={card.svg_markup}
                          itemType={card.item_type}
                          japanese={card.japanese}
                          kanaOnly={card.kana_only}
                          className="w-9 h-9"
                        />
                        <div className="min-w-0">
                          <JpText japanese={card.japanese || card.kana_only} romaji={card.romaji} kana={card.kana_only} size="sm" align="left" />
                          <div className="text-[11px] text-stone-500 truncate mt-0.5">
                            {card.english_meaning || card.english}
                            {(card.marathi_meaning || card.marathi) && (
                              <span className="font-marathi text-stone-700 ml-1">
                                ({card.marathi_meaning || card.marathi})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      {card.audio_path && (
                        <AudioButton audioPath={card.audio_path} size="sm" />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#F5F3EF] text-center text-xs text-stone-500">
                  Ready to review class material.
                </div>
              )}
            </div>
          </div>

          {/* Action Footer: 100% solid white, high-contrast buttons */}
          <div className="p-6 border-t border-[#E5E0D8] bg-white space-y-3 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                onClose();
                openUnit(unit.unit_number, 'study_deck');
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#F5F3EF] hover:bg-[#EAE6DF] border border-[#E5E0D8] text-stone-900 font-semibold transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white text-[#2B4C7E] border border-[#E5E0D8] flex items-center justify-center shadow-xs">
                  <BookOpen size={18} />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-stone-900">Study Cards (Warm-Up)</div>
                  <div className="text-[11px] text-stone-500">Review Kana, vocab & Marathi traps</div>
                </div>
              </div>
              <ChevronRight size={18} className="text-stone-400 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                openUnit(unit.unit_number, 'exercises');
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold transition-all group shadow-md"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 text-white flex items-center justify-center">
                  <Play size={18} className="fill-white ml-0.5" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-white">Start Drills (15 Exercises)</div>
                  <div className="text-[11px] text-white/80">Audio, tiles, traps & politeness drills</div>
                </div>
              </div>
              <ChevronRight size={18} className="text-white group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
