// Browser-local storage for Life Log. Entries survive refreshes without requiring a server.
const STORAGE_KEY = 'life-log.entries.v1';

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.text === 'string') : [];
  } catch (error) {
    console.error('Could not read Life Log entries:', error);
    return [];
  }
}

function writeAll(entries) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch (error) {
    console.error('Could not write Life Log entries:', error);
    if (error?.name === 'QuotaExceededError') throw new Error('Your browser storage is full. Export your memories and remove some entries before saving again.');
    throw new Error('Your browser blocked storage. Check that local storage is enabled for this site.');
  }
}

export function getEntries() {
  return readAll().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function saveEntry(entry) {
  const entries = readAll();
  const index = entries.findIndex((item) => item.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  writeAll(entries);
  return entry;
}

export function deleteEntry(id) {
  const entries = readAll();
  const next = entries.filter((entry) => entry.id !== id);
  writeAll(next);
  return next.length !== entries.length;
}

export function replaceEntries(entries) {
  writeAll(entries);
}
