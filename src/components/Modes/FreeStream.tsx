import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Mic, MicOff, AlertCircle, Sparkles, Send } from "lucide-react";
import { Thought } from "../../types";
import AssistBar from "../AssistBar";

interface FreeStreamProps {
  topic: string;
  onAddThought: (text: string) => void;
}

const PASSIVE_GUIDES = [
  "What else comes up when you look at this?",
  "What are you not saying yet?",
  "Say more about the hardest part of this.",
  "Is there a feeling in your gut that doesn't have a word yet?",
  "What would you say if nobody was judging you?",
];

export default function FreeStream({ topic, onAddThought }: FreeStreamProps) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [guideIndex, setGuideIndex] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Trigger guide prompt after 10 seconds of inactivity
  useEffect(() => {
    resetIdleTimer();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [text, isRecording]);

  const resetIdleTimer = () => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setShowGuide(false);

    idleTimerRef.current = setTimeout(() => {
      // Pick a random guide
      const nextIdx = Math.floor(Math.random() * PASSIVE_GUIDES.length);
      setGuideIndex(nextIdx);
      setShowGuide(true);
    }, 12000); // 12 seconds
  };

  const handleSubmit = () => {
    if (!text.trim()) return;
    onAddThought(text.trim());
    setText("");
    setShowGuide(false);
  };

  // Simulated Dictation
  const [recordingTimer, setRecordingTimer] = useState<number | null>(null);
  const startRecording = () => {
    setIsRecording(true);
    let count = 0;
    const interval = setInterval(() => {
      count++;
      if (count > 5) {
        // Auto-transcribe a thought based on the topic
        const simulatedPhrases = [
          `Actually, looking at this, my primary block is that I'm overthinking the outcome rather than focusing on the initial framework.`,
          `There's a subtle dread when thinking about Monday morning because of the lack of autonomy in my current project stack.`,
          `I want to do this, but I'm worried about what happens if I waste money on a side concept that fails in a month.`,
        ];
        const randomPhrase = simulatedPhrases[Math.floor(Math.random() * simulatedPhrases.length)];
        setText((prev) => (prev ? prev + " " + randomPhrase : randomPhrase));
        setIsRecording(false);
        clearInterval(interval);
      }
    }, 1000);
  };

  return (
    <div className="space-y-6" id="free-stream-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Free Stream Mode</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            This is a blank slate. Write whatever comes to mind about{" "}
            <strong className="text-slate-700 font-medium">{topic}</strong>. No formatting, no
            censoring, no interruptions.
          </p>
        </div>
      </div>

      <div className="relative">
        <textarea
          rows={8}
          placeholder="Dump your thoughts here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full text-sm border border-slate-200 focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 rounded-2xl p-4 placeholder:text-slate-400 bg-linear-to-b from-slate-50/20 to-white shadow-2xs resize-none"
        />

        {/* Dictation Simulation button */}
        <div className="absolute right-4 bottom-4 flex items-center gap-2">
          {isRecording ? (
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: [1, 1.1, 1], rotate: [0, 2, -2, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              onClick={() => setIsRecording(false)}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs whitespace-nowrap"
            >
              <MicOff className="w-3.5 h-3.5 shrink-0" />
              <span>Listening (Talking out loud)...</span>

              {/* Bouncing waves */}
              <div className="flex gap-0.5 items-center">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-1 bg-white rounded-full animate-bounce"
                    style={{
                      height: "10px",
                      animationDelay: `${i * 0.15}s`,
                      animationDuration: "0.8s",
                    }}
                  />
                ))}
              </div>
            </motion.div>
          ) : (
            <button
              onClick={startRecording}
              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-semibold hover:bg-indigo-100/50 transition cursor-pointer whitespace-nowrap"
              title="Voice Dictation Simulator"
            >
              <Mic className="w-3.5 h-3.5 shrink-0" />
              <span>Simulate Voice</span>
            </button>
          )}
        </div>
      </div>

      {/* Dynamic passive guide presentation */}
      <AnimatePresence>
        {showGuide && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2.5 p-3 bg-amber-50 border border-amber-100 text-amber-800 rounded-xl"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="text-xs font-medium italic">"{PASSIVE_GUIDES[guideIndex]}"</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Between the box and the submit button, which is where docs/intents/006 argues a filing
          decision belongs: after you have written, as you are about to submit, and never
          hovering while you type. */}
      <AssistBar text={text} />

      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-400">
          Tip: Hit Submit to add these ideas to your permanent list pile.
        </span>
        <button
          disabled={!text.trim()}
          onClick={handleSubmit}
          className={`flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition cursor-pointer ${
            !text.trim() ? "opacity-50 cursor-not-allowed" : ""
          }`}
        >
          <Send className="w-3.5 h-3.5" />
          Capture Idea
        </button>
      </div>
    </div>
  );
}
