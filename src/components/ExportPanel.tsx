import { useState, useEffect, useCallback } from "react";
import { motion } from "motion/react";
import {
  Sparkles,
  Clipboard,
  CheckCircle,
  FileText,
  Calendar,
  Layers,
  ArrowLeft,
  ListTodo,
  Share2,
  Printer,
  ChevronDown,
  RefreshCw,
  Plus
} from "lucide-react";
import { Session } from "../types";
import CompareSettingsModal from "./CompareSettingsModal";

interface ExportPanelProps {
  session: Session;
  onUpdateSession: (updates: Partial<Session>) => void;
  onStartNewSession: () => void;
  onExitToDashboard: () => void;
}

export default function ExportPanel({
  session,
  onUpdateSession,
  onStartNewSession,
  onExitToDashboard,
}: ExportPanelProps) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMarkdownSource, setShowMarkdownSource] = useState(false);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareModalTab, setCompareModalTab] = useState<"tone" | "filter" | "bias" | "intention" | "quiz">("tone");
  const [sharingEnabled, setSharingEnabled] = useState(false);

  // Advanced Styling Config States
  const [promptingStyle, setPromptingStyle] = useState<'standard' | 'socratic' | 'empathetic'>(
    session.advancedSettings?.promptingStyle || "standard"
  );
  const [outputFilter, setOutputFilter] = useState<'comprehensive' | 'actions' | 'roadmap'>(
    session.advancedSettings?.outputFilter || "comprehensive"
  );
  const [cognitiveBiasAudit, setCognitiveBiasAudit] = useState<'include' | 'exclude'>(
    session.advancedSettings?.cognitiveBiasAudit || "exclude"
  );

  const triggerSynthesize = useCallback(async (
    customStyle = promptingStyle,
    customFilter = outputFilter,
    customBias = cognitiveBiasAudit
  ) => {
    setLoading(true);
    try {
      const response = await fetch("/api/session/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: session.topic,
          intention: session.intention,
          thoughts: session.thoughts,
          advancedSettings: {
            promptingStyle: customStyle,
            outputFilter: customFilter,
            cognitiveBiasAudit: customBias,
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        onUpdateSession({
          synthesizedSummary: data.summary,
          synthesizedOutline: data.outline,
          synthesizedActionItems: data.actionItems,
          advancedSettings: {
            promptingStyle: customStyle,
            outputFilter: customFilter,
            cognitiveBiasAudit: customBias,
          },
          status: "review",
        });
      } else {
        throw new Error("HTTP error " + response.status);
      }
    } catch (e) {
      console.error(e);
      // Fallback local structures if server errors out
      onUpdateSession({
        synthesizedSummary: `We analyzed your brainstorming on '${session.topic}'. Your thoughts highlight key priorities matching your timeline constraints.`,
        synthesizedOutline: `## 1. Core Focus: ${session.topic}\n\n- Primary surfaced thoughts\n- Emotional and analytical milestones\n\n## 2. Immediate Action Priorities\n\n- Unblock initial hurdles\n- Structure plan and steps`,
        synthesizedActionItems: session.thoughts.slice(0, 3).map((t) => t.text.slice(0, 60)),
        status: "review",
      });
    } finally {
      setLoading(false);
    }
  }, [session.topic, session.intention, session.thoughts, onUpdateSession, promptingStyle, outputFilter, cognitiveBiasAudit]);

  useEffect(() => {
    if (!session.synthesizedOutline || !session.synthesizedSummary) {
      triggerSynthesize();
    }
  }, [session.synthesizedOutline, session.synthesizedSummary, triggerSynthesize]);

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    // Generate a Shareable snapshot that packs the session into a base64 string
    const stateBlob = btoa(encodeURIComponent(JSON.stringify(session)));
    const shareableUrl = `${window.location.origin}/?snapshot=${stateBlob}`;
    navigator.clipboard.writeText(shareableUrl);
    alert("Shareable Base64 session URL copied to clipboard! Share it with anyone; they can read your exact outline instantly without an account.");
  };

  const fullMarkdownSummary = `# ${session.topic}\n**Intention:** ${session.intention}\n**Surfaces Date:** ${new Date().toLocaleDateString()}\n\n## Core Executive Summary\n${session.synthesizedSummary || ""}\n\n${session.synthesizedOutline || ""}\n\n## Refined Action Items\n${(session.synthesizedActionItems || []).map((itm) => `- [ ] ${itm}`).join("\n")}`;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 md:py-12 space-y-6" id="export-panel">
      
      {/* Upper Navigation Header */}
      <div className="flex justify-between items-center bg-white p-4.5 border-3 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] shrink-0">
        <button
          onClick={onExitToDashboard}
          className="flex items-center gap-1.5 text-xs border-2 border-black bg-white hover:bg-zinc-50 text-black px-3.5 py-1.5 font-display font-bold uppercase tracking-wider cursor-pointer transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={triggerSynthesize}
            className="p-2 border-2 border-black bg-white hover:bg-zinc-100 text-black rounded-none shrink-0 transition"
            title="Re-Synthesize Outline"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          
          <button
            onClick={onStartNewSession}
            className="px-4 py-2 border-2 border-black bg-black text-white hover:bg-[#F8F7F4] hover:text-black text-xs font-black font-display uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]"
          >
            <Plus className="w-3.5 h-3.5" />
            New Extraction
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center text-zinc-650 flex flex-col items-center justify-center gap-4">
          <RefreshCw className="w-8 h-8 animate-spin text-black" />
          <div className="space-y-1">
            <h3 className="font-display font-black text-xs uppercase text-zinc-900 tracking-wider">Synthesizing Outline Layout...</h3>
            <p className="text-xs text-zinc-650 font-serif italic max-w-sm mt-1">
              "Wait up; Gemini is processing all mapped nodes, sorting by clusters, and building a structured executive blueprint."
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Document Pane - Outline and summary */}
          <div className="lg:col-span-2 space-y-6 bg-white border-3 border-black p-6 md:p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
            
            {/* Header info */}
            <div>
              <span className="text-[9px] uppercase tracking-widest font-mono font-bold text-black flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                COGNITIVE SUMMARY
              </span>
              <h1 className="text-2xl font-black uppercase text-black font-display tracking-tight sm:text-3xl mt-1 leading-tight">
                {session.topic}
              </h1>
              <p className="text-[10px] text-zinc-500 mt-1.5 font-sans uppercase tracking-wider font-semibold">
                INTENTION: "{session.intention}" • CREATED: {new Date(session.createdAt).toLocaleDateString()}
              </p>
            </div>

            {/* Compass summary */}
            <div className="border-l-3 border-black pl-4.5 py-1 text-zinc-800 leading-relaxed text-sm whitespace-pre-wrap font-serif italic font-medium">
              {session.synthesizedSummary}
            </div>

            {/* Structured outline display */}
            <div className="pt-6 border-t-2 border-black">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 font-mono mb-4">
                Structured Markdown Outline
              </span>
              
              <div className="prose prose-sm max-w-none text-zinc-900 space-y-4">
                {showMarkdownSource ? (
                  <textarea
                    rows={12}
                    readOnly
                    value={session.synthesizedOutline}
                    className="w-full text-xs font-mono p-3 bg-zinc-50 border-2 border-black focus:outline-none focus:ring-0 text-zinc-900"
                  />
                ) : (
                  <div className="p-5 bg-[#F8F7F4] border-2 border-black whitespace-pre-wrap text-xs md:text-sm leading-relaxed text-black font-mono custom-scrollbar max-h-[460px] overflow-y-auto">
                    {session.synthesizedOutline}
                  </div>
                )}
              </div>
            </div>

            {/* Source trigger control */}
            <div className="flex flex-col sm:flex-row gap-4 pt-2 justify-between">
              <button
                onClick={() => setShowMarkdownSource(!showMarkdownSource)}
                className="text-xs uppercase font-bold tracking-wider font-display text-black hover:underline cursor-pointer"
              >
                {showMarkdownSource ? "Close Raw Source" : "[View Raw Markdown Source]"}
              </button>

              <button
                onClick={() => handleCopyToClipboard(fullMarkdownSummary)}
                className="text-xs uppercase font-bold tracking-wider font-display text-black hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copied ? <CheckCircle className="w-3.5 h-3.5 text-zinc-900" /> : <Clipboard className="w-3.5 h-3.5" />}
                {copied ? "Copied Document!" : "[Copy Full Summary Markdown]"}
              </button>
            </div>
          </div>

          {/* Sidebar - Action list and export options */}
          <div className="space-y-6">
            
            {/* Dynamic Re-Synthesis Modifier Controls */}
            <div className="bg-[#FFFDF0] border-3 border-black p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] uppercase font-bold tracking-wider font-display text-black flex items-center gap-1.5 leading-none">
                  <Sparkles className="w-3.5 h-3.5" />
                  Re-Format Blueprint
                </span>
              </div>
              
              <div className="space-y-3">
                {/* Tone Selector */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[9px] uppercase tracking-wider font-mono font-bold text-zinc-600">
                      Guidance Tone
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setCompareModalTab("tone");
                        setShowCompareModal(true);
                      }}
                      className="text-[8px] font-mono font-bold uppercase tracking-wider text-zinc-550 hover:text-black transition-all hover:underline cursor-pointer"
                    >
                      [ℹ Compare]
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: "standard", label: "Standard" },
                      { id: "socratic", label: "Socratic" },
                      { id: "empathetic", label: "Empathetic" },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setPromptingStyle(t.id as any)}
                        className={`text-[8px] font-mono py-1 border border-black cursor-pointer uppercase font-extrabold ${
                          promptingStyle === t.id 
                            ? "bg-black text-white font-black" 
                            : "bg-white text-black hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Selector */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-[9px] uppercase tracking-wider font-mono font-bold text-zinc-600">
                      Analysis filter focus
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setCompareModalTab("filter");
                        setShowCompareModal(true);
                      }}
                      className="text-[8px] font-mono font-bold uppercase tracking-wider text-zinc-550 hover:text-black transition-all hover:underline cursor-pointer"
                    >
                      [ℹ Compare]
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[
                      { id: "comprehensive", label: "Full Summary" },
                      { id: "roadmap", label: "Milestones" },
                      { id: "actions", label: "Checklists" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setOutputFilter(f.id as any)}
                        className={`text-[8px] font-mono py-1 border border-black cursor-pointer uppercase font-extrabold leading-none ${
                          outputFilter === f.id 
                            ? "bg-black text-white font-black" 
                            : "bg-white text-black hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {f.label === "Full Summary" ? "Full" : f.label === "Milestones" ? "Milestone" : "Checklist"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cognitive Bias */}
                <div className="flex items-center justify-between pt-1.5 border-t border-black/10">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-mono uppercase tracking-wider font-bold text-zinc-650">
                      Audit Cognitive Bias
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCompareModalTab("bias");
                        setShowCompareModal(true);
                      }}
                      className="text-[8px] font-mono font-bold uppercase tracking-wider text-zinc-550 hover:text-black transition-all hover:underline cursor-pointer"
                    >
                      [ℹ Compare]
                    </button>
                  </div>
                  <button
                    onClick={() => setCognitiveBiasAudit(cognitiveBiasAudit === "include" ? "exclude" : "include")}
                    className={`text-[9px] font-mono px-2 py-0.5 border border-black cursor-pointer uppercase font-extrabold ${
                      cognitiveBiasAudit === "include" ? "bg-black text-white" : "bg-white hover:bg-zinc-50 text-black"
                    }`}
                  >
                    {cognitiveBiasAudit === "include" ? "Audit on" : "Audit off"}
                  </button>
                </div>

                {/* Regenerate Trigger */}
                <button
                  onClick={() => triggerSynthesize(promptingStyle, outputFilter, cognitiveBiasAudit)}
                  disabled={loading}
                  className="w-full py-2 border-2 border-black bg-black text-yellow-300 font-display font-black text-[10px] uppercase tracking-widest cursor-pointer hover:bg-zinc-100 hover:text-black transition-all flex items-center justify-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Regenerate Outline
                </button>
              </div>
            </div>

            {/* Action items segment block */}
            <div className="bg-white border-3 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
              <span className="block text-[10px] uppercase font-bold tracking-wider font-display text-black flex items-center gap-1.5 mb-3.5">
                <ListTodo className="w-4 h-4 text-black" />
                Action Items Pile
              </span>

              <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar">
                {(session.synthesizedActionItems || []).map((action, index) => (
                  <div
                    key={index}
                    className="flex p-3 bg-[#F8F7F4] border-2 border-black text-xs text-black items-start gap-2.5 hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] transition-all"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-black"
                    />
                    <span className="leading-relaxed font-semibold font-mono text-[11px]">{action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sharing & Printing tools */}
            <div className="bg-white border-3 border-black p-5 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-4">
              <span className="block text-[10px] uppercase font-bold tracking-wider font-display text-black">
                Sharing & Output Tools
              </span>

              <div className="space-y-2.5">
                {/* Share link — disabled by default; all thoughts are encoded in plaintext */}
                <div className="border-2 border-black p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-zinc-600">
                      Web Link Sharing
                    </span>
                    <button
                      onClick={() => setSharingEnabled((prev) => !prev)}
                      className={`text-[9px] font-mono px-2 py-0.5 border border-black cursor-pointer uppercase font-extrabold transition-all ${
                        sharingEnabled ? "bg-black text-white" : "bg-white hover:bg-zinc-50 text-black"
                      }`}
                    >
                      {sharingEnabled ? "Enabled" : "Disabled"}
                    </button>
                  </div>

                  {!sharingEnabled ? (
                    <p className="text-[9px] font-mono text-zinc-500 leading-relaxed">
                      Sharing is off. The shareable link encodes all session thoughts in plaintext — enable only if you're comfortable with that.
                    </p>
                  ) : (
                    <button
                      onClick={handleShare}
                      className="w-full py-2.5 border-2 border-black hover:bg-black hover:text-white text-black text-xs font-black font-display uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all duration-150"
                    >
                      <Share2 className="w-4 h-4" />
                      Get Shareable Web Link
                    </button>
                  )}
                </div>

                <button
                  onClick={() => window.print()}
                  className="w-full py-2.5 border-2 border-black bg-zinc-50 hover:bg-black hover:text-white text-black text-xs font-black font-display uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer transition-all duration-150"
                >
                  <Printer className="w-4 h-4" />
                  Print Outlines
                </button>
              </div>
            </div>

          </div>

        </div>
      )}
      <CompareSettingsModal isOpen={showCompareModal} onClose={() => setShowCompareModal(false)} defaultTab={compareModalTab} />
    </div>
  );
}
