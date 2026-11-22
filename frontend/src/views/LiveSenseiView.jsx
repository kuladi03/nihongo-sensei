import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import JpText from '../components/JpText';
import {
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  Clock,
  Sparkles,
  Layers,
  Volume2,
  VolumeX,
  Send,
  AlertCircle,
  CheckCircle2,
  BookOpen,
  ArrowLeft,
  RefreshCw,
  Calendar,
  ChevronRight,
  X,
  MessageSquare,
  Award,
  Hand,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getAudioConstraints,
  floatTo16BitPCM,
  downsampleTo16k,
  uint8ArrayToBase64,
  decodePCMChunkToFloat32,
} from '../utils/audioLive';

export default function LiveSenseiView() {
  const { user, setActiveView, showToast, scriptMode } = useApp();

  // Call Lobby vs Active Call State
  const [isInCall, setIsInCall] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Session & Connection States
  const [connectionState, setConnectionState] = useState('disconnected'); // 'connecting' | 'connected' | 'error' | 'disconnected'
  const [activeModel, setActiveModel] = useState('gemini-3.8-live');
  const [modelSwitchNotice, setModelSwitchNotice] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [senseiSpeaking, setSenseiSpeaking] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Push-to-Talk vs Hands-Free States
  const [isPttMode, setIsPttMode] = useState(false); // false = Hands-Free (default), true = Push-to-Talk
  const [isPttActive, setIsPttActive] = useState(false); // true while button/spacebar is held down
  const isPttModeRef = useRef(isPttMode);
  const isPttActiveRef = useRef(isPttActive);
  const isInputFocusedRef = useRef(false);

  useEffect(() => {
    isPttModeRef.current = isPttMode;
  }, [isPttMode]);

  useEffect(() => {
    isPttActiveRef.current = isPttActive;
  }, [isPttActive]);

  // Content States
  const [transcripts, setTranscripts] = useState([]); // [{ id, role: 'user'|'sensei', text, time }]
  const [whiteboardCards, setWhiteboardCards] = useState([]); // [{ japanese, romaji, english, tip }]
  const [typedInput, setTypedInput] = useState('');

  // Past Sessions & Recaps States
  const [pastSessions, setPastSessions] = useState([]);
  const [loadingPastSessions, setLoadingPastSessions] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [activeSessionTab, setActiveSessionTab] = useState('recap'); // 'recap' | 'whiteboard' | 'transcript'

  // Refs
  const wsRef = useRef(null);
  const timerRef = useRef(null);
  const transcriptScrollRef = useRef(null);
  const isMutedRef = useRef(isMuted);
  const wakeLockRef = useRef(null);

  // Keep isMutedRef synced with state for audioworklet/scriptprocessor
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  // Mobile Screen Wake Lock API to prevent screen sleep during live calls
  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        if (!wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          wakeLockRef.current.addEventListener('release', () => {
            wakeLockRef.current = null;
          });
          console.log('📱 Screen Wake Lock acquired.');
        }
      } catch (err) {
        console.warn('Screen Wake Lock request failed (unsupported or denied):', err);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        console.log('📱 Screen Wake Lock released.');
      } catch (err) {
        console.warn('Screen Wake Lock release failed:', err);
      }
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire Wake Lock on visibilitychange if returning to active call
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && isInCall) {
        await requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isInCall, requestWakeLock]);

  // Release Wake Lock on unmount
  useEffect(() => {
    return () => {
      releaseWakeLock();
    };
  }, [releaseWakeLock]);

  // Web Audio Recording Refs
  const inputAudioCtxRef = useRef(null);
  const micStreamRef = useRef(null);
  const scriptProcessorRef = useRef(null);

  // Web Audio Playback Refs
  const outputAudioCtxRef = useRef(null);
  const nextPlayTimeRef = useRef(0);
  const activeSourcesRef = useRef([]);

  // Format Elapsed Time (MM:SS)
  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Format Date for Past Sessions
  const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Fetch Past Live Sessions
  const fetchPastSessions = useCallback(async () => {
    const token = localStorage.getItem('nihongo_token');
    if (!token) return;
    try {
      setLoadingPastSessions(true);
      const res = await fetch('/api/live/sessions', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setPastSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch past sessions:', err);
    } finally {
      setLoadingPastSessions(false);
    }
  }, []);

  // Fetch past sessions on initial mount and when call ends
  useEffect(() => {
    if (!isInCall) {
      fetchPastSessions();
      // Secondary check after 1.5s to guarantee freshly committed SQLite session row appears
      const secondaryTimer = setTimeout(() => {
        fetchPastSessions();
      }, 1500);
      return () => clearTimeout(secondaryTimer);
    }
  }, [isInCall, fetchPastSessions]);

  // If newly saved session has summary == null, auto-refresh after ~4s
  useEffect(() => {
    if (isInCall) return;
    const hasPendingRecap = pastSessions.some((s) => !s.summary);
    if (hasPendingRecap) {
      const timer = setTimeout(() => {
        fetchPastSessions();
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [pastSessions, isInCall, fetchPastSessions]);

  // Push-to-Talk Press and Release Handlers
  const handlePttDown = useCallback(() => {
    if (!isPttModeRef.current) return;
    if (!isPttActiveRef.current) {
      setIsPttActive(true);
    }
  }, []);

  const handlePttUp = useCallback(() => {
    if (!isPttModeRef.current) return;
    if (isPttActiveRef.current) {
      setIsPttActive(false);
      // Immediately notify backend so Gemini Live triggers turn boundary without delay
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ptt_release' }));
      }
    }
  }, []);

  // Desktop Spacebar support for Push-to-Talk (when not typing in an input)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat && isPttModeRef.current && !isInputFocusedRef.current && isInCall) {
        e.preventDefault();
        handlePttDown();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space' && isPttModeRef.current && !isInputFocusedRef.current && isInCall) {
        e.preventDefault();
        handlePttUp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isInCall, handlePttDown, handlePttUp]);

  // Play incoming 24kHz PCM audio chunk from Gemini Live
  const playPCMChunk = useCallback((base64Data, sampleRate = 24000) => {
    try {
      let audioCtx = outputAudioCtxRef.current;
      if (!audioCtx || audioCtx.state === 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
        outputAudioCtxRef.current = audioCtx;
      }

      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }

      // Fast 16-bit PCM little-endian decode to Float32
      const float32Data = decodePCMChunkToFloat32(base64Data);
      const numSamples = float32Data.length;
      if (numSamples === 0) return;

      // Create audio buffer at 24000 Hz. Web Audio will automatically resample to system output rate.
      const audioBuffer = audioCtx.createBuffer(1, numSamples, sampleRate);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);

      const now = audioCtx.currentTime;
      if (nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now + 0.02; // small 20ms lead buffer
      }

      source.start(nextPlayTimeRef.current);
      nextPlayTimeRef.current += audioBuffer.duration;

      activeSourcesRef.current.push(source);
      setSenseiSpeaking(true);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
        if (activeSourcesRef.current.length === 0) {
          setSenseiSpeaking(false);
        }
      };
    } catch (err) {
      console.error('Audio playback error:', err);
    }
  }, []);

  // Stop currently playing Sensei audio (e.g. user barge-in)
  const stopPlayingAudio = useCallback(() => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    nextPlayTimeRef.current = 0;
    setSenseiSpeaking(false);
  }, []);

  // Start Mic Recording & Stream PCM16 16kHz to WebSocket
  const startMicRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(getAudioConstraints());
      micStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      let inputCtx;
      try {
        inputCtx = new AudioContextClass({ sampleRate: 16000 });
      } catch (e) {
        inputCtx = new AudioContextClass();
      }
      inputAudioCtxRef.current = inputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      // ScriptProcessor buffer size 4096 gives ~256ms chunk at 16kHz
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      scriptProcessorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (isMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }

        // Push-to-Talk gating: discard frames unless PTT button or spacebar is held down
        if (isPttModeRef.current && !isPttActiveRef.current) {
          return;
        }

        const inputChannelData = e.inputBuffer.getChannelData(0);
        // Ensure data is at 16kHz
        const resampledData = downsampleTo16k(inputChannelData, inputCtx.sampleRate);
        const pcmUint8 = floatTo16BitPCM(resampledData);
        const b64 = uint8ArrayToBase64(pcmUint8);

        wsRef.current.send(
          JSON.stringify({
            type: 'audio',
            data: b64,
          })
        );
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);
    } catch (err) {
      console.warn('Microphone access unavailable or denied:', err);
      showToast('Microphone access unavailable. You can still type below!', 'info');
    }
  }, [showToast]);

  // Clean up all audio streams
  const cleanupAudio = useCallback(() => {
    stopPlayingAudio();

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch (e) {}
      scriptProcessorRef.current = null;
    }

    if (inputAudioCtxRef.current) {
      try {
        inputAudioCtxRef.current.close();
      } catch (e) {}
      inputAudioCtxRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (outputAudioCtxRef.current) {
      try {
        outputAudioCtxRef.current.close();
      } catch (e) {}
      outputAudioCtxRef.current = null;
    }
  }, [stopPlayingAudio]);

  // Handle Start Call (Invoked directly by User Gesture to satisfy Chrome Autoplay Policy)
  const handleStartCall = async () => {
    setIsConnecting(true);
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!outputAudioCtxRef.current || outputAudioCtxRef.current.state === 'closed') {
        outputAudioCtxRef.current = new AudioContextClass();
      }
      if (outputAudioCtxRef.current.state === 'suspended') {
        await outputAudioCtxRef.current.resume();
      }
      await requestWakeLock();
      setIsInCall(true);
      setConnectionState('connecting');
    } catch (err) {
      console.error('Failed to initialize audio output context:', err);
      showToast('Could not initialize audio device: ' + err.message, 'error');
      setIsConnecting(false);
    }
  };

  // Connect to Live Sensei WebSocket (Single-Port Unified /api/live/session) when isInCall is true
  useEffect(() => {
    if (!isInCall) return;

    const token = localStorage.getItem('nihongo_token');
    if (!token) {
      setConnectionState('error');
      setIsConnecting(false);
      showToast('Please sign in to access Live Sensei.', 'error');
      return;
    }

    // Determine WebSocket host and port dynamically (Single-Port Server & PWA)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/live/session?token=${encodeURIComponent(token)}`;

    setConnectionState('connecting');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionState('connected');
      setIsConnecting(false);
      showToast('🌸 Connected to Live Sensei! Starting session...', 'success');
      startMicRecording();

      // Start elapsed timer (never resets on model failovers!)
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const type = msg.type;

        if (type === 'session_ready') {
          if (msg.model) setActiveModel(msg.model);
        } else if (type === 'model_switched') {
          // Seamless Mid-Call Handoff: Model Fallback
          const newModel = msg.model || 'Fallback Model';
          setActiveModel(newModel);
          setModelSwitchNotice(`Seamless failover: Switched to ${newModel}. Conversation & whiteboard preserved!`);
          showToast(`⚡ Model waterfall: Active model is now ${newModel}`, 'info');

          // Auto-hide banner notice after 6 seconds
          setTimeout(() => {
            setModelSwitchNotice(null);
          }, 6000);
        } else if (type === 'audio') {
          // Incoming 24kHz Sensei speech chunk
          if (msg.data) {
            playPCMChunk(msg.data, msg.rate || 24000);
          }
        } else if (type === 'transcript') {
          // Real-time speech transcript from Gemini Live
          const { role, text, finished } = msg;
          if (text && text.trim()) {
            setTranscripts((prev) => {
              const last = prev[prev.length - 1];
              // If same role and previous wasn't marked finished, append
              if (last && last.role === role && !last.finished) {
                const cleanText = text.trim();
                // Avoid duplicating text if already present in last.text
                if (last.text.endsWith(cleanText) || last.text.includes(cleanText)) {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...last,
                      finished: !!finished,
                    },
                  ];
                }

                // Check whether to join with space (for Latin text) or no space (between Japanese characters)
                const lastChar = last.text.slice(-1);
                const firstChar = cleanText.charAt(0);
                const isJp = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(lastChar) &&
                             /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(firstChar);
                const separator = isJp ? '' : ' ';

                return [
                  ...prev.slice(0, -1),
                  {
                    ...last,
                    text: `${last.text}${separator}${cleanText}`,
                    finished: !!finished,
                  },
                ];
              }
              return [
                ...prev,
                {
                  id: Date.now() + Math.random(),
                  role,
                  text: text.trim(),
                  finished: !!finished,
                  time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                },
              ];
            });
          }
        } else if (type === 'whiteboard_card') {
          // Sensei pushed a study card via push_whiteboard_card tool
          if (msg.card) {
            setWhiteboardCards((prev) => {
              const exists = prev.some((c) => c.japanese === msg.card.japanese);
              if (exists) return prev;
              return [msg.card, ...prev];
            });
            showToast(`📝 Sensei wrote 「${msg.card.japanese}」 on the whiteboard!`, 'info');
          }
        } else if (type === 'interrupted') {
          stopPlayingAudio();
        } else if (type === 'error') {
          showToast(msg.message || 'Live Sensei error', 'error');
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setConnectionState('error');
      setIsConnecting(false);
    };

    ws.onclose = () => {
      setConnectionState('disconnected');
      setIsConnecting(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      cleanupAudio();
    };

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'end_call' }));
        ws.close();
      }
      cleanupAudio();
    };
  }, [isInCall, playPCMChunk, startMicRecording, cleanupAudio, stopPlayingAudio, showToast]);

  // Auto-scroll transcript container on new messages
  useEffect(() => {
    if (transcriptScrollRef.current) {
      transcriptScrollRef.current.scrollTop = transcriptScrollRef.current.scrollHeight;
    }
  }, [transcripts]);

  // Handle Mute Toggle
  const toggleMute = () => {
    setIsMuted((prev) => !prev);
    showToast(isMuted ? 'Microphone unmuted.' : 'Microphone muted.', 'info');
  };

  // End Call & Return to Roadmap or Lobby
  const endCall = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end_call' }));
      wsRef.current.close();
    }
    cleanupAudio();
    releaseWakeLock();
    setIsInCall(false);
    setConnectionState('disconnected');
    showToast('Live session ended cleanly. お疲れ様でした！ (Great work!)', 'success');

    // Fetch past sessions immediately and follow up at 1.5s
    fetchPastSessions();
    setTimeout(() => {
      fetchPastSessions();
    }, 1500);
  };

  // Send Typed Fallback Message
  const handleSendText = (e) => {
    e.preventDefault();
    if (!typedInput.trim()) return;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const text = typedInput.trim();
      wsRef.current.send(
        JSON.stringify({
          type: 'text',
          text,
        })
      );
      setTranscripts((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          role: 'user',
          text,
          finished: true,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setTypedInput('');
    } else {
      showToast('Live connection is not open.', 'error');
    }
  };

  // ==========================================
  // RENDER: LOBBY SCREEN (when !isInCall)
  // ==========================================
  if (!isInCall) {
    return (
      <div className="max-w-4xl mx-auto py-6 px-4 flex flex-col items-center justify-start min-h-[calc(100vh-6rem)]">
        {/* Navigation Bar */}
        <div className="w-full flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => setActiveView('roadmap')}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-[#E5E0D8] text-stone-700 hover:text-stone-900 hover:bg-[#F5F3EF] transition-colors shadow-2xs text-xs font-bold"
          >
            <ArrowLeft size={14} />
            <span>Back to Roadmap</span>
          </button>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2B4C7E]/10 border border-[#2B4C7E]/20 text-[#2B4C7E] text-xs font-semibold">
            <Radio size={12} className="text-[#2B4C7E] animate-pulse" />
            <span>Gemini Live Ready</span>
          </div>
        </div>

        {/* Main Hero Card */}
        <div className="w-full bg-white rounded-3xl border border-[#E5E0D8] p-6 sm:p-10 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
          {/* Subtle gradient highlights */}
          <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#2B4C7E]/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#4A7C59]/5 rounded-full blur-3xl pointer-events-none" />

          {/* Sensei Avatar with Ring Animation */}
          <div className="relative mb-6">
            <motion.div
              animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="absolute -inset-3 bg-[#4A7C59]/20 rounded-3xl blur-md"
            />
            <div className="w-24 h-24 rounded-3xl bg-[#2B4C7E] text-white flex items-center justify-center font-japanese font-black text-4xl shadow-lg relative border-4 border-white">
              先
            </div>
          </div>

          {/* Title & Description */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900 font-japanese mb-2">
            🌸 ライブ先生 <span className="font-sans font-bold text-lg text-stone-600 block sm:inline sm:ml-2">(Live Sensei Voice Session)</span>
          </h1>
          <p className="text-stone-600 text-xs sm:text-sm max-w-lg mb-8 leading-relaxed">
            Real-time 1-on-1 spoken Japanese conversation with Nihongo Sensei. Master spoken pronunciation, review your unlocked syllabus, and learn with Marathi & English phonetic insights.
          </p>

          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl mb-8 text-left">
            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#2B4C7E]/10 text-[#2B4C7E] shrink-0 mt-0.5">
                <Mic size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-900 mb-0.5">24 kHz HD Voice</h3>
                <p className="text-[11px] text-stone-500 leading-snug">
                  Bidirectional streaming audio with low latency and instant turn-taking.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#4A7C59]/10 text-[#4A7C59] shrink-0 mt-0.5">
                <BookOpen size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-900 mb-0.5">Live Whiteboard</h3>
                <p className="text-[11px] text-stone-500 leading-snug">
                  Sensei pushes real-time study cards with Romaji and script as you talk.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-700 shrink-0 mt-0.5">
                <Layers size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-900 mb-0.5">Curriculum Scoped</h3>
                <p className="text-[11px] text-stone-500 leading-snug">
                  Sensei teaches words and grammar matched to your current progress.
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-start gap-3">
              <div className="p-2 rounded-xl bg-[#D94E34]/10 text-[#D94E34] shrink-0 mt-0.5">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="text-xs font-bold text-stone-900 mb-0.5">Seamless Failover</h3>
                <p className="text-[11px] text-stone-500 leading-snug">
                  Multi-tier model waterfall keeps your call active without dropouts.
                </p>
              </div>
            </div>
          </div>

          {/* Start Call Button */}
          <button
            type="button"
            onClick={handleStartCall}
            disabled={isConnecting}
            className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-[#2B4C7E] hover:bg-[#1E3A63] active:scale-95 text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 disabled:opacity-60 cursor-pointer"
          >
            {isConnecting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Initializing Audio & Connecting...</span>
              </>
            ) : (
              <>
                <Mic size={18} className="animate-pulse" />
                <span>Start Voice Call (通話を始める)</span>
              </>
            )}
          </button>

          <p className="text-[11px] text-stone-400 mt-4 flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-[#4A7C59]" />
            <span>Clicking above initializes your speaker & microphone playback cleanly</span>
          </p>
        </div>

        {/* Past Sessions Bento Section */}
        <div className="w-full mt-8 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-[#2B4C7E]/10 border border-[#2B4C7E]/20 flex items-center justify-center text-[#2B4C7E]">
                <Clock size={15} />
              </div>
              <h2 className="text-base font-extrabold text-stone-900 font-japanese">
                過去のセッション <span className="font-sans font-bold text-xs text-stone-500 ml-1.5">• Past Sessions</span>
              </h2>
            </div>
            {loadingPastSessions ? (
              <div className="flex items-center gap-1.5 text-xs text-stone-400 font-medium">
                <RefreshCw size={13} className="animate-spin text-[#2B4C7E]" />
                <span>Syncing sessions...</span>
              </div>
            ) : (
              <span className="text-xs font-bold text-stone-500 font-mono bg-[#FAF8F5] px-2.5 py-1 rounded-xl border border-[#E5E0D8]">
                {pastSessions.length} total
              </span>
            )}
          </div>

          {pastSessions.length === 0 && !loadingPastSessions ? (
            <div className="w-full bg-white rounded-2xl border border-[#E5E0D8] p-8 text-center text-stone-400 shadow-2xs">
              <Calendar size={28} className="mx-auto mb-2 text-stone-300" />
              <p className="text-xs font-bold text-stone-600 mb-0.5">No Past Live Sessions Yet</p>
              <p className="text-[11px] text-stone-400 max-w-sm mx-auto">
                Start your first live voice lesson above to practice pronunciation, explore real-world conversations, and unlock automatic AI recaps.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pastSessions.map((session) => {
                const isPendingRecap = !session.summary;
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setSelectedSession(session);
                      setActiveSessionTab('recap');
                    }}
                    className="w-full bg-white rounded-2xl border border-[#E5E0D8] p-4 shadow-2xs hover:shadow-sm hover:border-[#2B4C7E]/40 transition-all cursor-pointer text-left group"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-stone-900 font-mono">
                          {formatDate(session.created_at)}
                        </span>
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#FAF8F5] border border-[#E5E0D8] text-[11px] font-mono font-bold text-stone-600">
                          <Clock size={11} className="text-stone-400" />
                          {formatTime(session.duration_seconds || 0)}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-[#2B4C7E]/10 text-[#2B4C7E] border border-[#2B4C7E]/20 text-[11px] font-semibold">
                          {session.unit_focus || 'Japanese Practice'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {isPendingRecap ? (
                          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-medium animate-pulse">
                            <Sparkles size={11} className="animate-spin text-amber-500" />
                            <span>Generating AI recap...</span>
                          </div>
                        ) : (
                          <span className="text-xs font-bold text-[#2B4C7E] flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                            <span>Review</span>
                            <ChevronRight size={14} />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Topics and Phrases Pills */}
                    {session.summary ? (
                      <div className="space-y-2">
                        {session.summary.topics_covered && session.summary.topics_covered.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-stone-400 mr-1">
                              Covered:
                            </span>
                            {session.summary.topics_covered.map((topic, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-[#FAF8F5] border border-[#E5E0D8] text-[11px] text-stone-700 font-medium"
                              >
                                {topic}
                              </span>
                            ))}
                          </div>
                        )}
                        {session.summary.new_phrases && session.summary.new_phrases.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-[#4A7C59] mr-1">
                              Practiced:
                            </span>
                            {session.summary.new_phrases.slice(0, 4).map((phrase, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-md bg-[#EDF5EF] border border-[#C5DEC9] text-[11px] text-[#233E2B] font-japanese font-semibold"
                              >
                                {phrase}
                              </span>
                            ))}
                            {session.summary.new_phrases.length > 4 && (
                              <span className="text-[10px] text-stone-400">
                                +{session.summary.new_phrases.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-stone-400 italic">
                        {isPendingRecap ? 'AI recap is analyzing conversation and notes...' : 'No summary available.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Session Details Modal / Slide-over Drawer */}
        <AnimatePresence>
          {selectedSession && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                className="w-full max-w-3xl max-h-[90vh] bg-white rounded-3xl border border-[#E5E0D8] shadow-2xl flex flex-col overflow-hidden text-left"
              >
                {/* Modal Header */}
                <div className="p-4 sm:p-5 border-b border-[#E5E0D8] bg-[#FAF8F5] flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-6 h-6 rounded-lg bg-[#2B4C7E] text-white flex items-center justify-center font-japanese text-xs font-bold">
                        先
                      </span>
                      <h2 className="text-base font-bold text-stone-900 font-japanese">
                        🌸 レッスン記録 <span className="font-sans font-extrabold text-sm text-stone-700">• Live Lesson Review</span>
                      </h2>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-stone-500 font-mono">
                      <span>{formatDate(selectedSession.created_at)}</span>
                      <span>•</span>
                      <span>{formatTime(selectedSession.duration_seconds || 0)}</span>
                      <span>•</span>
                      <span className="text-[#2B4C7E] font-semibold">{selectedSession.unit_focus}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedSession(null)}
                    className="p-2 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-[#EAE6DF] transition-colors cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Tabs */}
                <div className="flex items-center border-b border-[#E5E0D8] px-4 pt-2 gap-2 bg-white">
                  <button
                    type="button"
                    onClick={() => setActiveSessionTab('recap')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                      activeSessionTab === 'recap'
                        ? 'border-[#2B4C7E] text-[#2B4C7E]'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <Sparkles size={13} />
                    <span>AI Recap (まとめ)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSessionTab('whiteboard')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                      activeSessionTab === 'whiteboard'
                        ? 'border-[#2B4C7E] text-[#2B4C7E]'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <BookOpen size={13} />
                    <span>Whiteboard Cards ({selectedSession.whiteboard_cards?.length || 0})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveSessionTab('transcript')}
                    className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                      activeSessionTab === 'transcript'
                        ? 'border-[#2B4C7E] text-[#2B4C7E]'
                        : 'border-transparent text-stone-500 hover:text-stone-800'
                    }`}
                  >
                    <MessageSquare size={13} />
                    <span>Transcript ({selectedSession.transcript?.length || 0})</span>
                  </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {activeSessionTab === 'recap' && (
                    <div className="space-y-4">
                      {selectedSession.summary ? (
                        <>
                          {/* Topics Covered */}
                          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8]">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2 flex items-center gap-1.5">
                              <CheckCircle2 size={13} className="text-[#2B4C7E]" />
                              Topics Covered
                            </h3>
                            <ul className="space-y-1.5">
                              {(selectedSession.summary.topics_covered || []).map((topic, i) => (
                                <li key={i} className="text-xs text-stone-700 flex items-start gap-2">
                                  <span className="w-1.5 h-1.5 rounded-full bg-[#2B4C7E] mt-1.5 shrink-0" />
                                  <span>{topic}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* New Phrases Mastered */}
                          <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8]">
                            <h3 className="text-xs font-bold uppercase tracking-wider text-[#4A7C59] mb-2 flex items-center gap-1.5">
                              <Award size={13} className="text-[#4A7C59]" />
                              Key Phrases & Vocabulary Mastered
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              {(selectedSession.summary.new_phrases || []).map((phrase, i) => (
                                <span
                                  key={i}
                                  className="px-3 py-1 rounded-xl bg-[#EDF5EF] border border-[#C5DEC9] text-xs font-semibold text-[#233E2B] font-japanese"
                                >
                                  {phrase}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Sensei's Pronunciation & Phonetic Coaching Notes */}
                          {selectedSession.summary.pronunciation_notes && (
                            <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-800 mb-1.5 flex items-center gap-1.5">
                                <span>💡</span>
                                <span>Sensei's Pronunciation & Coaching Notes</span>
                              </h3>
                              <p className="text-xs text-amber-900 leading-relaxed">
                                {selectedSession.summary.pronunciation_notes}
                              </p>
                            </div>
                          )}

                          {/* Next Focus */}
                          {selectedSession.summary.next_focus && (
                            <div className="p-4 rounded-2xl bg-[#2B4C7E]/5 border border-[#2B4C7E]/20">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-[#2B4C7E] mb-1.5 flex items-center gap-1.5">
                                <span>🎯</span>
                                <span>Recommended Next Focus</span>
                              </h3>
                              <p className="text-xs text-[#2B4C7E] leading-relaxed">
                                {selectedSession.summary.next_focus}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="p-8 text-center text-stone-400">
                          <Sparkles size={24} className="mx-auto mb-2 text-amber-500 animate-spin" />
                          <p className="text-xs font-bold text-stone-700 mb-1">AI Recap is generating...</p>
                          <p className="text-[11px] text-stone-400">
                            Sensei is analyzing the session dialogue and notes. Please check back in a few seconds!
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {activeSessionTab === 'whiteboard' && (
                    <div className="space-y-3">
                      {(!selectedSession.whiteboard_cards || selectedSession.whiteboard_cards.length === 0) ? (
                        <div className="p-8 text-center text-stone-400">
                          <BookOpen size={24} className="mx-auto mb-2 text-stone-300" />
                          <p className="text-xs">No whiteboard cards were pushed during this session.</p>
                        </div>
                      ) : (
                        selectedSession.whiteboard_cards.map((card, i) => (
                          <div
                            key={i}
                            className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] shadow-2xs"
                          >
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <div className="text-base font-bold text-stone-900 font-japanese">
                                <JpText japanese={card.japanese} romaji={card.romaji} />
                              </div>
                              {card.romaji && (
                                <span className="px-2 py-0.5 rounded-md bg-white border border-[#E5E0D8] font-mono text-[10px] font-semibold text-stone-600">
                                  {card.romaji}
                                </span>
                              )}
                            </div>
                            {card.english && (
                              <p className="text-xs font-semibold text-stone-800 mb-1.5">{card.english}</p>
                            )}
                            {card.tip && (
                              <div className="p-2 rounded-lg bg-[#EDF5EF] border border-[#C5DEC9] text-[11px] text-[#233E2B] leading-relaxed flex items-start gap-1.5">
                                <span className="font-bold text-[10px] shrink-0">💡 Note:</span>
                                <span>{card.tip}</span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {activeSessionTab === 'transcript' && (
                    <div className="space-y-2.5">
                      {(!selectedSession.transcript || selectedSession.transcript.length === 0) ? (
                        <div className="p-8 text-center text-stone-400">
                          <MessageSquare size={24} className="mx-auto mb-2 text-stone-300" />
                          <p className="text-xs">No transcript recorded for this session.</p>
                        </div>
                      ) : (
                        selectedSession.transcript.map((t, i) => (
                          <div
                            key={i}
                            className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs leading-relaxed ${
                                t.role === 'user'
                                  ? 'bg-[#2B4C7E] text-white rounded-tr-xs'
                                  : 'bg-[#EDF5EF] text-[#233E2B] border border-[#C5DEC9] rounded-tl-xs'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2 mb-1 opacity-80 text-[10px]">
                                <span className="font-bold">
                                  {t.role === 'user' ? user?.name || 'You' : 'Nihongo Sensei (先生)'}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap font-sans text-xs">{t.text}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-[#E5E0D8] bg-[#FAF8F5] flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSession(null)}
                    className="px-4 py-2 rounded-xl border border-[#E5E0D8] bg-white hover:bg-[#F5F3EF] text-stone-700 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==========================================
  // RENDER: ACTIVE CALL SCREEN
  // ==========================================
  return (
    <div className="max-w-6xl mx-auto py-4 px-3 sm:px-6 flex flex-col min-h-[calc(100vh-5rem)]">
      {/* Top Header & Session Bar */}
      <div className="bg-white rounded-2xl border border-[#E5E0D8] p-3 sm:p-4 mb-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Left: Title & Live Indicator */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={endCall}
            className="p-1.5 rounded-xl bg-[#F5F3EF] border border-[#E5E0D8] text-stone-600 hover:text-stone-900 hover:bg-[#EAE6DF] transition-colors"
            title="Leave Call"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-stone-900 font-japanese flex items-center gap-1.5">
                🌸 ライブ先生 <span className="font-sans font-extrabold text-sm text-stone-700">(Live Sensei)</span>
              </h1>
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  connectionState === 'connected'
                    ? 'bg-[#4A7C59] animate-pulse'
                    : connectionState === 'connecting'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-[#D94E34]'
                }`}
              />
            </div>
            <p className="text-[11px] text-stone-500 hidden sm:block">
              Interactive voice conversation with Nihongo Sensei • Tailored to your syllabus
            </p>
          </div>
        </div>

        {/* Center: Active Model Waterfall Badge & Session Timer */}
        <div className="flex items-center gap-2">
          {/* Active Model Badge */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#2B4C7E]/10 border border-[#2B4C7E]/20 text-[#2B4C7E] text-xs font-semibold shadow-2xs"
            title="Active Gemini Live Model (Supports automatic waterfall fallback on rate limits)"
          >
            <Radio size={13} className="text-[#2B4C7E] animate-pulse" />
            <span className="font-mono text-[11px] font-bold">{activeModel}</span>
          </div>

          {/* Session Timer */}
          <div
            className="flex items-center gap-1 px-3 py-1 rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] text-stone-700 text-xs font-mono font-bold shadow-2xs"
            title="Session Duration (Never drops on model handoffs)"
          >
            <Clock size={13} className="text-stone-500" />
            <span>{formatTime(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Right: Controls (Mode Toggle, Mute, End Call) */}
        <div className="flex items-center gap-2">
          {/* Mode Switcher: Hands-Free vs Push-to-Talk */}
          <div className="flex items-center bg-[#FAF8F5] border border-[#E5E0D8] rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => {
                setIsPttMode(false);
                setIsPttActive(false);
                showToast('Switched to Hands-Free mode.', 'info');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                !isPttMode
                  ? 'bg-white text-[#2B4C7E] shadow-2xs'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              Hands-Free
            </button>
            <button
              type="button"
              onClick={() => {
                setIsPttMode(true);
                setIsPttActive(false);
                showToast('Push-to-Talk active. Hold button or Spacebar to speak.', 'info');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                isPttMode
                  ? 'bg-white text-[#2B4C7E] shadow-2xs'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              Push-to-Talk
            </button>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer ${
              isMuted
                ? 'bg-[#D94E34]/10 text-[#D94E34] border-[#D94E34]/30 hover:bg-[#D94E34]/20'
                : 'bg-white text-stone-700 border-[#E5E0D8] hover:bg-[#F5F3EF]'
            }`}
          >
            {isMuted ? <MicOff size={14} /> : <Mic size={14} className="text-[#4A7C59]" />}
            <span>{isMuted ? 'Muted' : 'Mute'}</span>
          </button>

          <button
            type="button"
            onClick={endCall}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#D94E34] hover:bg-[#B83E28] text-white text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
          >
            <PhoneOff size={14} />
            <span>End Call</span>
          </button>
        </div>
      </div>

      {/* Model Switch Toast Notification */}
      <AnimatePresence>
        {modelSwitchNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 px-4 py-2.5 rounded-xl bg-[#2B4C7E] text-white text-xs font-medium flex items-center justify-between shadow-md"
          >
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="animate-spin shrink-0" />
              <span>{modelSwitchNotice}</span>
            </div>
            <button
              onClick={() => setModelSwitchNotice(null)}
              className="text-white/80 hover:text-white text-xs font-bold ml-3"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main 2-Column Bento Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left Column (7 cols): Voice Orb & Live Dialogue Transcript */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          {/* Sensei Avatar & Soundwave Orb Canvas */}
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-5 shadow-xs flex flex-col items-center justify-center relative overflow-hidden min-h-[170px]">
            {/* Ambient Soundwaves */}
            <div className="relative flex items-center justify-center mb-3">
              <motion.div
                animate={{
                  scale: senseiSpeaking ? [1, 1.25, 1.05, 1.3, 1] : [1, 1.05, 1],
                  opacity: senseiSpeaking ? [0.6, 0.9, 0.7, 1, 0.6] : [0.3, 0.4, 0.3],
                }}
                transition={{
                  repeat: Infinity,
                  duration: senseiSpeaking ? 1.4 : 3,
                  ease: 'easeInOut',
                }}
                className={`absolute w-24 h-24 rounded-full ${
                  senseiSpeaking ? 'bg-[#4A7C59]/20' : 'bg-[#2B4C7E]/10'
                }`}
              />

              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-japanese font-black text-2xl shadow-md transition-all duration-300 ${
                  senseiSpeaking ? 'bg-[#4A7C59] scale-105 shadow-[#4A7C59]/30' : 'bg-[#2B4C7E]'
                }`}
              >
                先
              </div>
            </div>

            {/* Speaking State Pill */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  senseiSpeaking
                    ? 'bg-[#4A7C59] animate-ping'
                    : isMuted
                    ? 'bg-stone-400'
                    : isPttMode
                    ? isPttActive
                      ? 'bg-[#4A7C59] animate-pulse'
                      : 'bg-stone-400'
                    : 'bg-[#2B4C7E] animate-pulse'
                }`}
              />
              <span className="text-xs font-bold text-stone-700 tracking-wide">
                {senseiSpeaking
                  ? 'Sensei is speaking (聞いてください)...'
                  : isMuted
                  ? 'Microphone is muted'
                  : isPttMode
                  ? isPttActive
                    ? 'Transmitting voice to Sensei...'
                    : 'Push-to-Talk active (Hold button or Space to speak)'
                  : 'Listening... (Speak in Japanese or English)'}
              </span>
            </div>

            {/* Push-to-Talk Hold to Speak Button */}
            {isPttMode && (
              <div className="mt-3.5 w-full flex flex-col items-center">
                <button
                  type="button"
                  onPointerDown={handlePttDown}
                  onPointerUp={handlePttUp}
                  onPointerCancel={handlePttUp}
                  onPointerLeave={handlePttUp}
                  className={`w-full max-w-sm py-2.5 px-6 rounded-xl font-bold text-xs select-none transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-xs ${
                    isPttActive
                      ? 'bg-[#4A7C59] text-white scale-[0.98] ring-4 ring-[#4A7C59]/30 shadow-inner'
                      : 'bg-[#2B4C7E] hover:bg-[#1E3A63] text-white active:scale-95'
                  }`}
                >
                  <Mic size={15} className={isPttActive ? 'animate-bounce' : ''} />
                  <span>{isPttActive ? 'Transmitting... (Release to send)' : 'Hold to Speak (or hold Spacebar)'}</span>
                </button>
                <span className="text-[10px] text-stone-400 mt-1 font-mono">
                  {isPttActive ? '🎙️ Microphone active • Background muted' : 'Press & hold while talking'}
                </span>
              </div>
            )}

            {!isPttMode && (
              <p className="text-[11px] text-stone-400 mt-1">
                Natural conversation • Automatic barge-in • Marathi pronunciation tips
              </p>
            )}
          </div>

          {/* Dialogue Transcript Feed */}
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-4 shadow-xs flex-1 flex flex-col min-h-[320px] max-h-[460px]">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#E5E0D8]">
              <span className="text-xs font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1.5">
                <Sparkles size={13} className="text-[#2B4C7E]" />
                Live Dialogue Transcript
              </span>
              <span className="text-[11px] font-mono text-stone-400">
                {transcripts.length} turns recorded
              </span>
            </div>

            {/* Transcript Messages Container */}
            <div
              ref={transcriptScrollRef}
              className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-stone-200"
            >
              {transcripts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-8 text-stone-400">
                  <p className="text-sm font-semibold mb-1">Call is connected!</p>
                  <p className="text-xs max-w-xs">
                    Say <span className="font-japanese font-bold text-stone-600">「こんにちは、先生！」</span> to start.
                  </p>
                </div>
              ) : (
                transcripts.map((t) => (
                  <div
                    key={t.id}
                    className={`flex flex-col ${t.role === 'user' ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs leading-relaxed ${
                        t.role === 'user'
                          ? 'bg-[#2B4C7E] text-white rounded-tr-xs'
                          : 'bg-[#EDF5EF] text-[#233E2B] border border-[#C5DEC9] rounded-tl-xs'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 opacity-80 text-[10px]">
                        <span className="font-bold">
                          {t.role === 'user' ? user?.name || 'You' : 'Nihongo Sensei (先生)'}
                        </span>
                        {t.time && <span className="font-mono text-[9px]">{t.time}</span>}
                      </div>
                      <p className="whitespace-pre-wrap font-sans text-xs">{t.text}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Fallback Text Input Bar */}
            <form onSubmit={handleSendText} className="pt-3 mt-2 border-t border-[#E5E0D8] flex items-center gap-2">
              <input
                type="text"
                value={typedInput}
                onChange={(e) => setTypedInput(e.target.value)}
                onFocus={() => {
                  isInputFocusedRef.current = true;
                }}
                onBlur={() => {
                  isInputFocusedRef.current = false;
                }}
                placeholder="Type a message to Sensei if mic is disabled..."
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] text-stone-800 focus:outline-none focus:border-[#2B4C7E] placeholder:text-stone-400"
              />
              <button
                type="submit"
                disabled={!typedInput.trim()}
                className="px-3 py-2 rounded-xl bg-[#2B4C7E] text-white text-xs font-bold hover:bg-[#1E3A63] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Send size={13} />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </div>
        </div>

        {/* Right Column (5 cols): Interactive Whiteboard */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="bg-white rounded-2xl border border-[#E5E0D8] p-4 shadow-xs flex-1 flex flex-col min-h-[480px]">
            {/* Whiteboard Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#E5E0D8] mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-stone-700">
                  <BookOpen size={13} className="text-[#2B4C7E]" />
                </div>
                <div>
                  <h2 className="text-xs sm:text-sm font-extrabold text-stone-900 font-japanese">
                    先生のホワイトボード
                  </h2>
                  <span className="text-[10px] text-stone-500 font-sans block">
                    Sensei's Interactive Whiteboard
                  </span>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#4A7C59]/10 text-[#4A7C59] border border-[#4A7C59]/20">
                {whiteboardCards.length} cards
              </span>
            </div>

            {/* Whiteboard Cards Scroll Container */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-stone-200">
              {whiteboardCards.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4 text-stone-400">
                  <div className="w-12 h-12 rounded-2xl bg-[#FAF8F5] border border-[#E5E0D8] flex items-center justify-center text-stone-400 mb-3">
                    <Sparkles size={20} />
                  </div>
                  <p className="text-xs font-bold text-stone-700 mb-1">
                    Whiteboard is Ready
                  </p>
                  <p className="text-[11px] max-w-xs leading-relaxed text-stone-500">
                    As Sensei teaches vocabulary, Kana, and pronunciation traps, cards will appear here in real time.
                  </p>
                </div>
              ) : (
                whiteboardCards.map((card, idx) => (
                  <motion.div
                    key={`${card.japanese}-${idx}`}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    className="p-3.5 rounded-xl bg-[#FAF8F5] border border-[#E5E0D8] hover:border-[#2B4C7E]/40 transition-colors shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      {/* Main Japanese Script + Romaji via JpText */}
                      <div className="text-base font-bold text-stone-900 font-japanese">
                        <JpText japanese={card.japanese} romaji={card.romaji} />
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* Manual Tap-to-Play Audio Preview (Never Auto-Played) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const cleanJp = (card.japanese || "").replace(/[\(（\[【][^()（）\[\]【】]*[\)）\]】]/g, '').trim();
                            if (cleanJp) {
                              const audio = new Audio(`/static/audio/${encodeURIComponent(cleanJp)}.mp3`);
                              audio.play().catch(() => {});
                            }
                          }}
                          className="p-1 rounded-md text-stone-400 hover:text-[#2B4C7E] hover:bg-white border border-transparent hover:border-[#E5E0D8] transition-colors cursor-pointer"
                          title="Tap to listen to pronunciation"
                          aria-label="Play pronunciation"
                        >
                          <Volume2 size={14} />
                        </button>

                        {/* Romaji pill */}
                        {card.romaji && (
                          <span className="px-2 py-0.5 rounded-md bg-white border border-[#E5E0D8] font-mono text-[10px] font-semibold text-stone-600">
                            {card.romaji}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* English Meaning */}
                    {card.english && (
                      <p className="text-xs font-semibold text-stone-800 mb-1.5">
                        {card.english}
                      </p>
                    )}

                    {/* Marathi / Phonetic Nuance Tip */}
                    {card.tip && (
                      <div className="p-2 rounded-lg bg-[#EDF5EF] border border-[#C5DEC9] text-[11px] text-[#233E2B] leading-relaxed flex items-start gap-1.5">
                        <span className="font-bold text-[10px] shrink-0">💡 Note:</span>
                        <span>{card.tip}</span>
                      </div>
                    )}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
