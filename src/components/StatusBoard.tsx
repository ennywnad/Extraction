import { Check, Cpu, EyeOff, Maximize2, Settings, X } from "lucide-react";
import type { InstanceStatus } from "../types";
import type { EngagementStats } from "../utils/engagementStats";
import {
  BOX_ORDER,
  STAT_ORDER,
  type BoardBox,
  type BoardPrefs,
  type BoardStat,
} from "../utils/boardPrefs";

/**
 * What this instance is wired to, drawn.
 *
 * "Configuration decides behavior" is the most distinctive thing about how this app is built
 * and the hardest thing to observe: identity, storage and the model each select themselves by
 * the presence of what they need, and until this component the only way to see which branch
 * each took was to curl /healthz or read .env.
 *
 * Three rules hold it:
 *
 * **Shapes, not secrets.** It draws `instanceStatus()` and nothing else, because /healthz is
 * unauthenticated: "Vertex", never the project; "3 in chain", never the model ids. There is
 * nothing here to leak — the payload it renders is guarded by test/status.test.ts.
 *
 * **It says what it cannot see.** The app fails closed: an inconsistent identity config exits
 * the process rather than serving unverified identities, so the most dangerous
 * misconfigurations are exactly the ones with no server left to draw them. A board that shows
 * all green and implies "everything is fine" is lying by omission, so it states the omission.
 *
 * **Configured is not answering.** `storage.live` and the model's `source` are the two places
 * this distinction is real, and both are drawn as such rather than collapsed into a tick.
 *
 * Two variants, one component: the board is somewhere you go to look, the popup sits over the
 * workspace without taking the screen. They differ in layout only — same seams, same counts,
 * and the same preferences object, so a box turned off is off in both.
 */

const GREEN = "var(--color-signal-green)";
const GOLD = "var(--color-signal-amber)";
const CORAL = "var(--color-signal-red)";

interface SeamCard {
  key: BoardBox;
  label: string;
  /** The branch this instance took. */
  value: string;
  /** The branches it did not. */
  others: string[];
  state: string;
  fill: string;
  detail: string;
}

/** The three seams plus the one that does not exist yet, as cards. */
function seamsOf(status: InstanceStatus): SeamCard[] {
  const { identity, storage, model } = status;

  return [
    {
      key: "identity",
      label: "Identity",
      value: identity.mode === "iap" ? "IAP" : "Dev",
      others: identity.mode === "iap" ? ["dev"] : ["iap"],
      state: identity.verified ? "Verified" : "Asserted",
      fill: identity.verified ? GREEN : GOLD,
      detail: identity.verified
        ? "Identities are verified, not asserted — a signed header this process checked itself, on every request."
        : "You are whoever the environment says you are. Correct on a laptop, and the thing that must never reach production.",
    },
    {
      key: "storage",
      label: "Storage",
      value: storage.backend === "firestore" ? "Firestore" : "Local file",
      others: storage.backend === "firestore" ? ["file"] : ["firestore"],
      state: storage.live ? "Opened this process" : "Not opened yet",
      fill: storage.backend === "firestore" && storage.live ? GREEN : GOLD,
      detail: !storage.live
        ? "Configured, but nothing has read from it in this process. Whether it answers is still unknown."
        : storage.backend === "firestore"
          ? "A shared pile, held outside this container and surviving it."
          : "A JSON file under .data/ — which is why a fresh clone runs with no cloud setup at all. On a deployment it would mean the shared pile is on a disk that vanishes with the instance.",
    },
    {
      key: "model",
      label: "Model",
      value:
        model.backend === "vertex" ? "Vertex" : model.backend === "apikey" ? "API key" : "None",
      others: (["vertex", "apikey", "none"] as const)
        .filter((b) => b !== model.backend)
        .map((b) => (b === "apikey" ? "api key" : b)),
      state: model.backend === "none" ? "Nothing configured" : "A client was built",
      fill: model.backend === "none" ? CORAL : GREEN,
      detail:
        model.backend === "none"
          ? "Nothing is broken. Every route has a fixed answer, and labels the response so nobody mistakes it for a generated one."
          : `${model.chainLength} model ${model.chainLength === 1 ? "id is" : "ids are"} tried in order, and only for “this id is not served here”. Which ones is deployment topology, so it stays off this screen.`,
    },
    {
      key: "mcp",
      label: "MCP",
      value: "No clients",
      others: [],
      state: "Not served",
      fill: "var(--color-zinc-200)",
      detail:
        "The store seam it would adapt is real; the server over the pile is not built yet. This box stays grey until it is.",
    },
  ];
}

