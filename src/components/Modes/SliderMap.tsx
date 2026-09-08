import { useState } from "react";
import { Sliders, Sparkles, AlertCircle, PlayCircle, BarChart3, TrendingUp } from "lucide-react";
import { Thought } from "../../types";

interface SliderMapProps {
  thoughts: Thought[];
  onUpdateThought: (id: string, intensity: NonNullable<Thought["intensity"]>) => void;
}

export default function SliderMap({ thoughts, onUpdateThought }: SliderMapProps) {
  const [selectedThoughtId, setSelectedThoughtId] = useState<string | null>(
    thoughts.length > 0 ? thoughts[0].id : null,
  );

  const activeThought = thoughts.find((t) => t.id === selectedThoughtId);

  // Default sliders state
  const urgency = activeThought?.intensity?.urgency ?? 5;
  const certainty = activeThought?.intensity?.certainty ?? 5;
  const emotion = activeThought?.intensity?.emotion ?? 5;
  const actionability = activeThought?.intensity?.actionability ?? 5;

  const handleSliderChange = (
    key: "urgency" | "certainty" | "emotion" | "actionability",
    val: number,
  ) => {
    if (!selectedThoughtId || !activeThought) return;
    const existingIntensity = activeThought.intensity || {
      urgency: 5,
      certainty: 5,
      emotion: 5,
      actionability: 5,
    };
    onUpdateThought(selectedThoughtId, {
      ...existingIntensity,
      [key]: val,
    });
  };

  return (
    <div className="space-y-6" id="slider-map-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <Sliders className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Slider / Intensity Map</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Calibrate the load-bearing weight of each surfaced idea. Rate them along key cognitive
            dimensions to construct a heat-map outline of what actually matters.
          </p>
        </div>
      </div>

      {thoughts.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-200 rounded-2xl bg-slate-50 space-y-3">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-xs text-slate-500 font-medium">
            Capture some thoughts first using Free Stream or Quick Fire.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - Thought Selector list */}
          <div className="lg:col-span-2 space-y-2 border-r border-slate-100 lg:pr-4 h-96 overflow-y-auto custom-scrollbar">
            <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">
              Select Thought Fragment
            </span>
            {thoughts.map((t) => {
              const isSelected = t.id === selectedThoughtId;
              return (
                <button
                  key={t.id}
                  onClick={() => setSelectedThoughtId(t.id)}
                  className={`w-full text-left p-3 text-xs rounded-xl border transition ${
                    isSelected
                      ? "border-indigo-600 bg-indigo-50/20 text-slate-900 font-medium"
                      : "border-slate-100 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <p className="line-clamp-2 leading-relaxed">{t.text}</p>

                  {/* Miniature heat pill count */}
                  {t.intensity && (
                    <div className="flex gap-2.5 mt-2 text-[9px] font-bold text-indigo-600">
                      <span>Urgency: {t.intensity.urgency}/10</span>
                      <span>Emotion: {t.intensity.emotion}/10</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Column - Slider Gauges */}
          <div className="lg:col-span-3 space-y-6">
            {activeThought ? (
              <div className="space-y-6 bg-slate-50/50 p-6 border border-slate-200/80 rounded-2xl">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-500">
                    MAPPING INTENSITIES
                  </span>
                  <p className="text-sm text-slate-800 leading-relaxed font-medium mt-1">
                    "{activeThought.text}"
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Sliders Grid block */}
                  {[
                    {
                      key: "urgency",
                      label: "Urgency (Immediate Action Focus)",
                      lowLabel: "Eventually",
                      highLabel: "Do Today",
                      value: urgency,
                      color: "accent-red-500",
                    },
                    {
                      key: "certainty",
                      label: "Certainty (Confidence Level)",
                      lowLabel: "Gut feeling",
                      highLabel: "100% Confident",
                      value: certainty,
                      color: "accent-indigo-600",
                    },
                    {
                      key: "emotion",
                      label: "Emotional Charge (Stress / Energy level)",
                      lowLabel: "Rational/Neutral",
                      highLabel: "Highly Charged",
                      value: emotion,
                      color: "accent-pink-500",
                    },
                    {
                      key: "actionability",
                      label: "Willingness to Act (Capability)",
                      lowLabel: "Hard to address",
                      highLabel: "Fully actionable",
                      value: actionability,
                      color: "accent-emerald-500",
                    },
                  ].map((slider) => (
                    <div key={slider.key} className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs font-semibold text-slate-700">
                        <span>{slider.label}</span>
                        <span className="text-indigo-600 font-bold">{slider.value} / 10</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="10"
                        value={slider.value}
                        onChange={(e) =>
                          handleSliderChange(slider.key as any, parseInt(e.target.value))
                        }
                        className={`w-full ${slider.color} bg-slate-200 h-1.5 rounded-lg appearance-none cursor-pointer`}
                      />
                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                        <span>{slider.lowLabel}</span>
                        <span>{slider.highLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Micro Intensity Summary Analysis Card */}
                <div className="p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-3 text-xs text-slate-700">
                  <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    {urgency >= 7 && emotion >= 7 ? (
                      <p>
                        🔥 <strong className="text-slate-900 font-semibold">Tension Spot:</strong>{" "}
                        This thought carries both high urgency and emotional energy. This is a
                        critical item for immediate focus and unburdening.
                      </p>
                    ) : actionability >= 7 ? (
                      <p>
                        ✨ <strong className="text-slate-900 font-semibold">Quick Win:</strong>{" "}
                        Easily actionable variable. Let's make sure this becomes a top structured
                        action item in your export.
                      </p>
                    ) : (
                      <p>
                        💡 Calibrating these weights aids the AI in structuring your final outline
                        layers smoothly.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-24 text-slate-400 text-xs">
                Select a thought on the left to begin scaling.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
