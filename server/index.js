import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT || 4000);
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const LOGS_FILE = path.join(DATA_DIR, 'logs.txt');
const MAX_TITLE = 120;
const MAX_TEXT = 50000;

if (!process.env.APP_USERNAME || !process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
  console.warn('Configuration missing: set APP_USERNAME, APP_PASSWORD, and SESSION_SECRET in server/.env before starting.');
}
if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  throw new Error('SESSION_SECRET must be at least 32 characters in production.');
}

app.disable('x-powered-by');
app.set('trust proxy', isProduction ? 1 : false);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || origin.replace(/\/$/, '') === FRONTEND_ORIGIN) return callback(null, true);
    return callback(new Error('Origin not allowed by CORS.'));
  },
  credentials: true,
}));
app.use(express.json({ limit: '60kb' }));

const PgStore = connectPgSimple(session);
const sessionOptions = {
  name: 'life_log.sid',
  secret: process.env.SESSION_SECRET || 'local-development-only-change-this-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 14,
  },
};
if (process.env.DATABASE_URL) {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
  });
  sessionOptions.store = new PgStore({ pool, tableName: 'life_log_sessions', createTableIfMissing: true });
} else if (isProduction) {
  console.warn('No DATABASE_URL set. Sessions use in-memory storage and will be lost on restart; configure PostgreSQL for durable production sessions.');
}
app.use(session(sessionOptions));

await fs.mkdir(DATA_DIR, { recursive: true });
try { await fs.access(LOGS_FILE); }
catch { await fs.writeFile(LOGS_FILE, '', { flag: 'wx' }).catch(err => { if (err.code !== 'EEXIST') throw err; }); }

// Serialize mutations within this Node process to prevent overlapping read/modify/write operations.
let mutationQueue = Promise.resolve();
function serializedMutation(work) {
  const current = mutationQueue.then(work, work);
  mutationQueue = current.catch(() => {});
  return current;
}
async function readEntries() {
  const content = await fs.readFile(LOGS_FILE, 'utf8').catch(err => {
    if (err.code === 'ENOENT') return '';
    throw err;
  });
  const entries = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value.id === 'string' && typeof value.text === 'string' && typeof value.createdAt === 'string') {
        entries.push(value);
      } else console.error(`Skipping malformed journal record at line ${index + 1}.`);
    } catch {
      // Skip malformed lines without exposing potentially private line contents.
      console.error(`Skipping malformed journal JSON at line ${index + 1}.`);
    }
  }
  return entries;
}
async function writeEntries(entries) {
  const tempFile = path.join(DATA_DIR, `logs.${process.pid}.${crypto.randomUUID()}.tmp`);
  const content = entries.length ? `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n` : '';
  try {
    await fs.writeFile(tempFile, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await fs.rename(tempFile, LOGS_FILE);
  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});
    throw error;
  }
}
function requireAuth(_req, _res, next) {
  // Login disabled at the user's request. This app is intended for private/local use.
  next();
}
function safeEntry(entry) {
  return {
    id: entry.id, title: entry.title, text: entry.text,
    language: entry.language, createdAt: entry.createdAt,
  };
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('/api/me', (req, res) => {
  if (!req.session?.authenticated) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: { username: req.session.username } });
});
app.post('/api/login', (req, res, next) => {
  const username = typeof req.body?.username === 'string' ? req.body.username : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const expectedUser = process.env.APP_USERNAME || '';
  const expectedPassword = process.env.APP_PASSWORD || '';
  const userMatches = username.length === expectedUser.length &&
    crypto.timingSafeEqual(Buffer.from(username), Buffer.from(expectedUser));
  const passwordMatches = password.length === expectedPassword.length &&
    crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expectedPassword));
  if (!expectedUser || !expectedPassword || !userMatches || !passwordMatches) {
    return res.status(401).json({ error: 'That username or password doesn’t look right. Please try again.' });
  }
  req.session.regenerate(err => {
    if (err) return next(err);
    req.session.authenticated = true;
    req.session.username = expectedUser;
    req.session.save(saveErr => {
      if (saveErr) return next(saveErr);
      res.json({ user: { username: expectedUser } });
    });
  });
});
app.post('/api/logout', (req, res, next) => {
  if (!req.session) return res.status(204).end();
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie('life_log.sid', { httpOnly: true, secure: isProduction, sameSite: isProduction ? 'none' : 'lax' });
    res.status(204).end();
  });
});

app.get('/api/logs', requireAuth, async (_req, res, next) => {
  try {
    const entries = await readEntries();
    entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ entries: entries.map(safeEntry) });
  } catch (error) { next(error); }
});
app.post('/api/logs', requireAuth, async (req, res, next) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  const language = req.body?.language;
  if (!text) return res.status(400).json({ error: 'Write or transcribe a memory before saving.' });
  if (title.length > MAX_TITLE) return res.status(400).json({ error: `Title must be ${MAX_TITLE} characters or fewer.` });
  if (text.length > MAX_TEXT) return res.status(400).json({ error: `Journal text must be ${MAX_TEXT} characters or fewer.` });
  if (!['en-US', 'fil-PH'].includes(language)) return res.status(400).json({ error: 'Choose English or Tagalog as the journal language.' });
  try {
    const entry = {
      id: crypto.randomUUID(), title, text, language, createdAt: new Date().toISOString(),
    };
    await serializedMutation(async () => {
      const entries = await readEntries();
      entries.push(entry);
      await writeEntries(entries);
    });
    res.status(201).json({ entry: safeEntry(entry) });
  } catch (error) { next(error); }
});
app.delete('/api/logs/:id', requireAuth, async (req, res, next) => {
  try {
    let deleted = false;
    await serializedMutation(async () => {
      const entries = await readEntries();
      const nextEntries = entries.filter(entry => entry.id !== req.params.id);
      deleted = nextEntries.length !== entries.length;
      if (deleted) await writeEntries(nextEntries);
    });
    if (!deleted) return res.status(404).json({ error: 'That memory could not be found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  if (error?.message === 'Origin not allowed by CORS.') return res.status(403).json({ error: 'This site is not allowed to access the journal API.' });
  if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large.' });
  console.error('API error:', error?.message || 'Unknown server error');
  if (res.headersSent) return;
  res.status(500).json({ error: 'The server could not complete that request. Please try again.' });
});

app.listen(PORT, () => {
  console.log(`Life Log API listening on port ${PORT}`);
  console.log(`Journal file: ${LOGS_FILE}`);
});
