import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import SvgIcon from '../components/SvgIcon';
import AudioButton from '../components/AudioButton';
import { ArrowLeft, Dumbbell, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

export default function WeakGymView() {
  const { dueItems, fetchDueItems, setActiveView, showToast, gradeReviewItem } = useApp();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRevealed, setIsRevealed] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  useEffect(() => {
    fetchDueItems();
  }, [fetchDueItems]);

  const currentItem = dueItems[currentIndex];
  const totalItems = dueItems.length;

  const handleGrade = async (quality) => {
    if (!currentItem) return;

    try {
      await gradeReviewItem(currentItem.id, quality);

      setCompletedCount(prev => prev + 1);
      setIsRevealed(false);

      if (currentIndex < totalItems - 1) {
        setCurrentIndex(prev => prev + 1);
      } else {
        showToast("🎉 Weak words review complete!", "success");
        fetchDueItems();
      }
    } catch (err) {
      showToast(err.message || "Error updating mastery score.", "error");
    }
  };

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
          className="px-6 py-3 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold shadow-md transition-all"
        >
          Back to Roadmap
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4 flex flex-col min-h-[85vh] justify-between">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setActiveView('roadmap')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 hover:text-stone-900 hover:bg-[#F5F3EF] text-xs font-semibold shadow-xs transition-colors"
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

        <div className="w-full h-2 bg-[#F5F3EF] rounded-full overflow-hidden border border-[#E5E0D8] mb-6">
          <div
            className="h-full bg-gradient-to-r from-[#D94E34] to-amber-500 transition-all duration-300 rounded-full"
            style={{ width: `${((currentIndex + 1) / totalItems) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Flashcard */}
      <div className="my-auto">
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white border border-[#E5E0D8] rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden"
        >
          {/* Badge & Sized Stamp/SVG */}
          <div className="w-full flex items-center justify-between mb-4">
            <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-[#FDF2EF] text-[#D94E34] border border-[#F5C6BC]">
              Mistakes: {currentItem.wrong_count || 0}
            </span>
            <div className="w-14 h-14 p-1.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] flex items-center justify-center">
              <SvgIcon
                svgMarkup={currentItem.svg_markup}
                itemType={currentItem.item_type}
                japanese={currentItem.japanese}
                kanaOnly={currentItem.kana_only}
                className="w-11 h-11"
              />
            </div>
          </div>

          {/* Front Prompt using JpText */}
          <div className="my-3">
            <JpText
              japanese={currentItem.japanese || currentItem.kana_only}
              romaji={currentItem.romaji}
              size="3xl"
            />
            {currentItem.kana_only && currentItem.kana_only !== currentItem.japanese && (
              <div className="text-base font-bold text-[#4A7C59] font-japanese mt-1">
                {currentItem.kana_only}
              </div>
            )}
          </div>

          <div className="my-3">
            <AudioButton audioPath={currentItem.audio_path} size="lg" showSlowToggle={true} label="Audio" />
          </div>

          {/* Reveal Back Answer Toggle */}
          {!isRevealed ? (
            <button
              type="button"
              onClick={() => setIsRevealed(true)}
              className="w-full mt-4 py-3.5 rounded-2xl bg-[#F5F3EF] hover:bg-[#EAE6DF] text-stone-800 font-semibold border border-[#E5E0D8] transition-colors shadow-xs"
            >
              Show Meaning & Nuance
            </button>
          ) : (
            <div className="w-full pt-4 border-t border-[#E5E0D8] space-y-3 animate-in fade-in duration-200">
              <div className="text-xl font-bold text-stone-900">
                {currentItem.english || currentItem.english_meaning}
              </div>
              {(currentItem.marathi || currentItem.marathi_meaning) && (
                <div className="text-sm font-semibold text-[#233E2B] font-marathi">
                  मराठी: {currentItem.marathi || currentItem.marathi_meaning}
                </div>
              )}

              {(currentItem.pronunciation_tip || currentItem.trap_note) && (
                <div className="p-3.5 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-left flex items-start gap-2.5">
                  <AlertTriangle size={16} className="text-[#D94E34] flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-[#9A2E1A] font-marathi leading-relaxed">
                    {currentItem.pronunciation_tip || currentItem.trap_note}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* SM-2 Grading Buttons (High-contrast) */}
      <div className="mt-6">
        {isRevealed ? (
          <div className="grid grid-cols-4 gap-2">
            <button
              onClick={() => handleGrade(1)}
              className="py-3 px-2 rounded-2xl bg-[#FDF2EF] hover:bg-[#FCE5E0] border border-[#F5C6BC] text-[#9A2E1A] text-xs font-bold transition-transform active:scale-95 shadow-xs"
            >
              Again (q=1)
            </button>
            <button
              onClick={() => handleGrade(3)}
              className="py-3 px-2 rounded-2xl bg-[#FCF8ED] hover:bg-[#F9ECC9] border border-[#F2DEAF] text-[#936D1C] text-xs font-bold transition-transform active:scale-95 shadow-xs"
            >
              Hard (q=3)
            </button>
            <button
              onClick={() => handleGrade(4)}
              className="py-3 px-2 rounded-2xl bg-[#EDF5EF] hover:bg-[#D1E7D6] border border-[#C5DEC9] text-[#233E2B] text-xs font-bold transition-transform active:scale-95 shadow-xs"
            >
              Good (q=4)
            </button>
            <button
              onClick={() => handleGrade(5)}
              className="py-3 px-2 rounded-2xl bg-[#4A7C59] hover:bg-[#355940] text-white text-xs font-semibold transition-transform active:scale-95 shadow-sm"
            >
              Easy (q=5)
            </button>
          </div>
        ) : (
          <div className="text-center text-xs text-stone-500 font-medium">
            Test yourself mentally first, then tap reveal to grade your recall.
          </div>
        )}
      </div>
    </div>
  );
}
