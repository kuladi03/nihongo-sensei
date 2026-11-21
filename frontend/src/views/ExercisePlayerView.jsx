import React, { useState, useEffect, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import SvgIcon from '../components/SvgIcon';
import AudioButton from '../components/AudioButton';
import {
  X,
  Check,
  AlertCircle,
  Mic,
  Trophy,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

export default function ExercisePlayerView() {
  const { activeUnit, setActiveView, submitProgress, addXp, fetchRoadmap } = useApp();

  const exercises = activeUnit?.exercises || [];
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null); // stores { text, romaji, raw } or string
  const [tileAnswer, setTileAnswer] = useState([]); // array of { text, romaji, raw }
  const [rankedItems, setRankedItems] = useState([]); // array of { text, romaji, raw }
  const [spokenText, setSpokenText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);

  // Evaluation states
  const [hasChecked, setHasChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [resultsLog, setResultsLog] = useState([]);
  const [isCompleted, setIsCompleted] = useState(false);

  const currentExercise = exercises[currentIndex];
  const totalExercises = exercises.length;

  // Normalized option details with guaranteed fallback
  const optionDetails = (currentExercise?.option_details || (currentExercise?.options || []).map(opt => ({
    text: opt,
    romaji: "",
    raw: opt,
  }))).map(opt => (typeof opt === 'object' ? opt : { text: opt, romaji: "", raw: opt }));

  // Reset answer states when question changes
  useEffect(() => {
    setSelectedOption(null);
    setTileAnswer([]);
    setRankedItems([]);
    setSpokenText("");
    setHasChecked(false);
    setIsCorrect(false);
  }, [currentIndex]);

  // Speech Recognition setup for ja-JP
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
    }
  }, []);

  // Keyboard shortcut listener for option selection [1-4]
  useEffect(() => {
    const handleOptionSelect = (e) => {
      if (hasChecked) return;
      const idx = e.detail?.index;
      if (idx !== undefined && idx >= 0 && idx < optionDetails.length) {
        setSelectedOption(optionDetails[idx]);
      }
    };

    window.addEventListener('drill-select-option', handleOptionSelect);
    return () => window.removeEventListener('drill-select-option', handleOptionSelect);
  }, [optionDetails, hasChecked]);

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'ja-JP';
      recognition.continuous = false;
      recognition.interimResults = false;

      setIsListening(true);

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setSpokenText(transcript);
        setIsListening(false);
      };

      recognition.onerror = (err) => {
        console.warn('Speech recognition error:', err);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  const normalizeJapanese = (text = "") => {
    return String(text).replace(/[。、！？\s・（）()]/g, "").trim().toLowerCase();
  };

  const handleCheck = useCallback(() => {
    if (!currentExercise || hasChecked) return;
    let correct = false;
    const type = currentExercise.type;
    const expected = currentExercise.correct_answer || "";
    const expectedUpgraded = currentExercise.correct_answer_upgraded || "";
    const expectedRaw = currentExercise.correct_answer_raw || "";

    if (type === "TILE_BUILDER") {
      const built = tileAnswer.map(t => (typeof t === 'object' ? t.text : t)).join("");
      correct = normalizeJapanese(built) === normalizeJapanese(expected) ||
                (expectedUpgraded && normalizeJapanese(built) === normalizeJapanese(expectedUpgraded));
    } else if (type === "POLITENESS_RANK") {
      const builtStrings = rankedItems.map(t => (typeof t === 'object' ? t.text : t));
      const built = builtStrings.join(" → ");
      const expClean = expected.replace(/\s*,\s*/g, " → ").replace(/\s*->\s*/g, " → ").trim();
      correct = built === expClean ||
                builtStrings.join(",") === expected.replace(/\s+/g, "") ||
                normalizeJapanese(builtStrings.join("")) === normalizeJapanese(expected);
    } else if (type === "SPEAKING_CHECK") {
      const target = currentExercise.target_kana || currentExercise.target_phrase || "";
      correct = normalizeJapanese(spokenText).includes(normalizeJapanese(target)) ||
                normalizeJapanese(target).includes(normalizeJapanese(spokenText));
    } else {
      // Multiple-choice options
      const selText = typeof selectedOption === 'object' ? selectedOption?.text || "" : selectedOption || "";
      const selRaw = typeof selectedOption === 'object' ? selectedOption?.raw || "" : selectedOption || "";
      const selRom = typeof selectedOption === 'object' ? selectedOption?.romaji || "" : "";

      const expTrim = expected.trim();
      const expUpTrim = expectedUpgraded.trim();
      const expRawTrim = expectedRaw.trim();

      correct = selText === expTrim ||
                selRaw === expTrim ||
                (expUpTrim && selText === expUpTrim) ||
                (expRawTrim && selRaw === expRawTrim) ||
                (selRom && selRom.toLowerCase() === expTrim.toLowerCase()) ||
                (normalizeJapanese(selText) && normalizeJapanese(expTrim) && normalizeJapanese(selText) === normalizeJapanese(expTrim));
    }

    setIsCorrect(correct);
    setHasChecked(true);

    if (correct) {
      addXp(15);
      confetti({ particleCount: 30, spread: 60, origin: { y: 0.85 } });
    }

    setResultsLog(prev => [...prev, { isCorrect: correct, quality: correct ? 5 : 2 }]);
  }, [currentExercise, hasChecked, tileAnswer, rankedItems, spokenText, selectedOption, addXp]);

  const handleContinue = useCallback(async () => {
    if (currentIndex < totalExercises - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
      const correctCount = resultsLog.filter(r => r.isCorrect).length;
      const accuracy = totalExercises > 0 ? correctCount / totalExercises : 1.0;
      const earnedXp = correctCount * 15 + 50;

      const grades = resultsLog.map((r, i) => {
        const ex = activeUnit?.exercises?.[i];
        const card = activeUnit?.study_cards?.[i];
        return {
          item_id: ex?.item_id || card?.id || null,
          target: ex?.target_phrase || ex?.target_kana || card?.japanese || null,
          quality: r.quality,
        };
      });

      await submitProgress(activeUnit?.unit_number, true, grades, earnedXp, accuracy);
      setIsCompleted(true);
    }
  }, [currentIndex, totalExercises, resultsLog, activeUnit, submitProgress]);

  // Enter Key Listener to Check or Continue
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = (e.target?.tagName || '').toUpperCase();
      const activeTag = (document.activeElement?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) || ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag) || e.target?.isContentEditable) {
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (!hasChecked) {
          handleCheck();
        } else {
          handleContinue();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasChecked, handleCheck, handleContinue]);

  // Completion Screen
  if (!currentExercise || isCompleted) {
    const correctCount = resultsLog.filter(r => r.isCorrect).length;
    const accuracy = totalExercises > 0 ? Math.round((correctCount / totalExercises) * 100) : 100;
    const earnedXp = correctCount * 15 + 50;

    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white border border-[#E5E0D8] rounded-3xl p-8 shadow-md relative overflow-hidden"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl bg-[#EDF5EF] border border-[#C5DEC9] flex items-center justify-center text-4xl mb-4 shadow-inner">
            <Trophy size={40} className="text-[#4A7C59] animate-bounce" />
          </div>

          <span className="text-xs font-bold text-[#4A7C59] tracking-wider uppercase">
            Unit Completed
          </span>
          <h2 className="text-2xl font-black text-stone-900 mt-1 mb-2 font-japanese">
            お疲れ様でした！
          </h2>
          <p className="text-stone-600 text-sm mb-6">
            Great work! Your mastery progress has been saved into your SM-2 spaced repetition memory engine.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-4 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8]">
              <div className="text-2xl font-black text-[#233E2B]">{accuracy}%</div>
              <div className="text-xs text-stone-500 font-semibold uppercase">Accuracy</div>
            </div>
            <div className="p-4 rounded-2xl bg-[#FCF8ED] border border-[#F2DEAF]">
              <div className="text-2xl font-black text-[#936D1C]">+{earnedXp}</div>
              <div className="text-xs text-[#936D1C]/80 font-semibold uppercase">XP Earned</div>
            </div>
          </div>

          <button
            type="button"
            onClick={async () => {
              await fetchRoadmap();
              setActiveView('roadmap');
            }}
            className="w-full py-4 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] text-white font-semibold shadow-md transition-transform active:scale-95"
          >
            Continue on Roadmap
          </button>
        </motion.div>
      </div>
    );
  }

  const addTile = (tileObj) => {
    setTileAnswer(prev => [...prev, tileObj]);
  };
  const removeTile = (index) => {
    setTileAnswer(prev => prev.filter((_, i) => i !== index));
  };

  const toggleRankItem = (itemObj) => {
    const itemText = typeof itemObj === 'object' ? itemObj.text : itemObj;
    const exists = rankedItems.some(x => (typeof x === 'object' ? x.text : x) === itemText);
    if (exists) {
      setRankedItems(prev => prev.filter(x => (typeof x === 'object' ? x.text : x) !== itemText));
    } else {
      setRankedItems(prev => [...prev, itemObj]);
    }
  };

  const isOptionCheckDisabled =
    (currentExercise.type === "TILE_BUILDER" && tileAnswer.length === 0) ||
    (currentExercise.type === "POLITENESS_RANK" && rankedItems.length === 0) ||
    (currentExercise.type === "SPEAKING_CHECK" && !spokenText) ||
    (["AUDIO_TO_MEANING", "PRONUNCIATION_TRAP", "SITUATIONAL_CHOICE"].includes(currentExercise.type) && !selectedOption);

  return (
    <div className="max-w-xl mx-auto py-6 px-4 flex flex-col min-h-[90vh] justify-between">
      {/* Top Bar with Progress */}
      <div>
        <div className="flex items-center justify-between gap-4 mb-4">
          <button
            onClick={() => setActiveView('roadmap')}
            className="p-2 rounded-xl bg-white border border-[#E5E0D8] text-stone-600 hover:text-stone-900 shadow-xs transition-colors"
          >
            <X size={20} />
          </button>

          {/* Progress Bar */}
          <div className="flex-1 h-2 bg-[#F5F3EF] rounded-full overflow-hidden border border-[#E5E0D8]">
            <div
              className="h-full bg-gradient-to-r from-[#2B4C7E] to-[#4A7C59] transition-all duration-300 rounded-full"
              style={{ width: `${((currentIndex + 1) / totalExercises) * 100}%` }}
            />
          </div>

          <div className="text-xs font-mono font-bold text-stone-600">
            {currentIndex + 1}/{totalExercises}
          </div>
        </div>

        {/* Spaced Repetition Badge */}
        {currentExercise.is_revision_item && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FCF8ED] border border-[#F2DEAF] text-[#936D1C] text-xs font-bold mb-3 animate-pulse">
            <RefreshCw size={12} className="animate-spin text-[#C9972C]" />
            <span>Spaced Repetition Review (Past Unit Item)</span>
          </div>
        )}
      </div>

      {/* Main Exercise Card */}
      <div className="my-auto py-4">
        {/* Prompt Header */}
        <div className="mb-6 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-stone-900 leading-snug">
            {currentExercise.prompt}
          </h2>

          {/* Visual SVG / Stamp if present */}
          {currentExercise.svg_markup && (
            <div className="my-4 flex justify-center">
              <div className="w-16 h-16 p-2.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] shadow-xs flex items-center justify-center">
                <SvgIcon
                  svgMarkup={currentExercise.svg_markup}
                  itemType={currentExercise.type === 'KANA' ? 'KANA' : ''}
                  japanese={currentExercise.target_phrase || currentExercise.target_kana}
                  className="w-11 h-11"
                />
              </div>
            </div>
          )}

          {/* Audio Player with Crisp Contrast White Text on Green Button */}
          {currentExercise.audio_path && (
            <div className="my-4 flex justify-center">
              <AudioButton
                audioPath={currentExercise.audio_path}
                size="lg"
                label="Listen to Native Audio"
                showSlowToggle={true}
                autoPlay={true}
                buttonClassName="bg-[#4A7C59] hover:bg-[#355940] text-white border-transparent shadow-sm px-6 py-3 rounded-2xl"
                labelClassName="text-white font-bold"
              />
            </div>
          )}
        </div>

        {/* 1, 2, 4. Multiple Choice / Trap / Situational Drills (All render with <JpText />) */}
        {["AUDIO_TO_MEANING", "PRONUNCIATION_TRAP", "SITUATIONAL_CHOICE"].includes(currentExercise.type) && (
          <div className="grid grid-cols-1 gap-3">
            {optionDetails.map((optItem, idx) => {
              const isSelected = selectedOption?.text === optItem.text || selectedOption === optItem.text || selectedOption?.raw === optItem.raw;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={hasChecked}
                  onClick={() => setSelectedOption(optItem)}
                  className={`flex items-center justify-between p-4 rounded-2xl font-semibold text-left transition-all border active:scale-[0.99] shadow-xs ${
                    isSelected
                      ? "bg-[#2B4C7E]/10 border-[#2B4C7E] text-[#2B4C7E] ring-2 ring-[#2B4C7E]/30"
                      : "bg-white hover:bg-[#F5F3EF] border-[#E5E0D8] text-stone-900"
                  }`}
                >
                  <JpText japanese={optItem.text} romaji={optItem.romaji} size="md" align="left" />

                  <div
                    className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold flex-shrink-0 ml-3 ${
                      isSelected
                        ? "border-[#2B4C7E] bg-[#2B4C7E] text-white"
                        : "border-[#E5E0D8] text-stone-400 bg-[#F5F3EF]"
                    }`}
                  >
                    {idx + 1}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 3. POLITENESS_RANK: Casual -> Polite -> Formal (Render EVERY chip with <JpText />) */}
        {currentExercise.type === "POLITENESS_RANK" && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white border border-[#E5E0D8] min-h-[64px] flex flex-wrap items-center gap-2 shadow-xs">
              <span className="text-xs font-bold text-stone-500 uppercase tracking-wider mr-2">
                Your Order:
              </span>
              {rankedItems.length === 0 ? (
                <span className="text-xs text-stone-400 italic">Tap phrases below in order from Casual → Formal</span>
              ) : (
                rankedItems.map((item, i) => {
                  const text = typeof item === 'object' ? item.text : item;
                  const romaji = typeof item === 'object' ? item.romaji : "";
                  return (
                    <span
                      key={i}
                      onClick={() => toggleRankItem(item)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EDF5EF] border border-[#C5DEC9] text-[#233E2B] font-bold text-sm cursor-pointer hover:bg-[#D1E7D6] shadow-xs"
                    >
                      <span className="text-xs font-extrabold text-[#233E2B]/70">{i + 1}.</span>
                      <JpText japanese={text} romaji={romaji} size="xs" />
                      <X size={13} className="text-[#233E2B]/60 ml-0.5" />
                    </span>
                  );
                })
              )}
            </div>

            <div className="flex flex-wrap gap-2 justify-center">
              {optionDetails.map((optItem, idx) => {
                const isUsed = rankedItems.some(x => (typeof x === 'object' ? x.text : x) === optItem.text);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isUsed || hasChecked}
                    onClick={() => toggleRankItem(optItem)}
                    className={`px-4 py-2.5 rounded-xl font-bold text-sm border transition-all shadow-xs ${
                      isUsed
                        ? "bg-[#F5F3EF] text-stone-400 border-[#E5E0D8] cursor-not-allowed opacity-50"
                        : "bg-white hover:bg-[#F5F3EF] text-stone-900 border-[#E5E0D8] active:scale-95"
                    }`}
                  >
                    <JpText japanese={optItem.text} romaji={optItem.romaji} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 5. TILE_BUILDER Drill (Render EVERY word tile with <JpText />) */}
        {currentExercise.type === "TILE_BUILDER" && (
          <div className="space-y-6">
            {/* Answer Tray */}
            <div className="p-4 rounded-2xl bg-white border border-[#E5E0D8] min-h-[75px] flex flex-wrap items-center gap-2 shadow-xs">
              {tileAnswer.length === 0 ? (
                <span className="text-xs text-stone-400 italic">Tap word tiles below to construct the target sentence</span>
              ) : (
                tileAnswer.map((tile, i) => {
                  const text = typeof tile === 'object' ? tile.text : tile;
                  const romaji = typeof tile === 'object' ? tile.romaji : "";
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={hasChecked}
                      onClick={() => removeTile(i)}
                      className="px-3.5 py-2 rounded-xl bg-[#EDF5EF] border border-[#C5DEC9] text-[#233E2B] font-bold text-base transition-all hover:bg-[#D1E7D6] active:scale-95 shadow-xs"
                    >
                      <JpText japanese={text} romaji={romaji} size="sm" />
                    </button>
                  );
                })
              )}
            </div>

            {/* Tile Pool */}
            <div className="flex flex-wrap gap-2.5 justify-center">
              {optionDetails.map((tileItem, idx) => {
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={hasChecked}
                    onClick={() => addTile(tileItem)}
                    className="px-4 py-2.5 rounded-xl bg-white hover:bg-[#F5F3EF] text-stone-900 font-bold border border-[#E5E0D8] shadow-xs transition-all active:scale-95"
                  >
                    <JpText japanese={tileItem.text} romaji={tileItem.romaji} size="sm" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 6. SPEAKING_CHECK: ja-JP Voice Recognition */}
        {currentExercise.type === "SPEAKING_CHECK" && (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="my-2">
              <JpText
                japanese={currentExercise.target_phrase}
                romaji={currentExercise.target_romaji}
                size="2xl"
              />
            </div>
            {currentExercise.target_kana && (
              <div className="text-sm font-semibold text-stone-500 font-japanese">
                ({currentExercise.target_kana})
              </div>
            )}

            {/* Mic Button */}
            <button
              type="button"
              disabled={hasChecked}
              onClick={startListening}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-md ${
                isListening
                  ? "bg-[#D94E34] text-white ring-8 ring-[#D94E34]/20 animate-pulse"
                  : "bg-white hover:bg-[#F5F3EF] text-[#2B4C7E] border border-[#E5E0D8]"
              }`}
            >
              {isListening ? <Mic size={36} className="animate-bounce" /> : <Mic size={36} />}
            </button>

            <div className="text-xs text-stone-500 font-medium">
              {isListening ? "Listening (speak in Japanese)..." : "Tap microphone to speak"}
            </div>

            {/* What Browser Heard */}
            {spokenText && (
              <div className="p-3 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] text-sm font-japanese text-stone-900">
                Heard: <span className="font-bold text-[#233E2B]">{spokenText}</span>
              </div>
            )}

            {/* Fallback Self-Verify for devices without SpeechRecognition */}
            {!speechSupported && (
              <div className="w-full mt-2 p-3 rounded-xl bg-[#F5F3EF] border border-[#E5E0D8] text-xs text-stone-600 flex items-center justify-between">
                <span>Speech API not active on this browser:</span>
                <button
                  type="button"
                  onClick={() => setSpokenText(currentExercise.target_phrase)}
                  className="px-2.5 py-1 rounded-lg bg-[#EDF5EF] text-[#233E2B] font-bold border border-[#C5DEC9]"
                >
                  Self-Verify
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Check Answer CTA */}
      {!hasChecked && (
        <div className="mt-6">
          <button
            type="button"
            onClick={handleCheck}
            disabled={isOptionCheckDisabled}
            className={`w-full py-4 rounded-2xl font-semibold shadow-md active:scale-95 transition-all ${
              isOptionCheckDisabled
                ? "bg-stone-300 text-stone-500 cursor-not-allowed"
                : "bg-[#2B4C7E] hover:bg-[#1E3A63] text-white"
            }`}
          >
            Check Answer
          </button>
        </div>
      )}

      {/* Slide-Up Feedback Drawer */}
      <AnimatePresence>
        {hasChecked && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className={`fixed inset-x-0 bottom-0 z-50 p-6 border-t shadow-2xl ${
              isCorrect
                ? "bg-[#EDF5EF] border-[#C5DEC9] text-[#233E2B]"
                : "bg-[#FDF2EF] border-[#F5C6BC] text-[#9A2E1A]"
            }`}
          >
            <div className="max-w-xl mx-auto flex flex-col gap-3">
              <div className="flex items-center gap-2">
                {isCorrect ? (
                  <Check size={24} className="text-[#4A7C59] stroke-[3]" />
                ) : (
                  <AlertCircle size={24} className="text-[#D94E34] stroke-[3]" />
                )}
                <span className="text-lg font-black tracking-wide font-japanese">
                  {isCorrect ? "正解！ Excellent!" : "Not quite right"}
                </span>
              </div>

              {/* Pedagogical Explanation & Marathi Nuance */}
              <div className="text-sm font-medium leading-relaxed font-marathi">
                {currentExercise.explanation}
              </div>

              <button
                type="button"
                onClick={handleContinue}
                className={`w-full mt-2 py-3.5 rounded-2xl font-semibold text-white transition-all active:scale-95 shadow-md ${
                  isCorrect
                    ? "bg-[#4A7C59] hover:bg-[#355940]"
                    : "bg-[#D94E34] hover:bg-[#A63620]"
                }`}
              >
                Continue <ArrowRight size={18} className="inline ml-1" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
