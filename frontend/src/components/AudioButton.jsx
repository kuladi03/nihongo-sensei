import React, { useState, useRef, useEffect } from 'react';
import { Volume2 } from 'lucide-react';

export default function AudioButton({
  audioPath,
  size = "md",
  showSlowToggle = false,
  className = "",
  buttonClassName = "",
  labelClassName = "",
  label = "",
  autoPlay = false,
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [slowRate, setSlowRate] = useState(false);
  const audioRef = useRef(null);

  useEffect(() => {
    if (autoPlay && audioPath) {
      playAudio();
    }
  }, [audioPath, autoPlay]);

  // Spacebar audio replay listener
  useEffect(() => {
    const handleReplay = () => {
      if (audioPath) {
        playAudio();
      }
    };
    window.addEventListener('nihongo-replay-audio', handleReplay);
    return () => window.removeEventListener('nihongo-replay-audio', handleReplay);
  }, [audioPath, slowRate]);

  if (!audioPath) return null;

  const playAudio = (e) => {
    e?.stopPropagation();
    if (!audioPath) return;

    if (!audioRef.current) {
      audioRef.current = new Audio(audioPath);
    } else {
      audioRef.current.src = audioPath;
    }

    audioRef.current.playbackRate = slowRate ? 0.75 : 1.0;

    audioRef.current.onended = () => setIsPlaying(false);
    audioRef.current.onerror = () => setIsPlaying(false);

    setIsPlaying(true);
    audioRef.current.play().catch(() => setIsPlaying(false));
  };

  const toggleSlow = (e) => {
    e?.stopPropagation();
    const next = !slowRate;
    setSlowRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next ? 0.75 : 1.0;
    }
  };

  const sizeClasses = {
    sm: "p-1.5 text-xs",
    md: "p-2.5 text-sm",
    lg: "p-4 text-base",
  };

  const iconSizes = {
    sm: 16,
    md: 20,
    lg: 26,
  };

  const defaultButtonStyles = isPlaying
    ? "bg-[#4A7C59] text-white ring-4 ring-[#4A7C59]/20"
    : "bg-white hover:bg-[#F5F3EF] text-[#2B4C7E] border border-[#E5E0D8] hover:border-[#2B4C7E]";

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={playAudio}
        aria-label="Play native speech audio"
        className={`relative inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 active:scale-95 shadow-xs ${
          sizeClasses[size] || sizeClasses.md
        } ${buttonClassName || defaultButtonStyles}`}
      >
        <Volume2
          size={iconSizes[size] || 20}
          className={`${isPlaying ? "animate-pulse" : ""}`}
        />
        {label && (
          <span
            className={`font-semibold ${
              labelClassName || (isPlaying || buttonClassName?.includes("text-white") ? "text-white" : "text-stone-800")
            }`}
          >
            {label}
          </span>
        )}

        {isPlaying && (
          <span className="flex items-center gap-0.5 ml-1">
            <span className="w-1 h-3 bg-white rounded-full animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1 h-4 bg-white rounded-full animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1 h-2 bg-white rounded-full animate-bounce" />
          </span>
        )}
      </button>

      {showSlowToggle && (
        <button
          type="button"
          onClick={toggleSlow}
          title={slowRate ? "0.75x Slow Playback ON" : "1.0x Normal Playback"}
          className={`px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            slowRate
              ? "bg-[#FCF8ED] text-[#936D1C] border-[#F2DEAF] shadow-xs"
              : "bg-white text-stone-600 border-[#E5E0D8] hover:bg-[#F5F3EF]"
          }`}
        >
          {slowRate ? "0.75x" : "1.0x"}
        </button>
      )}
    </div>
  );
}
