import { useState } from "react";
import { motion } from "motion/react";
import { MailOpen, Send, Sparkles, AlertCircle, Eye } from "lucide-react";

interface LetterWritingProps {
  onAddThought: (text: string) => void;
}

const LETTER_TEMPLATES = [
  {
    key: "person",
    label: "Letter to a Key Person",
    desc: "Write honestly to someone involved without pressing send.",
  },
  { key: "future", label: "Letter to Future Self", desc: "Dear me in one year..." },
  {
    key: "past",
    label: "Letter from Past Self",
    desc: "What would past-me want present-me to remember?",
  },
  {
    key: "situation",
    label: "Letter to the Situation",
    desc: "Address the job, relationship, or project directly.",
  },
];

export default function LetterWriting({ onAddThought }: LetterWritingProps) {
  const [activeKey, setActiveKey] = useState<string>("person");
  const [recipient, setRecipient] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [surprisedText, setSurprisedText] = useState("");

  const handleSubmitLetter = () => {
    if (!bodyText.trim()) return;

    const recipientTitle = activeKey === "person" ? recipient || "Stakeholder" : activeKey;
    const rawThought = `Letter Fragment addressed to [${recipientTitle}]:\n\n${bodyText.trim()}`;

    onAddThought(rawThought);
    setSubmitted(true);
  };

  const handleSaveReflection = () => {
    if (surprisedText.trim()) {
      onAddThought(`Reflection on written letter: "${surprisedText.trim()}"`);
    }
    // Reset state
    setBodyText("");
    setRecipient("");
    setSurprisedText("");
    setSubmitted(false);
  };

  return (
    <div className="space-y-6" id="letter-writing-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <MailOpen className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Letter Writing Drill</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Address someone directly, bypass your fears, and write with complete, unfiltered
            honesty. We won't share this letter; the exercise aims purely to surface raw feelings.
          </p>
        </div>
      </div>

      {!submitted ? (
        <div className="space-y-5">
          {/* Deck Select tabs block */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {LETTER_TEMPLATES.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  setActiveKey(item.key);
                  setBodyText("");
                }}
                className={`p-3 border rounded-xl text-left cursor-pointer transition flex flex-col justify-between ${
                  activeKey === item.key
                    ? "border-orange-450 bg-orange-50/20 text-slate-900"
                    : "border-slate-100 hover:bg-slate-50 text-slate-505"
                }`}
              >
                <span className="block text-[11px] font-bold">{item.label}</span>
                <span className="block text-[8px] text-slate-400 mt-1 line-clamp-2 leading-normal">
                  {item.desc}
                </span>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {activeKey === "person" && (
              <div className="space-y-1.5 animate-fadeIn">
                <span className="block text-xs font-semibold text-slate-600">
                  Who is this letter addressed to?
                </span>
                <input
                  type="text"
                  placeholder="e.g., My manager, parent, business partner..."
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  className="w-full text-xs border border-slate-200 focus:ring-1 focus:ring-orange-400 focus:outline-none rounded-lg p-2 bg-white"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <span className="block text-xs font-semibold text-slate-600">
                Write your letter below:
              </span>
              <textarea
                rows={6}
                placeholder="Write with absolute, unshielded truth..."
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                className="w-full text-sm border border-slate-200 focus:ring-2 focus:ring-orange-505/10 focus:border-orange-400 rounded-xl p-3 resize-none bg-white"
              />
            </div>

            <div className="flex justify-end">
              <button
                disabled={!bodyText.trim()}
                onClick={handleSubmitLetter}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 font-semibold text-xs text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                Capture Letter
              </button>
            </div>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="p-6 bg-orange-50/30 border border-orange-100 rounded-2xl space-y-5"
        >
          <div className="flex items-start gap-3">
            <Eye className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-slate-800">Review & Post-Reflection</h4>
              <p className="text-[11px] text-slate-500 lead-relaxed">
                Excellent. The letter content has been captured in your main thoughts pile. Take a
                small breath, look over what you wrote, and ask yourself:
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <span className="block text-xs font-bold text-slate-700 italic">
              “Is there anything you wrote in there that surprised you?”
            </span>
            <input
              type="text"
              placeholder="e.g., I realized how much I'm holding onto past expectations..."
              value={surprisedText}
              onChange={(e) => setSurprisedText(e.target.value)}
              className="w-full text-xs border border-orange-200 p-2.5 bg-white focus:outline-none rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2 text-xs">
            <button
              onClick={() => setSubmitted(false)}
              className="px-3 py-1.5 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500"
            >
              Write another Letter
            </button>
            <button
              onClick={handleSaveReflection}
              className="px-4.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-bold"
            >
              Confirm Reflection
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
