import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { HelpCircle, RefreshCw, Send, ArrowUpRight, HelpCircle as HelpIcon, Smile, Mic, MicOff, MessageSquareCode } from "lucide-react";
import { Thought } from "../../types";

interface GuidedDrillProps {
  topic: string;
  intention: string;
  onAddThought: (text: string) => void;
  thoughts: Thought[];
  advancedSettings?: {
    promptingStyle: 'standard' | 'socratic' | 'empathetic';
    outputFilter: 'comprehensive' | 'actions' | 'roadmap';
    cognitiveBiasAudit: 'include' | 'exclude';
  };
}

interface QAHistory {
  question: string;
  answer: string;
  clarifyingReply?: string;
  isDialogue?: boolean;
}

export default function GuidedDrill({ topic, intention, onAddThought, thoughts, advancedSettings }: GuidedDrillProps) {
  const [qaHistory, setQaHistory] = useState<QAHistory[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [answerDraft, setAnswerDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDialogueMode, setIsDialogueMode] = useState(false);
  
  // Voice Dictation States
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<any>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize Speech Recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (event: any) => {
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          setAnswerDraft((prev) => prev + (prev ? " " : "") + finalTranscript);
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        setIsRecording(false);
      };

      rec.onend = () => {
        setIsRecording(false);
      };

      recognitionRef.current = rec;
    }
  }, []);

  const toggleSpeech = () => {
    if (!recognitionRef.current) {
      alert("Speech-to-text is not supported in this browser version or current container view. Please type your thoughts.");
      return;
    }

    if (isRecording) {
      recognitionRef.current.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsRecording(true);
      } catch (e) {
        console.error("Failed to start SpeechRecognition", e);
      }
    }
  };

  useEffect(() => {
    fetchNextQuestion();
  }, [topic]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaHistory, currentQuestion, loading]);

  const fetchNextQuestion = async (updatedHistory = qaHistory) => {
    setLoading(true);
    try {
      const response = await fetch("/api/session/drill-next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          intention,
          history: updatedHistory,
          recentThoughts: thoughts.slice(0, 8),
          advancedSettings,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.question) {
          setCurrentQuestion(data.question);
          setContextNote(data.contextNote || "Deep Extraction Thread");
        } else {
          throw new Error("Invalid response format");
        }
      } else {
        throw new Error("HTTP error " + response.status);
      }
    } catch (e) {
      console.error(e);
      if (updatedHistory.length === 0) {
        setCurrentQuestion(`Let's start by unpacking "${topic}". What is the primary milestone or outcome you want to focus on first?`);
        setContextNote("Initial Focus");
      } else {
        const lastAnswer = updatedHistory[updatedHistory.length - 1]?.answer || "";
        const truncatedAnswer = lastAnswer.length > 50 ? lastAnswer.substring(0, 50) + "..." : lastAnswer;
        setCurrentQuestion(`Unpacking your point: "${truncatedAnswer}". What is the next bottleneck or detail we should clarify for "${topic}"?`);
        setContextNote("Deepening Thread");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!answerDraft.trim() || !currentQuestion) return;

    // Turn off recording if it is active
    if (isRecording && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }

    const currentText = answerDraft.trim();
    setAnswerDraft("");

    if (isDialogueMode) {
      setLoading(true);
      try {
        const response = await fetch("/api/session/drill-clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            intention,
            history: qaHistory,
            userComment: currentText,
            recentThoughts: thoughts.slice(0, 8),
            advancedSettings,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          
          // Capture as a conversational thought bubble in our pile!
          onAddThought(`Perspective Clarification // User Query: "${currentText}" -> Guide Response: "${data.reply}"`);

          const newQA: QAHistory = {
            question: currentQuestion, // Keeps same question we clarifyingly pivoted on
            answer: currentText,
            clarifyingReply: data.reply,
            isDialogue: true,
          };

          const newHistory = [...qaHistory, newQA];
          setQaHistory(newHistory);
          setCurrentQuestion(data.nextQuestion);
          setContextNote(data.contextNote || "Evolving Context Thread");
          setIsDialogueMode(false); // Reset dialogue back after prompt clarified
        } else {
          throw new Error("HTTP error " + response.status);
        }
      } catch (e) {
        console.error(e);
        // Fallback
        onAddThought(`Perspective Clarification // User Query: "${currentText}"`);
        setCurrentQuestion(`Unpacking your point about "${currentText}". How does this impact your main goal for "${topic}"?`);
        setContextNote("Clarification Pivot");
        setIsDialogueMode(false);
      } finally {
        setLoading(false);
      }
    } else {
      const newQA: QAHistory = {
        question: currentQuestion,
        answer: currentText,
        isDialogue: false,
      };

      // Captured as a surfaced thought inside our pile!
      onAddThought(`Q: "${currentQuestion}"\nA: "${currentText}"`);

      const newHistory = [...qaHistory, newQA];
      setQaHistory(newHistory);
      await fetchNextQuestion(newHistory);
    }
  };

  const handleSkipQuestion = () => {
    fetchNextQuestion();
  };

  return (
    <div className="space-y-6 flex flex-col h-[520px]" id="guided-drill-mode">
      
      {/* Header Info */}
      <div className="bg-white border-3 border-black p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] flex items-start gap-4 shrink-0">
        <HelpCircle className="w-5 h-5 text-black shrink-0 mt-0.5" />
        <div>
          <h3 className="font-display font-black text-xs uppercase text-black tracking-wider flex items-center gap-2">
            Guided Drill Interview
            <span className="bg-yellow-300 text-black border border-black px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase tracking-widest leading-none">
              Double-Agent Conversations
            </span>
          </h3>
          <p className="text-[11px] text-zinc-650 leading-normal mt-0.5 font-sans">
            An adaptive expert interview. Type answers, consult the coach directly, or speak your ideas.
          </p>
        </div>
      </div>

      {/* Interactive Conversation Timeline Thread block */}
      <div className="flex-1 overflow-y-auto border-3 border-black bg-[#F8F7F4] p-4 space-y-4 custom-scrollbar">
        {qaHistory.map((h, i) => (
          <div key={i} className="space-y-3">
            {/* AI Question Bubble */}
            <div className="flex items-start max-w-[85%]">
              <div className="bg-white border-2 border-black p-3 rounded-none text-xs text-black font-sans">
                {h.question}
              </div>
            </div>

            {/* User Response/Comment Bubble */}
            <div className="flex items-start justify-end">
              <div className="bg-black text-white border border-black p-3 rounded-none text-xs max-w-[85%] font-mono">
                {h.isDialogue && (
                  <span className="block text-[8px] tracking-wider text-yellow-300 uppercase font-bold mb-1">
                    💬 Dialogue Comment // query:
                  </span>
                )}
                {h.answer}
              </div>
            </div>

            {/* AI Clarifying Reply Bubble if it was Dialogue Mode */}
            {h.isDialogue && h.clarifyingReply && (
              <motion.div 
                initial={{ opacity: 0, y: 5 }} 
                animate={{ opacity: 1, y: 0 }} 
                className="flex items-start max-w-[85%] pl-4"
              >
                <div className="bg-yellow-100 border-2 border-dashed border-black p-3 text-xs text-black font-serif italic">
                  <span className="block text-[8px] uppercase tracking-wider font-mono font-black text-zinc-600 mb-1 leading-none">
                    💡 Guide response & Pivot:
                  </span>
                  "{h.clarifyingReply}"
                </div>
              </motion.div>
            )}
          </div>
        ))}

        {/* Current Active Question Bubble */}
        {currentQuestion && !loading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-2 max-w-[85%]"
          >
            {contextNote && (
              <span className="text-[8px] uppercase tracking-widest font-mono font-bold text-white bg-black px-2 py-0.5 inline-block">
                CRITICAL FOCUS // {contextNote}
              </span>
            )}
            <div className="bg-white border-2 border-black border-l-8 border-l-black p-4 text-xs text-black font-sans shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              {currentQuestion}
            </div>
          </motion.div>
        )}

        {loading && (
          <div className="flex items-start max-w-[85%]">
            <div className="bg-white border-2 border-black p-3.5 text-xs text-black font-mono italic flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" />
              Mapping associations & retrieving deep follow-up...
            </div>
          </div>
        )}

        <div ref={threadEndRef} />
      </div>

      {/* Input panel block */}
      <div className="space-y-3 shrink-0">
        <div className="flex gap-2.5 items-stretch relative">
          
          <input
            type="text"
            placeholder={
              loading 
                ? "Formulating thread..." 
                : isDialogueMode 
                  ? "Converse with AI (e.g. 'Can you explain why you are asking that?')..."
                  : "Respond to the question here..."
            }
            value={answerDraft}
            onChange={(e) => setAnswerDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !loading && handleSendAnswer()}
            disabled={loading}
            className={`flex-1 text-xs border-2 border-black px-4 py-3 focus:outline-none bg-white font-mono text-black transition-colors ${
              isDialogueMode ? "bg-yellow-50 border-yellow-500 ring-2 ring-yellow-400" : ""
            }`}
          />
          
          {/* Hands-free Voice Dictation Microphone Button */}
          <button
            onClick={toggleSpeech}
            disabled={loading}
            type="button"
            className={`px-3 border-2 border-black flex items-center justify-center transition-all cursor-pointer ${
              isRecording 
                ? "bg-red-500 text-white animate-pulse" 
                : "bg-white hover:bg-zinc-100 text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            }`}
            title="Speak your answer (Speech-to-Text)"
          >
            {isRecording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          <button
            disabled={!answerDraft.trim() || loading}
            onClick={handleSendAnswer}
            className="px-5 py-3 border-2 border-black bg-black text-white hover:bg-white hover:text-black font-display font-black text-xs uppercase tracking-wider flex items-center justify-center cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] transition-all"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Conversational Mode Toggle Option Switch button */}
          <button
            onClick={() => setIsDialogueMode((prev) => !prev)}
            type="button"
            className={`flex items-center gap-1.5 px-3 py-1.5 border-2 text-[10px] font-mono uppercase tracking-wider transition-all cursor-pointer ${
              isDialogueMode 
                ? "bg-yellow-300 border-black text-black font-bold" 
                : "bg-zinc-100 border-black text-zinc-650 hover:bg-zinc-200"
            }`}
          >
            <MessageSquareCode className="w-3.5 h-3.5" />
            {isDialogueMode ? "💬 CONVERSATIONAL MODE: ON" : "💬 DIRECT RESPONSE: CHANGE TO CHAT"}
          </button>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSkipQuestion}
              className="text-xs uppercase font-extrabold tracking-wider font-display text-black hover:underline cursor-pointer"
              disabled={loading}
            >
              [Skip / Pivot Question]
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
