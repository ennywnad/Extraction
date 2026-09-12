/**
 * The EngagementStore contract, run against every implementation of it.
 *
 * The rules group mode depends on — no fragment lost under concurrent contribution, a version
 * that answers without reading the pile, a patch that cannot invent an engagement — are stated
 * as prose on the interface in server/store/types.ts and were only ever *executed* against
 * `FileEngagementStore`. The production store had never run at all, which is the first row of
 * the table in docs/intents/008-deploying-group-mode.md. Everything the route layer above it
 * is tested on was therefore proven of one implementation and assumed of the other.
 *
 * So the assertions live here once and both stores answer them:
 *
 *   FileEngagementStore      always, under a temp directory
 *   FirestoreEngagementStore when FIRESTORE_EMULATOR_HOST is set, else skipped
 *
 *     gcloud emulators firestore start --host-port=localhost:8484
 *     FIRESTORE_EMULATOR_HOST=localhost:8484 npm test
 *
 * What the emulator does and does not buy: it runs the real `@google-cloud/firestore` client
 * and the real query, batch, aggregation and FieldPath semantics this store depends on, which
 * is where a divergence between the two implementations would live. It does not exercise
 * Application Default Credentials, IAM, or firestore.rules — those are still first exercised
 * by a deployment.
 */
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileEngagementStore } from "../server/store/fileEngagementStore.ts";
import type { EngagementStore } from "../server/store/types.ts";
import type { AuthorStamp, Thought } from "../src/types.ts";

const FACILITATOR: AuthorStamp = {
  email: "s.lindqvist@northwind.com",
  name: "S Lindqvist",
  role: "Facilitator",
};
const CONTRIBUTOR: AuthorStamp = {
  email: "j.okonkwo@northwind.com",
  name: "J Okonkwo",
  role: "Contributor",
};

/** Distinct timestamps: both stores promise newest-first, and only one of them ties on equal. */
const fragment = (id: string, secondsAgo: number, author = FACILITATOR): Thought => ({
  id,
  text: `fragment ${id}`,
  timestamp: new Date(Date.UTC(2026, 8, 3, 12, 0, 60 - secondsAgo)).toISOString(),
  mode: "free_stream",
  author,
});

