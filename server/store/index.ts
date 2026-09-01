import type { EngagementStore } from "./types.ts";
import { FileEngagementStore } from "./fileEngagementStore.ts";

let store: EngagementStore | null = null;

/**
 * Selects the store the same way getGemini() selects a client: presence of configuration.
 * FIRESTORE_PROJECT_ID set means the real thing; unset means the local JSON file, so
 * `npm run dev` works with no cloud setup at all.
 */
export async function getEngagementStore(): Promise<EngagementStore> {
  if (store) return store;

  const projectId = process.env.FIRESTORE_PROJECT_ID?.trim();
  if (projectId) {
    // Imported lazily so local development never loads the Firestore SDK or looks for
    // Application Default Credentials.
    const { FirestoreEngagementStore } = await import("./firestoreEngagementStore.ts");
    console.log(`Engagement store: Firestore (project ${projectId})`);
    store = new FirestoreEngagementStore(projectId);
  } else {
    console.log("Engagement store: local file (.data/engagements.json)");
    store = new FileEngagementStore();
  }
  return store;
}
