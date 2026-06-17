import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { GitCommit, Sparkles, RefreshCw, ChevronRight } from "lucide-react";
import { Thought, BinaryPair } from "../../types";

interface BinaryFrameProps {
  topic: string;
  onAddThought: (text: string) => void;
  thoughts: Thought[];
}

export default function BinaryFrame({ topic, onAddThought, thoughts }: BinaryFrameProps) {
  const [currentPair, setCurrentPair] = useState<BinaryPair | null>(null);
  const [loading, setLoading] = useState(false);
  const [customValue, setCustomValue] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [bracketsCount, setBracketsCount] = useState(0);

  useEffect(() => {
    fetchPair();
  }, [topic]);

  const fetchPair = async () => {
    setLoading(true);
    setShowCustomInput(false);
    setCustomValue("");
    try {
      const response = await fetch("/api/session/binary-bracket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          recentThoughts: thoughts.slice(0, 8),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.optionA && data.optionB) {
          setCurrentPair({
            id: crypto.randomUUID(),
            optionA: data.optionA,
            optionB: data.optionB,
          });
        } else {
          throw new Error("Invalid response format");
        }
      } else {
        throw new Error("HTTP error " + response.status);
      }
    } catch (e) {
      console.error(e);
      setCurrentPair({
        id: crypto.randomUUID(),
        optionA: "Option A: I feel stuck because I am worried about making a mistake and burning valuable bridges.",
        optionB: "Option B: I feel stuck because deep down I don't actually believe this plan is worth pursuing.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (choice: "A" | "B" | "custom") => {
    if (!currentPair) return;

    let textSelection = "";
    if (choice === "A") textSelection = currentPair.optionA;
    else if (choice === "B") textSelection = currentPair.optionB;
    else textSelection = `Neither, my truth is: ${customValue.trim()}`;

    onAddThought(`Core Belief Lock: Chosen between angles -> "${textSelection}"`);
    setBracketsCount((prev) => prev + 1);
    fetchPair();
  };

  return (
    <div className="space-y-6" id="binary-frame-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <GitCommit className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Binary Frame / Bracket</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Compare two deep framings of your current situation. Ask yourself: “Which feels *more true* right now?” We'll use your choices to lock down your core beliefs.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-450 flex flex-col items-center justify-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-500" />
          <span className="text-xs font-medium">Drilling deep and shaping contrasting framings...</span>
        </div>
      ) : currentPair ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between text-[11px] text-slate-450">
            <span>Narrowing down beliefs</span>
            <span>{bracketsCount} brackets resolved</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Option A card */}
            <motion.button
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleSelectOption("A")}
              className="flex flex-col justify-between text-left p-6 bg-white border border-slate-200 rounded-2xl hover:border-emerald-400 hover:shadow-xs active:bg-slate-50 cursor-pointer text-sm font-medium transition"
            >
              <div className="space-y-3">
                <span className="inline-block bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Framing A
                </span>
                <p className="text-slate-750 font-normal leading-relaxed text-xs">
                  "{currentPair.optionA}"
                </p>
              </div>
              <span className="text-[10px] text-emerald-600 mt-5 font-bold flex items-center gap-1.5 shrink-0">
                This feels more true
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </motion.button>

            {/* Option B card */}
            <motion.button
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleSelectOption("B")}
              className="flex flex-col justify-between text-left p-6 bg-white border border-slate-200 rounded-2xl hover:border-teal-400 hover:shadow-xs active:bg-slate-50 cursor-pointer text-sm font-medium transition"
            >
              <div className="space-y-3">
                <span className="inline-block bg-teal-50 text-teal-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Framing B
                </span>
                <p className="text-slate-750 font-normal leading-relaxed text-xs">
                  "{currentPair.optionB}"
                </p>
              </div>
              <span className="text-[10px] text-teal-600 mt-5 font-bold flex items-center gap-1.5 shrink-0">
                This feels more true
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </motion.button>
          </div>

          {/* Escape hatch "something else" entry */}
          <div className="pt-2">
            {!showCustomInput ? (
              <button
                onClick={() => setShowCustomInput(true)}
                className="text-xs text-indigo-600 hover:underline cursor-pointer"
              >
                Or represents something else entirely?
              </button>
            ) : (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="p-4 border border-slate-200/80 rounded-xl bg-slate-50 space-y-3"
              >
                <span className="block text-xs font-semibold text-slate-700">
                  Write down your own alternative interpretation:
                </span>
                <input
                  type="text"
                  placeholder="e.g., Neither, I think I'm actually just feeling..."
                  value={customValue}
                  onChange={(e) => setCustomValue(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none"
                />
                <div className="flex gap-2 justify-end text-[11px]">
                  <button
                    onClick={() => setShowCustomInput(false)}
                    className="px-3 py-1.5 border hover:bg-white text-slate-500 rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!customValue.trim()}
                    onClick={() => handleSelectOption("custom")}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    Confirm Custom framing
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
