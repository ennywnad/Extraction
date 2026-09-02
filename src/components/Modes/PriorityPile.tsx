import { Sparkles, Layers, ListTodo, AlertCircle } from "lucide-react";
import { Thought } from "../../types";

interface PriorityPileProps {
  thoughts: Thought[];
  onUpdateThoughtPriority: (id: string, zone: "act" | "watch" | "discard") => void;
}

export default function PriorityPile({ thoughts, onUpdateThoughtPriority }: PriorityPileProps) {
  return (
    <div className="space-y-6" id="priority-pile-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <ListTodo className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Priority Pile / Eisenhower Setup</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Identify what you actually need to do. Sort your compiled insights into Action Piles:
            "Act On This" (Actionable), "Worth Watching" (Monitor), or "Leave/Discard" (Noise).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Core Zone lists */}
        {[
          {
            key: "act",
            label: "Act On This",
            desc: "Top action goals & focus points",
            textStyle: "text-emerald-700 bg-emerald-550/10 border-t-emerald-500",
          },
          {
            key: "watch",
            label: "Worth Watching",
            desc: "Monitor periodically, medium weight",
            textStyle: "text-indigo-700 bg-indigo-550/10 border-t-indigo-500",
          },
          {
            key: "discard",
            label: "Good to know / Leave It",
            desc: "Noise, non-actionable elements",
            textStyle: "text-slate-500 bg-slate-200/50 border-t-slate-300",
          },
        ].map((zone) => {
          const zoneThoughts = thoughts.filter((t) => t.priorityZone === zone.key);
          return (
            <div
              key={zone.key}
              className={`border border-slate-100 p-4 rounded-2xl min-h-[300px] flex flex-col justify-between ${zone.textStyle}`}
            >
              <div>
                <span className="block text-xs font-bold uppercase tracking-wider">
                  {zone.label}
                </span>
                <span className="block text-[10px] opacity-70 mb-3">{zone.desc}</span>

                <div className="space-y-2 overflow-y-auto max-h-[320px] pr-1 custom-scrollbar">
                  {zoneThoughts.length === 0 ? (
                    <span className="block text-center py-10 text-[10px] italic opacity-50 border border-dashed rounded-lg bg-white/45">
                      No elements sorted
                    </span>
                  ) : (
                    zoneThoughts.map((t) => (
                      <div
                        key={t.id}
                        className="p-2.5 bg-white border border-slate-150 rounded-xl text-[11px] text-slate-705 shadow-2xs leading-relaxed"
                      >
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

      {/* Interactive Sorting table list */}
      <div className="space-y-3 pt-3 border-t border-slate-100 max-h-56 overflow-y-auto custom-scrollbar">
        <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
          Rank Action priorities
        </span>
        {thoughts.map((thought) => (
          <div
            key={thought.id}
            className="p-3 bg-white border border-slate-150 rounded-xl flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center"
          >
            <p className="text-xs text-slate-700 leading-relaxed font-normal flex-1">
              "{thought.text}"
            </p>

            <div className="flex gap-1.5 shrink-0">
              {[
                { zone: "act", label: "Act" },
                { zone: "watch", label: "Watch" },
                { zone: "discard", label: "Leave It" },
              ].map((opt) => (
                <button
                  key={opt.zone}
                  onClick={() => onUpdateThoughtPriority(thought.id, opt.zone as any)}
                  className={`px-3.5 py-1.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    thought.priorityZone === opt.zone
                      ? "bg-slate-800 text-white"
                      : "bg-slate-50 hover:bg-slate-100 border border-slate-205 text-slate-505"
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
