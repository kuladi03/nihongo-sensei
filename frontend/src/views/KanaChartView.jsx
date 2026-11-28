import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import {
  ArrowLeft,
  Volume2,
  Lock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';

// Complete 46 Gojūon Kana definitions (a, i, u, e, o columns across 11 rows)
export const GOJUON_ROWS = [
  {
    rowKey: 'a',
    rowName: 'A-Row (あ行)',
    kana: [
      { h: 'あ', k: 'ア', r: 'a', m: 'अ', col: 0 },
      { h: 'い', k: 'イ', r: 'i', m: 'इ', col: 1 },
      { h: 'う', k: 'ウ', r: 'u', m: 'उ', col: 2 },
      { h: 'え', k: 'エ', r: 'e', m: 'ए', col: 3 },
      { h: 'お', k: 'オ', r: 'o', m: 'ओ', col: 4 },
    ]
  },
  {
    rowKey: 'ka',
    rowName: 'Ka-Row (か行)',
    kana: [
      { h: 'か', k: 'カ', r: 'ka', m: 'क + अ', col: 0 },
      { h: 'き', k: 'キ', r: 'ki', m: 'क + इ', col: 1 },
      { h: 'く', k: 'ク', r: 'ku', m: 'क + उ', col: 2 },
      { h: 'け', k: 'ケ', r: 'ke', m: 'क + ए', col: 3 },
      { h: 'こ', k: 'コ', r: 'ko', m: 'क + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'sa',
    rowName: 'Sa-Row (さ行)',
    kana: [
      { h: 'さ', k: 'サ', r: 'sa', m: 'स + अ', col: 0 },
      { h: 'し', k: 'シ', r: 'shi', m: 'श + इ', col: 1 },
      { h: 'す', k: 'ス', r: 'su', m: 'स + उ', col: 2 },
      { h: 'せ', k: 'セ', r: 'se', m: 'स + ए', col: 3 },
      { h: 'そ', k: 'ソ', r: 'so', m: 'स + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'ta',
    rowName: 'Ta-Row (た行)',
    kana: [
      { h: 'た', k: 'タ', r: 'ta', m: 'त + अ', col: 0 },
      { h: 'ち', k: 'チ', r: 'chi', m: 'च + इ', col: 1 },
      { h: 'つ', k: 'ツ', r: 'tsu', m: 'त्सु', col: 2 },
      { h: 'て', k: 'テ', r: 'te', m: 'त + ए', col: 3 },
      { h: 'と', k: 'ト', r: 'to', m: 'त + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'na',
    rowName: 'Na-Row (な行)',
    kana: [
      { h: 'な', k: 'ナ', r: 'na', m: 'न + अ', col: 0 },
      { h: 'に', k: 'ニ', r: 'ni', m: 'न + इ', col: 1 },
      { h: 'ぬ', k: 'ヌ', r: 'nu', m: 'न + उ', col: 2 },
      { h: 'ね', k: 'ネ', r: 'ne', m: 'न + ए', col: 3 },
      { h: 'の', k: 'ノ', r: 'no', m: 'न + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'ha',
    rowName: 'Ha-Row (は行)',
    kana: [
      { h: 'は', k: 'ハ', r: 'ha', m: 'ह + अ', col: 0 },
      { h: 'ひ', k: 'ヒ', r: 'hi', m: 'ह + इ', col: 1 },
      { h: 'ふ', k: 'フ', r: 'fu', m: 'फ/हु', col: 2 },
      { h: 'へ', k: 'ヘ', r: 'he', m: 'ह + ए', col: 3 },
      { h: 'ほ', k: 'ホ', r: 'ho', m: 'ह + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'ma',
    rowName: 'Ma-Row (ま行)',
    kana: [
      { h: 'ま', k: 'マ', r: 'ma', m: 'म + अ', col: 0 },
      { h: 'み', k: 'ミ', r: 'mi', m: 'म + इ', col: 1 },
      { h: 'む', k: 'ム', r: 'mu', m: 'म + उ', col: 2 },
      { h: 'め', k: 'メ', r: 'me', m: 'म + ए', col: 3 },
      { h: 'も', k: 'モ', r: 'mo', m: 'म + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'ya',
    rowName: 'Ya-Row (や行)',
    kana: [
      { h: 'や', k: 'ヤ', r: 'ya', m: 'य + अ', col: 0 },
      null,
      { h: 'ゆ', k: 'ユ', r: 'yu', m: 'य + उ', col: 2 },
      null,
      { h: 'よ', k: 'ヨ', r: 'yo', m: 'य + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'ra',
    rowName: 'Ra-Row (ら行)',
    kana: [
      { h: 'ら', k: 'ラ', r: 'ra', m: 'र + अ', col: 0 },
      { h: 'り', k: 'リ', r: 'ri', m: 'र + इ', col: 1 },
      { h: 'る', k: 'ル', r: 'ru', m: 'र + उ', col: 2 },
      { h: 'れ', k: 'レ', r: 're', m: 'र + ए', col: 3 },
      { h: 'ろ', k: 'ロ', r: 'ro', m: 'र + ओ', col: 4 },
    ]
  },
  {
    rowKey: 'wa',
    rowName: 'Wa-Row (わ行)',
    kana: [
      { h: 'わ', k: 'ワ', r: 'wa', m: 'व + अ', col: 0 },
      null,
      null,
      null,
      { h: 'を', k: 'ヲ', r: 'wo', m: 'ओ/वो', col: 4 },
    ]
  },
  {
    rowKey: 'n',
    rowName: 'N-Sound (ん)',
    kana: [
      { h: 'ん', k: 'ン', r: 'n', m: 'न् / ऽ', col: 0, isN: true },
      null,
      null,
      null,
      null,
    ]
  },
];

export const GOJUON_HIRAGANA_SET = new Set([
  'あ','い','う','え','お',
  'か','き','く','け','こ',
  'さ','し','す','せ','そ',
  'た','ち','つ','て','と',
  'な','に','ぬ','ね','の',
  'は','ひ','ふ','へ','ほ',
  'ま','み','む','め','も',
  'や','ゆ','よ',
  'ら','り','る','れ','ろ',
  'わ','を','ん'
]);

export const GOJUON_KATAKANA_SET = new Set([
  'ア','イ','ウ','エ','オ',
  'カ','キ','ク','ケ','コ',
  'サ','シ','セ','ソ',
  'タ','チ','ツ','テ','ト',
  'ナ','ニ','ヌ','ネ','ノ',
  'ハ','ヒ','フ','ヘ','ホ',
  'マ','ミ','ム','メ','モ',
  'ヤ','ユ','ヨ',
  'ラ','リ','ル','レ','ロ',
  'ワ','ヲ','ン'
]);

export default function KanaChartView() {
  const { bankItems = [], setActiveView } = useApp();
  const [scriptType, setScriptType] = useState('hiragana'); // 'hiragana' | 'katakana'
  const [slowAudio, setSlowAudio] = useState(false);
  const [playingChar, setPlayingChar] = useState(null);

  // Dynamic Unlock Map: strictly deduplicate by character glyph, separate standard Gojūon (cap at 46) and extra dakuten/yōon
  const { learnedKanaMap, gojuonLearnedCount, extraLearnedCount } = useMemo(() => {
    const map = {};
    const scriptRegex = scriptType === 'hiragana' ? /^[\u3040-\u309F]+$/ : /^[\u30A0-\u30FF]+$/;
    const targetGojuonSet = scriptType === 'hiragana' ? GOJUON_HIRAGANA_SET : GOJUON_KATAKANA_SET;

    (bankItems || []).forEach(item => {
      if ((item.item_type || '').toUpperCase() !== 'KANA') return;
      const text = (item.kana_only || item.japanese || '').trim();
      if (!text || text.length > 2) return;
      if (scriptRegex.test(text)) {
        if (!map[text] || (!map[text].audio_path && item.audio_path)) {
          map[text] = item;
        }
      }
    });

    const learnedKeys = Object.keys(map);
    const gojuonLearned = learnedKeys.filter(k => targetGojuonSet.has(k)).length;
    const extraLearned = learnedKeys.filter(k => !targetGojuonSet.has(k)).length;

    return {
      learnedKanaMap: map,
      gojuonLearnedCount: Math.min(46, gojuonLearned),
      extraLearnedCount: extraLearned,
    };
  }, [bankItems, scriptType]);

  const totalCharacters = 46;
  const progressPercent = Math.min(100, Math.round((gojuonLearnedCount / totalCharacters) * 100));
  const remainingCount = Math.max(0, totalCharacters - gojuonLearnedCount);

  // Default selected Kana: 'あ' or 'か' if available
  const [selectedKana, setSelectedKana] = useState(() => {
    const defaultItem = GOJUON_ROWS[1].kana[0]; // 'か'
    return {
      char: defaultItem.h,
      h: defaultItem.h,
      k: defaultItem.k,
      r: defaultItem.r,
      m: defaultItem.m,
      rowName: GOJUON_ROWS[1].rowName,
    };
  });

  // Play audio helper
  const playAudio = useCallback((audioPath, char) => {
    if (!audioPath) return;
    try {
      setPlayingChar(char);
      const audio = new Audio(audioPath);
      audio.playbackRate = slowAudio ? 0.75 : 1.0;
      audio.onended = () => setPlayingChar(null);
      audio.onerror = () => setPlayingChar(null);
      audio.play().catch(() => setPlayingChar(null));
    } catch (err) {
      console.error('Failed to play kana audio:', err);
      setPlayingChar(null);
    }
  }, [slowAudio]);

  // Handle tile click
  const handleTileClick = (item, rowName) => {
    if (!item) return;
    const char = scriptType === 'hiragana' ? item.h : item.k;
    const learnedData = learnedKanaMap[char];

    setSelectedKana({
      char,
      h: item.h,
      k: item.k,
      r: item.r,
      m: item.m,
      rowName,
      learned: learnedData,
    });

    if (learnedData?.audio_path) {
      playAudio(learnedData.audio_path, char);
    }
  };

  // Find currently selected learned details
  const currentSelectedLearned = useMemo(() => {
    const char = scriptType === 'hiragana' ? selectedKana.h : selectedKana.k;
    return learnedKanaMap[char] || null;
  }, [selectedKana, learnedKanaMap, scriptType]);

  const selectedDisplayChar = scriptType === 'hiragana' ? selectedKana.h : selectedKana.k;

  return (
    <div className="py-8 px-4 sm:px-6 max-w-6xl mx-auto">
      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setActiveView('roadmap')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 hover:text-stone-900 text-xs font-semibold shadow-xs transition-colors"
            >
              <ArrowLeft size={15} /> Back to Roadmap
            </button>
            <button
              onClick={() => setActiveView('bank')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F3EF] border border-[#E5E0D8] text-stone-700 hover:text-stone-900 text-xs font-semibold shadow-xs transition-colors"
            >
              <BookOpen size={15} /> Vocab Bank →
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#4A7C59]">
              Japanese Syllabary Foundation
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight font-japanese">
            五十音表 <span className="text-stone-500 font-sans text-xl font-normal block sm:inline sm:ml-2">Kana Mastery Chart</span>
          </h1>
          <p className="text-stone-600 text-sm mt-1 max-w-2xl leading-relaxed">
            The foundation of Japanese reading and pronunciation. Track your progress across the classic 46 Gojūon sounds with native audio and Marathi phonetic guides.
          </p>
        </div>

        {/* Script Type Switcher Pill */}
        <div className="flex items-center self-start sm:self-center bg-[#F5F3EF] p-1.5 rounded-2xl border border-[#E5E0D8] shadow-xs">
          <button
            type="button"
            onClick={() => setScriptType('hiragana')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              scriptType === 'hiragana'
                ? 'bg-[#2B4C7E] text-white shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
            }`}
          >
            <span className="font-japanese text-sm font-black">あ</span>
            <span>Hiragana (ひらがな)</span>
          </button>

          <button
            type="button"
            onClick={() => setScriptType('katakana')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              scriptType === 'katakana'
                ? 'bg-[#2B4C7E] text-white shadow-sm'
                : 'text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF]'
            }`}
          >
            <span className="font-japanese text-sm font-black">ア</span>
            <span>Katakana (カタカナ)</span>
          </button>
        </div>
      </div>

      {/* Progress Bar Strip */}
      <div className="p-4 sm:p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-xs mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4A7C59] animate-pulse" />
            <span className="text-xs font-bold text-stone-900">
              {scriptType === 'hiragana' ? 'Hiragana Progress' : 'Katakana Progress'}:
            </span>
            <span className="text-xs font-extrabold text-[#4A7C59]">
              {gojuonLearnedCount} / {totalCharacters} learned ({progressPercent}%)
            </span>
            {extraLearnedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#2B4C7E]/10 text-[#2B4C7E] border border-[#2B4C7E]/20">
                +{extraLearnedCount} Dakuten / Yōon
              </span>
            )}
          </div>
          <div className="text-[11px] font-semibold text-stone-500">
            {gojuonLearnedCount === 0
              ? 'Introduced in upcoming Katakana class notes'
              : remainingCount === 0
              ? '🎉 100% Gojūon syllabary mastered!'
              : `${remainingCount} remaining to achieve 100% syllabary mastery`}
          </div>
        </div>

        {/* Bar */}
        <div className="w-full h-3 rounded-full bg-[#F5F3EF] border border-[#E5E0D8] overflow-hidden p-0.5">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4A7C59] to-[#2B4C7E] transition-all duration-500 shadow-xs"
            style={{ width: `${Math.max(progressPercent, 4)}%` }}
          />
        </div>
      </div>

      {/* Main Grid + Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: 5-Column Gojūon Chart (8 Cols) */}
        <div className="lg:col-span-8 p-4 sm:p-6 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm">
          {/* Column Headers (a, i, u, e, o) */}
          <div className="grid grid-cols-5 gap-2 sm:gap-3 pb-3 mb-4 border-b border-[#E5E0D8] text-center">
            {[
              { vowel: 'a', jp: scriptType === 'hiragana' ? 'あ' : 'ア' },
              { vowel: 'i', jp: scriptType === 'hiragana' ? 'い' : 'イ' },
              { vowel: 'u', jp: scriptType === 'hiragana' ? 'う' : 'ウ' },
              { vowel: 'e', jp: scriptType === 'hiragana' ? 'え' : 'エ' },
              { vowel: 'o', jp: scriptType === 'hiragana' ? 'お' : 'オ' },
            ].map(col => (
              <div key={col.vowel} className="flex flex-col items-center">
                <span className="text-xs font-black uppercase text-[#2B4C7E] tracking-wider">
                  {col.vowel}
                </span>
                <span className="text-[11px] font-japanese font-semibold text-stone-600">
                  {col.jp}段
                </span>
              </div>
            ))}
          </div>

          {/* Rows */}
          <div className="space-y-3">
            {GOJUON_ROWS.map((row) => (
              <div key={row.rowKey} className="flex flex-col gap-1">
                <div className="text-[11px] font-bold text-stone-600 pl-1 uppercase tracking-wider">
                  {row.rowName}
                </div>

                <div className="grid grid-cols-5 gap-2 sm:gap-3">
                  {row.kana.map((item, idx) => {
                    if (!item) {
                      // Empty spacer tile to preserve 5-column alignment
                      return (
                        <div
                          key={`empty-${row.rowKey}-${idx}`}
                          className="h-20 sm:h-22 rounded-2xl border border-dashed border-[#E5E0D8] bg-[#FAF8F5]/50 flex items-center justify-center text-stone-300 text-xs font-mono select-none"
                        >
                          —
                        </div>
                      );
                    }

                    const char = scriptType === 'hiragana' ? item.h : item.k;
                    const learnedData = learnedKanaMap[char];
                    const isLearned = Boolean(learnedData);
                    const isSelected = selectedDisplayChar === char;
                    const isAudioPlaying = playingChar === char;

                    return (
                      <button
                        key={char}
                        type="button"
                        onClick={() => handleTileClick(item, row.rowName)}
                        title={
                          isLearned
                            ? `Click to listen to native audio for ${char} (${item.r})`
                            : `${char} (${item.r}) • Locked (Upcoming)`
                        }
                        className={`h-20 sm:h-22 rounded-2xl flex flex-col items-center justify-between p-2 relative text-center transition-all select-none group cursor-pointer ${
                          isLearned
                            ? isSelected
                              ? 'bg-[#EDF5EF] border-2 border-[#4A7C59] ring-2 ring-[#4A7C59]/30 shadow-md scale-[1.03]'
                              : 'bg-white border-2 border-[#4A7C59] hover:bg-[#F5FAF6] shadow-xs hover:shadow-md hover:scale-[1.02]'
                            : isSelected
                            ? 'bg-[#EAE6DF] border-2 border-stone-400 text-stone-600 ring-2 ring-stone-300'
                            : 'bg-[#F5F3EF] border border-[#E5E0D8] text-stone-400 hover:bg-[#EAE6DF]/70'
                        }`}
                      >
                        {/* Audio / Lock indicator badge in corner */}
                        <div className="w-full flex items-center justify-between text-[10px]">
                          <span
                            className={`font-mono font-bold leading-none ${
                              isLearned ? 'text-[#2B4C7E]' : 'text-stone-600'
                            }`}
                          >
                            {item.r}
                          </span>
                          {isLearned ? (
                            <Volume2
                              size={12}
                              className={`transition-colors ${
                                isAudioPlaying
                                  ? 'text-[#D94E34] animate-bounce'
                                  : 'text-[#4A7C59] group-hover:scale-110'
                              }`}
                            />
                          ) : (
                            <Lock size={10} className="text-stone-500" />
                          )}
                        </div>

                        {/* Large Japanese Character */}
                        <div
                          className={`font-japanese font-black text-2xl sm:text-3xl leading-none transition-colors ${
                            isLearned
                              ? 'text-stone-900 group-hover:text-[#4A7C59]'
                              : 'text-stone-600'
                          }`}
                        >
                          {char}
                        </div>

                        {/* Marathi Sound Guide */}
                        <div
                          className={`text-[10px] sm:text-[11px] font-marathi font-medium leading-tight truncate max-w-full ${
                            isLearned ? 'text-[#233E2B]' : 'text-stone-500'
                          }`}
                        >
                          {item.m}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Sticky Sensei Pronunciation & Marathi Nuance Inspector (4 Cols) */}
        <div className="lg:col-span-4 sticky top-20 space-y-4">
          <div className="p-6 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm flex flex-col justify-between">
            <div>
              {/* Header Badge */}
              <div className="flex items-center justify-between gap-2 mb-4">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#2B4C7E]">
                  Pronunciation Inspector
                </span>
                {currentSelectedLearned ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF5EF] text-[#233E2B] border border-[#C5DEC9]">
                    <CheckCircle2 size={11} /> Mastered
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F5F3EF] text-stone-500 border border-[#E5E0D8]">
                    <Lock size={11} /> Locked
                  </span>
                )}
              </div>

              {/* Character Stamp Hero */}
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] mb-5">
                <div className="w-18 h-18 rounded-2xl bg-white border-2 border-[#E5E0D8] flex items-center justify-center font-japanese font-black text-4xl text-[#2B4C7E] shadow-sm">
                  {selectedDisplayChar}
                </div>
                <div className="space-y-1">
                  <div className="text-xl font-black text-stone-900 leading-tight">
                    Romaji: <span className="text-[#2B4C7E] font-mono">{selectedKana.r}</span>
                  </div>
                  <div className="text-xs font-semibold text-stone-500">
                    {selectedKana.rowName}
                  </div>
                  <div className="text-xs font-bold text-[#4A7C59] font-marathi">
                    मराठी ध्वनी: {selectedKana.m}
                  </div>
                </div>
              </div>

              {/* Audio Playback Controls */}
              {currentSelectedLearned?.audio_path ? (
                <div className="space-y-2 mb-5">
                  <button
                    type="button"
                    onClick={() =>
                      playAudio(currentSelectedLearned.audio_path, selectedDisplayChar)
                    }
                    className="w-full py-3 px-4 rounded-2xl bg-[#4A7C59] hover:bg-[#3B6447] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    <Volume2 size={18} className={playingChar === selectedDisplayChar ? "animate-pulse" : ""} />
                    <span>Listen Native Audio ({selectedKana.r})</span>
                  </button>

                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold text-stone-500">
                      Playback Speed
                    </span>
                    <button
                      type="button"
                      onClick={() => setSlowAudio(!slowAudio)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                        slowAudio
                          ? 'bg-[#2B4C7E] text-white border-[#2B4C7E]'
                          : 'bg-[#F5F3EF] text-stone-700 border-[#E5E0D8] hover:bg-[#EAE6DF]'
                      }`}
                    >
                      {slowAudio ? 'Slow (0.75x) ON' : 'Normal (1.0x)'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] text-center text-xs text-stone-500 mb-5">
                  <Lock size={16} className="mx-auto mb-1 text-stone-400" />
                  Native audio will unlock when this Kana is covered in your class notes.
                </div>
              )}

              {/* Marathi Nuance & Sensei Pronunciation Trap */}
              {currentSelectedLearned?.pronunciation_tip || currentSelectedLearned?.trap_note ? (
                <div className="p-4 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-[#9A2E1A] uppercase tracking-wider mb-1.5">
                    <AlertTriangle size={14} className="text-[#D94E34]" /> Marathi Pronunciation Nuance
                  </div>
                  <p className="text-xs text-[#9A2E1A] font-sans font-medium leading-relaxed">
                    {currentSelectedLearned.pronunciation_tip || currentSelectedLearned.trap_note}
                  </p>
                </div>
              ) : currentSelectedLearned?.marathi ? (
                <div className="p-4 rounded-2xl bg-[#EDF5EF] border border-[#C5DEC9] text-xs">
                  <div className="font-bold text-[#233E2B] uppercase tracking-wider mb-1">
                    Marathi Guide
                  </div>
                  <p className="text-xs text-[#233E2B] font-medium leading-relaxed">
                    {currentSelectedLearned.marathi}
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] text-xs text-stone-500 leading-relaxed">
                  <div className="font-bold text-stone-700 mb-1">Pronunciation Note</div>
                  Pronounced as clear <span className="font-bold text-stone-800">'{selectedKana.m}'</span>. Keep vowel lengths distinct and unnasalized.
                </div>
              )}
            </div>

            {/* Syllabary Context Card */}
            <div className="mt-5 pt-4 border-t border-[#E5E0D8] flex items-center justify-between text-xs text-stone-500">
              <span>Standard Gojūon</span>
              <span className="font-mono font-bold text-stone-700">
                Col {selectedKana.col !== undefined ? selectedKana.col + 1 : '—'} / 5
              </span>
            </div>
          </div>

          {/* Quick Tip Card */}
          <div className="p-5 rounded-3xl bg-[#FAF8F5] border border-[#E5E0D8] shadow-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2B4C7E] mb-1.5">
              <Sparkles size={14} />
              <span>Sensei Tip: Sound Order</span>
            </div>
            <p className="text-xs text-stone-600 leading-relaxed">
              Japanese consonants combine with the 5 vowel anchors (<strong>a, i, u, e, o</strong>). Once you master the vowel sounds in the <strong>A-Row</strong>, every subsequent row follows the identical mouth shape!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
