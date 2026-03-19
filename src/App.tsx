import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Languages, 
  MapPin, 
  Utensils, 
  PartyPopper, 
  ShoppingBag, 
  ChevronRight, 
  Mic, 
  MicOff, 
  Send, 
  ArrowLeft,
  Sparkles,
  Trophy,
  Info,
  Volume2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from './lib/utils';
import { 
  DIALECTS, 
  SCENARIOS, 
  TUTORS,
  Dialect, 
  Scenario, 
  Tutor,
  Accent,
  generateSpeech,
  getTutorResponse, 
  getFeedback,
  getLiveSession
} from './services/gemini';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function App() {
  const [step, setStep] = useState<'dialect' | 'accent' | 'tutor' | 'scenario' | 'chat' | 'feedback'>('dialect');
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [selectedDialect, setSelectedDialect] = useState<Dialect | null>(null);
  const [selectedAccent, setSelectedAccent] = useState<Accent | null>(null);
  const [selectedTutor, setSelectedTutor] = useState<Tutor | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [localCred, setLocalCred] = useState(0);
  const [feedback, setFeedback] = useState<any>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const audioQueueRef = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const initAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    return audioContextRef.current;
  };

  const playRawAudio = async (base64: string, sampleRate: number = 24000) => {
    const ctx = initAudioContext();
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }

    const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start();
  };

  // STT Setup
  useEffect(() => {
    if (typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsRecording(false);
      };

      recognitionRef.current.onerror = () => {
        setIsRecording(false);
      };
    }
  }, []);

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      recognitionRef.current?.start();
      setIsRecording(true);
    }
  };

  const speakText = async (text: string) => {
    if (!selectedTutor) return;
    try {
      const audioData = await generateSpeech(text, selectedTutor.voice);
      if (audioData) {
        playRawAudio(audioData, 24000);
      }
    } catch (error) {
      console.error('TTS Error:', error);
      // Fallback to web speech if Gemini TTS fails
      const utterance = new SpeechSynthesisUtterance(text);
      if (selectedAccent) {
        const voices = window.speechSynthesis.getVoices();
        const voice = voices.find(v => v.lang.toLowerCase().includes(selectedAccent.langCode.toLowerCase()));
        if (voice) utterance.voice = voice;
        utterance.lang = selectedAccent.langCode;
      }
      window.speechSynthesis.speak(utterance);
    }
  };

  const startLiveMode = async () => {
    if (!selectedDialect || !selectedTutor || !selectedAccent) return;
    
    setIsLiveMode(true);
    const session = await getLiveSession(selectedDialect, selectedTutor, selectedAccent, {
      onopen: () => {
        console.log('Live session opened');
        // Start microhpone streaming
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
          const ctx = new AudioContext({ sampleRate: 16000 });
          const source = ctx.createMediaStreamSource(stream);
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          
          source.connect(processor);
          processor.connect(ctx.destination);
          
          processor.onaudioprocess = (e) => {
            if (!isLiveMode) return;
            const inputData = e.inputBuffer.getChannelData(0);
            const int16Data = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              int16Data[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            const base64Data = btoa(String.fromCharCode(...new Uint8Array(int16Data.buffer)));
            session.sendRealtimeInput({
              audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
            });
          };
        });
      },
      onmessage: (message: any) => {
        if (message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data) {
          playRawAudio(message.serverContent.modelTurn.parts[0].inlineData.data, 24000);
        }
        if (message.serverContent?.modelTurn?.parts?.[0]?.text) {
          const text = message.serverContent.modelTurn.parts[0].text;
          setMessages(prev => [...prev, { role: 'model', text }]);
        }
      }
    });
    liveSessionRef.current = session;
  };

  const stopLiveMode = () => {
    setIsLiveMode(false);
    liveSessionRef.current?.close();
    liveSessionRef.current = null;
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedDialect || !selectedScenario || !selectedTutor || !selectedAccent || isLoading) return;

    const userMsg: Message = { role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
      const response = await getTutorResponse(selectedDialect, selectedScenario, selectedTutor, selectedAccent, history, input);
      if (response) {
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        // Simple TTS for the main response
        const mainPart = response.split('Local Tip:')[0];
        speakText(mainPart);
      }
    } catch (error) {
      console.error('Error getting response:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishSession = async () => {
    if (messages.length < 2 || !selectedDialect || !selectedScenario) return;
    setIsLoading(true);
    try {
      const conversation = messages.map(m => `${m.role}: ${m.text}`).join('\n');
      const result = await getFeedback(selectedDialect, selectedScenario, conversation);
      setFeedback(result);
      setLocalCred(prev => prev + result.pointsEarned);
      setStep('feedback');
    } catch (error) {
      console.error('Error getting feedback:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setStep('dialect');
    setSelectedDialect(null);
    setSelectedAccent(null);
    setSelectedTutor(null);
    setSelectedScenario(null);
    setMessages([]);
    setFeedback(null);
  };

  const renderMessageContent = (text: string) => {
    const parts = text.split('Local Tip:');
    const mainText = parts[0];
    const localTip = parts[1];

    // Try to extract slang and pronunciation from local tip
    // e.g., "Slang Term [pronunciation]"
    const slangMatch = localTip?.match(/([^\[]+)\[([^\]]+)\]/);
    const slangTerm = slangMatch ? slangMatch[1].trim() : null;
    const pronunciation = slangMatch ? slangMatch[2].trim() : null;

    return (
      <div className="space-y-3">
        <div className="prose prose-invert prose-sm">
          <Markdown>{mainText}</Markdown>
        </div>
        {localTip && (
          <div className="mt-3 pt-3 border-t border-blue-500/20 bg-blue-500/5 p-3 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Local Tip</span>
                {slangTerm && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                    {slangTerm}
                  </span>
                )}
              </div>
              <div className="flex gap-1">
                <button 
                  onClick={() => speakText(mainText)}
                  className="p-1.5 hover:bg-blue-500/20 rounded-full transition-colors group"
                  title="Hear full response"
                >
                  <Volume2 className="w-3.5 h-3.5 text-blue-400/60 group-hover:text-blue-400" />
                </button>
                <button 
                  onClick={() => speakText(localTip)}
                  className="p-1.5 hover:bg-blue-500/20 rounded-full transition-colors group"
                  title="Hear pronunciation"
                >
                  <Volume2 className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                </button>
              </div>
            </div>
            <div className="text-xs text-white/70 italic leading-relaxed">
              <Markdown>{localTip}</Markdown>
            </div>
            {pronunciation && (
              <div className="mt-2 text-[10px] text-blue-400/50 font-mono">
                Phonetic: {pronunciation}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#02050a] text-white font-sans selection:bg-blue-500/30">
      {/* Immersive Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/10 blur-[160px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[70%] h-[70%] bg-indigo-600/10 blur-[160px] rounded-full animate-pulse [animation-delay:2s]" />
        <div className="absolute top-[30%] left-[20%] w-[30%] h-[30%] bg-blue-400/5 blur-[120px] rounded-full" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <header className="relative z-10 p-6 flex justify-between items-center border-b border-white/5 backdrop-blur-md sticky top-0">
        <div className="flex items-center gap-3 cursor-pointer" onClick={reset}>
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Languages className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tighter">VERNACULAR</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-white/5 px-4 py-2 rounded-full border border-white/10">
            <Trophy className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">{localCred} <span className="text-white/40 ml-1">Local Cred</span></span>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-4xl mx-auto p-6 pt-12">
        <AnimatePresence mode="wait">
          {step === 'dialect' && (
            <motion.div
              key="dialect"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                <h2 className="text-4xl font-light italic serif">Where are we heading?</h2>
                <p className="text-white/50">Select a region to master its local vernacular.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {DIALECTS.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setSelectedDialect(d); setStep('accent'); }}
                    className="group relative p-8 bg-white/5 border border-white/10 rounded-[40px] text-left transition-all hover:bg-white/10 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10"
                  >
                    <div className="flex justify-between items-start mb-6">
                      <span className="text-5xl group-hover:scale-110 transition-transform">{d.flag}</span>
                      <div className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <ChevronRight className="w-5 h-5 text-white/20 group-hover:text-blue-500" />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{d.name}</h3>
                    <p className="text-sm text-white/40 leading-relaxed">{d.description}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'accent' && (
            <motion.div
              key="accent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <button 
                onClick={() => setStep('dialect')}
                className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Regions
              </button>
              <div className="space-y-2">
                <h2 className="text-4xl font-light italic serif">Choose your accent</h2>
                <p className="text-white/50">Select a specific regional accent for your tutor in {selectedDialect?.name}.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {selectedDialect?.accents.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedAccent(a); setStep('tutor'); }}
                    className="group p-6 bg-white/5 border border-white/10 rounded-3xl text-left transition-all hover:bg-white/10 hover:border-blue-500/50"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <Volume2 className="w-5 h-5 text-blue-500" />
                      </div>
                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <h3 className="text-lg font-bold mb-1">{a.name}</h3>
                    <p className="text-xs text-white/40 uppercase tracking-widest">{a.langCode}</p>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'tutor' && (
            <motion.div
              key="tutor"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <button 
                onClick={() => setStep('accent')}
                className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Accents
              </button>
              <div className="space-y-2">
                <h2 className="text-4xl font-light italic serif">Select your guide</h2>
                <p className="text-white/50">Who will be showing you the ropes in {selectedDialect?.name}?</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TUTORS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { setSelectedTutor(t); setStep('scenario'); }}
                    className="group relative p-8 bg-white/5 border border-white/10 rounded-[40px] text-center transition-all hover:bg-white/10 hover:border-blue-500/50 flex flex-col items-center hover:shadow-2xl hover:shadow-blue-500/10"
                  >
                    <div className="w-24 h-24 bg-blue-500/10 rounded-full flex items-center justify-center text-5xl mb-6 group-hover:scale-110 transition-transform shadow-inner">
                      {t.avatar}
                    </div>
                    <div className="mb-2">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest bg-blue-500/10 px-3 py-1 rounded-full">
                        {t.id === 'legend' ? 'Casual' : t.id === 'guide' ? 'Informative' : t.id === 'neighbor' ? 'Friendly' : t.id === 'artist' ? 'Creative' : 'Traditional'}
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{t.name}</h3>
                    <p className="text-xs text-white/40 leading-relaxed px-4">{t.personality}</p>
                    <div className="mt-8 px-6 py-2.5 bg-blue-500/20 rounded-full text-[10px] font-bold uppercase tracking-widest text-blue-400 opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0">
                      Select Personality
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'scenario' && (
            <motion.div
              key="scenario"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <button 
                onClick={() => setStep('tutor')}
                className="flex items-center gap-2 text-white/40 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Tutors
              </button>
              <div className="space-y-2">
                <h2 className="text-4xl font-light italic serif">Choose your situation</h2>
                <p className="text-white/50">Practice real-life conversations in {selectedDialect?.name}.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {SCENARIOS.map((s) => {
                  const Icon = s.id === 'restaurant' ? Utensils : s.id === 'party' ? PartyPopper : s.id === 'market' ? ShoppingBag : MapPin;
                  return (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedScenario(s); setStep('chat'); }}
                      className="group p-8 bg-white/5 border border-white/10 rounded-[40px] text-left transition-all hover:bg-white/10 hover:border-blue-500/50 hover:shadow-2xl hover:shadow-blue-500/10"
                    >
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
                        <Icon className="w-8 h-8 text-white/60 group-hover:text-blue-500" />
                      </div>
                      <h3 className="text-2xl font-bold mb-2">{s.title}</h3>
                      <p className="text-sm text-white/40 leading-relaxed">{s.description}</p>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col h-[75vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setStep('scenario')}
                    className="p-2 hover:bg-white/5 rounded-full transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center text-xl">
                      {selectedTutor?.avatar}
                    </div>
                    <div>
                      <h3 className="font-bold text-sm">{selectedTutor?.name}</h3>
                      <p className="text-[10px] text-white/40 uppercase tracking-widest">
                        {selectedScenario?.title} • {selectedAccent?.name} Accent
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={isLiveMode ? stopLiveMode : startLiveMode}
                    className={cn(
                      "px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2",
                      isLiveMode ? "bg-red-500 hover:bg-red-600" : "bg-emerald-600 hover:bg-emerald-700"
                    )}
                  >
                    <Mic className={cn("w-4 h-4", isLiveMode && "animate-pulse")} />
                    {isLiveMode ? 'Stop Live' : 'Live Mode'}
                  </button>
                  <button
                    onClick={handleFinishSession}
                    disabled={messages.length < 2 || isLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full text-sm font-medium transition-all"
                  >
                    Finish Session
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-6 pr-2 scrollbar-thin scrollbar-thumb-white/10">
                {messages.length === 0 && (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                    <Sparkles className="w-12 h-12" />
                    <p>Start the conversation! Try saying hello in your own way.</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: m.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(
                      "flex flex-col max-w-[85%]",
                      m.role === 'user' ? "ml-auto items-end" : "mr-auto items-start"
                    )}
                  >
                    <div className={cn(
                      "p-5 rounded-[32px] shadow-xl",
                      m.role === 'user' 
                        ? "bg-white/10 rounded-tr-none" 
                        : "bg-blue-600/10 border border-blue-500/20 rounded-tl-none backdrop-blur-sm"
                    )}>
                      {m.role === 'user' ? (
                        <div className="prose prose-invert prose-sm">
                          <Markdown>{m.text}</Markdown>
                        </div>
                      ) : (
                        renderMessageContent(m.text)
                      )}
                    </div>
                    <div className={cn(
                      "flex items-center gap-2 mt-2",
                      m.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}>
                      <span className="text-[10px] text-white/20 uppercase tracking-widest font-mono">
                        {m.role === 'user' ? 'You' : selectedTutor?.name}
                      </span>
                      {m.role === 'model' && (
                        <div className="w-1 h-1 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  </motion.div>
                ))}
                {isLoading && (
                  <div className="flex gap-2 p-4 bg-white/5 rounded-3xl w-24 items-center justify-center">
                    <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className="mt-6 relative">
                <div className="absolute -top-12 left-0 right-0 flex justify-center pointer-events-none">
                  <AnimatePresence>
                    {isRecording && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="bg-blue-600 px-4 py-1 rounded-full text-[10px] font-bold tracking-tighter uppercase"
                      >
                        Listening...
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                <div className="flex gap-2 p-2 bg-white/5 border border-white/10 rounded-full focus-within:border-blue-500/50 transition-all">
                  <button
                    onClick={toggleRecording}
                    className={cn(
                      "p-3 rounded-full transition-all",
                      isRecording ? "bg-red-500 text-white" : "hover:bg-white/10 text-white/60"
                    )}
                  >
                    {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Type your message..."
                    className="flex-1 bg-transparent border-none focus:ring-0 px-2 text-sm"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isLoading}
                    className="p-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-full transition-all"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 'feedback' && feedback && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              <div className="text-center space-y-4">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-blue-500/20 rounded-full mb-4">
                  <Trophy className="w-10 h-10 text-blue-500" />
                </div>
                <h2 className="text-4xl font-bold">Session Complete!</h2>
                <p className="text-white/50">You've earned <span className="text-blue-500 font-bold">+{feedback.pointsEarned}</span> Local Cred.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: 'Grammar', value: feedback.grammar },
                  { label: 'Slang Usage', value: feedback.slangUsage },
                  { label: 'Culture', value: feedback.culturalAccuracy }
                ].map((stat, i) => (
                  <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-3xl">
                    <p className="text-[10px] uppercase tracking-widest text-white/40 mb-2">{stat.label}</p>
                    <p className="text-sm leading-relaxed">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="p-8 bg-blue-600/10 border border-blue-500/20 rounded-[40px] space-y-4">
                <div className="flex items-center gap-2 text-blue-500">
                  <Info className="w-5 h-5" />
                  <h3 className="font-bold uppercase tracking-widest text-xs">Improvement Tips</h3>
                </div>
                <ul className="space-y-3">
                  {feedback.suggestions.map((s: string, i: number) => (
                    <li key={i} className="flex gap-3 text-sm text-white/70">
                      <span className="text-blue-500">•</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex justify-center pt-4">
                <button
                  onClick={reset}
                  className="px-8 py-4 bg-white text-black font-bold rounded-full hover:bg-white/90 transition-all"
                >
                  Start New Session
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="relative z-10 p-12 text-center text-white/20 text-[10px] uppercase tracking-[0.2em]">
        &copy; 2026 Vernacular AI • Group 10 Project
      </footer>
    </div>
  );
}
