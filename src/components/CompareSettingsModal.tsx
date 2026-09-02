import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  Sparkles,
  HelpCircle,
  ShieldAlert,
  Smile,
  ListTodo,
  Calendar,
  AlertTriangle,
  FolderLock,
  Target,
  Brain,
  Timer,
} from "lucide-react";

interface CompareSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: TabType;
}

type TabType = "framing" | "intention" | "tone" | "filter" | "bias" | "quiz";

export default function CompareSettingsModal({
  isOpen,
  onClose,
  defaultTab = "framing",
}: CompareSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  useEffect(() => {
    if (isOpen && defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [isOpen, defaultTab]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6"
        id="compare-modal-root"
      >
        {/* Dark overlay backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-xs cursor-pointer"
        />

        {/* Modal container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="relative bg-white border-3 border-black p-6 md:p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] z-10 font-sans custom-scrollbar"
        >
          {/* Header */}
          <div className="flex justify-between items-start border-b-3 border-black pb-4 mb-6">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 font-mono flex items-center gap-1.5 leading-none">
                <Sparkles className="w-3.5 h-3.5 text-black" />
                Advanced Controls Guide
              </span>
              <h2 className="text-xl md:text-2xl font-black uppercase text-black font-display tracking-tight mt-1.5">
                Compare Settings & Outcomes
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 border-2 border-black bg-white hover:bg-zinc-100 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <p className="text-xs text-zinc-700 leading-relaxed font-serif italic">
              "Below is a comparison of how different settings process a sample topic: **'Should I
              make a career pivot from corporate to freelancing?'** with the thought: **'I am burnt
              out by corporate rules but terrified of freelance income instability.'**"
            </p>

            {/* Neo-Brutalist Tabs */}
            <div className="flex border-b-2 border-black overflow-x-auto gap-1">
              {[
                { id: "framing", label: "01 // Topic Framing" },
                { id: "intention", label: "02 // Intention Objective" },
                { id: "tone", label: "03.1 // Guidance Tone" },
                { id: "filter", label: "03.2 // Output Filtering" },
                { id: "bias", label: "03.3 // Bias Auditing" },
                { id: "quiz", label: "04 // Warm-up Quiz" },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as TabType)}
                    className={`px-4 py-2 border-2 border-b-0 border-black whitespace-nowrap cursor-pointer transition text-xs font-black uppercase tracking-wide ${
                      isActive
                        ? "bg-black text-white"
                        : "bg-white text-black hover:bg-zinc-50 translate-y-[2px]"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Contents */}
            <div className="pt-2">
              {activeTab === "framing" && (
                <div className="space-y-6">
                  <div className="bg-[#FFFDE0] border-2 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                    <span className="font-black uppercase tracking-wider block flex items-center gap-1.5 font-mono text-xs mb-2 text-black">
                      <HelpCircle className="w-4 h-4 text-black" />
                      Session Framing Guide
                    </span>
                    <p className="text-xs text-zinc-700 leading-relaxed font-sans">
                      To get the highest signal synthesis from Gemini, follow these three core
                      guidelines when starting a new session. Since Gemini acts as a cognitive
                      mirror, the structure of your starting statement primes the depth of the
                      entire session.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Tip 1 */}
                    <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                      <div>
                        <span className="bg-[#FFD2D2] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide inline-block mb-3">
                          Tip 01 // Be Specific
                        </span>
                        <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                          Define a concrete problem space
                        </h4>
                        <p className="text-[10px] text-zinc-650 font-sans leading-relaxed">
                          Instead of entering general topics like "work problems" or "marketing
                          project", frame it as a specific question, constraint, or goal.
                        </p>

                        <div className="mt-4 pt-3 border-t border-dashed border-black/15 font-mono text-[9px] text-zinc-600 leading-normal">
                          <span className="font-bold text-red-650 uppercase tracking-wide block mb-1">
                            ❌ Avoid generic topics:
                          </span>
                          "Work problems"
                          <br />
                          <span className="font-bold text-green-755 uppercase tracking-wide block mt-2 mb-1">
                            ✅ Frame specifically:
                          </span>
                          "Should I delegate core backend work to a contractor next month?"
                        </div>
                      </div>
                    </div>

                    {/* Tip 2 */}
                    <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                      <div>
                        <span className="bg-[#D2E3FC] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide inline-block mb-3">
                          Tip 02 // stream-of-consciousness
                        </span>
                        <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                          Don't edit or filter yourself
                        </h4>
                        <p className="text-[10px] text-zinc-650 font-sans leading-relaxed">
                          Write exactly as you think. Spill out random thoughts, worries, facts, and
                          tasks. Do not worry about grammar or logical hierarchy.
                        </p>

                        <div className="mt-4 pt-3 border-t border-dashed border-black/15 font-mono text-[9px] text-zinc-650 leading-normal">
                          <span className="font-bold text-black uppercase tracking-wide block mb-1">
                            How Gemini Synthesizes:
                          </span>
                          The synthesis engine is specifically designed to sort, cluster, and
                          outline messy brain dumps into clear structured Blueprints.
                        </div>
                      </div>
                    </div>

                    {/* Tip 3 */}
                    <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                      <div>
                        <span className="bg-[#CEEAD6] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide inline-block mb-3">
                          Tip 03 // State constraints
                        </span>
                        <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                          Include deadlines & blockers
                        </h4>
                        <p className="text-[10px] text-zinc-650 font-sans leading-relaxed">
                          Mentioning timelines, budget anxiety, external blockers, or emotional
                          friction points allows Gemini to suggest the most optimal extraction mode.
                        </p>

                        <div className="mt-4 pt-3 border-t border-dashed border-black/15 font-mono text-[9px] text-zinc-650 leading-normal">
                          <span className="font-bold text-black uppercase tracking-wide block mb-1">
                            Adaptive Mode Suggestions:
                          </span>
                          Friction-heavy sessions recommend <strong>Devil's Advocate</strong>,
                          whereas low-time, high-clarity sessions recommend{" "}
                          <strong>Quick Fire</strong>.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "tone" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Standard */}
                  <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#D2E3FC] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide">
                          Standard Guide
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Balanced strategic coaching
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                        Ideal for structural roadmap building and logical mapping.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Example Interview Nudge
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            "What is the primary milestone or safety buffer you want to secure first
                            before quitting?"
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Example Synthesized Outline
                          </span>
                          <div className="p-2 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-normal">
                            <strong>## 1. Core Focus: Freelance</strong>
                            <br />
                            - Rigid Rules vs Flexibility
                            <br />
                            - Key Bottleneck: Income Stability
                            <br />
                            <strong>## 2. Action Priorities</strong>
                            <br />
                            - Establish 6-month buffer
                            <br />- Land 2 beta clients
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Socratic */}
                  <div className="border-2 border-black p-4 bg-[#FFE8CC] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#FFE3E3] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-red-500 shrink-0" />
                          Socratic Pressure
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Challenging core assumptions
                      </h4>
                      <p className="text-[10px] text-zinc-755 font-sans leading-relaxed mb-4">
                        Forces you to test assumptions, cut through hesitation, and audit
                        rationalizations.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-600 block mb-1">
                            Example Interview Nudge
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed font-semibold italic">
                            "If your stability concern is purely financial, why haven't you drafted
                            an exact budget sheet yet? Is it a math block or a fear block?"
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-600 block mb-1">
                            Example Synthesized Outline
                          </span>
                          <div className="p-2 bg-white border border-black font-mono text-[9px] text-zinc-800 leading-normal">
                            <strong>## 1. Viability Audit: Income</strong>
                            <br />
                            - Reality Test: Financial projection
                            <br />
                            - Sunk-Cost Trap: Years of tenure
                            <br />
                            <strong>## 2. Hard Action Items</strong>
                            <br />
                            - [ ] Draft concrete expense ledger
                            <br />- [ ] Audit consulting hourly market rate
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Empathetic */}
                  <div className="border-2 border-black p-4 bg-[#E6F4EA] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#FFF] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <Smile className="w-3 h-3 text-green-600 shrink-0" />
                          Empathetic Vent
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Supporting emotional unburdening
                      </h4>
                      <p className="text-[10px] text-zinc-650 font-sans leading-relaxed mb-4">
                        Gives room to decompress burnout fatigue and align choices with emotional
                        security.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-500 block mb-1">
                            Example Interview Nudge
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            "How does it feel when you imagine staying in your corporate job for
                            another full year? Let's acknowledge the exhaustion first."
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-500 block mb-1">
                            Example Synthesized Outline
                          </span>
                          <div className="p-2 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-normal">
                            <strong>## 1. Burnout & Fatigue Relief</strong>
                            <br />
                            - Honoring exhaustion boundaries
                            <br />
                            - Emotional safety over speed
                            <br />
                            <strong>## 2. Supportive Roadmap</strong>
                            <br />
                            - Phase 1: Set firm off-work limits
                            <br />- Phase 2: Gentle freelance testing
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "filter" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Full summary */}
                  <div className="border-2 border-black p-4 bg-zinc-50">
                    <span className="bg-[#FFFEE0] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1.5 w-max mb-3">
                      Full Summary (Blueprint)
                    </span>
                    <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                      Comprehensive Document
                    </h4>
                    <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                      Outputs a detailed narrative summary of your state, a complete Markdown
                      outline tree, and actionable steps.
                    </p>
                    <div className="border-t border-dashed border-black/15 pt-3">
                      <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1.5">
                        Generated Outcome Structure
                      </span>
                      <div className="p-2.5 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-relaxed whitespace-pre-line">
                        {
                          "### Executive Summary\nYou are exploring a career transition from corporate structure to freelance work, balancing exhaustion...\n\n### Outline\n## 1. Freelance Transition\n- Rigidity vs flexibility\n\n### Action Checklist\n- [ ] Establish 6-month buffer"
                        }
                      </div>
                    </div>
                  </div>

                  {/* Milestones focus */}
                  <div className="border-2 border-black p-4 bg-zinc-50">
                    <span className="bg-[#E8F0FE] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1.5 w-max mb-3">
                      <Calendar className="w-3.5 h-3.5 text-blue-500" />
                      Milestones Only (Roadmap)
                    </span>
                    <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                      High-Level Milestones Focus
                    </h4>
                    <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                      Filters out granular daily tasks, generating strategic phases, milestones, and
                      timeline steps.
                    </p>
                    <div className="border-t border-dashed border-black/15 pt-3">
                      <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1.5">
                        Generated Outcome Structure
                      </span>
                      <div className="p-2.5 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-relaxed whitespace-pre-line">
                        {
                          "### Strategic Roadmap Milestones\n\n## Phase 1: Burnout Mitigation (Month 1)\n- Set firm offline hours\n- Re-energize baseline\n\n## Phase 2: Client Validation (Months 2-3)\n- Land 2 beta consulting projects\n- Build project catalog"
                        }
                      </div>
                    </div>
                  </div>

                  {/* Checklists focus */}
                  <div className="border-2 border-black p-4 bg-zinc-50">
                    <span className="bg-[#E6F4EA] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1.5 w-max mb-3">
                      <ListTodo className="w-3.5 h-3.5 text-green-600" />
                      Checklists Only (Actions)
                    </span>
                    <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                      Action List Focused
                    </h4>
                    <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                      Removes conversational intros and analytical summaries. Emphasizes checkboxes
                      and direct, executable recipes.
                    </p>
                    <div className="border-t border-dashed border-black/15 pt-3">
                      <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1.5">
                        Generated Outcome Structure
                      </span>
                      <div className="p-2.5 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-relaxed whitespace-pre-line">
                        {
                          "### Transition Action Checklists\n\n- [ ] Save 6-month buffer ledger\n- [ ] Draft freelance services page\n- [ ] Pitch first 5 corporate alumni contacts\n- [ ] Register consulting LLC"
                        }
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "bias" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Audit Off */}
                  <div className="border-2 border-black p-4 bg-zinc-50">
                    <span className="bg-white text-zinc-500 border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide w-max block mb-3">
                      Audit Off (Standard)
                    </span>
                    <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                      Unmodified Thought Mapping
                    </h4>
                    <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                      Gemini organizes, clusters, and outlines your thoughts exactly as you
                      brainstormed them.
                    </p>
                    <div className="border-t border-dashed border-black/15 pt-3">
                      <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1.5">
                        Example Summary Output
                      </span>
                      <div className="p-3 bg-white border border-black text-xs text-zinc-700 leading-relaxed font-sans font-medium italic">
                        "We analyzed your career pivot thoughts. You want to escape corporate
                        structures but feel anxious about finance stability. You outlined a plan to
                        build up savings and pitch consulting clients..."
                      </div>
                    </div>
                  </div>

                  {/* Audit On */}
                  <div className="border-2 border-black p-4 bg-[#FFE8CC]">
                    <span className="bg-[#FFFEE0] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1.5 w-max mb-3 font-black">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      Audit On (Diagnostics)
                    </span>
                    <h4 className="text-xs font-black uppercase tracking-tight text-black mb-2">
                      Intellectual Fallacy Audit
                    </h4>
                    <p className="text-[10px] text-zinc-755 font-sans leading-relaxed mb-4">
                      Gemini scans your thoughts for logical blocks or psychological fallacies,
                      appending warning overlays.
                    </p>
                    <div className="border-t border-dashed border-black/15 pt-3">
                      <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-600 block mb-1.5">
                        Example Summary Output
                      </span>
                      <div className="p-3 bg-white border border-black text-xs text-zinc-800 leading-relaxed font-sans font-medium italic space-y-2">
                        <p>"We analyzed your career pivot thoughts..."</p>
                        <div className="bg-[#FFF9DB] border border-black p-2 rounded-none font-mono text-[9px] leading-relaxed text-black not-italic">
                          <span className="font-bold text-red-650 block uppercase tracking-wider mb-1 flex items-center gap-1">
                            <FolderLock className="w-3 h-3 shrink-0" />
                            Cognitive Bias Audit // Diagnostic Traps:
                          </span>
                          - **Sunk-Cost Fallacy**: Your hesitation is heavily anchored in 'years
                          spent climbing corporate ladder', treating past time spent as future
                          obligation.
                          <br />- **Avoidance Trap**: You prioritized LLC registration over savings
                          calculation, avoiding the hard numerical assessment of your stability
                          worry.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "intention" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Outline Intention */}
                  <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#E8F0FE] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <ListTodo className="w-3 h-3 text-blue-600 shrink-0" />
                          Organize Outline
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Structure Stream of Consciousness
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                        Prioritizes logical clustering, structural hierarchy, and categorization of
                        scattered details.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Engine Synthesis Bias
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            Heavy mapping of chronological steps, semantic tagging, and nested
                            grouping.
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Sample Synthesis Focus
                          </span>
                          <div className="p-2 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-normal">
                            <strong>## 1. Burnout Triggers</strong>
                            <br />
                            - Rigid rules constraint
                            <br />
                            - Overtime overhead
                            <br />
                            <strong>## 2. Fear Vectors</strong>
                            <br />- Monthly overhead risk
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Choice/Action Intention */}
                  <div className="border-2 border-black p-4 bg-[#FFE8CC] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#FFE3E3] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <Target className="w-3 h-3 text-red-500 shrink-0" />
                          Make a Choice
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Decisiveness & Priority Actions
                      </h4>
                      <p className="text-[10px] text-zinc-755 font-sans leading-relaxed mb-4">
                        Filters out fluff to highlight tradeoffs, decision-matrices, and immediate
                        actions.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-600 block mb-1">
                            Engine Synthesis Bias
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            Identifies trade-offs, assigns impact vectors, and details high-priority
                            actions.
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-600 block mb-1">
                            Sample Synthesis Focus
                          </span>
                          <div className="p-2.5 bg-white border border-black font-mono text-[9px] text-zinc-800 leading-normal">
                            <strong>## Tradeoff Analysis</strong>
                            <br />
                            - Corporate (Stable vs Dull)
                            <br />
                            - Freelance (Free vs Risky)
                            <br />
                            <strong>## High-Priority Actions</strong>
                            <br />- [ ] Draft 6mo stability budget
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Decompress/Peace Intention */}
                  <div className="border-2 border-black p-4 bg-[#E6F4EA] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#FFF] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <Smile className="w-3 h-3 text-green-600 shrink-0" />
                          Decompress Fog
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Emotional Calm & Validation
                      </h4>
                      <p className="text-[10px] text-zinc-650 font-sans leading-relaxed mb-4">
                        Prioritizes cognitive load reduction, stressor mapping, and emotional
                        de-escalation.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-500 block mb-1">
                            Engine Synthesis Bias
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            Reframes self-pressure, normalizes fear blocks, and details gentle
                            recovery boundaries.
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-500 block mb-1">
                            Sample Synthesis Focus
                          </span>
                          <div className="p-2.5 bg-white border border-black font-mono text-[9px] text-zinc-700 leading-normal">
                            <strong>## Stress & Exhaustion Scan</strong>
                            <br />
                            - Burden of rules is highly draining
                            <br />
                            - Stability fear is natural protection
                            <br />
                            <strong>## Restoration Plan</strong>
                            <br />- Stop work strict boundary at 6 PM
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "quiz" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Profile 1 */}
                  <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#FFE8CC] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <Brain className="w-3 h-3 text-amber-600 shrink-0" />
                          The Decision Jam
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Foggy + Analytical + Decide
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                        For users facing complex options, unable to prioritize action items due to
                        information overload.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Diagnostic Assessment
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            User is stuck in logic analysis loop and needs external framing filters.
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Recommended Mode
                          </span>
                          <div className="p-2 bg-white border border-black text-[11px] font-bold text-black flex items-center justify-between">
                            <span>👿 Devil's Advocate</span>
                            <span className="text-[8px] bg-red-100 text-red-700 px-1 border border-red-300 font-mono">
                              CHALLENGING
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 font-sans mt-1">
                            Stress-tests stability arguments, forces binary choices.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Profile 2 */}
                  <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#E6F4EA] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <Smile className="w-3 h-3 text-green-600 shrink-0" />
                          The Burnout Vent
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Foggy + Emotional + Process
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                        For users feeling heavy exhaustion and overwhelm who need to express complex
                        feelings.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Diagnostic Assessment
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            User needs safe holding-space to unpack stress before applying execution
                            plans.
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Recommended Mode
                          </span>
                          <div className="p-2 bg-white border border-black text-[11px] font-bold text-black flex items-center justify-between">
                            <span>🔍 Guided Drill</span>
                            <span className="text-[8px] bg-green-100 text-green-700 px-1 border border-green-300 font-mono">
                              SUPPORTIVE
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 font-sans mt-1">
                            Gently coaxes thoughts out via step-by-step diagnostic inquiries.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Profile 3 */}
                  <div className="border-2 border-black p-4 bg-zinc-50 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-[#E8F0FE] text-black border border-black px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-wide flex items-center gap-1">
                          <Timer className="w-3 h-3 text-blue-600 shrink-0" />
                          The Quick Dump
                        </span>
                      </div>
                      <h4 className="text-xs font-black uppercase tracking-tight text-black mb-1.5">
                        Clear + Analytical + Capture
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-sans leading-relaxed mb-4">
                        For users with structured thoughts who want to capture everything before
                        focus shifts.
                      </p>

                      <div className="space-y-3.5 border-t border-dashed border-black/15 pt-3">
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Diagnostic Assessment
                          </span>
                          <p className="text-xs text-black font-sans leading-relaxed">
                            High clarity, high urgency. Needs minimum prompt friction, zero
                            conversational lag.
                          </p>
                        </div>
                        <div>
                          <span className="text-[8px] uppercase font-bold tracking-widest font-mono text-zinc-400 block mb-1">
                            Recommended Mode
                          </span>
                          <div className="p-2 bg-white border border-black text-[11px] font-bold text-black flex items-center justify-between">
                            <span>⚡ Quick Fire</span>
                            <span className="text-[8px] bg-blue-100 text-blue-700 px-1 border border-blue-300 font-mono font-bold">
                              RAPID
                            </span>
                          </div>
                          <p className="text-[9px] text-zinc-500 font-sans mt-1">
                            Fires quick single-line prompts to catalog ideas in fast sequence.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer info box */}
          <div className="mt-6 p-3 bg-zinc-100 border-2 border-black text-center font-mono text-[9px] text-zinc-550 uppercase tracking-wide leading-relaxed">
            Note: You can re-synthesize your outlines with different blueprint settings at any time
            without losing your thoughts history list!
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
