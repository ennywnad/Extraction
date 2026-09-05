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

**Two of those four do not survive the obvious test, which is whether the Copy button already
gets you there.** [ExportPanel.tsx](../../src/components/ExportPanel.tsx) renders the level set
and the coverage map as markdown, and an engagement is a few KB, so "let an assistant read one
pile" is a convenience over Cmd-C. The provenance argument survives only for questions spanning
_several_ engagements — and that is a gap in the product rather than a protocol problem: the
store holds every pile, `listEngagements()` already returns them, and the app has no
cross-engagement surface of any kind. The coverage argument does not survive at all, because
the map is built and drawn. What is left after removing them is `contribute_fragment`. See the
first resolved question below.

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

**Check IAP's own programmatic path before designing option 3.** IAP documents a non-browser
flow in which a client presents an OIDC ID token as `Authorization: Bearer`, audienced to the
OAuth client id, and IAP converts it into the same signed assertion header
[iapAuth.ts](../../server/iapAuth.ts) already verifies. If that holds for this deployment,
option 3 is not a token lifecycle this repo owns — it is `gcloud auth print-identity-token` for
a person and a service account for an agent, and `createRequireIdentity` needs no parallel path
at all. Unverified, and two things decide it: whether it composes with the **direct `--iap`
Cloud Run integration** this deployment uses rather than load-balancer IAP, and what the
one-hour token lifetime does to a client config meant to be set once.

**A lead worth checking before designing option 3 by hand.**
[GCP Agent Gateway](https://docs.cloud.google.com/gemini-enterprise-agent-platform/govern/gateways/agent-gateway-overview)
governs agent-to-agent and agent-to-tool traffic, explicitly including MCP, over mTLS with Agent
Identity and Context-Aware Access. It surfaced while resolving the model-gateway question in
[004](004-claude-and-the-gcp-model-gateway.md), where it was the wrong tool — it does not proxy
model inference — but it is aimed squarely at the problem this section describes: authenticating
a non-browser client that is not behind IAP. If it can arrive at the same `Identity` this app
already trusts, option 3 becomes configuration rather than a token lifecycle this repo owns and
has to keep correct. Only the overview has been read. Whether it composes with IAP rather than
replacing it, and what it costs to run, are both unverified.

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
  are callable directly, including the single-flight map. One caveat that matters for a
  resource: `computeCoverage` is arithmetic, but its input is `classify()`, a model call, and
  the result is mirrored onto the session at synthesis time. So a coverage resource serves the
  last synthesize rather than the current pile, and would have to say so.
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
- ~~Read-only v1, or is a write tool the whole point?~~ **Resolved: neither, which is also the
  answer to whether to build this now.** The two surfaces worth reading are better served off
  this protocol — cross-engagement questions want a surface in the app, and computed absence is
  already drawn — so a read-only v1 is a second door onto the Copy button. That leaves the write
  tool carrying the whole of the remaining value, and it serves a facilitator who has the
  browser open, against a group mode [008](008-deploying-group-mode.md) says has never run
  outside a laptop. **Not now.** Two things reopen it: a deployed group mode with piles worth
  querying from outside, or a client that is genuinely not a browser — an agent doing prep
  between sessions rather than a person mid-call.
- ~~Does `synthesize` belong as a tool at all?~~ **Resolved: not in a v1.** It spends money, it
  is single-flight per engagement, and an MCP transport has no limiter in front of it.
  `get_level_set` is cheaper and more useful anyway: it returns the stored deliverable and
  whether `pileVersion` has moved since, so a caller learns the level set is stale instead of
  silently paying to rebuild it.
- Resources or tools for the pile? Resources are the better semantic fit; tools get used more
  reliably by more clients today.
- ~~If an agent contributes a fragment, what role does it get stamped with?~~ **Resolved: the
  operator's own role, with the provenance carried in `mode` instead.** The instinct to add an
  "agent" role is the expensive one: [corpus.ts](../../server/ai/corpus.ts) labels every
  fragment by role and the level set reasons about which roles have spoken, so a new role
  changes the deliverable. `Thought.mode` is already `ExtractionMode | "system"`, and `"system"`
  is already handled as a non-mode — accepted on import in [App.tsx](../../src/App.tsx),
  excluded from `modesUsed` in
  [engagementStats.ts](../../src/utils/engagementStats.ts) — so it needs no card in `MODE_CARDS`
  and no case in the render switch.

## Non-goals

- Turning Extraction into an agent platform. This exposes a pile; it does not run a loop.
- Replacing the twelve modes. The modes are the product; this is a second door.
