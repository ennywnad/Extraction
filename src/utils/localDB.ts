import { Session } from "../types";

export function loadSessions(onError?: () => void): Session[] {
  try {
    const raw = localStorage.getItem("extraction_sessions");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load sessions from localStorage", e);
    onError?.();
    return [];
  }
}

function saveSessions(sessions: Session[]) {
  try {
    localStorage.setItem("extraction_sessions", JSON.stringify(sessions));
  } catch (e) {
    console.error("Failed to save sessions to localStorage", e);
  }
}

export function persistSession(session: Session) {
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.id === session.id);
  if (index >= 0) {
    sessions[index] = { ...session, updatedAt: new Date().toISOString() };
  } else {
    sessions.push({ ...session, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  saveSessions(sessions);
}

export function deleteSession(id: string) {
  const sessions = loadSessions();
  const filtered = sessions.filter((s) => s.id !== id);
  saveSessions(filtered);
}
