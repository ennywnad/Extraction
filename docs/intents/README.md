# Intents

Roadmap material. An **intent** is a direction with a rationale, written down before it is
planned — what it is, why it would be worth doing, roughly how, and honestly how far the code
already is. It is not a plan and nothing here is scheduled.

Separate from [planv1/](../../planv1/), which is the frozen design record of a thing that got
built. These are the opposite end: ideas that have not earned a plan yet.

| #                                              | Intent                                             | Depends on | Cost if attempted today                                         |
| :--------------------------------------------- | :------------------------------------------------- | :--------- | :-------------------------------------------------------------- |
| [001](001-mcp-server-over-the-pile.md)         | An MCP server over the pile                        | —          | Medium. The store seam fits; identity is the real work.         |
| [002](002-model-provider-seam.md)              | A provider-neutral model seam                      | —          | Medium, and it is the prerequisite for 003 and 004.             |
| [003](003-local-models-in-solo-mode.md)        | Local models in solo mode                          | 002        | Small once 002 exists.                                          |
| [004](004-claude-and-the-gcp-model-gateway.md) | Claude, and the model as a deployment choice       | 002        | Small once 002 exists.                                          |
| [005](005-listening-mode.md)                   | Listening mode — a kickoff with no model           | —          | Smallest on this list. Mostly already true.                     |
| [006](006-distributed-local-inference.md)      | Peer compute — local models doing the room's work  | 002, 003   | Largest. Introduces a trust boundary the app does not have yet. |
| [007](007-status-board.md)                     | A status board that looks like the rest of the app | —          | Small. Every fact it needs is already computed.                 |

## How to read these

Each file carries a **"What the code already supports"** section. That is the part worth
trusting least over time and checking first — it describes the repository as of the date on
the file, and the whole point of writing it down was to find out which of these intents the
existing seams already fit and which ones they do not.

Two findings from writing them, worth stating up front:

- **The store seam is in good shape and the model seam is not.** `EngagementStore` is an
  interface with no HTTP in it, so 001 is genuinely additive. The model call is not abstracted
  at all — `generateContentWithFallback` takes a raw `@google/genai` request — so 003 and 004
  both stall on the same missing piece, which is why 002 was pulled out as its own intent
  rather than being written three times.
- **Several are cheaper than they look, and two are not.** 005 is mostly a matter of naming a
  state the app can already be in, and 007 needs no new facts — only a place to put the ones
  already computed. 001 looks like the small one and is not: exposing a pile that remembers who
  said what means solving identity for a client that is not behind IAP. 006 is the genuinely
  large one, because it asks the server to accept a result it did not produce.
- **Two of them push against a property the app currently has.** 006 would send one
  contributor's fragments to another contributor's laptop; 007 would publish deployment
  topology on an endpoint that has no identity requirement. Both are doable; neither should be
  done without noticing.
