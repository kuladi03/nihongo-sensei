import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import SvgIcon from '../components/SvgIcon';
import AudioButton from '../components/AudioButton';
import {
  Search,
  BookOpen,
  AlertTriangle,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function BankView() {
  const { bankItems = [], bankLoading, fetchBank, setActiveView } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('ALL');
  const [selectedType, setSelectedType] = useState('ALL');

  // Trigger fetch on mount to guarantee bank is never empty
  useEffect(() => {
    fetchBank();
  }, [fetchBank]);

  const items = useMemo(() => {
    return Array.isArray(bankItems)
      ? bankItems.filter(item => (item.item_type || '').toUpperCase() !== 'KANA')
      : [];
  }, [bankItems]);

  const availableUnits = useMemo(() => {
    const unitSet = new Set();
    items.forEach(item => {
      if (item.unit_number) unitSet.add(item.unit_number);
    });
    return Array.from(unitSet).sort((a, b) => a - b);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return items.filter(item => {
      if (selectedUnit !== 'ALL' && item.unit_number !== Number(selectedUnit)) {
        return false;
      }

      if (selectedType !== 'ALL') {
        const itemType = (item.item_type || 'VOCAB').toUpperCase();
        if (selectedType === 'TRAP') {
          if (!item.trap_note && !item.phonetic_trap && !item.pronunciation_tip) return false;
        } else if (selectedType === 'PHRASE') {
          if (!['PHRASE', 'GREETING'].includes(itemType)) return false;
        } else if (selectedType === 'VOCAB') {
          if (!['VOCAB', 'VOC_AB'].includes(itemType)) return false;
        } else if (itemType !== selectedType) {
          return false;
        }
      }

      if (!q) return true;

      const jp = (item.japanese || '').toLowerCase();
      const kana = (item.kana_only || '').toLowerCase();
      const romaji = (item.romaji || '').toLowerCase();
      const eng = (item.english || item.english_meaning || '').toLowerCase();
      const marathi = (item.marathi || item.marathi_meaning || '').toLowerCase();
      const trap = (item.trap_note || item.phonetic_trap || item.pronunciation_tip || '').toLowerCase();

      return (
        jp.includes(q) ||
        kana.includes(q) ||
        romaji.includes(q) ||
        eng.includes(q) ||
        marathi.includes(q) ||
        trap.includes(q)
      );
    });
  }, [items, searchQuery, selectedUnit, selectedType]);

  return (
    <div className="py-8 px-4 sm:px-6 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setActiveView('roadmap')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 hover:text-stone-900 text-xs font-semibold shadow-xs transition-colors"
            >
              <ArrowLeft size={15} /> Back to Roadmap
            </button>
            <button
              onClick={() => setActiveView('kana')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EDF5EF] border border-[#C5DEC9] text-[#233E2B] hover:bg-[#DDF0E1] text-xs font-bold shadow-xs transition-colors"
            >
              <span className="font-japanese font-black">あ</span> Go to Kana Chart →
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[#2B4C7E]">
              Comprehensive Syllabus Index
            </span>
          </div>
          <h1 className="text-3xl font-extrabold text-stone-900 tracking-tight font-japanese">
            語彙・文法バンク <span className="text-stone-500 font-sans text-xl font-normal block sm:inline sm:ml-2">Vocab & Grammar Bank</span>
          </h1>
          <p className="text-stone-600 text-sm mt-1 max-w-2xl leading-relaxed">
            Every vocabulary word, expression, and Marathi phonetic trap indexed directly from your real class notes.
          </p>
        </div>

        {/* Stats Pill & Refresh */}
        <div className="flex items-center gap-3">
          <div className="p-3.5 rounded-2xl bg-white border border-[#E5E0D8] shadow-xs flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F5F3EF] text-[#2B4C7E] flex items-center justify-center font-bold">
              <BookOpen size={20} />
            </div>
            <div>
              <div className="text-lg font-black text-stone-900 leading-none">
                {items.length}
              </div>
              <div className="text-[11px] font-semibold text-stone-500 mt-1">Master Items</div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchBank()}
            title="Refresh bank from database"
            className="p-3 rounded-2xl bg-white border border-[#E5E0D8] hover:bg-[#F5F3EF] text-stone-600 hover:text-stone-900 shadow-xs transition-colors"
          >
            <RefreshCw size={18} className={bankLoading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="p-5 rounded-3xl bg-white border border-[#E5E0D8] shadow-sm mb-8 space-y-4">
        {/* Search Input Bar */}
        <div className="relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search in English, Romaji, Japanese (Hiragana/Katakana), or Marathi..."
            className="w-full pl-11 pr-4 py-3 rounded-2xl bg-[#F5F3EF] border border-[#E5E0D8] text-stone-900 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#2B4C7E]/30 focus:border-[#2B4C7E] transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-600 hover:text-stone-900 px-2 py-1 rounded-lg bg-white border border-[#E5E0D8]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5E0D8] text-xs">
          {/* Unit Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-stone-500 font-semibold mr-1">Unit:</span>
            <button
              onClick={() => setSelectedUnit('ALL')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                selectedUnit === 'ALL'
                  ? 'bg-[#2B4C7E] text-white shadow-xs'
                  : 'bg-[#F5F3EF] text-stone-700 hover:bg-[#EAE6DF]'
              }`}
            >
              All Units
            </button>
            {availableUnits.map((u) => (
              <button
                key={u}
                onClick={() => setSelectedUnit(u.toString())}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  selectedUnit === u.toString()
                    ? 'bg-[#2B4C7E] text-white shadow-xs'
                    : 'bg-[#F5F3EF] text-stone-700 hover:bg-[#EAE6DF]'
                }`}
              >
                Unit {u.toString().padStart(2, '0')}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-stone-500 font-semibold mr-1">Filter:</span>
            {[
              { id: 'ALL', label: 'All Items' },
              { id: 'VOCAB', label: 'Vocab' },
              { id: 'PHRASE', label: 'Phrases & Greetings' },
              { id: 'GRAMMAR', label: 'Grammar' },
              { id: 'TRAP', label: 'Phonetic Traps' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setSelectedType(f.id)}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  selectedType === f.id
                    ? 'bg-[#4A7C59] text-white shadow-xs'
                    : 'bg-[#F5F3EF] text-stone-700 hover:bg-[#EAE6DF]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Grid with Kana Stamp Cleanup */}
      {bankLoading && items.length === 0 ? (
        <div className="py-20 text-center">
          <div className="w-12 h-12 border-4 border-[#2B4C7E]/20 border-t-[#2B4C7E] rounded-full animate-spin mx-auto mb-3" />
          <p className="text-stone-500 text-sm font-semibold">Loading vocab repository...</p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-16 text-center bg-white border border-[#E5E0D8] rounded-3xl p-8">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-bold text-stone-900 mb-1">No matching vocabulary found</h3>
          <p className="text-stone-500 text-sm mb-4">
            Try adjusting your search query or clear the filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedUnit('ALL');
              setSelectedType('ALL');
            }}
            className="px-4 py-2 rounded-xl bg-[#F5F3EF] text-stone-700 border border-[#E5E0D8] text-xs font-bold"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map((item, idx) => {
            const hasTrap = item.trap_note || item.phonetic_trap || item.pronunciation_tip;
            const rep = item.repetitions || 0;

            return (
              <motion.div
                key={item.id || idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(idx * 0.02, 0.3) }}
                className="p-5 rounded-3xl bg-white border border-[#E5E0D8] hover:border-[#2B4C7E] shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#F5F3EF] text-stone-700 border border-[#E5E0D8]">
                      Unit {item.unit_number?.toString().padStart(2, '0') || '01'}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {rep > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#EDF5EF] text-[#233E2B] border border-[#C5DEC9]">
                          Mastered (x{rep})
                        </span>
                      )}
                      {/* Styled Kana Stamp or SvgIcon */}
                      <SvgIcon
                        svgMarkup={item.svg_markup}
                        itemType={item.item_type}
                        japanese={item.japanese}
                        kanaOnly={item.kana_only}
                        className="w-8 h-8 text-base"
                      />
                    </div>
                  </div>

                  {/* Japanese Word + Universal Romaji via JpText */}
                  <div className="my-2">
                    <JpText
                      japanese={item.japanese || item.kana_only}
                      romaji={item.romaji}
                      kana={item.kana_only}
                      size="xl"
                      align="left"
                    />
                  </div>

                  {/* Meanings */}
                  <div className="mt-3 space-y-1">
                    <div className="text-sm font-bold text-stone-900 leading-snug">
                      {item.english || item.english_meaning}
                    </div>
                    {(item.marathi || item.marathi_meaning) && (
                      <div className="text-xs font-semibold text-[#233E2B] font-marathi tracking-wide leading-relaxed">
                        मराठी: {item.marathi || item.marathi_meaning}
                      </div>
                    )}
                  </div>

                  {/* Phonetic Trap Alert Banner */}
                  {hasTrap && (
                    <div className="mt-3 p-3 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] text-xs">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#9A2E1A] uppercase tracking-wider mb-1">
                        <AlertTriangle size={13} className="text-[#D94E34]" /> Phonetic Trap
                      </div>
                      <p className="text-xs text-[#9A2E1A] font-marathi font-medium leading-relaxed">
                        {item.trap_note || item.phonetic_trap || item.pronunciation_tip}
                      </p>
                    </div>
                  )}
                </div>

                {/* Bottom Strip: Audio Playback */}
                <div className="mt-4 pt-3 border-t border-[#E5E0D8] flex items-center justify-between">
                  <span className="text-[11px] font-mono text-stone-400">
                    {item.item_type || 'VOCAB'}
                  </span>
                  {item.audio_path ? (
                    <AudioButton audioPath={item.audio_path} size="sm" label="Play" />
                  ) : (
                    <span className="text-[11px] text-stone-400 italic">No audio</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
