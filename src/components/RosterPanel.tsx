import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Users, X, Check, AlertTriangle } from "lucide-react";
import type { AuthorStamp, Session } from "../types";
import { isDeclaredRole, rosterState } from "../utils/roster";
import { resolveVoice, roleKey } from "../utils/voices";
import RoleGroups from "./RoleGroups";

/**
 * Who is in this engagement, and the one card in the app that is about you.
 *
 * This exists because of a number rather than because of a feature. `AuthorStamp.role` is
 * stamped onto every fragment and grouped over by server/ai/coverage.ts to produce `voices` —
 * and until this panel existed there was no surface anywhere that could set a role, so every
 * role in every live engagement was one of two constants the server assigned. The arithmetic
 * was right and its input was a stub: `voices` could reach two in a room of twenty.
 *
 * So the editable half is the point and the list is the context. The list is what makes the
 * editing make sense — you can see that four people have declared and three have not, which is
 * the difference between "a form the app wants filled in" and "the room is half-described".
 *
 * **It says what the role is for, every time.** A role field with no explanation gets a job
 * title, which is not the question. What the level set needs is what you *own here* — the
 * thing that makes "which role is best placed to answer this" answerable at all. That
 * sentence is on the card rather than in documentation nobody opens.
 *
 * **Self-service only, and the server agrees.** `PUT /roster/me` takes the identity from the
 * verified stamp and not from the body, so this cannot edit anybody else even if it tried. The
 * other entries are rendered read-only because that is what they are, not as a UI courtesy.
 */
export default function RosterPanel({
  session,
  viewerEmail,
  onSave,
  onSetRoleGroup,
  onClose,
}: {
  session: Session;
  viewerEmail?: string;
  onSave: (entry: { name: string; role: string }) => Promise<void>;
  /** Absent means grouping cannot be saved from here, so it is not offered. */
  onSetRoleGroup?: (label: string, group: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const { members, declared, total, me } = rosterState(session, viewerEmail);

  const [name, setName] = useState(me?.name ?? "");
  const [role, setRole] = useState(isDeclaredRole(me?.role) ? me!.role : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The poll rewrites the session every fifteen seconds. Re-seeding the fields from it would
  // wipe half-typed text under the person typing it, so this syncs only when the identity of
  // the entry changes — which is a different event from the entry's contents changing.
  useEffect(() => {
    setName(me?.name ?? "");
    setRole(isDeclaredRole(me?.role) ? me!.role : "");
  }, [me?.email]);

  const submit = async () => {
    const trimmed = role.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim() || (me?.name ?? ""), role: trimmed });
      onClose();
    } catch (e) {
      // Kept open with the text intact. A roster edit that silently failed would leave
      // somebody believing they had declared a role they had not.
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 md:p-8 overflow-y-auto"
      onClick={onClose}
      id="roster-panel"
    >
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-paper border-3 border-black shadow-hard-4 my-auto"
      >
        <div className="flex items-start justify-between gap-3 border-b-3 border-black bg-white px-4 py-3">
          <span className="flex items-center gap-2 min-w-0">
            <Users className="w-4 h-4 shrink-0 text-black" />
            <span className="text-xs font-black uppercase font-display tracking-tight text-black">
              Who is in this engagement
            </span>
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-black/50 hover:text-black cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Your own entry. First, because it is the only one you can do anything about. */}
        <div className="p-4 border-b-3 border-black bg-butter">
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-black">
            Your entry
          </span>
          {me ? (
            <>
              <p className="text-[11px] leading-relaxed text-black mt-1.5 mb-3">
                Your role is stamped on every fragment you contribute, and the level set uses it to
                work out which conflicts are real and who is best placed to answer an open question.
                Say what you <strong>own here</strong> — “Owns the billing migration” beats
                “Engineer”.
              </p>
              <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-black mb-1">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                className="w-full border-2 border-black bg-white px-2.5 py-1.5 text-xs text-black mb-3"
                placeholder="How you want to be listed"
              />
              <label className="block text-[9px] font-mono font-bold uppercase tracking-wider text-black mb-1">
                Role
              </label>
              <input
                value={role}
                onChange={(e) => setRole(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                maxLength={120}
                className="w-full border-2 border-black bg-white px-2.5 py-1.5 text-xs text-black"
                placeholder="What you own in this engagement"
              />
              {error && (
                <p className="mt-2 border-2 border-black bg-coral px-2.5 py-1.5 text-[10px] text-black">
                  {error}
                </p>
              )}
              <button
                onClick={submit}
                disabled={!role.trim() || saving}
                className="mt-3 px-3.5 py-1.5 border-2 border-black bg-black text-white text-xs font-bold font-display uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-hard-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save my role"}
              </button>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-black mt-1.5">
              You are not on this roster yet. Contribute a fragment and you will be.
            </p>
          )}
        </div>

        <ul className="p-4 space-y-2">
          {members.map((m) => {
            const voice = resolveVoice(session, m.role);
            return (
              <RosterRow
                key={m.email}
                member={m}
                isMe={m.email === me?.email}
                countsAs={voice.key === roleKey(m.role) ? null : voice.name}
              />
            );
          })}
        </ul>

        {onSetRoleGroup && <RoleGroups session={session} onSet={onSetRoleGroup} />}

        {/* The honest footer, in the same place and for the same reason as CoverageMap's. */}
        <div className="border-t-3 border-black bg-white px-4 py-3">
          <p className="text-[10px] leading-relaxed text-zinc-600">
            <strong className="text-black">
              {declared} of {total}
            </strong>{" "}
            {total === 1 ? "person has" : "people have"} declared a role.
            {declared < total && (
              <>
                {" "}
                The rest are carrying the role the server assigned them, so every{" "}
                <strong className="text-black">voices</strong> count in the coverage map is counting
                those defaults rather than the room.
              </>
            )}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

function RosterRow({
  member,
  isMe,
  countsAs,
}: {
  member: AuthorStamp;
  isMe: boolean;
  /** The group this member's label was filed under, when it was; their own words stay primary. */
  countsAs: string | null;
}) {
  const declared = isDeclaredRole(member.role);
  return (
    <li
      className={`border-2 border-black p-2.5 flex items-center justify-between gap-3 ${
        declared ? "bg-white" : "bg-zinc-100"
      }`}
    >
      <span className="min-w-0">
        <span className="block text-xs font-bold text-black truncate">
          {member.name}
          {isMe && <span className="text-zinc-500 font-normal"> · you</span>}
        </span>
        <span
          className={`block text-[10px] truncate ${declared ? "text-zinc-600" : "text-zinc-500 italic"}`}
        >
          {declared ? member.role : `${member.role} — not declared`}
          {countsAs && <span className="text-zinc-500"> · counts as {countsAs}</span>}
        </span>
      </span>
      {!declared && (
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-black" aria-label="Role not declared" />
      )}
    </li>
  );
}
