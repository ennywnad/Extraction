import { EyeOff } from "lucide-react";
import { AreaCoverage, AreaStatus } from "../types";

/**
 * The map of what a room has *not* discussed.
 *
 * The arithmetic behind this has always been the most distinctive thing the app produces and
 * has never been drawn: server/ai/coverage.ts computes it deliberately outside the model so
 * that a count of zero is right every time, the level set carries it, and until now the only
 * trace of it a human saw was whatever the prose chose to mention.
 *
 * Two things it refuses to imply:
 *
 * **A dark area is a finding, not an error.** It gets the black cell rather than the coral
 * one — coral means misconfigured elsewhere in the app, and there is nothing wrong with a
 * room that has not reached a topic yet. It is the headline, so it is the loudest cell.
 *
 * **A zero only means silence if every fragment was placed.** The classifier assigns
 * fragments to areas, and it can return fewer assignments than there are fragments or names
 * that match no area. Those fragments are then in the pile and in no cell, which makes an
 * area look unspoken when it may only be unplaced. So the footer accounts for the pile
 * rather than leaving the reader to assume it balanced.
 */
const STATUS: Record<AreaStatus, { cell: string; text: string; label: string }> = {
  defined: { cell: "bg-[#51CF66]", text: "text-black", label: "Defined" },
  partial: { cell: "bg-[#FFD43B]", text: "text-black", label: "Partial" },
  dark: { cell: "bg-black", text: "text-white", label: "Dark" },
};

/** Why an area with plenty of fragments can still fall short of "defined". */
function qualifier(area: AreaCoverage): string | null {
  if (area.status === "dark") return "nobody has spoken here";
  if (area.status === "partial" && area.voices === 1) return "one voice only";
  return null;
}

export default function CoverageMap({
  coverage,
  pileSize,
}: {
  coverage: AreaCoverage[];
  pileSize: number;
}) {
  if (!coverage.length) return null;

  const dark = coverage.filter((c) => c.status === "dark");
  const placed = coverage.reduce((sum, c) => sum + c.fragments, 0);
  const unplaced = Math.max(0, pileSize - placed);

  return (
    <div
      className="bg-white border-3 border-black p-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] space-y-5"
      id="coverage-map"
    >
      <div>
        <span className="text-[9px] uppercase tracking-widest font-mono font-bold text-black flex items-center gap-1.5">
          <EyeOff className="w-3.5 h-3.5" />
          COVERAGE MAP
        </span>
        <h2 className="text-lg font-black uppercase text-black font-display tracking-tight mt-1 leading-tight">
          {dark.length === 0
            ? "Every area has been spoken into"
            : `${dark.length} of ${coverage.length} areas still dark`}
        </h2>
        <p className="text-[11px] text-zinc-700 font-sans mt-1">
          Counted, not generated — an area with no fragments reports zero because zero is what it
          has.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {coverage.map((area) => {
          const style = STATUS[area.status];
          const note = qualifier(area);
          return (
            <div
              key={area.area}
              className={`border-2 border-black p-3.5 ${style.cell} ${style.text} flex flex-col gap-2 min-h-[104px]`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-black uppercase font-display tracking-tight leading-tight">
                  {area.area}
                </span>
                <span className="text-[8px] font-mono font-bold uppercase tracking-widest border border-current px-1 py-0.5 shrink-0">
                  {style.label}
                </span>
              </div>
              <div className="mt-auto">
                <span className="block text-[10px] font-mono font-bold tracking-wider">
                  {area.fragments} {area.fragments === 1 ? "fragment" : "fragments"} · {area.voices}{" "}
                  {area.voices === 1 ? "voice" : "voices"}
                </span>
                {note && (
                  <span className="block text-[9px] font-sans italic opacity-80 mt-0.5">
                    {note}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] font-mono text-zinc-700 border-t-2 border-black pt-3 leading-relaxed">
        {placed} of {pileSize} {pileSize === 1 ? "fragment" : "fragments"} placed into an area.
        {unplaced > 0 && (
          <span className="text-black font-bold">
            {" "}
            {unplaced} {unplaced === 1 ? "was" : "were"} not placed by the classifier, so a dark
            area above may be unplaced rather than unspoken.
          </span>
        )}
      </p>
    </div>
  );
}
