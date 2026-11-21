import React from 'react';

/**
 * Renders either:
 * 1. A clean Japanese Kana Stamp/Badge for Hiragana/Katakana characters (never random icons like pencils or blue A's)
 * 2. An Iconify SVG with consistent scaling for concrete vocabulary words (book, coffee, etc.)
 */
export default function SvgIcon({
  svgMarkup,
  itemType = "",
  japanese = "",
  kanaOnly = "",
  className = "w-12 h-12",
  fallback = "🌸"
}) {
  const rawJp = (japanese || kanaOnly || "").trim();
  const type = (itemType || "").toUpperCase();

  // If item is explicitly KANA or is 1-2 Hiragana/Katakana characters
  const isKanaChar = type === 'KANA' || (rawJp && /^[\u3040-\u30ff]{1,2}$/.test(rawJp));

  if (isKanaChar && rawJp) {
    return (
      <div
        className={`rounded-xl bg-[#F5F3EF] border border-[#E5E0D8] text-[#2B4C7E] font-serif text-xl font-bold flex items-center justify-center select-none shadow-sm flex-shrink-0 ${className}`}
        title={`Kana Stamp: ${rawJp}`}
      >
        {rawJp}
      </div>
    );
  }

  if (!svgMarkup) {
    return (
      <div className={`flex items-center justify-center text-2xl select-none ${className}`}>
        {fallback}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center justify-center overflow-hidden flex-shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block ${className}`}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}