function contractSuite(label: string, makeStore: () => Promise<EngagementStore>) {
  describe(`EngagementStore contract: ${label}`, () => {
    let store: EngagementStore;
    before(async () => {
      store = await makeStore();
    });

    const seed = () => store.createEngagement({ topic: "t", intention: "i", creator: FACILITATOR });

    it("seeds a new engagement with the creator on the roster and an empty pile", async () => {
      const session = await seed();
      assert.equal(session.engagementId, session.id, "engagementId is the group-mode switch");
      assert.deepEqual(session.roster, { [FACILITATOR.email]: FACILITATOR });
      assert.deepEqual(session.thoughts, []);

      const read = await store.getEngagement(session.id);
      assert.equal(read?.topic, "t");
      assert.deepEqual(read?.thoughts, []);
    });

    it("reassembles fragments onto Session.thoughts, newest first", async () => {
      const { id } = await seed();
      await store.addThought(id, fragment("older", 30));
      await store.addThought(id, fragment("newer", 5));

      const session = await store.getEngagement(id);
      assert.deepEqual(
        session?.thoughts.map((t) => t.id),
        ["newer", "older"],
        "the frontend renders the pile in the order it is handed",
      );
      assert.equal(session?.thoughts[0].author?.email, FACILITATOR.email, "attribution survives");
    });

    it("keeps every fragment when contributions interleave", async () => {
      // The rule the whole shared pile rests on. The file store rewrites one array and the
      // production store writes a subcollection, and both have to come out at ten.
      const { id } = await seed();
      await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          store.addThought(id, fragment(`f${i}`, i, i % 2 ? CONTRIBUTOR : FACILITATOR)),
        ),
      );
      const session = await store.getEngagement(id);
      assert.equal(session?.thoughts.length, 10);
      assert.equal(new Set(session?.thoughts.map((t) => t.id)).size, 10, "ids were overwritten");
    });

    it("answers getVersion with the pair the poll compares", async () => {
      const { id, updatedAt } = await seed();
      const initial = await store.getVersion(id);
      assert.deepEqual(initial, { updatedAt, thoughtCount: 0 });

      await store.addThought(id, fragment("one", 1));
      const after = await store.getVersion(id);
      assert.equal(after?.thoughtCount, 1);
      assert.ok(
        after!.updatedAt >= initial!.updatedAt,
        "a contribution must move updatedAt, or every tab strands on a stale pile",
      );
    });

    it("keeps the reported count equal to the pile through adds and deletes", async () => {
      // The production store answers this from a stored counter rather than by counting, so
      // the count and the pile are two facts that can disagree. Every path that changes one
      // has to change the other, and only a test that deletes will notice if one stops.
      const { id } = await seed();
      const ids = Array.from({ length: 4 }, (_, i) => fragment(`f${i}`, i));
      for (const f of ids) await store.addThought(id, f);

      const agrees = async (expected: number, when: string) => {
        assert.equal((await store.getVersion(id))?.thoughtCount, expected, `getVersion ${when}`);
        assert.equal((await store.getEngagement(id))?.thoughts.length, expected, `pile ${when}`);
        const shelf = (await store.listEngagements()).find((e) => e.id === id);
        assert.equal(shelf?.thoughtCount, expected, `shelf ${when}`);
      };

      await agrees(4, "after four contributions");
      assert.equal(await store.deleteThought(id, ids[0].id), true);
      await agrees(3, "after a deletion");
      assert.equal(await store.deleteThought(id, ids[0].id), false, "deleting twice");
      await agrees(3, "after a deletion that removed nothing");
    });

    it("patches metadata and the server-owned coverage map together", async () => {
      const { id } = await seed();
      const patched = await store.patchEngagement(id, {
        status: "review",
        synthesizedSummary: "a summary",
        coverage: [
          {
            area: "Processes",
            status: "partial",
            fragments: 2,
            voices: 1,
            fragmentIds: ["a", "b"],
          },
          { area: "Systems", status: "dark", fragments: 0, voices: 0, fragmentIds: [] },
        ],
      });
      assert.equal(patched?.status, "review");
      // Round-tripped through storage rather than echoed: the drawn map reads this back.
      const read = await store.getEngagement(id);
      assert.equal(read?.coverage?.length, 2);
      assert.deepEqual(read?.coverage?.[0].fragmentIds, ["a", "b"]);
      assert.equal(read?.coverage?.[1].status, "dark");
    });

    it("edits and deletes a single fragment without disturbing the rest", async () => {
      const { id } = await seed();
      await store.addThought(id, fragment("keep", 20));
      await store.addThought(id, fragment("edit", 10));
      await store.addThought(id, fragment("drop", 5));

      const edited = await store.patchThought(id, "edit", { clusterCategory: "Process scope" });
      assert.equal(edited?.clusterCategory, "Process scope");
      assert.equal(edited?.text, "fragment edit", "a field patch must not replace the fragment");

      assert.equal(await store.deleteThought(id, "drop"), true);
      const session = await store.getEngagement(id);
      assert.deepEqual(
        session?.thoughts.map((t) => t.id),
        ["edit", "keep"],
      );
    });

    it("upserts a roster entry under an email key with dots in it", async () => {
      // Firestore reads a dotted string field path as nested keys, so an email as a map key
      // is a real trap; the file store cannot see it. Same contract, both stores.
      const { id } = await seed();
      const session = await store.upsertRosterEntry(id, CONTRIBUTOR);
      assert.deepEqual(Object.keys(session?.roster ?? {}).sort(), [
        CONTRIBUTOR.email,
        FACILITATOR.email,
      ]);
      assert.equal(session?.roster?.[CONTRIBUTOR.email].role, "Contributor");

      const promoted = await store.upsertRosterEntry(id, { ...CONTRIBUTOR, role: "Facilitator" });
      assert.equal(promoted?.roster?.[CONTRIBUTOR.email].role, "Facilitator");
      assert.equal(Object.keys(promoted?.roster ?? {}).length, 2, "an upsert must not add a key");
    });

    it("carries a brief with its entry, and an entry rewritten without one drops it", async () => {
      // Overwrite, not merge: a brief is optional, so clearing one is an entry that has none.
      // Firestore replaces the map at a FieldPath and the file store replaces the key — a merge
      // in either would keep a brief its author had deleted.
      const { id } = await seed();
      const briefed = { ...CONTRIBUTOR, role: "Treasury", brief: "Cash positioning and banks." };
      const session = await store.upsertRosterEntry(id, briefed);
      assert.deepEqual(session?.roster?.[CONTRIBUTOR.email], briefed);

      const rewritten = await store.upsertRosterEntry(id, { ...CONTRIBUTOR, role: "Treasury" });
      assert.equal(rewritten?.roster?.[CONTRIBUTOR.email].role, "Treasury");
      assert.equal(rewritten?.roster?.[CONTRIBUTOR.email].brief, undefined);
    });

    it("sets and clears a role group under a key a person typed", async () => {
      // A role label is free text, and "sr. finance / fp&a" is an ordinary thing to type. A dot
      // is the roster's Firestore trap over again, in a key nobody chose with storage in mind.
      const { id } = await seed();
      const key = "sr. finance / fp&a";
      const entry = {
        label: "Sr. Finance / FP&A",
        group: "Finance",
        by: CONTRIBUTOR.email,
        at: "2026-09-11T10:00:00.000Z",
      };
      const before = await store.getVersion(id);

      const set = await store.setRoleGroup(id, key, entry);
      assert.deepEqual(set?.roleGroups?.[key], entry);
      assert.deepEqual(Object.keys(set?.roleGroups ?? {}), [key], "the dots split the key");
      assert.ok(
        (await store.getVersion(id))!.updatedAt >= before!.updatedAt,
        "a regroup must move updatedAt, or no other tab ever sees it",
      );

      await store.setRoleGroup(id, "treasury", { ...entry, label: "Treasury", group: "Treasury" });
      const cleared = await store.setRoleGroup(id, key, null);
      assert.equal(cleared?.roleGroups?.[key], undefined, "null clears the decision");
      assert.equal(
        (await store.getEngagement(id))?.roleGroups?.treasury?.group,
        "Treasury",
        "clearing one label must not disturb another",
      );
    });

    it("keeps both groupings when two are made at once", async () => {
      // Two people tidying different labels in the same poll window. A whole-map write from
      // either one's snapshot would silently undo the other.
      const { id } = await seed();
      const at = "2026-09-11T10:00:00.000Z";
      await Promise.all([
        store.setRoleGroup(id, "fp&a", {
          label: "FP&A",
          group: "Finance",
          by: FACILITATOR.email,
          at,
        }),
        store.setRoleGroup(id, "treasury", {
          label: "Treasury",
          group: "Finance",
          by: CONTRIBUTOR.email,
          at,
        }),
      ]);
      const read = await store.getEngagement(id);
      assert.deepEqual(Object.keys(read?.roleGroups ?? {}).sort(), ["fp&a", "treasury"]);
    });

    it("lists engagements newest-first with counts that need no pile read", async () => {
      const store2 = await makeStore();
      const first = await store2.createEngagement({
        topic: "first",
        intention: "i",
        creator: FACILITATOR,
      });
      await store2.addThought(first.id, fragment("f", 1));
      const second = await store2.createEngagement({
        topic: "second",
        intention: "i",
        creator: FACILITATOR,
      });
      await store2.upsertRosterEntry(second.id, CONTRIBUTOR);

      const list = await store2.listEngagements();
      const mine = list.filter((e) => e.id === first.id || e.id === second.id);
      assert.equal(mine.length, 2);
      assert.equal(mine[0].id, second.id, "the shelf is ordered by updatedAt, newest first");
      assert.equal(mine.find((e) => e.id === first.id)?.thoughtCount, 1);
      assert.equal(mine.find((e) => e.id === second.id)?.memberCount, 2);
    });

    it("reports a missing engagement rather than inventing one", async () => {
      // The route layer turns each of these into a 404, so a null here is load-bearing.
      assert.equal(await store.getEngagement("no-such-id"), null);
      assert.equal(await store.getVersion("no-such-id"), null);
      assert.equal(await store.patchEngagement("no-such-id", { status: "review" }), null);
      assert.equal(await store.addThought("no-such-id", fragment("x", 1)), null);
      assert.equal(await store.upsertRosterEntry("no-such-id", CONTRIBUTOR), null);
    });

    it("reports a missing fragment rather than a silent no-op", async () => {
      const { id } = await seed();
      assert.equal(await store.getThought(id, "no-such-thought"), null);
      assert.equal(await store.patchThought(id, "no-such-thought", { text: "x" }), null);
      assert.equal(await store.deleteThought(id, "no-such-thought"), false);
    });
  });
}

const dirs: string[] = [];
after(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

contractSuite("FileEngagementStore", async () => {
  const dir = await mkdtemp(join(tmpdir(), "extraction-store-"));
  dirs.push(dir);
  return new FileEngagementStore(dir);
});

// Gated rather than skipped silently: without an emulator this file proves the contract of one
// implementation, which is the situation 008 describes.
if (process.env.FIRESTORE_EMULATOR_HOST) {
  const { FirestoreEngagementStore } = await import("../server/store/firestoreEngagementStore.ts");
  contractSuite("FirestoreEngagementStore (emulator)", async () => {
    // Any project id works against the emulator; it never authenticates.
    return new FirestoreEngagementStore(
      process.env.FIRESTORE_TEST_PROJECT || "extraction-contract-test",
    );
  });
} else {
  describe("EngagementStore contract: FirestoreEngagementStore", () => {
    it("is not exercised without FIRESTORE_EMULATOR_HOST", { skip: "no emulator" }, () => {});
  });
}
