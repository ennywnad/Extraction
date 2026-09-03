# 001 — An MCP server over the pile

**Status:** intent. Not planned, not scheduled.
**Written:** 2026-09-03

## What

A Model Context Protocol server that exposes an Extraction engagement — the pile, its
attribution, its coverage, and its level set — to any MCP client: Claude Code, Claude Desktop,
an IDE, another agent.

Today there is exactly one way a fragment gets into a pile: a person uses one of the twelve
modes in the browser. And exactly one way it comes out: the level set, rendered in the export
panel. An MCP server adds a second door on both sides, for software rather than people.

Concretely, an MCP client would see something like:

| Surface  | Name                                     | Purpose                                                        |
| :------- | :--------------------------------------- | :------------------------------------------------------------- |
| Resource | `extraction://engagement/{id}/pile`      | Every fragment, labelled by contributor role                   |
| Resource | `extraction://engagement/{id}/coverage`  | Per-area status, including the areas nobody raised             |
| Resource | `extraction://engagement/{id}/level-set` | The current deliverable and the pile version it was built from |
| Tool     | `list_engagements`                       | What piles exist on this instance                              |
| Tool     | `contribute_fragment`                    | Add a fragment, attributed to the caller                       |
| Tool     | `search_pile`                            | Find fragments by text, mode, or role                          |
| Tool     | `synthesize`                             | Generate a level set — see the note on this one below          |

## Why

Not "because MCP is interesting." Four reasons specific to this app:

**The pile is a corpus with provenance, which is rare.** Every fragment carries the role of
the person who contributed it, stamped server-side and never accepted from the client. That
makes questions answerable that are not answerable from a transcript or a doc: _what has the
security lead actually said about data residency_, _which areas has only IT spoken to_. An
assistant with access to the pile can answer those. An assistant without it is guessing from
whatever got pasted into the chat.

**Getting things into the pile is the real bottleneck.** The twelve modes are a careful answer
to the human half of that problem. They do nothing for the case where a facilitator is already
working in an editor or a terminal during a discovery call and has a fragment in hand right
now. `contribute_fragment` is a smaller feature than any of the twelve modes and might move
more fragments than several of them.

**Coverage is worth exposing precisely because it is not model-generated.** The dark-area
arithmetic in [coverage.ts](../../server/ai/coverage.ts) is deliberately computed rather than
asked of a model, so a count of zero is right every time. Handing an agent a _computed_ map of
what a group has not discussed is a genuinely different thing from asking it to guess.

**It is the honest way to close the tool-use gap.** The app currently uses schema-constrained
decoding well and has no agentic surface at all. An MCP server over a real domain model with a
real authorization story demonstrates the thing; reshuffling the existing JSON calls would not.

## How

### Where it sits

`server/mcp/`, as a sibling of `server/ai/` and `server/store/`. It is a **second adapter over
`EngagementStore`**, exactly parallel to what `createEngagementRouter()` already is over HTTP.
Nothing in the store interface knows about Express, so this is additive rather than a
refactor:

```
                    ┌─ engagementRoutes.ts ── HTTP + IAP ── the browser app
   EngagementStore ─┤
   (file │ firestore)└─ server/mcp/ ─────────  MCP  ─────── Claude Code, agents
```

### The hard part is identity, not protocol

Group mode's central rule is that the server stamps the verified contributor and never accepts
an identity from the client. That rule is what makes "a fragment remembers who said it" true
rather than aspirational, and it is enforced in
[engagementRoutes.ts](../../server/engagementRoutes.ts), not just hidden in the UI.

An MCP client is not behind Identity-Aware Proxy. So `contribute_fragment` has to answer: who
is this, and by what evidence? Three shapes, in increasing order of both usefulness and work:

1. **Read-only, no writes.** Sidesteps the question entirely. Still useful — an agent that can
   read the pile and the coverage map is most of the value — and it is the obvious v1.
2. **Local stdio, solo scope.** The MCP server runs on the user's own machine as their own
   process, so "who is this" is answered by the operating system. Loses group mode, which is
   where attribution matters.
3. **A token minted by the app while the user is IAP-authenticated**, presented by the MCP
   server and exchanged for an `Identity`. Keeps IAP as the single source of truth about who
   someone is, which is the property worth protecting — the app never becomes an identity
   provider of its own. Most work, and the only option that makes group mode reachable.

Starting at 1 and leaving 3 as the open door seems right. Going straight to 3 means designing
a token lifecycle before knowing whether anyone wants to write to a pile from an agent.

### `synthesize` is not a normal tool

It costs money, it takes a while, and it is single-flight per engagement by design — ten people
opening the review panel join one run rather than starting ten. An MCP tool that can trigger it
is a new way to spend the budget, from a client that has no rate limit in front of it. Options:
leave it out of v1; expose it read-only (`get_level_set`, which returns the existing one and
says whether the pile has moved on since); or expose it behind the same single-flight gate with
an explicit cost acknowledgement in the tool description.

## What the code already supports

Better than expected on the data side:

- **`EngagementStore`** ([types.ts](../../server/store/types.ts)) is a clean interface — create,
  list, get, patch, per-thought CRUD, roster upsert, plus an O(1) `getVersion`. No HTTP
  anywhere in it. A second adapter is genuinely additive.
- **Attribution is already server-side and already enforced.** `ensureMember`, the
  author-only edit rule, and the "any member may file a card" rule all live in the route layer
  over that store, so the MCP adapter inherits the model rather than reinventing it.
- **Coverage and synthesis are already functions, not handlers** —
  [coverage.ts](../../server/ai/coverage.ts) and [synthesis.ts](../../server/ai/synthesis.ts)
  are callable directly, including the single-flight map.
- **`renderCorpus`** in [corpus.ts](../../server/ai/corpus.ts) already renders a pile
  role-labelled and name-free for a model to read. That is close to the resource format.

## What would have to change

- **Identity.** `createRequireIdentity` is Express middleware over an IAP assertion header.
  An MCP transport needs a parallel path that arrives at the same `Identity` type.
- **Solo piles are unreachable.** They live in the browser's `localStorage`; no server has
  ever seen them. So MCP is group-only unless solo gains an optional server-side store —
  which would be a real change to what solo mode _is_, and probably should not be done for
  this reason alone.
- **Rate limiting.** `express-rate-limit` is keyed per IP on `/api/session`. An MCP transport
  is a different door with no limiter behind it.

## Open questions

- Transport: stdio for local use, streamable HTTP for the hosted instance, or both?
- Read-only v1, or is a write tool the whole point?
- Does `synthesize` belong as a tool at all?
- Resources or tools for the pile? Resources are the better semantic fit; tools get used more
  reliably by more clients today.
- If an agent contributes a fragment, what role does it get stamped with? "Agent" as a
  first-class role is a product question, not a plumbing one — the level set reasons about
  roles, so a new one changes the deliverable.

## Non-goals

- Turning Extraction into an agent platform. This exposes a pile; it does not run a loop.
- Replacing the twelve modes. The modes are the product; this is a second door.
