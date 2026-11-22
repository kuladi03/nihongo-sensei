import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import SvgIcon from '../components/SvgIcon';
import AudioButton from '../components/AudioButton';
import { ChevronLeft, ChevronRight, Play, AlertTriangle, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudyDeckView() {
  const { activeUnit, setActiveView, openUnit } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);

  const cards = activeUnit?.study_cards || [];
  const currentCard = cards[currentIndex] || {};
  const totalCards = cards.length;

  if (totalCards === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center px-4">
        <h2 className="text-xl font-bold text-stone-900 mb-2">No Study Cards in this Unit</h2>
        <button
          onClick={() => setActiveView('roadmap')}
          className="mt-4 px-4 py-2 rounded-xl bg-[#F5F3EF] text-stone-700 border border-[#E5E0D8] hover:bg-[#EAE6DF]"
        >
          Return to Roadmap
        </button>
      </div>
    );
  }

  const goNext = () => {
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4 flex flex-col min-h-[85vh] justify-between">
      {/* Deck Top Navigation */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setActiveView('roadmap')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 hover:text-stone-900 hover:bg-[#F5F3EF] text-xs font-semibold transition-colors shadow-xs"
          >
            <ArrowLeft size={16} /> Roadmap
          </button>
          <div className="text-xs font-bold uppercase tracking-wider text-[#2B4C7E]">
            Unit {activeUnit?.unit_number?.toString().padStart(2, '0')} • Study Deck
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-white border border-[#E5E0D8] text-xs font-mono font-bold text-stone-700 shadow-xs">
            {currentIndex + 1} / {totalCards}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full h-2 bg-[#F5F3EF] rounded-full overflow-hidden border border-[#E5E0D8] mb-6">
          <div
            className="h-full bg-gradient-to-r from-[#2B4C7E] to-[#4A7C59] transition-all duration-300 rounded-full"
            style={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Study Card */}
      <div className="my-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.97, x: 20 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.97, x: -20 }}
            transition={{ duration: 0.2 }}
            className="relative bg-white border border-[#E5E0D8] rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center overflow-hidden"
          >
            {/* Top Category Tag & SVG/Stamp Icon */}
            <div className="w-full flex items-center justify-between mb-6">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#F5F3EF] text-[#2B4C7E] border border-[#E5E0D8]">
                {currentCard.item_type || 'VOCAB'}
              </span>

              {/* Styled Kana Stamp or Sized SVG */}
              <div className="w-14 h-14 p-1.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] flex items-center justify-center shadow-xs">
                <SvgIcon
                  svgMarkup={currentCard.svg_markup}
                  itemType={currentCard.item_type}
                  japanese={currentCard.japanese}
                  kanaOnly={currentCard.kana_only}
                  className="w-11 h-11"
                />
              </div>
            </div>

            {/* Main Japanese Script + Romaji via JpText */}
            <div className="my-3">
              <JpText
                japanese={currentCard.japanese || currentCard.kana_only}
                romaji={currentCard.romaji}
                kana={currentCard.kana_only}
                size="3xl"
              />
              {currentCard.kana_only && currentCard.kana_only !== currentCard.japanese && (
                <div className="text-base font-bold text-[#4A7C59] font-japanese mt-1">
                  {currentCard.kana_only}
                </div>
              )}
            </div>

            {/* Audio Button with Slow Toggle */}
            <div className="mt-4 mb-6">
              <AudioButton
                audioPath={currentCard.audio_path}
                size="lg"
                showSlowToggle={true}
                label="Listen"
              />
            </div>

            {/* Meaning Section: English & Marathi */}
            <div className="w-full pt-4 border-t border-[#E5E0D8] space-y-1.5">
              <div className="text-xl font-bold text-stone-900">
                {currentCard.english || currentCard.english_meaning}
              </div>
              {(currentCard.marathi || currentCard.marathi_meaning) && (
                <div className="text-sm font-semibold text-[#233E2B] font-marathi">
                  मराठी: {currentCard.marathi || currentCard.marathi_meaning}
                </div>
              )}
            </div>

            {/* Phonetic Trap Banner (High contrast Vermilion) */}
            {(currentCard.pronunciation_tip || currentCard.trap_note || currentCard.phonetic_trap) && (
              <div className="w-full mt-5 p-3.5 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-left flex items-start gap-3">
                <AlertTriangle size={18} className="text-[#D94E34] flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-bold text-[#9A2E1A] uppercase tracking-wider mb-0.5">
                    Phonetic Nuance & Trap Alert
                  </div>
                  <div className="text-xs text-[#9A2E1A] font-medium leading-relaxed font-marathi">
                    {currentCard.pronunciation_tip || currentCard.trap_note || currentCard.phonetic_trap}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Navigation & CTA */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={goPrev}
          disabled={currentIndex === 0}
          className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-[#F5F3EF] disabled:opacity-40 text-stone-700 font-bold border border-[#E5E0D8] shadow-xs transition-colors"
        >
          <ChevronLeft size={18} /> Prev
        </button>

        <button
          type="button"
          onClick={() => {
            if (activeUnit?.unit_number) {
              openUnit(activeUnit.unit_number, 'exercises');
            } else {
              setActiveView('exercises');
            }
          }}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold shadow-md active:scale-95 transition-all"
        >
          <Play size={18} className="fill-white ml-0.5" />
          <span>Start Drills</span>
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === totalCards - 1}
          className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-[#F5F3EF] disabled:opacity-40 text-stone-700 font-bold border border-[#E5E0D8] shadow-xs transition-colors"
        >
          Next <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
