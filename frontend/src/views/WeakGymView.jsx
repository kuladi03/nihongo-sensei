import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import SvgIcon from '../components/SvgIcon';
import AudioButton from '../components/AudioButton';
import {
  ArrowLeft,
  Dumbbell,
  AlertTriangle,
  Eye,
  SkipForward,
  X,
  CheckCircle2,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function WeakGymView() {
  const { dueItems, fetchDueItems, setActiveView, showToast, gradeReviewItem } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [showSkipConfirm, setShowSkipConfirm] = useState(false);
  const [gradingFeedback, setGradingFeedback] = useState(null); // 'again' | 'hard' | 'good' | 'easy'

  useEffect(() => {
    fetchDueItems();
  }, [fetchDueItems]);

  const currentItem = dueItems[currentIndex];
  const totalItems = dueItems.length;

  const handleGrade = async (quality) => {
    if (!currentItem) return;

    const feedbackTypes = { 1: 'again', 3: 'hard', 4: 'good', 5: 'easy' };
    setGradingFeedback(feedbackTypes[quality] || 'good');

    try {
      await gradeReviewItem(currentItem.id, quality);

      setTimeout(() => {
        setGradingFeedback(null);
        setIsRevealed(false);
        setShowSkipConfirm(false);

        if (currentIndex < totalItems - 1) {
          setCurrentIndex(prev => prev + 1);
        } else {
          showToast("🎉 Weak words review complete!", "success");
          fetchDueItems();
        }
      }, 300);
    } catch (err) {
      setGradingFeedback(null);
      showToast(err.message || "Error updating mastery score.", "error");
    }
  };

  const handleConfirmedSkip = () => {
    // Gated Skip applies a low-quality grade (q=1) penalty so weak words aren't bypassed freely
    handleGrade(1);
    showToast("Word skipped with review penalty (q=1).", "info");
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || e.target?.isContentEditable) return;

      if (!isRevealed) {
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          setIsRevealed(true);
        }
      } else {
        if (e.key === '1') handleGrade(1);
        if (e.key === '2' || e.key === '3') handleGrade(3);
        if (e.key === '4') handleGrade(4);
        if (e.key === '5') handleGrade(5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRevealed, currentItem]);

  if (!currentItem || currentIndex >= totalItems) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-[#EDF5EF] border border-[#C5DEC9] flex items-center justify-center text-4xl mb-4 shadow-sm">
          💪
        </div>
        <h2 className="text-2xl font-black text-stone-900 mb-2">Memory Bank is Strong!</h2>
        <p className="text-stone-600 text-sm mb-6 max-w-sm mx-auto">
          You currently have no weak or due words in your SM-2 spaced repetition queue.
        </p>
        <button
          onClick={() => setActiveView('roadmap')}
          className="px-6 py-3 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold shadow-md transition-all cursor-pointer"
        >
          Back to Roadmap
        </button>
      </div>
    );
  }

  // Clean Japanese prompt: strip nested parenthetical kana
  const cleanJapanese = String(currentItem.japanese || currentItem.kana_only || '')
    .replace(/\s*[\(（][\u3040-\u309f\s・]+[\)）]/g, '')
    .trim();

  const trapText = currentItem.pronunciation_tip || currentItem.trap_note || currentItem.phonetic_trap;

  return (
    <div className="max-w-xl mx-auto py-8 px-4 flex flex-col min-h-[85vh] justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setActiveView('roadmap')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 hover:text-stone-900 hover:bg-[#F5F3EF] text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} /> Roadmap
          </button>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#D94E34]">
            <Dumbbell size={16} /> Weak Words Gym
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-white border border-[#E5E0D8] text-xs font-mono font-bold text-stone-700 shadow-xs">
            {currentIndex + 1} / {totalItems}
          </div>
        </div>

        {/* Animated Progress Bar */}
        <div className="w-full h-2 bg-[#F5F3EF] rounded-full overflow-hidden border border-[#E5E0D8] mb-6">
          <motion.div
            className="h-full bg-gradient-to-r from-[#D94E34] to-amber-500 rounded-full"
            initial={false}
            animate={{ width: `${((currentIndex + 1) / totalItems) * 100}%` }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>
      </div>

      {/* Main Flashcard with Motion & Hidden Readings on Front */}
      <div className="my-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              x: gradingFeedback === 'again' ? [0, -8, 8, -4, 4, 0] : 0,
            }}
            exit={{ opacity: 0, scale: 0.96, y: -12 }}
            transition={{ duration: 0.25 }}
            className={`bg-white border rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden transition-colors ${
              gradingFeedback === 'good' || gradingFeedback === 'easy'
                ? 'border-[#4A7C59] ring-2 ring-[#4A7C59]/20'
                : gradingFeedback === 'again'
                ? 'border-[#D94E34] ring-2 ring-[#D94E34]/20'
                : 'border-[#E5E0D8]'
            }`}
          >
            {/* Badge & Sized Seal/SVG */}
            <div className="w-full flex items-center justify-between mb-4">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FDF2EF] text-[#D94E34] border border-[#F5C6BC]">
                Mistakes: {currentItem.wrong_count || 0}
              </span>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#F5F3EF] text-stone-600 border border-[#E5E0D8]">
                  {currentItem.item_type || 'VOCAB'}
                </span>

                <div className="w-14 h-14 p-1.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] flex items-center justify-center shadow-xs">
                  <SvgIcon
                    svgMarkup={currentItem.svg_markup}
                    itemType={currentItem.item_type}
                    japanese={cleanJapanese}
                    kanaOnly={currentItem.kana_only}
                    className="w-11 h-11"
                  />
                </div>
              </div>
            </div>

            {/* Prompt Area */}
            {!isRevealed ? (
              /* FRONT: Pure Japanese Prompt (Readings & Romaji completely hidden for true active recall) */
              <div className="my-6 space-y-3">
                <div className="font-japanese font-black text-4xl sm:text-5xl text-stone-900 tracking-tight leading-snug">
                  {cleanJapanese}
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F5F3EF] border border-[#E5E0D8] text-xs font-semibold text-stone-600 select-none">
                  <HelpCircle size={13} className="text-stone-500" />
                  <span>Reading & Meaning Hidden</span>
                </div>
              </div>
            ) : (
              /* REVEALED: Full JpText + Readings + Audio (Zero duplicate kana sub-lines) */
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="my-3 space-y-3"
              >
                <JpText
                  japanese={cleanJapanese}
                  romaji={currentItem.romaji}
                  kana={currentItem.kana_only}
                  size="3xl"
                />

                <div className="pt-2">
                  <AudioButton audioPath={currentItem.audio_path} size="lg" showSlowToggle={true} label="Audio" />
                </div>
              </motion.div>
            )}

            {/* Reveal Answer Toggle vs Expanded Nuance */}
            {!isRevealed ? (
              <div className="w-full mt-4 space-y-3">
                <button
                  type="button"
                  onClick={() => setIsRevealed(true)}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-[#2B4C7E] to-[#1E3A63] hover:from-[#1E3A63] hover:to-[#162B4A] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye size={18} />
                  <span>Show Reading & Meaning</span>
                  <span className="hidden sm:inline text-xs font-mono opacity-60 ml-1 px-1.5 py-0.5 rounded bg-white/10">
                    Space
                  </span>
                </button>

                {/* Gated Skip Trigger */}
                <div className="text-center pt-1">
                  {!showSkipConfirm ? (
                    <button
                      type="button"
                      onClick={() => setShowSkipConfirm(true)}
                      className="text-xs font-semibold text-stone-600 hover:text-stone-800 inline-flex items-center gap-1 transition-colors"
                    >
                      <SkipForward size={13} /> Skip this word...
                    </button>
                  ) : (
                    /* Explicit Confirmation Dialog preventing effortless skipping */
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-3.5 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-left space-y-2 shadow-xs"
                    >
                      <div className="text-xs font-bold text-[#9A2E1A] flex items-center justify-between">
                        <span>Skip with review penalty?</span>
                        <button
                          type="button"
                          onClick={() => setShowSkipConfirm(false)}
                          className="text-stone-400 hover:text-stone-600"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-[11px] text-[#9A2E1A]/90 leading-relaxed font-medium">
                        Skipping marks this item as unremembered (q=1) and resets your SM-2 streak for this word.
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={handleConfirmedSkip}
                          className="px-3 py-1.5 rounded-xl bg-[#D94E34] hover:bg-[#B93D26] text-white font-bold text-xs shadow-xs"
                        >
                          Yes, Skip (Penalty)
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowSkipConfirm(false)}
                          className="px-3 py-1.5 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 font-semibold text-xs hover:bg-[#F5F3EF]"
                        >
                          Cancel
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="w-full pt-4 border-t border-[#E5E0D8] space-y-3 text-center"
              >
                <div className="text-xl font-black text-stone-900 tracking-tight">
                  {currentItem.english || currentItem.english_meaning}
                </div>

                {(currentItem.marathi || currentItem.marathi_meaning) && (
                  <div className="text-sm font-semibold text-[#233E2B] font-marathi tracking-wide leading-relaxed">
                    मराठी: {currentItem.marathi || currentItem.marathi_meaning}
                  </div>
                )}

                {trapText && (
                  <div className="p-3.5 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-left flex items-start gap-2.5 shadow-xs">
                    <AlertTriangle size={16} className="text-[#D94E34] flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-[#9A2E1A] uppercase tracking-wider mb-0.5">
                        Phonetic Trap Alert
                      </div>
                      <div className="text-xs text-[#9A2E1A] font-marathi font-medium leading-relaxed">
                        {trapText}
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* SM-2 Grading Buttons (High-contrast, keyboard-guided) */}
      <div className="mt-6">
        {isRevealed ? (
          <div>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => handleGrade(1)}
                className="py-3 px-2 rounded-2xl bg-[#FDF2EF] hover:bg-[#FCE5E0] border border-[#F5C6BC] text-[#9A2E1A] text-xs font-bold transition-all active:scale-95 shadow-xs flex flex-col items-center gap-0.5 cursor-pointer"
                title="Forgot completely (q=1)"
              >
                <span>Again</span>
                <span className="text-[10px] font-mono opacity-60">1</span>
              </button>
              <button
                onClick={() => handleGrade(3)}
                className="py-3 px-2 rounded-2xl bg-[#FCF8ED] hover:bg-[#F9ECC9] border border-[#F2DEAF] text-[#936D1C] text-xs font-bold transition-all active:scale-95 shadow-xs flex flex-col items-center gap-0.5 cursor-pointer"
                title="Struggled to recall (q=3)"
              >
                <span>Hard</span>
                <span className="text-[10px] font-mono opacity-60">2/3</span>
              </button>
              <button
                onClick={() => handleGrade(4)}
                className="py-3 px-2 rounded-2xl bg-[#EDF5EF] hover:bg-[#D1E7D6] border border-[#C5DEC9] text-[#233E2B] text-xs font-bold transition-all active:scale-95 shadow-xs flex flex-col items-center gap-0.5 cursor-pointer"
                title="Good recall (q=4)"
              >
                <span>Good</span>
                <span className="text-[10px] font-mono opacity-60">4</span>
              </button>
              <button
                onClick={() => handleGrade(5)}
                className="py-3 px-2 rounded-2xl bg-[#4A7C59] hover:bg-[#355940] text-white text-xs font-bold transition-all active:scale-95 shadow-sm flex flex-col items-center gap-0.5 cursor-pointer"
                title="Instant effortless recall (q=5)"
              >
                <span>Easy</span>
                <span className="text-[10px] font-mono opacity-80">5</span>
              </button>
            </div>
            <div className="text-center text-[11px] text-stone-600 font-medium mt-2.5">
              Grade your recall to update SM-2 memory intervals (Keys: [1] Again, [3] Hard, [4] Good, [5] Easy).
            </div>
          </div>
        ) : (
          <div className="text-center text-xs text-stone-600 font-medium">
            Test yourself mentally first, then tap reveal to grade your recall.
          </div>
        )}
      </div>
    </div>
  );
}
