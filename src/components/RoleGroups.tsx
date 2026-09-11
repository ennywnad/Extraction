import { useState } from "react";
import { Layers } from "lucide-react";
import type { Session } from "../types";
import { groupingSuggestions, roleLabels, voiceGroups, type RoleLabel } from "../utils/voices";

/**
 * Which role labels count as the same voice.
 *
 * People describe themselves in their own words, which is the point of the roster card — and it
 * means "Finance lead", "FP&A" and "Treasury" arrive as three voices whether or not they are one
 * part of the business. Only somebody who knows the organisation can say, so this is where it is
 * said: suggestions where two labels share a word, and a "counts as" choice on every label for the
 * ones no word gives away.
 *
 * **Open to everyone, for now, and marked as a facilitator's job.** This is the kind of tidying a
 * facilitator does between sessions, but the app has no facilitator to hand it to — "Facilitator"
 * is a default role anyone can type, and who reaches a deployment is an IAM question. So every
 * member can do it and every decision shows who made it. Whether it narrows to a facilitator tier
 * is an open question in docs/intents/011-the-role-brief.md, not a decision this makes.
 *
 * Nobody's words are touched. A label stays on the roster and on every fragment exactly as typed;
 * a group is a separate fact about what that label counts as.
 */
const SELF = "__self__";
const NEW = "__new__";

export default function RoleGroups({
  session,
  onSet,
}: {
  session: Session;
  /** Group a label under another voice, keep it separate (its own spelling), or clear (null). */
  onSet: (label: string, group: string | null) => Promise<void>;
}) {
  const labels = roleLabels(session);
  const suggestions = groupingSuggestions(session);
  const voices = voiceGroups(session);

  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  // One label has nothing to be grouped with.
  if (labels.length < 2) return null;

  const nameOf = (email: string) => session.roster?.[email.toLowerCase()]?.name ?? email;

  const run = async (id: string, writes: [label: string, group: string | null][]) => {
    if (pending || !writes.length) return;
    setPending(id);
    setError(null);
    try {
      for (const [label, group] of writes) await onSet(label, group);
      setNaming(null);
      setNewName("");
    } catch (e) {
      // A regroup that silently failed would leave the room reading a count it believes was
      // corrected, so the reason stays on screen.
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setPending(null);
    }
  };

  const keepSeparate = (...pair: RoleLabel[]): [string, string][] =>
    pair.filter((l) => !l.entry).map((l) => [l.label, l.label]);

  return (
    <div className="p-4 border-t-3 border-black bg-paper space-y-3" id="role-groups">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-black flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          Role groups
        </span>
        <span className="text-[8px] font-mono font-bold uppercase tracking-widest border border-black px-1 py-0.5 text-black shrink-0">
          Facilitator task · open to all for now
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-black">
        The coverage map counts one voice per group, not per spelling — capitals and spacing are
        already ignored. Put labels that speak for the same part of the business together, or keep a
        split that matters. Every change is named.
      </p>

      {error && (
        <p className="border-2 border-black bg-coral px-2.5 py-1.5 text-[10px] text-black">
          {error}
        </p>
      )}

      {suggestions.map(({ a, b, shared }) => {
        const id = `${a.key}|${b.key}`;
        return (
          <div key={id} className="border-2 border-black bg-peach p-2.5 space-y-2">
            <p className="text-[11px] leading-snug text-black">
              <strong>“{a.label}”</strong> and <strong>“{b.label}”</strong> share “
              {shared.join("”, “")}” and are counted as two voices. Same part of the business?
            </p>
            <div className="flex flex-wrap gap-1.5">
              <SmallButton
                disabled={pending !== null}
                onClick={() => run(id, [[b.label, a.voice.name]])}
              >
                Count both as {a.voice.name}
              </SmallButton>
              <SmallButton
                disabled={pending !== null}
                onClick={() => run(id, [[a.label, b.voice.name]])}
              >
                Count both as {b.voice.name}
              </SmallButton>
              <SmallButton disabled={pending !== null} onClick={() => run(id, keepSeparate(a, b))}>
                Keep separate
              </SmallButton>
            </div>
          </div>
        );
      })}

      <ul className="space-y-2">
        {labels.map((label) => {
          const grouped = label.voice.key !== label.key;
          // Only voices that end a chain are offered, and never this label's own — so a choice
          // made here cannot build a loop.
          const targets = voices.filter((v) => v.key !== label.key);
          const count = label.members.length;
          return (
            <li key={label.key} className="border-2 border-black bg-white p-2.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-black truncate">{label.label}</span>
                  <span className="block text-[10px] text-zinc-600">
                    {count === 0
                      ? "nobody on the roster now"
                      : `${count} ${count === 1 ? "person" : "people"}`}
                  </span>
                </span>
                <label className="flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-wider text-black">
                  Counts as
                  <select
                    value={grouped ? label.voice.key : SELF}
                    disabled={pending !== null}
                    onChange={(e) => {
                      const choice = e.target.value;
                      if (choice === NEW) {
                        setNaming(label.key);
                        setNewName("");
                      } else if (choice === SELF) {
                        run(label.key, [[label.label, label.label]]);
                      } else {
                        const target = voices.find((v) => v.key === choice);
                        if (target) run(label.key, [[label.label, target.name]]);
                      }
                    }}
                    className="border-2 border-black bg-white px-1.5 py-1 text-[11px] normal-case tracking-normal font-sans font-normal text-black max-w-48"
                  >
                    <option value={SELF}>Its own voice</option>
                    {targets.map((v) => (
                      <option key={v.key} value={v.key}>
                        {v.name}
                      </option>
                    ))}
                    <option value={NEW}>New group…</option>
                  </select>
                </label>
              </div>

              {label.entry && (
                <p className="text-[10px] text-zinc-600">
                  {grouped ? `Grouped under ${label.entry.group}` : "Kept separate"} by{" "}
                  {nameOf(label.entry.by)}
                </p>
              )}

              {naming === label.key && (
                <div className="flex gap-1.5 pt-1">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" &&
                      newName.trim() &&
                      run(label.key, [[label.label, newName.trim()]])
                    }
                    maxLength={120}
                    placeholder="e.g. Finance"
                    className="flex-1 min-w-0 border-2 border-black bg-white px-2 py-1 text-[11px] text-black"
                  />
                  <SmallButton
                    disabled={!newName.trim() || pending !== null}
                    onClick={() => run(label.key, [[label.label, newName.trim()]])}
                  >
                    Group
                  </SmallButton>
                  <SmallButton onClick={() => setNaming(null)}>Cancel</SmallButton>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SmallButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2.5 py-1 border-2 border-black bg-white text-black text-[10px] font-bold font-display uppercase tracking-wider cursor-pointer shadow-hard-2 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}