interface StatTile {
  key: BoardStat;
  label: string;
  value: string;
  note: string;
  /** Marked where the number means something narrower than its label suggests. */
  caveat?: boolean;
}

function tilesOf(stats: EngagementStats): StatTile[] {
  const tiles: StatTile[] = [
    {
      key: "roster",
      label: "On the roster",
      value: String(stats.roster),
      note: "opened the engagement — silent or not",
    },
    {
      key: "polling",
      label: "Polling now",
      value: stats.polling === null ? "—" : String(stats.polling),
      note: "tabs asking in the last 60s — two tabs, two counts",
      caveat: true,
    },
    {
      key: "fragments",
      label: "Fragments",
      value: String(stats.fragments),
      note: "the whole pile",
    },
    {
      key: "voices",
      label: "Voices",
      value: String(stats.voices),
      note: "of those on the roster, the ones who have written",
    },
    {
      key: "modes",
      label: "Modes used",
      value: `${stats.modesUsed} / ${stats.modesTotal}`,
      note: "distinct modes fragments came from",
    },
    {
      key: "recent",
      label: "Last 5 min",
      value: String(stats.recent),
      note: "fragments, by timestamp",
    },
    {
      key: "roles",
      label: "Roles",
      value: String(stats.roles),
      note: "distinct roles — what the level set reasons over",
    },
    {
      key: "dark",
      label: "Areas dark",
      value: stats.dark ? `${stats.dark.dark} / ${stats.dark.total}` : "—",
      note: stats.dark
        ? "from the last level set; the coverage map says more"
        : "no level set generated yet",
    },
    {
      key: "age",
      label: "Open for",
      value: `${stats.ageMinutes}m`,
      note: "since the engagement was created",
    },
  ];
  return STAT_ORDER.map((key) => tiles.find((t) => t.key === key)!);
}

const MONO = "font-mono font-bold uppercase tracking-wider text-black";

/**
 * One branch label. A function rather than a component so the key sits on a DOM element —
 * this project carries no @types/react, so `key` on a custom component is a type error.
 */
function chip(text: string, fill?: string, key?: string) {
  return fill ? (
    <span
      key={key}
      className={`border-2 border-black px-1.5 py-0.5 text-[9px] ${MONO}`}
      style={{ backgroundColor: fill }}
    >
      {text}
    </span>
  ) : (
    <span
      key={key}
      className="border-2 border-zinc-300 bg-white px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wider text-zinc-400"
    >
      {text}
    </span>
  );
}

function Cannot({ compact }: { compact?: boolean }) {
  return (
    <div className="border-2 border-black bg-coral p-3.5 flex gap-3 items-start">
      <EyeOff className="w-4 h-4 shrink-0 mt-0.5" />
      <p className="text-[11px] leading-relaxed text-zinc-800">
        <span className={`text-[10px] ${MONO}`}>
          {compact ? "Not the state space — " : "These boxes are not the state space — "}
        </span>
        an inconsistent identity configuration exits the process rather than serving unverified
        identities, so the most dangerous misconfigurations never reach a screen. All green means
        these seams answered, not that everything is fine.
      </p>
    </div>
  );
}

