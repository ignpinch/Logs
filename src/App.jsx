import { useCallback, useEffect, useRef, useState } from 'react';
import ExcelJS from 'exceljs';
import { getEntries, saveEntry as persistEntry, deleteEntry as removeStoredEntry } from './lib/storage.js';
import {
  BookOpen, CalendarDays, Check, ChevronLeft, CircleHelp, Download,
  FileText, Mic, MicOff, Plus, Search, Sparkles,
  Trash2, X, ArrowLeft, Leaf, ShieldCheck
} from 'lucide-react';

const formatDate = (value) => new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', year: 'numeric',
}).format(new Date(value));
const formatTime = (value) => new Intl.DateTimeFormat(undefined, {
  hour: 'numeric', minute: '2-digit',
}).format(new Date(value));
const prettyLanguage = (value) => value === 'fil-PH' ? 'Tagalog' : 'English';

function App() {
  const [page, setPage] = useState('new');
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [draft, setDraft] = useState('');
  const [language, setLanguage] = useState('en-US');
  const [recording, setRecording] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState('');
  const [message, setMessage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState('');
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const recordingBaseRef = useRef('');
  const draftRef = useRef(draft);
  const recordingRef = useRef(false);
  const [clearConfirm, setClearConfirm] = useState(false);

  useEffect(() => { draftRef.current = draft; }, [draft]);
  const notify = (text, kind = 'success') => {
    setMessage({ text, kind });
    window.setTimeout(() => setMessage(null), 3800);
  };


  const loadEntries = useCallback(async () => {
    setEntriesLoading(true);
    try {
      setEntries(getEntries());
    } catch (e) {
      notify(e.message || 'Could not load your memories.', 'error');
    } finally { setEntriesLoading(false); }
  }, []);

  useEffect(() => { if (page === 'memories') loadEntries(); }, [page, loadEntries]);
  useEffect(() => { loadEntries(); }, [loadEntries]);

  function stopRecording() {
    recordingRef.current = false;
    setRecording(false);
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    recognitionRef.current = null;
  }

  function startRecording() {
    setRecordingNotice('');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setRecordingNotice('Speech-to-text is not supported in this browser. Try Chrome or Edge, or type your memory below.');
      return;
    }
    if (recordingRef.current) { stopRecording(); return; }
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = language;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      finalTranscriptRef.current = '';
      recordingBaseRef.current = draftRef.current.trimEnd();
      recognition.onstart = () => { recordingRef.current = true; setRecording(true); setRecordingNotice('Listening… speak naturally.'); };
      recognition.onresult = (event) => {
        let recognized = '';
        for (let i = 0; i < event.results.length; i++) {
          recognized += `${event.results[i][0]?.transcript || ''} `;
        }
        finalTranscriptRef.current = recognized.trim();
        const prefix = recordingBaseRef.current;
        const next = [prefix, finalTranscriptRef.current].filter(Boolean).join(prefix && finalTranscriptRef.current ? ' ' : '');
        draftRef.current = next;
        setDraft(next);
      };
      recognition.onerror = (event) => {
        const errors = {
          'not-allowed': 'Microphone permission was denied. Allow microphone access in your browser settings.',
          'service-not-allowed': 'Speech recognition is blocked by this browser or device.',
          'audio-capture': 'No microphone was found. Check your device and try again.',
          network: 'Speech recognition needs a network connection in this browser.',
          'no-speech': 'No speech was detected. Try speaking a little closer to your microphone.',
        };
        setRecordingNotice(errors[event.error] || `Recording stopped: ${event.error}. You can continue typing below.`);
      };
      recognition.onend = () => {
        recordingRef.current = false; setRecording(false); recognitionRef.current = null;
        setRecordingNotice(prev => prev || 'Recording stopped. Your text is ready to edit.');
      };
      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setRecording(false);
      setRecordingNotice('Could not start speech recognition. Check your microphone permission and try again.');
    }
  }

  useEffect(() => () => {
    recordingRef.current = false;
    try { recognitionRef.current?.abort(); } catch { /* no-op */ }
  }, []);

  async function saveEntry() {
    if (!draft.trim()) { notify('Add a few words before saving your memory.', 'error'); return; }
    setSaving(true);
    try {
      const entry = {
        id: crypto.randomUUID(),
        title: title.trim(),
        text: draft.trim(),
        language,
        createdAt: new Date().toISOString(),
      };
      persistEntry(entry);
      setEntries(getEntries());
      setTitle(''); setDraft(''); draftRef.current = ''; finalTranscriptRef.current = '';
      setRecordingNotice('');
      notify('Your memory has been saved on this device.');
      setPage('memories');
    } catch (e) {
      notify(e.message || 'Could not save your memory.', 'error');
    } finally { setSaving(false); }
  }

  function clearDraft() {
    stopRecording(); setTitle(''); setDraft(''); draftRef.current = ''; finalTranscriptRef.current = '';
    setRecordingNotice(''); setClearConfirm(false);
  }

  async function deleteEntry(entry) {
    if (!window.confirm(`Delete “${entry.title || 'Untitled memory'}”? This cannot be undone.`)) return;
    setDeleting(entry.id);
    try {
      removeStoredEntry(entry.id);
      setEntries(getEntries());
      if (selected?.id === entry.id) setSelected(null);
      notify('Memory deleted.');
    } catch (e) { notify(e.message || 'Could not delete this memory.', 'error'); }
    finally { setDeleting(''); }
  }

  async function exportExcel() {
    if (!entries.length) { notify('There are no memories to export yet.', 'error'); return; }
    try {
      const allEntries = getEntries();
      if (!allEntries.length) { notify('There are no memories to export yet.', 'error'); return; }
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Life Log';
      workbook.created = new Date();
      const sheet = workbook.addWorksheet('My Memories', { views: [{ state: 'frozen', ySplit: 1 }] });
      sheet.columns = [
        { header: 'Entry ID', key: 'id', width: 38 },
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Time', key: 'time', width: 14 },
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Language', key: 'language', width: 14 },
        { header: 'Full Journal Text', key: 'text', width: 70 },
      ];
      allEntries.forEach(entry => sheet.addRow({
        id: entry.id, date: formatDate(entry.createdAt), time: formatTime(entry.createdAt),
        title: entry.title || 'Untitled memory', language: prettyLanguage(entry.language), text: entry.text,
      }));
      const header = sheet.getRow(1);
      header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF244D3B' } };
      header.alignment = { vertical: 'middle' };
      header.height = 26;
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
        row.eachCell(cell => { cell.border = { bottom: { style: 'thin', color: { argb: 'FFE3E8E0' } } }; });
      });
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `life-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
      notify(`Exported ${allEntries.length} ${allEntries.length === 1 ? 'memory' : 'memories'} to Excel.`);
    } catch (e) { notify(`Export failed: ${e.message || 'Please try again.'}`, 'error'); }
  }

  const filtered = entries.filter(entry => `${entry.title || ''} ${entry.text || ''}`.toLowerCase().includes(search.toLowerCase().trim()));
  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return <div className="app-shell">
    <header className="topbar">
      <button className="brand" onClick={() => { setPage('new'); setSelected(null); }} aria-label="Life Log home">
        <span className="brand-mark small"><Leaf size={19}/></span><span>life<span className="brand-light">log</span></span>
      </button>
      <div className="topbar-right"><span className="user-greeting">Your quiet corner</span></div>
    </header>

    <main className="main-content">
      {page === 'new' && <>
        <section className="page-heading">
          <p className="eyebrow"><Sparkles size={13}/> MAKE SPACE FOR TODAY</p>
          <h1>What's on your <em>mind?</em></h1>
          <p>Say it, write it, let it out. This moment is yours.</p>
        </section>
        <section className="record-card">
          <div className="record-card-top"><span className="section-label">VOICE NOTE</span><span className="private-label"><ShieldCheck size={14}/> PRIVATE</span></div>
          <div className={`mic-orbit ${recording ? 'is-recording' : ''}`}>
            <button className={`mic-button ${recording ? 'recording' : ''}`} onClick={startRecording} aria-label={recording ? 'Stop recording' : 'Start recording'}>
              {recording ? <MicOff size={29} strokeWidth={1.8}/> : <Mic size={30} strokeWidth={1.8}/>}
            </button>
          </div>
          <p className="record-title">{recording ? 'I’m listening…' : 'Tap to speak'}</p>
          <p className="record-subtitle">{recording ? 'Take your time. Your words will appear below.' : 'Turn the little moments into memories.'}</p>
          <div className="record-controls">
            <label htmlFor="language" className="sr-only">Spoken language</label>
            <select id="language" value={language} onChange={e => setLanguage(e.target.value)} disabled={recording} aria-label="Spoken language">
              <option value="en-US">English</option><option value="fil-PH">Tagalog</option>
            </select>
            {recording && <button className="button button-stop" onClick={stopRecording}><span className="stop-square"/> Stop recording</button>}
          </div>
          {recordingNotice && <p className={`recording-notice ${recording && 'notice-active'}`} role="status">{recording && <span className="live-dot"/>}{recordingNotice}</p>}
          <p className="speech-footnote"><CircleHelp size={13}/> Speech recognition works best in Chrome or Edge with internet access.</p>
        </section>

        <section className="editor-section">
          <div className="editor-heading"><div><p className="section-label">YOUR ENTRY</p><h2>Capture the thought</h2></div><span className="word-count">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span></div>
          <label className="field-label" htmlFor="entry-title">Title <span>· optional</span></label>
          <input id="entry-title" className="title-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="Give this memory a name…" />
          <label className="field-label journal-label" htmlFor="entry-text">Your journal</label>
          <textarea id="entry-text" className="journal-input" maxLength={50000} value={draft} onChange={e => { setDraft(e.target.value); draftRef.current = e.target.value; }} placeholder="Start with whatever comes to mind. No need to make it perfect…" rows={7}/>
          <div className="editor-actions">
            <button className="text-button" onClick={() => draft.trim() || title.trim() ? setClearConfirm(true) : clearDraft()}><X size={15}/> Clear draft</button>
            <button className="button button-primary save-button" onClick={saveEntry} disabled={saving || !draft.trim()}>{saving ? 'Saving…' : <><Check size={17}/> Save memory</>}</button>
          </div>
          {clearConfirm && <div className="confirm-strip"><span>Clear your unsaved draft?</span><button className="text-button" onClick={() => setClearConfirm(false)}>Keep it</button><button className="text-button danger-text" onClick={clearDraft}>Clear</button></div>}
          <p className="editor-hint"><Leaf size={14}/> Your journal doesn't have to be polished. It just has to be yours.</p>
        </section>
      </>}

      {page === 'memories' && !selected && <>
        <section className="page-heading memories-heading">
          <p className="eyebrow"><BookOpen size={13}/> YOUR PERSONAL ARCHIVE</p>
          <h1>Little moments,<br/><em>kept close.</em></h1>
          <p>All the things you wanted to remember.</p>
        </section>
        <div className="memories-toolbar">
          <div className="search-wrap"><Search size={18}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your memories…" aria-label="Search memories"/></div>
          <button className="button button-outline export-button" onClick={exportExcel} disabled={entriesLoading}><Download size={16}/> <span>Export</span></button>
        </div>
        <div className="list-meta"><span>{entriesLoading ? 'Gathering your memories…' : `${filtered.length} ${filtered.length === 1 ? 'memory' : 'memories'}`}</span><span>NEWEST FIRST</span></div>
        {entriesLoading ? <div className="empty-state"><div className="loading-spinner"/><p>Opening your memories…</p></div> :
          filtered.length === 0 ? <div className="empty-state"><div className="empty-icon"><BookOpen size={25}/></div><h2>{search ? 'No matches just yet' : 'Your story starts here'}</h2><p>{search ? 'Try another word or phrase.' : 'Save a thought, a feeling, or something small from today.'}</p>{!search && <button className="button button-primary" onClick={() => setPage('new')}><Plus size={17}/> Write your first memory</button>}</div> :
          <div className="memory-list">{filtered.map(entry => <article className="memory-card" key={entry.id}>
            <button className="memory-open" onClick={() => setSelected(entry)}>
              <div className="memory-date"><CalendarDays size={14}/><span>{formatDate(entry.createdAt)}</span><span className="date-dot">·</span><span>{formatTime(entry.createdAt)}</span></div>
              <h2>{entry.title || 'Untitled memory'}</h2>
              <p className="memory-preview">{entry.text}</p>
              <div className="memory-card-footer"><span className="language-pill">{entry.language === 'fil-PH' ? 'TAGALOG' : 'ENGLISH'}</span><span className="read-link">Read memory <span>↗</span></span></div>
            </button>
            <button className="icon-button delete-button" onClick={() => deleteEntry(entry)} disabled={deleting === entry.id} title="Delete memory" aria-label={`Delete ${entry.title || 'memory'}`}><Trash2 size={17}/></button>
          </article>)}</div>
        }
      </>}

      {page === 'memories' && selected && <section className="detail-page">
        <button className="back-button" onClick={() => setSelected(null)}><ArrowLeft size={17}/> All memories</button>
        <article className="detail-card">
          <div className="memory-date"><CalendarDays size={14}/><span>{formatDate(selected.createdAt)}</span><span className="date-dot">·</span><span>{formatTime(selected.createdAt)}</span></div>
          <h1>{selected.title || 'Untitled memory'}</h1>
          <div className="detail-meta"><span className="language-pill">{prettyLanguage(selected.language)}</span><button className="text-button danger-text" onClick={() => deleteEntry(selected)} disabled={deleting === selected.id}><Trash2 size={15}/> Delete</button></div>
          <p className="detail-text">{selected.text}</p>
        </article>
      </section>}
    </main>

    <nav className="bottom-nav" aria-label="Main navigation">
      <button className={page === 'new' ? 'nav-item active' : 'nav-item'} onClick={() => { stopRecording(); setPage('new'); setSelected(null); }}><span className="nav-icon"><Plus size={20}/></span><span>New entry</span></button>
      <button className={page === 'memories' ? 'nav-item active' : 'nav-item'} onClick={() => { stopRecording(); setPage('memories'); setSelected(null); }}><span className="nav-icon"><BookOpen size={19}/></span><span>My memories</span></button>
    </nav>
    {message && <div className={`toast ${message.kind}`} role="status"><span>{message.kind === 'success' ? <Check size={17}/> : <CircleHelp size={17}/>}</span>{message.text}<button onClick={() => setMessage(null)} aria-label="Dismiss message"><X size={15}/></button></div>}
  </div>;
}

export default App;
