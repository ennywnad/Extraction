# ⊞ EXTRACTION — Cognitive Chamber & Strategic Consultant

**Extraction** is a tactile, highly conversational thought-extraction chamber and executive outline synthesizer. Crafted in a high-contrast Neo-Brutalist design language, it helps you step out of mental paralysis, unpack scattered thought fragments, categorize them into structural dimensions, and synthesize crisp action strategies.

---

## 🎨 Visual Identity & Core Aesthetic

The interface rejects generic, soft purple gradients in favor of an **editorial, high-contrast, tactile physical desktop layout**.

- **Neo-Brutalist Frame**: Heavy black outlines (`border-3 border-black`), blocky hard shadows (`shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`), and rich typography pairings (**Space Grotesk / Outfit** for headers, and **JetBrains Mono / Fira Code** for metadata and data elements).
- **Functional Pastel Palette**: Dynamic, intentional, soft background fills corresponding to distinct steps and thought types:
  - ⚡ **Actions**: Pastel Coral (`#FF6B6B` / Red)
  - 💡 **Insights**: Pastel Pool Blue (`#4DABF7` / Blue)
  - ⚠️ **Fears/Risks**: Golden Wheat Yellow (`#FFD43B` / Yellow)
  - 🎯 **Goals**: Emerald Clover Green (`#51CF66` / Green)

---

## 🚀 Key Functional Capabilities

### 1. Hands-Free Voice Dictation (Multi-modal)

Integrated native **Web Speech-to-Text Recognition** allowing you to verbally dump your stream-of-consciousness, either direct into the **Surfaced Pile Scratch Note** or inside your **Guided Drill sessions**.

- Tap the microphone icon, speak freely, watch text register in real-time, and let the engine capture your raw brain waves before they slip away.

### 2. Conversational Dialogue Pivot (Double-Agent Dialogue)

When engaging with the **Guided Drill**, you aren't forced into single-direction input answering standard prompts.

- **Direct Mode**: Answer the questions posed by the AI consultant.
- **Conversational Mode**: Switch to "Chat Mode" to challenge or query the advisor directly (e.g. _"Why is this bottleneck important?"_ or _"Can you expand on what you mean by risk? "_). The agent dynamically identifies your sidebar pivot, clarifies the perspective, and guides you organically back to the extraction thread.

### 3. Smart Omni-Search & Categorical Filtration

The **Surfaced Pile** sidebar houses your extraction history. Key upgrades include:

- **Search-as-you-type**: Live search over raw contents or modes.
- **Semantic Filters**: One-tap filters separating **⚡ Actions**, **💡 Insights**, **⚠️ Fears**, and **🎯 Goals** utilizing a lightweight local keyword parsing engine to dynamically bubble structures out of raw text.

### 4. Custom Executive Blueprint & Advanced Modifiers

The final **Export Panel** features an advanced **Re-Format Executive Blueprint Control Center**:

- **Tone Profiles**: Shift your compiled outline between **Standard Guidance**, a combative & sharp **Socratic Audit**, or a gentle holding-space **Empathetic Mirror**.
- **Focus Filters**: Tailor the output to either **Comprehensive Deep-dives**, clean **Checklist-only Action Items**, or sequential **Strategic Roadmaps**.
- **Cognitive Bias Auditing**: Toggle the **Bias Audit** to let Gemini run a cold, diagnostic overlay highlighting blindspots, confirmation biases, sunk-cost hangups, and planning fallacies present in your surfaced thoughts pile.

---

## 🧭 Main Cognitive Extraction Modes

| Mode                    | Visual Theme                | Description                                                                                                              |
| :---------------------- | :-------------------------- | :----------------------------------------------------------------------------------------------------------------------- |
| **Guided Drill**        | Heavy Border / Yellow Label | Deep conversational interviews. Dynamically pivots between standard answers and custom sidebar dialogues.                |
| **Swipe / React Deck**  | Soft Yellow `#FFFEE0`       | Tactile Tinder-style card deck. Read synthetically generated candidate statements, swipe or tap to categorize resonance. |
| **Free Stream**         | Soft Warm Off-White         | Uninterrupted workspace highlighting block writing and stream-of-consciousness.                                          |
| **Quick Fire**          | Slate Minimalist            | Lightweight speed-dump box. Write a concept, tap Enter, clear the workspace instantly, build mass density fast.          |
| **Priority Eisenhower** | Emerald & Teal              | Structural matrices clustering items dynamically based on urgency and strategic leverage.                                |

---

## 👥 Group Mode — one shared pile

Extraction also runs as a **hosted, authenticated instance** where a whole room contributes to
a single pile over an engagement. The twelve extraction modes are unchanged; what changes is
who can reach the pile and whether a fragment remembers who said it.

