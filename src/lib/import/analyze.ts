/**
 * Local, client-side analysis of parsed entries.
 *
 * Runs entirely in the browser before anything is uploaded, so the UI can
 * show a preview summary ("N entries, dates X–Y, M photos, folders…").
 */

import type { NormalizedEntry } from './types.js';

export type ImportAnalysis = {
  total: number;
  dateRange: { min: string; max: string } | null;
  withPhotos: number;
  photoCount: number;
  folderCounts: Record<string, number>;
};

export function analyzeLocal(entries: NormalizedEntry[]): ImportAnalysis {
  const folderCounts: Record<string, number> = {};
  let withPhotos = 0;
  let photoCount = 0;
  let min: string | null = null;
  let max: string | null = null;

  for (const entry of entries) {
    if (entry.eventDate) {
      if (min === null || entry.eventDate < min) min = entry.eventDate;
      if (max === null || entry.eventDate > max) max = entry.eventDate;
    }
    if (entry.photos.length > 0) {
      withPhotos++;
      photoCount += entry.photos.length;
    }
    if (entry.categoryHint) {
      folderCounts[entry.categoryHint] = (folderCounts[entry.categoryHint] ?? 0) + 1;
    }
  }

  return {
    total: entries.length,
    dateRange: min !== null && max !== null ? { min, max } : null,
    withPhotos,
    photoCount,
    folderCounts,
  };
}
