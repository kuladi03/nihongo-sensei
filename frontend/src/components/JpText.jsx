import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

// Regex to detect Hiragana, Katakana, and CJK Unified Ideographs
const JAPANESE_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/;
// Regex to detect Kanji (CJK Unified Ideographs)
const KANJI_CHAR_REGEX = /[\u3400-\u4dbf\u4e00-\u9fff]/;

/**
 * Universal JpText component with 3-mode Romaji support and Universal Hiragana Pairing:
 * - 'assist': Stacked layout with Japanese on top, Hiragana underneath (if Kanji), Hepburn Romaji underneath.
 * - 'kana': Japanese + Hiragana (if Kanji); Romaji hidden by default, visible on hover/tap peek.
 * - 'native': Japanese + Hiragana (if Kanji); no Romaji rendered at all.
 *
 * Guaranteed Kanji-Hiragana rule: If text contains Kanji and a distinct kana/hiragana reading
 * is available (and text doesn't already have inline parentheses), Hiragana is ALWAYS displayed.
 */
export default function JpText({
  japanese = "",
  romaji = "",
  kana = "",
  kanaOnly = "",
  hiragana = "",
  size = "md",
  className = "",
  align = "center",
  inline = false,
}) {
  const { scriptMode = 'assist' } = useApp() || {};
  const [peek, setPeek] = useState(false);

  const rawJp = String(japanese || "").trim();
  const rawRomaji = String(romaji || "").trim();
  const rawKana = String(kana || kanaOnly || hiragana || "").trim();

  // Guard 1: Verify text contains Japanese characters
  const hasJapanese = JAPANESE_CHAR_REGEX.test(rawJp);
  const hasKanji = KANJI_CHAR_REGEX.test(rawJp);

  // Check if text already has inline parenthesized readings, e.g. 携帯 (けいたい)
  const hasInlineKana = /[\(（][\u3040-\u309f\s・]+[\)）]/.test(rawJp);

  // Determine whether to display separate Hiragana reading
  const shouldRenderKana = hasKanji && !hasInlineKana && rawKana && rawKana.toLowerCase() !== rawJp.toLowerCase();

  // If not Japanese or if romaji is identical to japanese, omit romaji
  const isDuplicate = rawRomaji.toLowerCase() === rawJp.toLowerCase();
  const shouldRenderRomaji = hasJapanese && rawRomaji && !isDuplicate;

  // Size mappings
  const sizeMap = {
    xs: { jp: "text-xs", kana: "text-[10px]", romaji: "text-[10px]" },
    sm: { jp: "text-sm", kana: "text-xs", romaji: "text-xs" },
    md: { jp: "text-base font-semibold", kana: "text-xs", romaji: "text-xs" },
    lg: { jp: "text-lg font-bold", kana: "text-xs", romaji: "text-xs" },
    xl: { jp: "text-xl sm:text-2xl font-bold", kana: "text-sm", romaji: "text-sm" },
    '2xl': { jp: "text-2xl sm:text-3xl font-bold", kana: "text-sm", romaji: "text-sm" },
    '3xl': { jp: "text-3xl sm:text-4xl font-extrabold", kana: "text-base", romaji: "text-base" },
    hero: { jp: "text-4xl sm:text-6xl font-black", kana: "text-lg", romaji: "text-lg" },
  };

  const currentSize = sizeMap[size] || sizeMap.md;

  const alignClass = align === "left"
    ? "items-start text-left"
    : align === "right"
    ? "items-end text-right"
    : "items-center text-center";

  // Native Mode: Only Japanese + Hiragana reading for Kanji (no Romaji)
  if (scriptMode === 'native' || !shouldRenderRomaji) {
    if (shouldRenderKana) {
      if (inline) {
        return (
          <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
            <span className={`font-japanese ${currentSize.jp}`}>{rawJp}</span>
            <span className="font-japanese text-[#4A7C59] font-bold text-xs">({rawKana})</span>
          </span>
        );
      }
      return (
        <div className={`inline-flex flex-col leading-tight ${alignClass} ${className}`}>
          <span className={`font-japanese tracking-tight text-stone-900 ${currentSize.jp}`}>
            {rawJp}
          </span>
          <span className={`font-japanese text-[#4A7C59] font-bold ${currentSize.kana} mt-0.5 select-none`}>
            {rawKana}
          </span>
        </div>
      );
    }
    return (
      <span className={`font-japanese ${currentSize.jp} ${className}`}>
        {rawJp}
      </span>
    );
  }

  // Kana Only Mode: Japanese + Hiragana with tap/hover peek for Romaji
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
        {shouldRenderKana && (
          <span className={`font-japanese text-[#4A7C59] font-bold ${currentSize.kana} mt-0.5 select-none`}>
            {rawKana}
          </span>
        )}
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

  // Full Assist Mode (Default): Stacked Japanese + Hiragana + Romaji
  if (inline) {
    return (
      <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span className={`font-japanese ${currentSize.jp}`}>{rawJp}</span>
        {shouldRenderKana && (
          <span className="font-japanese text-[#4A7C59] font-bold text-xs">
            ({rawKana})
          </span>
        )}
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
      {shouldRenderKana && (
        <span className={`font-japanese text-[#4A7C59] font-bold ${currentSize.kana} mt-0.5 select-none`}>
          {rawKana}
        </span>
      )}
      <span className={`font-mono text-[#2B4C7E] font-medium tracking-wide mt-0.5 select-none ${currentSize.romaji}`}>
        {rawRomaji}
      </span>
    </div>
  );
}
