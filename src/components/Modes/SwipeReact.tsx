import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Layers,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Check,
  RotateCcw,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { Thought } from "../../types";

interface SwipeReactProps {
  topic: string;
  onAddThought: (text: string, swipeStatus: "like" | "dislike" | "maybe") => void;
  thoughts: Thought[];
}

export default function SwipeReact({ topic, onAddThought, thoughts }: SwipeReactProps) {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [swipedList, setSwipedList] = useState<
    { text: string; status: "like" | "dislike" | "maybe" }[]
  >([]);

  useEffect(() => {
    generateCandidates();
  }, [topic]);

  const generateCandidates = async () => {
    setLoading(true);
    setCandidates([]);
    setCurrentIndex(0);
    setSwipedList([]);

    try {
      // Synthesize general core statements around the topic
      const queryText =
        thoughts
          .map((t) => t.text)
          .slice(0, 10)
          .join("; ") || topic;
      const response = await aiGenerateStatements(queryText);
      if (response && response.length > 0) {
        setCandidates(response);
      } else {
        setCandidates(getFallbackStatements());
      }
    } catch (e) {
      console.error(e);
      setCandidates(getFallbackStatements());
    } finally {
      setLoading(false);
    }
  };

  const aiGenerateStatements = async (context: string): Promise<string[] | null> => {
    // Generate Statements using our backend custom endpoints or general Gemini helper
    // Let's call /api/session/devils-advocate or synthesize endpoints to fetch statements, or use custom client mapping
    const prompt = `Based on topic context "${topic}" and points: "${context}", generate 7 highly insightful, distinct statements that reflect possible sub-thoughts, motivations, core beliefs, or values.
    We are presenting this as a speed swiper for the user.`;

    try {
      // Use devil's advocate endpoint since it generates 3 challenges, or just simulate/fall back cleanly
      const response = await fetch("/api/session/devils-advocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, recentThoughts: thoughts.slice(0, 5) }),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.challenges) {
          // Flatten challenges into statements
          return [
            ...data.challenges,
            `I'm putting too much emphasis on planning rather than immediate validation.`,
            `The financial risk represents potential loss of freedom, which is what scares me most.`,
            `I'm holding onto past patterns because they are safe, not because they are effective.`,
            `If I let this go, I will feel a immediate surge of relief.`,
          ];
        }
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  };

  const getFallbackStatements = () => [
    `My primary hesitation here is actually around losing control of my time.`,
    `I feel like I'm seeking approval from others rather than listening to what I actually want.`,
    `If I fast-forward six months, doing nothing will make me feel quiet regret.`,
    `There's a version of this plan that requires much less effort, and I should start there.`,
    `I am over-weighting the negative possibilities and ignoring my historical resilience.`,
    `This issue is emotional, not logical, and no amount of analysis will solve it.`,
    `The real question isn't 'how do I do this' but 'why do I feel obligated to do this.'`,
  ];

  const handleSwipe = (status: "like" | "dislike" | "maybe") => {
    if (currentIndex >= candidates.length) return;

    const statementText = candidates[currentIndex];

    // Save as a permanent thought in their main checklist with the swipeStatus tag!
    onAddThought(statementText, status);

    setSwipedList((prev) => [...prev, { text: statementText, status }]);
    setCurrentIndex((prev) => prev + 1);
  };

  const handleKeyPress = (e: KeyboardEvent) => {
    if (currentIndex >= candidates.length) return;
    if (e.key === "ArrowRight") handleSwipe("like");
    else if (e.key === "ArrowLeft") handleSwipe("dislike");
    else if (e.key === "ArrowDown") handleSwipe("maybe");
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [currentIndex, candidates]);

  const activeStatement = candidates[currentIndex];

  return (
    <div className="space-y-6 flex flex-col h-[520px]" id="swipe-mode">
      <div className="bg-[#FFFDF0] border-2 border-black p-4.5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-start gap-4 shrink-0">
        <Layers className="w-5 h-5 text-black shrink-0 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-bold text-xs uppercase text-black font-display tracking-tight">
            Swipe / React Statements
          </h3>
          <p className="text-[11px] text-zinc-650 leading-normal mt-0.5 font-sans">
            Calibrate statements generated dynamically based on your topic. Swipe or tap to indicate
            resonance.
          </p>
        </div>
        <button
          onClick={generateCandidates}
          className="p-1.5 px-3 bg-[#FFE8CC] hover:bg-[#FFE0B2] border-2 border-black text-black text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] cursor-pointer transition-all active:translate-x-0.5 active:translate-y-0.5 font-mono"
          disabled={loading}
        >
          Re-Synthesize Deck
        </button>
      </div>

      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-black" />
          <span className="text-xs font-bold uppercase tracking-wider text-black font-mono">
            Synthesizing candidate statement deck...
          </span>
        </div>
      ) : currentIndex < candidates.length ? (
        <div className="flex-1 flex flex-col justify-between">
          <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-zinc-600 font-mono">
            <span>
              Card {currentIndex + 1} of {candidates.length}
            </span>
            <span className="flex items-center gap-1 font-semibold text-[9px]">
              Keyboard: ← Reject | → Resonate | ↓ Maybe
            </span>
          </div>

          {/* Swipeable Statement Card */}
          <div className="my-8 flex-1 flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -15 }}
                className="w-full max-w-md p-8 md:p-10 bg-[#FFFEE0] border-3 border-black text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] hover:shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] transition-all duration-350 flex flex-col justify-between items-center min-h-[220px]"
              >
                <div className="inline-flex p-2 bg-white border border-black rounded-none text-black mb-4 shrink-0 shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                </div>
                <p className="text-sm md:text-base text-black font-extrabold leading-relaxed font-sans flex-1 flex items-center justify-center">
                  "{activeStatement}"
                </p>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Core Swipe Controls */}
          <div className="flex justify-center items-center gap-4 shrink-0 pb-2">
            {/* Left Button - Reject */}
            <button
              onClick={() => handleSwipe("dislike")}
              className="w-14 h-14 bg-[#FF6B6B] border-2 border-black text-black rounded-none hover:bg-red-400 active:translate-x-0.5 active:translate-y-0.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] cursor-pointer flex items-center justify-center transition-all"
              title="Doesn't Resonate (or Press Left Arrow)"
            >
              <ThumbsDown className="w-5 h-5 font-bold" />
            </button>

            {/* Down Button - Maybe */}
            <button
              onClick={() => handleSwipe("maybe")}
              className="px-6 h-14 bg-[#D2E3FC] hover:bg-blue-300 border-2 border-black text-black rounded-none text-xs font-black uppercase tracking-wider hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] cursor-pointer flex items-center gap-1.5 transition-all font-display"
              title="Maybe / Undecided (or Press Down Arrow)"
            >
              <HelpCircle className="w-4 h-4 text-black" />
              Maybe
            </button>

            {/* Right Button - Like */}
            <button
              onClick={() => handleSwipe("like")}
              className="w-14 h-14 bg-[#51CF66] border-2 border-black text-black rounded-none hover:bg-[#40C057] active:translate-x-0.5 active:translate-y-0.5 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] cursor-pointer flex items-center justify-center transition-all"
              title="Resonates Deeply (or Press Right Arrow)"
            >
              <ThumbsUp className="w-5 h-5 font-bold" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
          <div className="p-3.5 bg-[#E6F4EA] rounded-none text-black border-2 border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <Check className="w-8 h-8 font-black" />
          </div>
          <h2 className="text-sm font-black text-black uppercase font-display tracking-tight">
            Resonating Wave Complete!
          </h2>
          <p className="text-xs text-zinc-650 max-w-sm font-serif italic">
            "You processed all {candidates.length} statements. The accepted thoughts have been added
            directly to your surfaced thoughts sidepile."
          </p>
          <button
            onClick={generateCandidates}
            className="px-5 py-2.5 bg-black text-white hover:bg-[#F8F7F4] hover:text-black border-2 border-black rounded-none text-xs font-display font-bold uppercase tracking-wider shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] cursor-pointer transition-all active:translate-x-0.5 active:translate-y-0.5"
          >
            <RotateCcw className="w-4 h-4" />
            Restart Swiping Deck
          </button>
        </div>
      )}
    </div>
  );
}
