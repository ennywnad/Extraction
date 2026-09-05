import { motion } from "motion/react";
import { Waves, UserMinus, X } from "lucide-react";
import { modeLabel, type Echo } from "../utils/chorus";

/**
 * What the pile answers back, the moment after a fragment enters it.
 *
 * Two states, and the second one is the reason the feature exists.
 *
 * **Somebody is near you** — the fragments that share uncommon words with what you just wrote,
 * with the terms they share shown, so the claim is checkable at a glance rather than trusted.
 *
 * **Nobody is near you** — and this is drawn the way CoverageMap draws a dark area, for the
 * same reason and with the same care. Black, not coral: coral means something is misconfigured,
 * and there is nothing wrong with being the only person in the room who has raised something.
 * Every word here is chosen so that "you are alone on this" reads as a lead worth pulling on
 * rather than a verdict on the fragment. Get that wrong and the app tells people they are
 * wrong; get it right and it tells a facilitator, while the person is still in the chair, who
 * is holding something nobody else is.
 *
 * The footer is not decoration. This matches words, not meaning, and a reader who assumes
 * otherwise will read "nobody is near you" as "nobody agrees with you". So the limit is
 * printed on the card every time, in both states.
 */
export default function ChorusCard({ echo, onDismiss }: { echo: Echo; onDismiss: () => void }) {
  // Nothing to say, and no attempt to fill the space. A pile of four fragments cannot tell
  // anyone they are alone, and neither can three words.
  if (echo.silent) return null;

  const headline = echo.isolated
    ? "Nobody else has been here"
    : echo.others > 0
      ? `${echo.others} other${echo.others === 1 ? "" : "s"} ${echo.others === 1 ? "is" : "are"} circling this`
      : `You have been here ${echo.mine === 1 ? "before" : `${echo.mine} times before`}`;

  return (
    <motion.div
      // Entry only. An `exit` here would need an AnimatePresence around it, and this card is
      // not a direct motion child of one — which left it on screen after the state behind it
      // was gone, the one failure a card reporting on the pile must not have.
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`w-full mb-4 border-3 border-black shadow-hard-4 ${
        echo.isolated ? "bg-black text-white" : "bg-sky text-black"
      }`}
      id="chorus-card"
    >
      <div className="flex items-start justify-between gap-3 p-3.5 pb-2">
        <span className="flex items-center gap-2 min-w-0">
          {echo.isolated ? (
            <UserMinus className="w-4 h-4 shrink-0" />
          ) : (
            <Waves className="w-4 h-4 shrink-0" />
          )}
          <span className="text-xs font-black uppercase font-display tracking-tight leading-tight">
            {headline}
          </span>
        </span>
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className={`shrink-0 text-sm font-bold leading-none px-1 cursor-pointer ${
            echo.isolated ? "text-white/60 hover:text-white" : "text-black/50 hover:text-black"
          }`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {echo.isolated ? (
        <p className="px-3.5 pb-3 text-[11px] font-sans leading-relaxed">
          Nothing already in the pile shares uncommon words with what you just wrote. That is a
          finding, not a problem — it usually means you are the only person holding this, which is
          worth saying out loud while everyone is still here.
        </p>
      ) : (
        <ul className="px-3.5 pb-3 space-y-2">
          {echo.neighbours.map((n) => (
            <li key={n.id} className="border-2 border-black bg-white p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-black truncate">
                  {n.author ? `${n.author.name} · ${n.author.role}` : modeLabel(n.mode)}
                </span>
                <span className="flex flex-wrap gap-1 shrink-0 justify-end">
                  {n.shared.map((term) => (
                    <span
                      key={term}
                      className="border border-black bg-butter px-1 py-px text-[8px] font-mono font-bold lowercase"
                    >
                      {term}
                    </span>
                  ))}
                </span>
              </div>
              <p className="text-[11px] text-zinc-800 font-sans leading-snug line-clamp-3">
                {n.text}
              </p>
            </li>
          ))}
        </ul>
      )}

      <p
        className={`px-3.5 py-2 border-t-2 border-black text-[9px] font-mono leading-relaxed ${
          echo.isolated ? "text-white/70" : "text-zinc-700"
        }`}
      >
        Matched on shared uncommon words, not on meaning — somebody may have said the same thing in
        different words. Counted here, never generated.
      </p>
    </motion.div>
  );
}