- **A fragment remembers who said it.** Contributions are stamped server-side with the
  verified contributor's identity and role — never typed in, never accepted from the client.
- **Nobody rewrites anyone.** Only the author may edit or delete their own words. _Filing_ a
  card — cluster, timeline zone, priority, intensity, swipe — is open to any member, because
  sorting the pile together is the point of sharing it. Enforced server-side, not just hidden
  in the UI.
- **The pile keeps growing after the room empties.** Anyone in the group can contribute at any
  time; a `?engagement=<id>` link drops the whole room into the same pile.
- **No accounts.** Identity comes from the client's own directory through Identity-Aware
  Proxy. The app holds no credentials, and removing someone from the group removes their
  access.
- **The level set is a group deliverable.** Explicit and single-flight rather than generated
  on render, versioned against the pile it was built from, and marked stale when the pile
  moves on. Coverage — including which areas _nobody_ raised — is computed by arithmetic over
  classified fragments rather than asked of the model.

Solo mode is untouched: sessions still live in `localStorage`, and a session with no
engagement renders exactly as it always has.

## ☁️ Deployment

The app deploys to **Cloud Run behind IAP**, with **Firestore** holding the shared pile and
**Vertex AI** serving Gemini as the runtime service account — so a deployment holds no API key
material at all.

```bash
export PROJECT=your-project-id
./scripts/bootstrap-gcp.sh   # idempotent, once
./scripts/deploy.sh
```

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full walkthrough, including the one manual
console step and how to grant the engagement group access.

## 🛠️ Architecture & Setup Guidelines

### Full-Stack Express + Vite (Type-Safe Bundle)

The platform utilizes a robust Express API proxy in tandem with **Vite** and TypeScript. To safely bypass strict Node ES Module runtime checks and speed up cold-starts, the server-side code compiles on build into a single stand-alone target via `esbuild`.

The client bundle is built to `dist/` and served statically; the server bundle is built to
`dist-server/` deliberately **outside** that directory, so the compiled server and its
sourcemap are never fetchable over HTTP.

#### Key Node Scripts

```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist-server/server.cjs",
    "start": "node dist-server/server.cjs",
    "lint": "tsc --noEmit",
    "test": "tsx --test test/*.test.ts test/*.test.mjs"
  }
}
```

#### Run Local Development Server

```bash
# Install package dependencies
npm install

# Copy the sample environment (optional — the app runs with no configuration at all)
cp .env.example .env

# Start full-stack local server (defaults to :3000, override with PORT)
npm run dev
```

#### Tests

```bash
npm test
```

Boots a real server against an isolated file store, with no cloud configuration and no
Gemini key. Covers attribution, field-level authorship, the concurrent-contribution
regression, ETag revalidation, the CSRF content-type gate, synthesis failure handling and
the coverage arithmetic.

---

## 🔒 API Keys, Identity & Environment

All AI calls are proxied server-side (`/api/session/*`, `/api/engagement/*`) so credentials
are never exposed to client-side network inspectors. Never prefix a secret with `VITE_` — that
publishes it to the browser.

Everything below is optional: with no configuration at all, the app runs solo with canned
prompts. See [`.env.example`](.env.example) for the annotated list.

| Variable                           | Purpose                                                                   |
| :--------------------------------- | :------------------------------------------------------------------------ |
| `GEMINI_API_KEY`                   | Gemini Developer API key. Easiest for local development.                  |
| `GENAI_BACKEND`                    | `apikey` (default) or `vertex`. Vertex uses ADC — no key material.        |
| `VERTEX_LOCATION`                  | Region, when `GENAI_BACKEND=vertex`.                                      |
| `GEMINI_MODELS`                    | Comma-separated model chain. Ids differ per backend and change over time. |
| `AUTH_MODE`                        | `iap` verifies the IAP assertion; `dev` asserts a local identity.         |
| `IAP_AUDIENCE`                     | Expected JWT audience. Computed for you by `scripts/deploy.sh`.           |
| `FIRESTORE_PROJECT_ID`             | Set to use Firestore; unset falls back to a local JSON file.              |
| `DEV_USER_EMAIL` / `DEV_USER_NAME` | The identity assumed under `AUTH_MODE=dev`.                               |
| `PORT`                             | Listen port. Defaults to 3000; Cloud Run injects its own.                 |

**`AUTH_MODE` fails closed.** It resolves to `iap` under `NODE_ENV=production` and `dev`
otherwise, and the process exits at startup on an inconsistent configuration — a missing
`IAP_AUDIENCE` in production, or `dev` in production — rather than quietly serving unverified
identities.

For a two-person local test of the shared pile, run one server and pin a different identity
per browser profile with `?dev_user=someone@example.com`.
