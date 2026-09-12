import { useEffect, useState, useSyncExternalStore } from "react";
import { Cpu, Check } from "lucide-react";
import {
  assist,
  acceptAssist,
  clearAccepted,
  currentAssists,
  ready,
  subscribeToAssists,
  type Assist,
} from "../local/assist";
import { anyAssistOn } from "../utils/assistPrefs";
import type { LocalBackend } from "../local/types";

/**
 * What a local model would file your own draft under, offered where a filing decision belongs.
 *
 * **It is asked for, never volunteered.** docs/intents/006 names the tension this feature has
 * with the product and it is a real one: the app exists to get raw thought out before the
 * editing voice arrives, and Quick Fire clears the box on Enter precisely so you cannot go back
 * and polish. Anything that reads your half-formed sentence back to you while you are still
 * writing it is an anchoring machine — the same objection ChorusCard answers by firing only
 * after a fragment is committed, which this cannot do because the whole point is that the author
 * accepts or rejects before submitting. So the answer is a button. Nothing is scored, and
 * nothing is fetched, until somebody presses it.
 *
 * **Reformatting is a filing decision, not a writing one**, which is why this suggests where a
 * fragment belongs and never touches a word of it. There is no "clean this up" here and that is
 * deliberate: 006 rates the rewriting assists as buildable and then argues against them, and the
 * suggestion stands or falls on the author's judgement either way.
 *
 * **A suggestion, not a verdict.** The chips are inert until clicked, clicking one is the
 * acceptance that gets recorded on the fragment, and clicking it again takes it back. An assist
 * that applied itself would make the author a rubber stamp, and a rubber stamp is not the
 * verification step 006's whole safety argument rests on.
 */
export default function AssistBar({ text }: { text: string }) {
  // One prop, and it is the draft. Which assists are on and which runtime answers are both read
  // from the store, so a mode adding this writes `<AssistBar text={draft} />` and nothing else —
  // the same property askModel.ts gives a mode that needs the model seam.
  const prefs = useSyncExternalStore(subscribeToAssists, currentAssists, currentAssists);
  const [backend, setBackend] = useState<LocalBackend | null>(null);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<Assist | null>(null);
  const [taken, setTaken] = useState<{ tag: boolean; area: boolean }>({ tag: false, area: false });
  const [asked, setAsked] = useState(false);

  // Probed only once something is switched on — the module does nothing until asked, and a
  // feature that is off by default has to be genuinely free rather than merely quiet.
  useEffect(() => {
    if (!anyAssistOn(prefs)) {
      setBackend(null);
      return;
    }
    let live = true;
    ready().then((b) => {
      if (live) setBackend(b);
    });
    return () => {
      live = false;
    };
  }, [prefs]);

  // The draft moved on, so everything said about the old one is void — including the acceptance
  // held in the module, which is keyed by text and would otherwise sit there looking valid.
  useEffect(() => {
    setOffer(null);
    setAsked(false);
    setTaken({ tag: false, area: false });
    clearAccepted();
  }, [text]);

  const run = async () => {
    setBusy(true);
    try {
      setOffer(await assist(text));
    } finally {
      // Asked, whatever came back. Without this an honest "nothing to suggest" is indistinguishable
      // from a button that did nothing, and the person presses it again.
      setAsked(true);
      setBusy(false);
    }
  };

  const toggle = (which: "tag" | "area") => {
    if (!offer) return;
    const next = { ...taken, [which]: !taken[which] };
    setTaken(next);
    // Only what is currently accepted is recorded, and an acceptance emptied by unclicking is
    // cleared rather than written as an empty stamp — a fragment carrying a backend name and no
    // suggestion would claim a model was involved in a filing nobody took.
    const value: Assist = {
      backend,
      tag: next.tag ? offer.tag : undefined,
      area: next.area ? offer.area : undefined,
    };
    if (value.tag || value.area) acceptAssist(text, value);
    else clearAccepted();
  };

  if (!backend || !text.trim()) return null;

  return (
    <div className="w-full border-3 border-black bg-mist shadow-hard-2" id="assist-bar">
      <div className="flex items-center gap-2 flex-wrap p-2.5">
        <Cpu className="w-3.5 h-3.5 shrink-0" />
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-black">
          {backend === "in-page" ? "On-device" : "Local model"}
        </span>

        {!offer && (
          <button
            onClick={run}
            disabled={busy}
            className="ml-auto px-2.5 py-1 border-2 border-black bg-white hover:bg-butter disabled:opacity-50 text-[10px] font-black font-display uppercase tracking-wider cursor-pointer shadow-hard-1 transition-all"
          >
            {busy ? "Reading…" : asked ? "Ask again" : "Suggest a filing"}
          </button>
        )}

        {offer?.tag && <Chip label={offer.tag} taken={taken.tag} onClick={() => toggle("tag")} />}
        {offer?.area && (
          <Chip label={offer.area} taken={taken.area} onClick={() => toggle("area")} />
        )}
      </div>

      {asked && !offer && (
        <p className="px-2.5 pb-2.5 text-[10px] font-sans leading-snug text-zinc-700">
          Nothing to suggest — this does not sit clearly in one tag or one area. That is an answer,
          not a failure; file it yourself or leave it unfiled.
        </p>
      )}

      {offer && (
        <p className="px-2.5 pb-2.5 border-t-2 border-black pt-2 text-[9px] font-mono leading-relaxed text-zinc-700">
          Suggested on this machine, from your draft alone — nothing here left your browser, and
          nothing is recorded unless you accept it.
        </p>
      )}
    </div>
  );
}

function Chip({ label, taken, onClick }: { label: string; taken: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={taken}
      className={`flex items-center gap-1 px-2 py-1 border-2 border-black text-[10px] font-mono font-bold lowercase cursor-pointer shadow-hard-1 transition-all ${
        taken ? "bg-sage text-black" : "bg-white hover:bg-sky text-black"
      }`}
    >
      {taken && <Check className="w-3 h-3 shrink-0" />}
      {label}
    </button>
  );
}
