/**
 * Local project persistence.
 *
 * Version 1 stores everything except the model file itself (browsers cannot
 * re-open a File without the user picking it again). Re-opening a project
 * therefore restores the full configuration and prompts for the model — the
 * demo building restores completely. The shape is intentionally a plain,
 * versioned JSON document so the same payload can later be POSTed to a server.
 */

import type { ProjectSnapshot } from './useAppStore';

const KEY = 'scaffoldlab.projects.v1';

export interface StoredProject {
  id: string;
  name: string;
  savedAt: string;
  snapshot: ProjectSnapshot;
}

export function listProjects(): StoredProject[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredProject[]) : [];
  } catch {
    return [];
  }
}

export function saveProject(name: string, snapshot: ProjectSnapshot): StoredProject {
  const projects = listProjects();
  const entry: StoredProject = {
    id: `p-${Date.now()}`,
    name,
    savedAt: new Date().toISOString(),
    snapshot,
  };
  const next = [entry, ...projects.filter((p) => p.name !== name)].slice(0, 25);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    throw new Error('Could not save — browser storage is full or unavailable.');
  }
  return entry;
}

export function deleteProject(id: string) {
  const next = listProjects().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function projectToBlob(snapshot: ProjectSnapshot): Blob {
  return new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
}

export function parseProjectFile(text: string): ProjectSnapshot {
  const data = JSON.parse(text);
  if (!data || data.version !== 1 || !data.config) {
    throw new Error('Not a valid ScaffoldLab project file.');
  }
  return data as ProjectSnapshot;
}
