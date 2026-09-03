import type { EngagementStore } from "./types.ts";
import { FileEngagementStore } from "./fileEngagementStore.ts";

let store: EngagementStore | null = null;

/**
 * Which store the configuration selects. Derived from the environment rather than from the
 * instantiated client, so it answers before the first engagement request — the store is
 * created lazily, and a solo deployment may never create one at all.
 */
export type StoreBackend = "firestore" | "file";

function firestoreProjectId(): string | undefined {
  return process.env.FIRESTORE_PROJECT_ID?.trim() || undefined;
}

export function storeBackend(): StoreBackend {
  return firestoreProjectId() ? "firestore" : "file";
}

/**
 * Whether that branch has actually been taken yet. The distinction is the honest part: a
 * configured Firestore store that nothing has opened has not proved it can connect.
 */
export function storeIsLive(): boolean {
  return store !== null;
}

/**
 * Selects the store the same way getGemini() selects a client: presence of configuration.
 * FIRESTORE_PROJECT_ID set means the real thing; unset means the local JSON file, so
 * `npm run dev` works with no cloud setup at all.
 */
export async function getEngagementStore(): Promise<EngagementStore> {
  if (store) return store;

  const projectId = firestoreProjectId();
  if (projectId) {
    // Imported lazily so local development never loads the Firestore SDK or looks for
    // Application Default Credentials.
    const { FirestoreEngagementStore } = await import("./firestoreEngagementStore.ts");
    console.log(`Engagement store: Firestore (project ${projectId})`);
    store = new FirestoreEngagementStore(projectId);
  } else {
    console.log("Engagement store: local file (.data/engagements.json)");
    store = new FileEngagementStore(process.env.ENGAGEMENT_DATA_DIR || ".data");
  }
  return store;
}
