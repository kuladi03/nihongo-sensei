import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import SvgIcon from '../components/SvgIcon';
import AudioButton from '../components/AudioButton';
import {
  ChevronLeft,
  ChevronRight,
  Play,
  AlertTriangle,
  ArrowLeft,
  Eye,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function StudyDeckView() {
  const { activeUnit, setActiveView, openUnit } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealedSet, setRevealedSet] = useState(() => new Set());
  const [justRevealed, setJustRevealed] = useState(false);

  const cards = activeUnit?.study_cards || [];
  const currentCard = cards[currentIndex] || {};
  const totalCards = cards.length;
  const isRevealed = revealedSet.has(currentIndex);

  const goNext = () => {
    if (!isRevealed) {
      // Prevent effortless skipping: auto-reveal on first attempt
      revealCurrent();
      return;
    }
    if (currentIndex < totalCards - 1) {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const revealCurrent = () => {
    setRevealedSet(prev => new Set(prev).add(currentIndex));
    setJustRevealed(true);
    setTimeout(() => setJustRevealed(false), 500);
  };

  // Keyboard navigation & space-to-reveal
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (!isRevealed) {
          revealCurrent();
        } else if (currentIndex < totalCards - 1) {
          goNext();
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevealed, currentIndex, totalCards]);

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

  // Clean Japanese text: strip nested parenthetical kana so JpText doesn't repeat it
  const cleanJapanese = String(currentCard.japanese || currentCard.kana_only || '')
    .replace(/\s*[\(（][\u3040-\u309f\s・]+[\)）]/g, '')
    .trim();

  const trapText = currentCard.pronunciation_tip || currentCard.trap_note || currentCard.phonetic_trap;

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

        {/* Animated Progress Bar */}
        <div className="w-full h-2 bg-[#F5F3EF] rounded-full overflow-hidden border border-[#E5E0D8] mb-6">
          <motion.div
            className="h-full bg-gradient-to-r from-[#2B4C7E] via-[#4A7C59] to-emerald-400 rounded-full"
            initial={false}
            animate={{ width: `${((currentIndex + 1) / totalCards) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      {/* Main Interactive Study Card */}
      <div className="my-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={`relative bg-white border rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center overflow-hidden transition-colors ${
              justRevealed ? 'border-[#4A7C59] ring-2 ring-[#4A7C59]/20' : 'border-[#E5E0D8]'
            }`}
          >
            {/* Top Category Tag & Contextual Seal/SVG Icon */}
            <div className="w-full flex items-center justify-between mb-5">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#F5F3EF] text-[#2B4C7E] border border-[#E5E0D8]">
                {currentCard.item_type || 'VOCAB'}
              </span>

              {/* Status Badge */}
              <div className="flex items-center gap-2">
                {isRevealed && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF5EF] text-[#233E2B] border border-[#C5DEC9]"
                  >
                    <CheckCircle2 size={11} className="text-[#4A7C59]" /> Reviewed
                  </motion.span>
                )}
                {/* Styled Kana Stamp or Sized Hanko SVG */}
                <div className="w-14 h-14 p-1.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] flex items-center justify-center shadow-xs">
                  <SvgIcon
                    svgMarkup={currentCard.svg_markup}
                    itemType={currentCard.item_type}
                    japanese={cleanJapanese}
                    kanaOnly={currentCard.kana_only}
                    className="w-11 h-11"
                  />
                </div>
              </div>
            </div>

            {/* Main Japanese Script (Clean Furigana & Romaji without duplicate kana sub-lines) */}
            <div className="my-4">
              <JpText
                japanese={cleanJapanese}
                romaji={currentCard.romaji}
                kana={currentCard.kana_only}
                size="3xl"
              />
            </div>

            {/* Audio Button with Slow Toggle */}
            <div className="mt-2 mb-4">
              <AudioButton
                audioPath={currentCard.audio_path}
                size="lg"
                showSlowToggle={true}
                label="Listen"
              />
            </div>

            {/* Engagement Pacing: Reveal State vs Hidden Prompt */}
            {!isRevealed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="w-full pt-4 border-t border-[#E5E0D8] flex flex-col items-center"
              >
                <button
                  type="button"
                  onClick={revealCurrent}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#2B4C7E] to-[#1E3A63] hover:from-[#1E3A63] hover:to-[#162B4A] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 group cursor-pointer"
                >
                  <Eye size={18} className="group-hover:scale-110 transition-transform" />
                  <span>Reveal Meaning & Marathi Nuance</span>
                  <span className="hidden sm:inline text-xs font-mono opacity-60 ml-1 px-1.5 py-0.5 rounded bg-white/10">
                    Space
                  </span>
                </button>
                <p className="text-[11px] text-stone-600 mt-2 font-medium">
                  Test your recall first before unlocking the full meaning breakdown.
                </p>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="w-full pt-4 border-t border-[#E5E0D8] space-y-3"
              >
                {/* Meaning Section: English & Marathi */}
                <div className="space-y-1.5">
                  <div className="text-xl font-black text-stone-900 tracking-tight">
                    {currentCard.english || currentCard.english_meaning}
                  </div>
                  {(currentCard.marathi || currentCard.marathi_meaning) && (
                    <div className="text-sm font-semibold text-[#233E2B] font-marathi tracking-wide leading-relaxed">
                      मराठी: {currentCard.marathi || currentCard.marathi_meaning}
                    </div>
                  )}
                </div>

                {/* Phonetic Trap Banner (High contrast Vermilion with enhanced spacing) */}
                {trapText && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full mt-4 p-3.5 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-left flex items-start gap-3 shadow-xs"
                  >
                    <AlertTriangle size={18} className="text-[#D94E34] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-[#9A2E1A] uppercase tracking-wider mb-1">
                        Phonetic Nuance & Marathi Trap Alert
                      </div>
                      <div className="text-xs text-[#9A2E1A] font-medium leading-relaxed font-marathi">
                        {trapText}
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
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
          className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-white hover:bg-[#F5F3EF] disabled:opacity-40 text-stone-700 font-bold border border-[#E5E0D8] shadow-xs transition-colors cursor-pointer"
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
          className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold shadow-md active:scale-95 transition-all cursor-pointer"
        >
          <Play size={18} className="fill-white ml-0.5" />
          <span>Start Drills</span>
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={currentIndex === totalCards - 1 && isRevealed}
          className={`flex items-center gap-1.5 px-4 py-3 rounded-2xl font-bold border shadow-xs transition-all cursor-pointer ${
            !isRevealed
              ? 'bg-[#FDF2EF] hover:bg-[#FCE5E0] border-[#F5C6BC] text-[#D94E34] animate-pulse'
              : 'bg-white hover:bg-[#F5F3EF] border-[#E5E0D8] text-stone-700 disabled:opacity-40'
          }`}
          title={!isRevealed ? "Tap to reveal before advancing" : "Next Card"}
        >
          <span>{isRevealed ? 'Next' : 'Reveal'}</span>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
