import { useState } from "react";
import { BookOpen, ChevronRight, Check } from "lucide-react";
import { SentencePrompt } from "../../types";

interface SentenceCompletionProps {
  onAddThought: (text: string) => void;
}

const TEMPLATES: SentencePrompt[] = [
  { id: "1", prefix: "The thing I keep not saying is..." },
  { id: "2", prefix: "If I'm honest, what I actually want is..." },
  { id: "3", prefix: "I think I'm more worried about than I'm admitting because..." },
  { id: "4", prefix: "The version of me I want to be would handle this by..." },
  { id: "5", prefix: "The real question isn't whether this works, it's..." },
  {
    id: "6",
    prefix:
      "If I could tell the primary stakeholders one thing without consequences, it would be...",
  },
];

export default function SentenceCompletion({ onAddThought }: SentenceCompletionProps) {
  const [prompts, setPrompts] = useState<SentencePrompt[]>(TEMPLATES);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completion, setCompletion] = useState("");

  const handleSave = () => {
    if (!completion.trim()) return;
    const activePrompt = prompts[currentIndex];
    onAddThought(`Incomplete Answer Lock: "${activePrompt.prefix} ${completion.trim()}"`);
    setCompletion("");

    if (currentIndex < prompts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    setCompletion("");
    if (currentIndex < prompts.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  const activePrompt = prompts[currentIndex];

  return (
    <div className="space-y-6" id="sentence-completion-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <BookOpen className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Finish the Sentence</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Fill in the blank sentence starters tailored to bypass your verbal self-editor. Jump off
            from the template and let the response take care of itself.
          </p>
        </div>
      </div>

      {currentIndex < prompts.length ? (
        <div className="space-y-5">
          <div className="p-6 bg-violet-50/20 border border-violet-100 rounded-2xl">
            <span className="text-[10px] uppercase font-bold tracking-wider text-violet-500 block mb-2">
              Prompt {currentIndex + 1} of {prompts.length}
            </span>
            <span className="text-base font-bold text-slate-800 font-sans">
              "{activePrompt.prefix}"
            </span>
          </div>

          <div className="space-y-2">
            <span className="block text-xs font-semibold text-slate-600">
              Complete the prompt statement:
            </span>
            <input
              type="text"
              placeholder="e.g., ...I'm sacrificing sleep and autonomy hoping things will solve themselves"
              value={completion}
              onChange={(e) => setCompletion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && completion.trim() && handleSave()}
              className="w-full text-sm border border-slate-200 focus:ring-2 focus:ring-violet-500/15 focus:border-violet-500 rounded-xl p-3"
            />
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={handleSkip}
              className="px-4 py-2 border border-slate-200 text-slate-500 rounded-xl text-xs hover:bg-slate-50 transition"
            >
              Skip
            </button>
            <button
              disabled={!completion.trim()}
              onClick={handleSave}
              className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50 text-xs font-semibold rounded-xl flex items-center gap-1 transition cursor-pointer"
            >
              Save Response
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 p-8 space-y-4">
          <div className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl inline-block">
            <Check className="w-8 h-8" />
          </div>
          <h2 className="text-base font-bold text-slate-800">Templates Complete!</h2>
          <p className="text-xs text-slate-500">
            All prompts resolved successfully. Proceed with outline synthesis!
          </p>
        </div>
      )}
    </div>
  );
}
