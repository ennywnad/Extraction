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
- **Conversational Mode**: Switch to "Chat Mode" to challenge or query the advisor directly (e.g. *"Why is this bottleneck important?"* or *"Can you expand on what you mean by risk? "*). The agent dynamically identifies your sidebar pivot, clarifies the perspective, and guides you organically back to the extraction thread.

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

| Mode | Visual Theme | Description |
| :--- | :--- | :--- |
| **Guided Drill** | Heavy Border / Yellow Label | Deep conversational interviews. Dynamically pivots between standard answers and custom sidebar dialogues. |
| **Swipe / React Deck** | Soft Yellow `#FFFEE0` | Tactile Tinder-style card deck. Read synthetically generated candidate statements, swipe or tap to categorize resonance. |
| **Free Stream** | Soft Warm Off-White | Uninterrupted workspace highlighting block writing and stream-of-consciousness. |
| **Quick Fire** | Slate Minimalist | Lightweight speed-dump box. Write a concept, tap Enter, clear the workspace instantly, build mass density fast. |
| **Priority Eisenhower** | Emerald & Teal | Structural matrices clustering items dynamically based on urgency and strategic leverage. |

---

## 🛠️ Architecture & Setup Guidelines

### Full-Stack Express + Vite (Type-Safe Bundle)
The platform utilizes a robust Express API proxy in tandem with **Vite** and TypeScript. To safely bypass strict Node ES Module runtime checks and speed up cold-starts, the server-side code compiles on build into a single stand-alone target via `esbuild`.

#### Key Node Scripts
```json
{
  "scripts": {
    "dev": "tsx server.ts",
    "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
    "start": "node dist/server.cjs"
  }
}
```

#### Run Local Development Server
```bash
# Install package dependencies
npm install

# Start full-stack local server (Dev port binds exclusively to 3000)
npm run dev
```

---

## 🔒 API Key & Environment Security
This application utilizes server-side API proxying (`/api/session/*`) to keep all AI credentials fully secure and hidden from client-side network inspectors.

- Create a `.env` file at the root:
```env
GEMINI_API_KEY=your-high-security-google-genai-key-here
```
*(The framework will load the variable securely server-side; do not prefix with `VITE_` to ensure zero browser exposure).*
