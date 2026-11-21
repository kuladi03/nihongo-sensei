import React from 'react';
import { useApp } from './context/AppContext';
import TopBar from './components/TopBar';
import MobileNav from './components/MobileNav';
import RoadmapView from './views/RoadmapView';
import StudyDeckView from './views/StudyDeckView';
import ExercisePlayerView from './views/ExercisePlayerView';
import WeakGymView from './views/WeakGymView';
import BankView from './views/BankView';
import KanaChartView from './views/KanaChartView';
import LiveSenseiView from './views/LiveSenseiView';
import AuthView from './views/AuthView';

export default function App() {
  const { user, authLoading, activeView } = useApp();

  // Serene Washi loading screen while checking local session
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex flex-col items-center justify-center">
        <div className="w-14 h-14 rounded-2xl bg-[#FDF2EF] border border-[#F5C6BC] flex items-center justify-center text-[#D94E34] font-japanese font-black text-2xl shadow-xs animate-pulse mb-3">
          先生
        </div>
        <p className="text-xs font-bold text-stone-600 tracking-wider">
          日本語先生 loading...
        </p>
      </div>
    );
  }

  // Not authenticated: Show login / registration
  if (!user) {
    return <AuthView />;
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col font-sans pb-20 md:pb-6">
      <TopBar />

      <main className="flex-1 w-full max-w-6xl mx-auto">
        {activeView === 'roadmap' && <RoadmapView />}
        {activeView === 'kana' && <KanaChartView />}
        {activeView === 'study_deck' && <StudyDeckView />}
        {activeView === 'exercises' && <ExercisePlayerView />}
        {activeView === 'weak_gym' && <WeakGymView />}
        {activeView === 'bank' && <BankView />}
        {activeView === 'live' && <LiveSenseiView />}
      </main>

      <MobileNav />
    </div>
  );
}
