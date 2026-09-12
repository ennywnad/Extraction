import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Zap, ChevronRight, HelpCircle, AlertTriangle, RefreshCw, Sparkles } from "lucide-react";
import { Thought } from "../../types";
import { askModel } from "../../utils/askModel";
import { recordAnswer } from "../../utils/lastAnswer";

interface QuickFireProps {
  topic: string;
  intention: string;
  onAddThought: (text: string) => void;
  thoughts: Thought[];
}

export default function QuickFire({ topic, intention, onAddThought, thoughts }: QuickFireProps) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);

  // Character limit rules
  const wordCount = inputValue.trim().split(/\s+/).filter(Boolean).length;
  const isTooLong = wordCount > 7;

  useEffect(() => {
    fetchPrompts();
  }, [topic]);

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const response = await askModel("/api/session/quick-fire", {
        topic,
        intention,
        pastThoughts: thoughts.slice(0, 10),
      });
      if (response.ok) {
        const data = await response.json();
        recordAnswer("quick fire", response.headers, data);
        if (data.prompts && data.prompts.length > 0) {
          setPrompts(data.prompts);
        } else {
          throw new Error("Invalid response format");
        }
      } else {
        throw new Error("HTTP error " + response.status);
      }
    } catch (e) {
      console.error(e);
      // Fallback fallback lists
      setPrompts([
        "What word comes up when you think about this first?",
        "Who is driving the fear or reservation here?",
        "What are you pretending is fine when it's not?",
        "If you could press a button and bypass this, what's different?",
        "What is the single absolute block holding you back?",
        "Who are you jealous of right now in relation to this?",
        "What's the worst-case scenario you're avoiding?",
        "What would you do if money wasn't a question?",
        "Describe your level of excitement from 1 to 10.",
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (inputValue.trim()) {
      onAddThought(`Q: "${prompts[currentIndex]}" -> A: "${inputValue.trim()}"`);
      setInputValue("");
      setCompletedCount((prev) => prev + 1);
    }

    if (currentIndex < prompts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      // Re-fetch prompts with current history
      fetchPrompts();
      setCurrentIndex(0);
    }
  };

  const handleSkip = () => {
    setInputValue("");
    if (currentIndex < prompts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCurrentIndex(0);
    }
  };

  const currentPrompt = prompts[currentIndex] || "Loading quickfire questions...";

  return (
    <div className="space-y-6" id="quickfire-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-xs text-slate-800">Quick Fire Mode</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Volley speed questions. Write immediate 1-7 word answers to unblock raw instinct! Skip
            what doesn't land.
          </p>
        </div>
        <button
          onClick={fetchPrompts}
          className="p-1.5 hover:bg-slate-200/50 rounded-lg text-slate-400 hover:text-slate-700 transition"
          title="Reload AI Deck"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
          <span className="text-xs font-medium">Customizing provocative speed questions...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Progress gauge */}
          <div className="flex items-center justify-between text-[11px] text-slate-400 border-b border-slate-100 pb-2">
            <span>
              Question {currentIndex + 1} of {prompts.length}
            </span>
            <span>{completedCount} answered this session</span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={currentPrompt}
              initial={{ opacity: 0, x: 15 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -15 }}
              className="p-6 bg-linear-to-b from-indigo-50/40 to-indigo-50/10 border border-indigo-100/50 rounded-2xl text-center shadow-2xs"
            >
              <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight leading-relaxed max-w-xl mx-auto font-sans">
                {currentPrompt}
              </h2>
            </motion.div>
          </AnimatePresence>

          <div className="space-y-2">
            <div className="relative">
              <input
                type="text"
                placeholder="Give your immediate raw gut answer..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !isTooLong && handleNext()}
                className={`w-full text-sm border focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 rounded-xl px-4 py-3 bg-white ${
                  isTooLong
                    ? "border-amber-400 focus:ring-amber-500/10 focus:border-amber-500"
                    : "border-slate-200"
                }`}
              />
              <span
                className={`absolute right-4 top-3 text-[10px] font-bold ${isTooLong ? "text-amber-500" : "text-slate-400"}`}
              >
                {wordCount} / 7 words
              </span>
            </div>

            <AnimatePresence>
              {isTooLong && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg border border-amber-100 font-medium"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>
                    Velocity warning: Answer is {wordCount} words! Keep it under 7 words to maximize
                    intuitive flow.
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handleSkip}
              className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-xs hover:bg-slate-50 transition font-medium cursor-pointer"
            >
              Skip Prompt
            </button>
            <button
              disabled={!inputValue.trim()}
              onClick={handleNext}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
            >
              Next Prompt
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
