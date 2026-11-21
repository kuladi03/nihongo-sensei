import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

// Regex to detect Hiragana, Katakana, and CJK Unified Ideographs
const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * Universal JpText component with 3-mode Romaji support:
 * - 'assist': Stacked layout with Japanese on top, Hepburn Romaji underneath.
 * - 'kana': Pure Japanese text; Romaji hidden by default, visible on hover/tap peek.
 * - 'native': Pure Japanese text; no Romaji rendered at all.
 *
 * Guard: If the text contains no Japanese characters, or if romaji is empty/duplicate,
 * it renders only the primary text without duplicating English.
 */
export default function JpText({
  japanese = "",
  romaji = "",
  size = "md",
  className = "",
  align = "center",
  inline = false,
}) {
  const { scriptMode = 'assist' } = useApp() || {};
  const [peek, setPeek] = useState(false);

  const rawJp = String(japanese || "").trim();
  const rawRomaji = String(romaji || "").trim();

  // Guard 1: Verify text contains Japanese characters
  const hasJapanese = JAPANESE_CHAR_REGEX.test(rawJp);

  // If not Japanese or if romaji is identical to japanese, render plain text
  const isDuplicate = rawRomaji.toLowerCase() === rawJp.toLowerCase();
  const shouldRenderRomaji = hasJapanese && rawRomaji && !isDuplicate;

  // Size mappings
  const sizeMap = {
    xs: { jp: "text-xs", romaji: "text-[10px]" },
    sm: { jp: "text-sm", romaji: "text-xs" },
    md: { jp: "text-base font-semibold", romaji: "text-xs" },
    lg: { jp: "text-lg font-bold", romaji: "text-xs" },
    xl: { jp: "text-xl sm:text-2xl font-bold", romaji: "text-sm" },
    '2xl': { jp: "text-2xl sm:text-3xl font-bold", romaji: "text-sm" },
    '3xl': { jp: "text-3xl sm:text-4xl font-extrabold", romaji: "text-base" },
    hero: { jp: "text-4xl sm:text-6xl font-black", romaji: "text-lg" },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const alignClass = align === "left"
    ? "items-start text-left"
    : align === "right"
    ? "items-end text-right"
    : "items-center text-center";

  if (!shouldRenderRomaji) {
    return (
      <span className={`font-japanese ${currentSize.jp} ${className}`}>
        {rawJp}
      </span>
    );
  }

  // Native Mode: Only Japanese
  if (scriptMode === 'native') {
    return (
      <span className={`font-japanese ${currentSize.jp} ${className}`}>
        {rawJp}
      </span>
    );
  }

  // Kana Only Mode: Japanese with tap/hover peek for Romaji
  if (scriptMode === 'kana') {
    return (
      <span
        className={`relative group cursor-pointer inline-flex flex-col ${alignClass} ${className}`}
        onClick={() => setPeek(!peek)}
        title="Tap or hover to peek Romaji"
      >
        <span className={`font-japanese ${currentSize.jp}`}>
          {rawJp}
        </span>
        <span
          className={`transition-all duration-150 font-mono ${currentSize.romaji} text-[#2B4C7E] font-medium tracking-wide ${
            peek
              ? "opacity-100 max-h-6"
              : "opacity-0 group-hover:opacity-90 max-h-0 group-hover:max-h-6 overflow-hidden"
          }`}
        >
          {rawRomaji}
        </span>
      </span>
    );
  }

  // Full Assist Mode (Default): Stacked Japanese + Romaji
  if (inline) {
    return (
      <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span className={`font-japanese ${currentSize.jp}`}>{rawJp}</span>
        <span className={`font-mono ${currentSize.romaji} text-[#2B4C7E] font-medium tracking-wide`}>
          ({rawRomaji})
        </span>
      </span>
    );
  }

  return (
    <div className={`inline-flex flex-col leading-tight ${alignClass} ${className}`}>
      <span className={`font-japanese tracking-tight text-stone-900 ${currentSize.jp}`}>
        {rawJp}
      </span>
      <span className={`font-mono text-[#2B4C7E] font-medium tracking-wide mt-0.5 select-none ${currentSize.romaji}`}>
        {rawRomaji}
      </span>
    </div>
  );
}
