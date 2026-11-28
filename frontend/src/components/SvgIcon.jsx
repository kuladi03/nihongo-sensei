import React from 'react';

/**
 * Renders either:
 * 1. An Iconify vector SVG if available
 * 2. An authentic Japanese Kana Stamp for Hiragana/Katakana characters
 * 3. An authentic Japanese Calligraphic Inkan/Hanko Seal for Vocabulary, Grammar, Phrases, and Traps (never flat emojis)
 */
export default function SvgIcon({
  svgMarkup,
  itemType = "",
  japanese = "",
  kanaOnly = "",
  className = "w-12 h-12",
  fallback = null
}) {
  const rawJp = (japanese || kanaOnly || "").trim();
  const type = (itemType || "").toUpperCase();

  // 1. If Kana character (1-2 characters)
  const isKanaChar = type === 'KANA' || (rawJp && /^[\u3040-\u30ff]{1,2}$/.test(rawJp));
  if (isKanaChar && rawJp) {
    return (
      <div
        className={`rounded-2xl bg-gradient-to-br from-[#F5F3EF] to-[#EAE6DF] border border-[#E5E0D8] text-[#2B4C7E] font-japanese font-black text-lg sm:text-xl flex items-center justify-center select-none shadow-xs flex-shrink-0 transition-transform hover:scale-105 ${className}`}
        title={`Kana Stamp: ${rawJp}`}
      >
        {rawJp}
      </div>
    );
  }

  // 2. If SVG markup exists
  if (svgMarkup) {
    return (
      <div
        className={`inline-flex items-center justify-center overflow-hidden flex-shrink-0 transition-transform hover:scale-105 [&>svg]:w-full [&>svg]:h-full [&>svg]:block ${className}`}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    );
  }

  // 3. Fallback: Contextual Japanese Hanko / Seal Badge instead of flat emoji stickers
  const sealConfig = {
    VOCAB: { kanji: '語', label: '単語', bg: 'bg-[#F0F4F8]', text: 'text-[#2B4C7E]', border: 'border-[#D0DEEC]' },
    PHRASE: { kanji: '句', label: '短文', bg: 'bg-[#EDF5EF]', text: 'text-[#233E2B]', border: 'border-[#C5DEC9]' },
    GRAMMAR: { kanji: '文', label: '文法', bg: 'bg-[#FCF8ED]', text: 'text-[#936D1C]', border: 'border-[#F2DEAF]' },
    TRAP: { kanji: '音', label: '発音', bg: 'bg-[#FDF2EF]', text: 'text-[#D94E34]', border: 'border-[#F5C6BC]' },
  };

  const currentSeal = sealConfig[type] || sealConfig.VOCAB;

  return (
    <div
      className={`rounded-2xl ${currentSeal.bg} border ${currentSeal.border} ${currentSeal.text} flex flex-col items-center justify-center select-none shadow-xs flex-shrink-0 transition-transform hover:scale-105 group relative overflow-hidden ${className}`}
      title={currentSeal.label}
    >
      <span className="font-japanese font-black text-base sm:text-lg leading-none z-10">
        {currentSeal.kanji}
      </span>
      <span className="text-[8px] font-sans font-bold opacity-60 uppercase tracking-tighter mt-0.5 z-10">
        {type ? type.slice(0, 5) : 'JP'}
      </span>
      <div className="absolute inset-0 bg-radial from-white/40 to-transparent pointer-events-none" />
    </div>
  );
}
