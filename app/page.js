'use client';
import { useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase-browser';

const icons = {
  spark: <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M16 2.5 19.3 12.7 29.5 16 19.3 19.3 16 29.5 12.7 19.3 2.5 16 12.7 12.7Z" fill="currentColor"/></svg>,
  file: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h6"/></svg>,
  upload: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 16v5h16v-5"/></svg>,
  send: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m4 12 16-8-5 16-3-7-8-1Zm8 1 8-9"/></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>,
  book: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 5.5C7 3 10 3 12 5v15c-2-2-5-2-8 0V5.5Zm16 0c-3-2.5-6-2.5-8-.5v15c2-2 5-2 8 0V5.5Z"/></svg>
};
const examples = ['What are the main takeaways?', 'Which deadlines are mentioned?', 'Summarize the requirements'];
function formatSize(bytes) { return bytes > 1024 * 1024 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`; }
function shortDate(value) { return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' }); }
function renderInlineMarkdown(text, keyPrefix) {
  const value = String(text);
  const tick = String.fromCharCode(96);
  const parts = [];
  let plain = '';
  let index = 0;

  function flushPlain() {
    if (plain) {
      parts.push(plain);
      plain = '';
    }
  }

  while (index < value.length) {
    let marker = '';
    let close = -1;
    let Tag = null;
    if (value.startsWith('**', index)) {
      marker = '**'; close = value.indexOf(marker, index + marker.length); Tag = 'strong';
    } else if (value.startsWith('__', index)) {
      marker = '__'; close = value.indexOf(marker, index + marker.length); Tag = 'strong';
    } else if (value[index] === tick) {
      marker = tick; close = value.indexOf(marker, index + 1); Tag = 'code';
    } else if (value[index] === '*') {
      marker = '*'; close = value.indexOf(marker, index + 1); Tag = 'em';
    }

    if (Tag && close > index + marker.length) {
      flushPlain();
      const key = keyPrefix + '-' + parts.length;
      parts.push(<Tag key={key}>{value.slice(index + marker.length, close)}</Tag>);
      index = close + marker.length;
    } else {
      plain += value[index];
      index++;
    }
  }

  flushPlain();
  return parts.map((part, partIndex) => typeof part === 'string' ? part : <React.Fragment key={keyPrefix + '-fragment-' + partIndex}>{part}</React.Fragment>);
}

function renderMarkdown(text) {
  const newline = String.fromCharCode(10);
  const carriageReturn = String.fromCharCode(13);
  const lines = String(text || '').split(carriageReturn).join('').split(newline);
  const blocks = [];
  let paragraph = [];
  let items = [];
  let listType = null;
  let listStart = 1;
  let blockIndex = 0;

  function flushParagraph() {
    if (!paragraph.length) return;
    const key = 'p-' + blockIndex++;
    blocks.push(<p key={key}>{renderInlineMarkdown(paragraph.join(' '), key)}</p>);
    paragraph = [];
  }

  function flushList() {
    if (!items.length) return;
    const Tag = listType === 'ol' ? 'ol' : 'ul';
    const key = 'list-' + blockIndex++;
    const props = listType === 'ol' ? { start: listStart, key } : { key };
    blocks.push(<Tag {...props}>{items.map((item, itemIndex) => <li key={itemIndex}>{renderInlineMarkdown(item, key + '-li-' + itemIndex)}</li>)}</Tag>);
    items = [];
    listType = null;
    listStart = 1;
  }

  const fence = String.fromCharCode(96).repeat(3);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith(fence)) {
      flushParagraph();
      flushList();
      const code = [];
      for (lineIndex++; lineIndex < lines.length && !lines[lineIndex].trim().startsWith(fence); lineIndex++) code.push(lines[lineIndex]);
      blocks.push(<pre key={'code-' + blockIndex++}><code>{code.join(newline)}</code></pre>);
      continue;
    }

    let headingLevel = 0;
    while (headingLevel < trimmed.length && trimmed[headingLevel] === '#') headingLevel++;
    if (headingLevel > 0 && headingLevel <= 6 && trimmed[headingLevel] === ' ') {
      flushParagraph();
      flushList();
      const Tag = 'h' + headingLevel;
      const key = 'h-' + blockIndex++;
      blocks.push(<Tag key={key}>{renderInlineMarkdown(trimmed.slice(headingLevel).trim(), key)}</Tag>);
      continue;
    }

    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushParagraph();
      flushList();
      blocks.push(<hr key={'hr-' + blockIndex++} />);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushParagraph();
      flushList();
      const key = 'quote-' + blockIndex++;
      blocks.push(<blockquote key={key}>{renderInlineMarkdown(trimmed.slice(1).trim(), key)}</blockquote>);
      continue;
    }

    let listContent = null;
    let nextListType = null;
    let nextListStart = 1;
    const bulletPrefix = ['- ', '* ', '+ '].find((prefix) => trimmed.startsWith(prefix));
    if (bulletPrefix) {
      listContent = trimmed.slice(bulletPrefix.length);
      nextListType = 'ul';
    } else {
      let digitEnd = 0;
      while (digitEnd < trimmed.length && trimmed.charCodeAt(digitEnd) >= 48 && trimmed.charCodeAt(digitEnd) <= 57) digitEnd++;
      if (digitEnd > 0 && (trimmed[digitEnd] === '.' || trimmed[digitEnd] === ')') && trimmed[digitEnd + 1] === ' ') {
        listContent = trimmed.slice(digitEnd + 2);
        nextListType = 'ol';
        nextListStart = Number(trimmed.slice(0, digitEnd)) || 1;
      }
    }

    if (listContent !== null) {
      flushParagraph();
      if (listType && listType !== nextListType) flushList();
      if (!items.length) listStart = nextListStart;
      listType = nextListType;
      items.push(listContent);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

function ErrorMessage({ text }) { return text ? <div className="error-alert" role="alert">{text}</div> : null; }

export default function Home() {
  const configured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!configured) return <div className="setup-screen"><div className="logo-mark">{icons.spark}</div><h1>Connect your workspace</h1><p>Add the Supabase URL and anon key to <code>.env.local</code>, then restart the server. Follow the README for the database setup.</p></div>;
  return <Application />;
}

function Application() {
  const supabase = browserClient();
  const [session, setSession] = useState(null), [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, current) => { setSession(current); setReady(true); });
    return () => subscription.unsubscribe();
  }, [supabase]);
  if (!ready) return <div className="boot"><div className="logo-mark">{icons.spark}</div><span>Opening your workspace…</span></div>;
  if (!session) return <SignIn supabase={supabase} />;
  return <Workspace session={session} supabase={supabase} />;
}

function SignIn({ supabase }) {
  const [mode, setMode] = useState('signin'), [email, setEmail] = useState(''), [password, setPassword] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (!data.session) setNotice('Check your email for a confirmation link, then sign in.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="auth-page"><div className="auth-intro"><div className="wordmark"><div className="logo-mark">{icons.spark}</div> margin<span className="dot">.</span></div><div className="auth-copy"><span className="eyebrow light">YOUR IDEAS, GROUNDED IN YOUR DOCUMENTS</span><h1>Answers with<br/><em>the receipts.</em></h1><p>Bring your documents together. Ask anything. Get clear answers with a direct path back to the source.</p><div className="auth-illustration"><div className="floating-doc"><span>RESEARCH NOTES</span><i></i><i></i><i></i><b>Page 04</b></div><div className="floating-answer">{icons.spark}<div><strong>Here’s what I found</strong><small>Grounded in your sources <span>↗</span></small></div></div></div></div><div className="auth-bottom">Read closely. Think clearly.</div></div><div className="auth-form-wrap"><div className="auth-form"><span className="eyebrow">WELCOME TO MARGIN</span><h2>{mode === 'signin' ? 'Sign in to your library' : 'Create your workspace'}</h2><p>Your documents, conversations, and sources in one place.</p><form onSubmit={submit}><label>Email address<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></label><label>Password<input type="password" required minLength="6" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} /></label><ErrorMessage text={error}/>{notice && <div className="success-alert">{notice}</div>}<button className="dark-button" disabled={busy}>{busy ? 'One moment…' : mode === 'signin' ? 'Sign in →' : 'Create account →'}</button></form><div className="auth-switch">{mode === 'signin' ? 'New to Margin?' : 'Already have an account?'} <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setNotice(''); }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</button></div></div></div></div>;
}

function Workspace({ session, supabase }) {
  const [docs, setDocs] = useState([]), [conversations, setConversations] = useState([]), [activeId, setActiveId] = useState(null), [messages, setMessages] = useState([]), [selected, setSelected] = useState([]), [question, setQuestion] = useState(''), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState(''), [source, setSource] = useState(null), [mobilePanel, setMobilePanel] = useState('chat');
  const fileRef = useRef(null), bottomRef = useRef(null), questionRef = useRef(null);
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${session.access_token}`, ...options.headers } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  async function load() {
    try {
      const [d, c] = await Promise.all([api('/api/documents'), api('/api/conversations')]);
      setDocs(d.documents); setConversations(c.conversations);
      setSelected(current => current.length ? current.filter(id => d.documents.some(doc => doc.id === id && doc.status === 'ready')) : d.documents.filter(doc => doc.status === 'ready').map(doc => doc.id));
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [session.access_token]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);
  useEffect(() => { const textarea = questionRef.current; if (!textarea) return; textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight, 240) + 'px'; }, [question]);
  async function openConversation(id) {
    setError(''); setMobilePanel('chat'); setActiveId(id); setSource(null);
    try { const data = await api(`/api/conversations/${id}`); setMessages(data.messages); setSelected(data.conversation.document_ids); }
    catch (e) { setError(e.message); }
  }
  function newConversation() { setActiveId(null); setMessages([]); setQuestion(''); setSource(null); setSelected(docs.filter(d => d.status === 'ready').map(d => d.id)); setMobilePanel('chat'); setError(''); }
  async function renameConversation(id, currentTitle) {
    const value = window.prompt('Rename conversation', currentTitle);
    if (value === null) return;
    const title = value.trim();
    if (!title || title.length > 100) { setError('Title must be between 1 and 100 characters.'); return; }
    setError('');
    try {
      const result = await api(`/api/conversations/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
      setConversations(items => items.map(item => item.id === id ? { ...item, title: result.conversation.title } : item));
    } catch (e) { setError(e.message); }
  }
  async function deleteConversation(id, title) {
    if (!window.confirm('Delete "' + title + '" and its message history?')) return;
    setError('');
    try {
      await api(`/api/conversations/${id}`, { method: 'DELETE' });
      setConversations(items => items.filter(item => item.id !== id));
      if (activeId === id) newConversation();
    } catch (e) { setError(e.message); }
  }
  async function upload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = ''; setUploading(true); setError('');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('The file must be under 5 MB');
      const form = new FormData(); form.append('file', file);
      const result = await api('/api/documents', { method: 'POST', body: form });
      if (result.document.status === 'failed') throw new Error(result.document.error || 'Indexing failed');
      await load(); setSelected(current => [...new Set([...current, result.document.id])]);
    } catch (e) { setError(e.message); await load(); } finally { setUploading(false); }
  }
  async function retry(id) { setError(''); setUploading(true); try { await api(`/api/documents/${id}/retry`, { method: 'POST' }); await load(); } catch (e) { setError(e.message); await load(); } finally { setUploading(false); } }
  async function remove(id) { if (!window.confirm('Remove this document and its searchable passages?')) return; try { await api(`/api/documents/${id}`, { method: 'DELETE' }); setSelected(x => x.filter(d => d !== id)); await load(); } catch (e) { setError(e.message); } }
  async function openFile(id, page) {
    try { const result = await api(`/api/documents/${id}/file`); const opened = window.open(result.url + (page ? `#page=${page}` : ''), '_blank', 'noopener,noreferrer'); if (!opened) window.location.assign(result.url); }
    catch (e) { setError(e.message); }
  }
  async function send(e, prompt) {
    e?.preventDefault(); const q = (prompt || question).trim(); if (!q || busy) return;
    if (!activeId && !selected.length) { setError('Select at least one ready document first.'); return; }
    setError(''); setQuestion(''); setBusy(true);
    const previous = messages; setMessages([...previous, { id: `temp-${Date.now()}`, role: 'user', content: q, citations: [] }]);
    try {
      const result = await api('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, ...(activeId ? { conversationId: activeId } : { documentIds: selected }) }) });
      setActiveId(result.conversation.id); setMessages([...previous, ...result.messages]); setSource(result.citations[0] || null);
      const c = await api('/api/conversations'); setConversations(c.conversations);
    } catch (e) { setMessages(previous); setQuestion(q); setError(e.message); } finally { setBusy(false); }
  }
  const readyDocs = docs.filter(d => d.status === 'ready');
  return <div className="workspace-shell"><aside className={`sidebar ${mobilePanel === 'library' ? 'mobile-open' : ''}`}><div className="side-brand"><div className="logo-mark">{icons.spark}</div><strong>margin<span className="dot">.</span></strong></div><div className="side-section"><div className="section-header"><span>YOUR WORKSPACE</span></div><button className="new-chat" onClick={newConversation}><span>＋</span> New conversation <span className="shortcut">↗</span></button></div><div className="side-section docs-section"><div className="section-header"><span>DOCUMENT LIBRARY</span><b>{docs.length}</b></div><button className="upload-dash" onClick={() => fileRef.current?.click()} disabled={uploading}>{icons.upload}<span>{uploading ? 'Reading & indexing…' : 'Upload a document'}</span></button><input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.md" onChange={upload}/><div className="doc-list">{!docs.length && <p className="side-empty">Add a document to start asking questions.</p>}{docs.map(doc => <div key={doc.id} className={`doc-item ${selected.includes(doc.id) ? 'selected' : ''}`}><button className="doc-select" disabled={doc.status !== 'ready' || !!activeId} onClick={() => setSelected(s => s.includes(doc.id) ? s.filter(x => x !== doc.id) : [...s, doc.id])} aria-label={`${selected.includes(doc.id) ? 'Deselect' : 'Select'} ${doc.filename}`}><span className={`checkbox ${selected.includes(doc.id) ? 'checked' : ''}`}>{selected.includes(doc.id) ? icons.check : ''}</span></button><button className="doc-main" onClick={() => doc.status === 'ready' ? openFile(doc.id) : doc.status === 'failed' ? retry(doc.id) : null}><span className="file-badge">{doc.file_type.toUpperCase()}</span><span className="doc-info"><strong title={doc.filename}>{doc.filename}</strong><small>{doc.status === 'ready' ? `${doc.chunk_count} passages · ${formatSize(doc.file_size)}` : doc.status === 'failed' ? 'Index failed · click to retry' : 'Indexing…'}</small></span></button><button className="doc-remove" aria-label={`Remove ${doc.filename}`} title="Remove" onClick={() => remove(doc.id)}>×</button></div>)}</div><p className="side-tip">PDF, DOCX, TXT, MD · up to 5 MB</p></div><div className="side-section conversations"><div className="section-header"><span>RECENT CONVERSATIONS</span></div>{conversations.length ? conversations.map(c => (<div key={c.id} className="conversation-row"><button className={`conversation ${activeId === c.id ? 'active' : ''}`} onClick={() => openConversation(c.id)}><span className="conversation-icon">◷</span><span title={c.title}>{c.title}</span></button><button className="conversation-action" title="Rename conversation" aria-label={'Rename ' + c.title} onClick={() => renameConversation(c.id, c.title)}>✎</button><button className="conversation-action delete" title="Delete conversation" aria-label={'Delete ' + c.title} onClick={() => deleteConversation(c.id, c.title)}>×</button></div>)) : <p className="side-empty">Your conversations will appear here.</p>}</div><div className="side-footer"><span className="avatar">{session.user.email?.[0]?.toUpperCase() || 'U'}</span><span className="email" title={session.user.email}>{session.user.email}</span><button onClick={() => supabase.auth.signOut()} title="Sign out" aria-label="Sign out">↪</button></div></aside>
    <main className="main-column"><div className="topbar"><button className="mobile-menu" onClick={() => setMobilePanel(mobilePanel === 'library' ? 'chat' : 'library')}>☰</button><div className="top-path">Workspace <span>/</span> {activeId ? 'Conversation' : 'New conversation'}</div><div className="top-actions"><span className="private-pill"><span>●</span> Private workspace</span></div></div><div className="chat-scroll"><div className="chat-inner">{!messages.length ? <div className="welcome"><div className="welcome-icon">{icons.spark}</div><span className="eyebrow">YOUR KNOWLEDGE, WITH CONTEXT</span><h1>Ask your documents<br/><em>anything.</em></h1><p>Get the answer you need, with the exact source to back it up.</p><div className="example-grid">{examples.map((example, i) => <button key={example} onClick={e => send(e, example)} disabled={!readyDocs.length || busy}><span>{['✦', '◷', '▤'][i]}</span>{example}<b>↗</b></button>)}</div>{!readyDocs.length && <div className="welcome-hint">Start by uploading a document in the library on the left.</div>}</div> : <div className="messages">{messages.map(m => <div key={m.id} className={`message ${m.role}`}><div className="message-avatar">{m.role === 'assistant' ? icons.spark : session.user.email?.[0]?.toUpperCase()}</div><div className="message-body"><span className="message-label">{m.role === 'assistant' ? 'MARGIN' : 'YOU'}</span><div className="message-text">{renderMarkdown(m.content)}</div>{m.citations?.length > 0 && <div className="citation-list">{m.citations.map(c => <button key={c.index} className="cite-chip" onClick={() => setSource(c)}><span>[{c.index}]</span> {c.documentName}{c.page ? ` · p. ${c.page}` : ''} ↗</button>)}</div>}</div></div>)}{busy && <div className="message assistant"><div className="message-avatar">{icons.spark}</div><div className="message-body"><span className="message-label">MARGIN</span><div className="thinking"><i></i><i></i><i></i><span>Reading your sources…</span></div></div></div>}<div ref={bottomRef}/></div>}</div></div><div className="composer-wrap"><ErrorMessage text={error}/><form className="composer" onSubmit={send}><textarea ref={questionRef} value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }} placeholder={readyDocs.length ? 'Ask a question about your documents…' : 'Upload a document to get started…'} rows={2} maxLength={1500} disabled={busy || !readyDocs.length}/><div className="composer-bottom"><span>{activeId ? `Using ${selected.length} document${selected.length !== 1 ? 's' : ''} in this conversation` : `${selected.length} document${selected.length !== 1 ? 's' : ''} selected`} <span className="dot-sep">·</span> Enter to send</span><button disabled={busy || !question.trim() || !readyDocs.length} aria-label="Send question">{icons.send}</button></div></form><p className="composer-note">Margin uses your documents as its source. Check important answers against the original.</p></div></main>
    <aside className={`source-panel ${mobilePanel === 'sources' ? 'mobile-open' : ''}`}><div className="source-header"><span>SOURCE INSPECTOR</span><button onClick={() => setMobilePanel('chat')} className="mobile-close" aria-label="Close sources">×</button></div>{source ? <div className="source-content"><span className="source-overline">CITED PASSAGE</span><h2>{source.documentName}</h2><span className="source-page">{icons.file} {source.page ? `Page ${source.page}` : 'Document excerpt'}</span><div className="source-quote"><span>“</span><p>{source.snippet}</p></div><button className="source-open" onClick={() => openFile(source.documentId, source.page)}>Open original document ↗</button><div className="source-explain"><span>{icons.spark}</span><p>Answers are linked back to the passages used to generate them.</p></div></div> : <div className="no-source"><div className="stack-art"><div></div><div></div><div>{icons.book}</div></div><h2>Trace it back.</h2><p>When an answer cites a source, you’ll see the supporting passage right here.</p><span className="source-ornament">✦ &nbsp; SOURCES FIRST &nbsp; ✦</span></div>}</aside><button className="mobile-sources" onClick={() => setMobilePanel('sources')}>Sources ↗</button></div>;
}
