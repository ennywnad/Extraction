import { Calendar, Tag, AlertCircle } from "lucide-react";
import { Thought } from "../../types";

interface TimelineModeProps {
  thoughts: Thought[];
  onUpdateThoughtTimeline: (id: string, zone: "before" | "now" | "after") => void;
}

export default function TimelineMode({ thoughts, onUpdateThoughtTimeline }: TimelineModeProps) {
  return (
    <div className="space-y-6" id="timeline-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <Calendar className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Timeline Mode</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Organize when each thought actually matters: Before (Unprocessed history/origin), Now (Immediate active weight), or After (Future hopes and worries).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Timeline Columns block */}
        {[
          { key: "before", label: "Before / The Past", desc: "Origin context, roots, history", color: "border-t-amber-400 bg-amber-500/10" },
          { key: "now", label: "Now / The Present", desc: "Active situation, current actions", color: "border-t-rose-500 bg-rose-500/10" },
          { key: "after", label: "After / The Future", desc: "Forecasts, hopes, future fears", color: "border-t-indigo-500 bg-indigo-500/10" }
        ].map((col) => {
          const colThoughts = thoughts.filter((t) => t.timelineZone === col.key);
          return (
            <div key={col.key} className={`border border-slate-100 p-4 rounded-2xl min-h-[300px] flex flex-col justify-between ${col.color}`}>
              <div>
                <span className="block text-xs font-bold text-slate-800 uppercase tracking-wider">{col.label}</span>
                <span className="block text-[10px] text-slate-500/80 mb-3">{col.desc}</span>
                
                <div className="space-y-2 overflow-y-auto max-h-[320px] pr-1 custom-scrollbar">
                  {colThoughts.length === 0 ? (
                    <span className="block text-center py-10 text-[10px] text-slate-400/70 border border-dashed border-slate-200/50 rounded-lg bg-white/40">Empty zone</span>
                  ) : (
                    colThoughts.map((t) => (
                      <div key={t.id} className="p-2.5 bg-white border border-slate-150 rounded-xl text-[11px] text-slate-705 shadow-2xs leading-relaxed">
                        {t.text}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Select Assignment Area */}
      <div className="space-y-3 pt-3 border-t border-slate-100 max-h-56 overflow-y-auto custom-scrollbar">
        <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
          Assign Temporal Slots
        </span>
        {thoughts.map((thought) => (
          <div key={thought.id} className="p-3 bg-white border border-slate-150 rounded-xl flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
            <p className="text-xs text-slate-700 leading-relaxed font-normal flex-1">"{thought.text}"</p>
            
            <div className="flex gap-1.5 shrink-0">
              {[
                { zone: "before", label: "Before" },
                { zone: "now", label: "Now" },
                { zone: "after", label: "After" },
              ].map((opt) => (
                <button
                  key={opt.zone}
                  onClick={() => onUpdateThoughtTimeline(thought.id, opt.zone as any)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    thought.timelineZone === opt.zone
                      ? "bg-slate-800 text-white"
                      : "bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-500"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
