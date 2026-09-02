repo: ennywnad/Extraction
branch: main
path: src

## Last sync

date: 2026-09-01T05:04:20Z

### Updated in this project

- Recreated nine app screens pixel-faithfully as a shared Design Component (`ExtractionScreens.dc.html`).
- Sample session reworked: an engagement architect preparing a client kickoff (was GCP org design).
- Added `Extraction Level Set.dc.html` — a concept doc for hosted, authenticated group use (not built).
- `Extraction Showcase.dc.html`, `Extraction Demo.dc.html`, `docs/screenshots/*.png` and `README.md` all track the shipped single-user app.

## Screen map

| Project screen | Repo files |
| :--- | :--- |
| `intake` (Intake / dashboard) | `src/components/IntakeForm.tsx`, `src/index.css`, `src/App.tsx` |
| `compare` (Compare Settings modal) | `src/components/CompareSettingsModal.tsx`, `src/components/IntakeForm.tsx` |
| `guided` (Guided Drill) | `src/components/Modes/GuidedDrill.tsx`, `src/components/Workspace.tsx` |
| `swipe` (Swipe / React deck) | `src/components/Modes/SwipeReact.tsx`, `src/components/Workspace.tsx` |
| `cluster` (Cluster sorting) | `src/components/Modes/CardSort.tsx`, `src/components/Workspace.tsx` |
| `timeline` (Temporal map) | `src/components/Modes/TimelineMode.tsx`, `src/components/Workspace.tsx` |
| `intensity` (Intensity map) | `src/components/Modes/SliderMap.tsx`, `src/components/Workspace.tsx` |
| `priority` (Priority Eisenhower) | `src/components/Modes/PriorityPile.tsx`, `src/components/Workspace.tsx` |
| `export` (Executive blueprint) | `src/components/ExportPanel.tsx` |
| Workspace shell (header, mode tape, Surfaced Pile) | `src/components/Workspace.tsx`, `src/types.ts` |
| Session/thought data model used for the sample session | `src/types.ts`, `src/App.tsx`, `src/utils/localDB.ts` |

## Notes

- Icons are the real Lucide set, loaded from `lucide-static` (the repo uses `lucide-react@^0.546.0`).
- Fonts, colors, borders and shadow values lifted from `src/index.css` and the Tailwind classes in each component.
- Modes not yet recreated: `binary_frame`, `quick_fire`, `free_stream`, `sentence_completion`, `devils_advocate`, `letter_writing`.

## Concept work (not in the repo)

`Extraction Level Set.dc.html` proposes a hosted multi-user mode: contributor attribution on each fragment,
a coverage map and scope ledger over the pile, and Cloud Run + Identity-Aware Proxy + Firestore for access
and storage. None of it exists in `ennywnad/Extraction` — the doc is marked concept throughout. If it is
built, the touch points are `src/utils/localDB.ts` (datastore), `src/types.ts` (author on `Thought`),
`server.ts` (verify the IAP assertion) and `src/components/Workspace.tsx` (render attribution).