function SettingsPanel({
  prefs,
  onChange,
  tiles,
}: {
  prefs: BoardPrefs;
  onChange: (next: BoardPrefs) => void;
  tiles: StatTile[];
}) {
  const toggleBox = (key: BoardBox) =>
    onChange({ ...prefs, boxes: { ...prefs.boxes, [key]: !prefs.boxes[key] } });
  const toggleStat = (key: BoardStat) =>
    onChange({ ...prefs, stats: { ...prefs.stats, [key]: !prefs.stats[key] } });

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-zinc-500">
          Boxes
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          {BOX_ORDER.map((key) => (
            <button
              key={key}
              onClick={() => toggleBox(key)}
              aria-pressed={prefs.boxes[key]}
              className="border-2 border-black bg-white px-2 py-1.5 flex items-center justify-between gap-2 cursor-pointer"
            >
              <span className={`text-[10px] ${MONO}`}>{key}</span>
              <span
                className="w-[30px] h-4 border-2 border-black flex items-center p-0.5 shrink-0"
                style={{
                  backgroundColor: prefs.boxes[key] ? GREEN : "var(--color-white)",
                  justifyContent: prefs.boxes[key] ? "flex-end" : "flex-start",
                }}
              >
                <span className="w-2.5 h-2.5 bg-black" />
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-zinc-500">
          Stats
        </span>
        {/* A heading over an empty box is a control that does nothing. In a solo session there
            is no roster and no shared pile, so there is nothing to offer here yet. */}
        {tiles.length === 0 ? (
          <p className="text-[10px] leading-snug text-zinc-500">
            Nothing to count until an engagement is open.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              {tiles.map((tile) => (
                <button
                  key={tile.key}
                  onClick={() => toggleStat(tile.key)}
                  aria-pressed={prefs.stats[tile.key]}
                  className="border-2 border-black bg-white px-2 py-1 flex items-center gap-2 cursor-pointer text-left"
                >
                  <span
                    className="w-4 h-4 border-2 border-black flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: prefs.stats[tile.key] ? GREEN : "var(--color-white)",
                    }}
                  >
                    {prefs.stats[tile.key] && <Check className="w-2.5 h-2.5" strokeWidth={4} />}
                  </span>
                  <span className={`text-[9px] grow ${MONO}`}>{tile.label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-snug text-zinc-500">
              Counted from the pile this browser already polls, except{" "}
              <strong className="text-black">Polling now</strong>, which the server counts per
              instance.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export interface StatusBoardProps {
  status: InstanceStatus | null;
  /** Null in solo mode: no engagement id means no roster and no shared pile to count. */
  stats: EngagementStats | null;
  prefs: BoardPrefs;
  onPrefsChange: (next: BoardPrefs) => void;
  settingsOpen: boolean;
  onSettingsToggle: () => void;
  variant?: "board" | "popup";
  onClose?: () => void;
  /** Offered by the popup: the same facts with room to read them. */
  onExpand?: () => void;
}

export default function StatusBoard({
  status,
  stats,
  prefs,
  onPrefsChange,
  settingsOpen,
  onSettingsToggle,
  variant = "board",
  onClose,
  onExpand,
}: StatusBoardProps) {
  // /healthz has not answered (or could not). Saying so is the point of the component — a
  // board that renders defaults here would be inventing the very facts it exists to report.
  if (!status) {
    return (
      <div id="status-board" className="bg-white border-3 border-black p-5 shadow-hard-4">
        <span className={`text-[9px] ${MONO}`}>Instance status</span>
        <p className="text-xs text-zinc-700 mt-1">
          The server has not said what it is wired to. Nothing here is a claim about this
          deployment.
        </p>
      </div>
    );
  }

  const seams = seamsOf(status).filter((s) => prefs.boxes[s.key]);
  const allTiles = stats ? tilesOf(stats) : [];
  const tiles = allTiles.filter((t) => prefs.stats[t.key]);
  const configured = [
    status.identity.verified,
    status.storage.backend === "firestore" && status.storage.live,
    status.model.backend !== "none",
  ].filter(Boolean).length;

  const eyebrow = (
    <span className={`text-[9px] flex items-center gap-1.5 whitespace-nowrap ${MONO}`}>
      <Cpu className="w-3.5 h-3.5 shrink-0" />
      Instance status · /healthz
    </span>
  );

  const title = (
    <h2 className="font-display font-bold uppercase tracking-tight leading-none text-black text-xl md:text-2xl">
      {status.identity.verified ? "Wired for a group engagement" : "Running on the dev branch"}
    </h2>
  );

  const seamCount = (
    <span
      className={`border-2 border-black px-2.5 py-1 text-[10px] shadow-hard-4 ${MONO}`}
      style={{ backgroundColor: configured === 3 ? GREEN : configured === 0 ? CORAL : GOLD }}
    >
      {configured} of 3 seams configured
    </span>
  );

  const controls = (
    <div className="flex items-center gap-2 shrink-0">
      {onExpand && (
        <button
          onClick={onExpand}
          aria-label="Open the full board"
          className="border-2 border-black bg-white w-9 h-9 flex items-center justify-center shadow-hard-3 cursor-pointer"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={onSettingsToggle}
        aria-label="What to show"
        aria-expanded={settingsOpen}
        className="border-2 border-black w-9 h-9 flex items-center justify-center shadow-hard-3 cursor-pointer"
        style={{ backgroundColor: settingsOpen ? GOLD : "var(--color-white)" }}
      >
        <Settings className="w-4 h-4" />
      </button>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="border-2 border-black bg-white w-9 h-9 flex items-center justify-center shadow-hard-3 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  // The popup stacks its header: at 380px the controls and the badge leave the title a column
  // about ten characters wide, and the heading breaks into four lines of one word.
  const header =
    variant === "popup" ? (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          {eyebrow}
          {controls}
        </div>
        {title}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-zinc-600">
            Three seams, in the order a request meets them.
          </p>
          {seamCount}
        </div>
      </div>
    ) : (
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          {eyebrow}
          {title}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {seamCount}
          {controls}
        </div>
      </div>
    );

  const statStrip =
    stats === null ? (
      <div className="border-2 border-black bg-white p-3.5 shadow-hard-4 flex flex-col gap-1">
        <span className={`text-[9px] ${MONO}`}>Engagement stats</span>
        <span className="font-display font-bold uppercase tracking-tight text-zinc-400 text-lg leading-none">
          Solo — none
        </span>
        <span className="text-[11px] leading-snug text-zinc-600">
          No engagement id, so there is no roster and no shared pile to count. The fragments are in
          this browser.
        </span>
      </div>
    ) : (
      tiles.length > 0 && (
        <div
          className={variant === "popup" ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-3"}
          id="status-board-stats"
        >
          {tiles.map((tile) =>
            variant === "popup" ? (
              <div
                key={tile.key}
                className="border-2 border-black bg-paper px-2.5 py-2 flex items-baseline justify-between gap-2"
              >
                <span className={`text-[9px] ${MONO}`}>{tile.label}</span>
                <span className="font-display font-bold tracking-tight text-lg leading-none text-black">
                  {tile.value}
                </span>
              </div>
            ) : (
              <div
                key={tile.key}
                className="grow basis-[150px] border-2 border-black bg-white p-3.5 shadow-hard-4 flex flex-col gap-1"
              >
                <span className={`text-[9px] ${MONO}`}>{tile.label}</span>
                <span className="font-display font-bold tracking-tight text-3xl leading-none text-black">
                  {tile.value}
                </span>
                <span className="text-[10px] leading-snug text-zinc-500">{tile.note}</span>
              </div>
            ),
          )}
        </div>
      )
    );

  if (variant === "popup") {
    return (
      <div
        id="status-board"
        className="w-[380px] max-w-[92vw] bg-white border-3 border-black p-5 shadow-hard-8 flex flex-col gap-3 max-h-[85vh] overflow-y-auto"
      >
        {header}
        {settingsOpen && (
          <div className="border-2 border-black bg-paper p-3">
            <SettingsPanel prefs={prefs} onChange={onPrefsChange} tiles={allTiles} />
          </div>
        )}
        <div className="flex flex-col gap-2.5">
          {seams.map((seam) => (
            <div key={seam.key} className="border-2 border-black bg-white shadow-hard-3 flex">
              <div
                className="w-3 border-r-2 border-black shrink-0"
                style={{ backgroundColor: seam.fill }}
              />
              <div className="grow p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[9px] ${MONO}`}>{seam.label}</span>
                  <span className="font-display font-bold uppercase tracking-tight text-[17px] leading-none text-black">
                    {seam.value}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {chip(seam.state, seam.fill)}
                  {seam.others.map((other) => chip(other, undefined, other))}
                </div>
                <span className="text-[11px] leading-snug text-zinc-600">{seam.detail}</span>
              </div>
            </div>
          ))}
        </div>
        {statStrip}
        <Cannot compact />
      </div>
    );
  }

  const model = seams.find((s) => s.key === "model");
  const rest = seams.filter((s) => s.key !== "model");

  return (
    <div id="status-board" className="bg-paper p-6 flex flex-col gap-4 relative">
      {header}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {model && (
          <div className="md:col-span-2 md:row-span-2 border-2 border-black bg-white p-5 shadow-hard-4 flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <span className={`text-[10px] ${MONO}`}>Model</span>
              {chip(model.state, model.fill)}
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-display font-bold uppercase tracking-tight text-4xl leading-none text-black">
                {model.value}
              </span>
              <span className="font-mono text-xs text-zinc-400">
                {status.model.backend === "vertex"
                  ? "ADC · no key material"
                  : status.model.backend === "apikey"
                    ? "key material, held locally"
                    : "no client was built"}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {model.others.map((other) => chip(other, undefined, other))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className={`text-[9px] ${MONO}`}>
                {status.model.chainLength > 0
                  ? `Fallback chain · ${status.model.chainLength} deep`
                  : "Fallback chain · empty"}
              </span>
              {/* One slot per model id, and never a slot more: the label says how deep the
                  chain is, so a row of three boxes beside the words "2 deep" is the board
                  overstating what it was told. An empty chain gets one dashed bar instead. */}
              <div className="flex gap-2">
                {status.model.chainLength === 0 ? (
                  <div
                    data-chain-slot="empty"
                    className="grow h-5 border-2 border-dashed border-zinc-300 bg-white"
                  />
                ) : (
                  Array.from({ length: status.model.chainLength }).map((_, i) => (
                    <div
                      key={i}
                      data-chain-slot={i === 0 ? "first" : "later"}
                      className="grow h-5 border-2 border-black"
                      style={{ backgroundColor: i === 0 ? GREEN : "var(--color-white)" }}
                    />
                  ))
                )}
              </div>
              <span className="text-[11px] leading-snug text-zinc-600">{model.detail}</span>
            </div>
          </div>
        )}

        {rest.map((seam) => (
          <div
            key={seam.key}
            className="border-2 border-black bg-white p-4 shadow-hard-4 flex flex-col gap-2"
          >
            <span className={`text-[9px] ${MONO}`}>{seam.label}</span>
            <span className="font-display font-bold uppercase tracking-tight text-2xl leading-none text-black">
              {seam.value}
            </span>
            <div className="flex gap-1.5 flex-wrap">
              {chip(seam.state, seam.fill)}
              {seam.others.map((other) => chip(other, undefined, other))}
            </div>
            <span className="text-[11px] leading-snug text-zinc-600">{seam.detail}</span>
          </div>
        ))}
      </div>

      {statStrip}
      <Cannot />

      {settingsOpen && (
        <div className="absolute top-20 right-6 w-[320px] bg-white border-3 border-black p-4 shadow-hard-8 z-10 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-display font-bold uppercase tracking-tight text-black">
              What to show
            </span>
            <button
              onClick={onSettingsToggle}
              aria-label="Close settings"
              className="border-2 border-black bg-white w-6 h-6 flex items-center justify-center cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <SettingsPanel prefs={prefs} onChange={onPrefsChange} tiles={allTiles} />
        </div>
      )}
    </div>
  );
}
