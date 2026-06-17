import { useState } from "react";
import { Folder, FolderPlus, Tag, Check, HelpCircle, Sparkles, FolderOpen, AlertCircle } from "lucide-react";
import { Thought } from "../../types";

interface CardSortProps {
  thoughts: Thought[];
  onUpdateThoughtCluster: (id: string, category: string) => void;
}

export default function CardSort({ thoughts, onUpdateThoughtCluster }: CardSortProps) {
  const [categories, setCategories] = useState<string[]>([
    "Primary Goals",
    "Mental Barriers",
    "Action Tasks",
    "Loose Details",
  ]);
  const [newCatName, setNewCatName] = useState("");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | "all">("all");

  const handleAddCategory = () => {
    if (!newCatName.trim() || categories.includes(newCatName.trim())) return;
    setCategories([...categories, newCatName.trim()]);
    setNewCatName("");
  };

  const handleRemoveCategory = (cat: string) => {
    setCategories(categories.filter((c) => c !== cat));
    // Reset clustered thoughts targeting this
    thoughts.forEach((t) => {
      if (t.clusterCategory === cat) {
        onUpdateThoughtCluster(t.id, "");
      }
    });
  };

  return (
    <div className="space-y-6" id="card-sort-mode">
      <div className="bg-slate-50 border border-slate-100 p-4.5 rounded-2xl flex items-start gap-4">
        <FolderOpen className="w-5 h-5 text-teal-500 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-xs text-slate-800">Card Sort / Cluster Sorting</h3>
          <p className="text-[11px] text-slate-500 leading-normal mt-0.5">
            Group scattered thoughts into logical thematic buckets. Creating clear buckets allows Gemini to structure the headings/subheadings in your final synthesized layout.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left panel - Manage theme buckets */}
        <div className="lg:col-span-1 space-y-4 border-r border-slate-100 lg:pr-5">
          <span className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">
            Thematic Buckets
          </span>

          <div className="space-y-1.5 scroll-y max-h-56 overflow-y-auto custom-scrollbar">
            {categories.map((cat) => {
              const count = thoughts.filter((t) => t.clusterCategory === cat).length;
              return (
                <div
                  key={cat}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl text-xs text-slate-700"
                >
                  <span className="truncate pr-2 font-medium flex items-center gap-1.5">
                    <Folder className="w-3.5 h-3.5 text-indigo-505" />
                    {cat}
                  </span>
                  <span className="bg-slate-200 text-slate-700 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full shrink-0">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="pt-3 border-t border-slate-100 space-y-2">
            <input
              type="text"
              placeholder="Create folder bucket..."
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white"
            />
            <button
              onClick={handleAddCategory}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition"
            >
              <FolderPlus className="w-3.5 h-3.5" />
              Add Bucket
            </button>
          </div>
        </div>

        {/* Right panel - Clustered cards sorting dashboard */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Unsorted and Sorted Pile
            </span>
            <div className="flex gap-1">
              {["all", "unsorted", ...categories].map((filterTab) => {
                const count =
                  filterTab === "all"
                    ? thoughts.length
                    : filterTab === "unsorted"
                    ? thoughts.filter((t) => !t.clusterCategory).length
                    : thoughts.filter((t) => t.clusterCategory === filterTab).length;
                if (count === 0 && filterTab !== "all" && filterTab !== "unsorted") return null;

                const isTabActive = activeCategoryFilter === filterTab;
                return (
                  <button
                    key={filterTab}
                    onClick={() => setActiveCategoryFilter(filterTab)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold capitalize transition cursor-pointer ${
                      isTabActive
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-655"
                    }`}
                  >
                    {filterTab} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 max-h-[420px] overflow-y-auto p-1 custom-scrollbar">
            {thoughts.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                Capture some thoughts first using stream/fire tools to play sorting!
              </div>
            ) : (
              thoughts
                .filter((t) => {
                  if (activeCategoryFilter === "all") return true;
                  if (activeCategoryFilter === "unsorted") return !t.clusterCategory;
                  return t.clusterCategory === activeCategoryFilter;
                })
                .map((thought) => (
                  <div
                    key={thought.id}
                    className="p-3.5 bg-white border border-slate-200 shadow-2xs rounded-xl flex flex-col md:flex-row justify-between gap-4 items-start md:items-center"
                  >
                    <p className="text-xs text-slate-700 leading-relaxed font-normal flex-1">
                      "{thought.text}"
                    </p>

                    {/* Bucket placement tools dropdown */}
                    <div className="flex items-center gap-1.5 shrink-0 w-full md:w-auto justify-end">
                      <Tag className="w-3.5 h-3.5 text-slate-400" />
                      <select
                        value={thought.clusterCategory || ""}
                        onChange={(e) => onUpdateThoughtCluster(thought.id, e.target.value)}
                        className="text-[11px] bg-slate-50 border border-slate-200 rounded-lg py-1 px-3.5 text-slate-600 focus:ring-0 focus:outline-none min-w-[124px]"
                      >
                        <option value="">-- No Bucket --</option>
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
