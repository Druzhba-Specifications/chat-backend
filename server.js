// server.js
const express = require('express');
const fs      = require('fs');
const path    = require('path');
const cors    = require('cors');
const dns     = require('dns');

const app  = express();
const PORT = process.env.PORT || 3000;

// Static assets (avatars & sounds)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

app.use(cors());
app.use(express.json());

// Track online users
const onlineUsers = new Set();

// Ensure all required data files exist
const dataFiles = [
  'privates.json', 'accounts.json', 'blacklist.json', 'status.json', 'log.json',
  'ranks.json', 'warns.json', 'lastlogin.json', 'admins.json', 'threads.json'
];
dataFiles.forEach(f => {
  const filePath = path.join(__dirname, f);
  if (!fs.existsSync(filePath)) {
    let initial = [];
    if (f === 'status.json') initial = { off: false, paused: false };
    if (f === 'admins.json') initial = ['GOD HIMSELF'];
    if (f === 'warns.json' || f === 'lastlogin.json' || f === 'ranks.json') initial = {};
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
  }
});

// Robust JSON helpers
function read(f) {
  const filePath = path.join(__dirname, f);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw || !raw.trim()) {
      // empty file -> sensible defaults
      if (f === 'status.json') return { off: false, paused: false };
      if (f === 'admins.json') return ['GOD HIMSELF'];
      if (f === 'warns.json' || f === 'lastlogin.json' || f === 'ranks.json') return {};
      return [];
    }
    return JSON.parse(raw);
  } catch (e) {
    // If file missing or invalid, return sensible default
    if (f.endsWith('.json')) {
      if (f === 'status.json') return { off: false, paused: false };
      if (f === 'admins.json') return ['GOD HIMSELF'];
      if (f === 'warns.json' || f === 'lastlogin.json' || f === 'ranks.json') return {};
      return [];
    }
    throw e;
  }
}
function write(f, data) {
  fs.writeFileSync(path.join(__dirname, f), JSON.stringify(data, null, 2));
}

// Traffic counter
let trafficCount = 0;
setInterval(() => { trafficCount = 0; }, 60_000);
app.use((req, res, next) => { trafficCount++; next(); });

// ─── PRIVATE MESSAGES ───────────────────────────────────────────────────────────
app.get('/pm/:user1/:user2', (req, res) => {
  const pmLog = read('privates.json');  // [ { from, to, message, ts } … ]
  const { user1, user2 } = req.params;
  const convo = pmLog.filter(m =>
    (m.from === user1 && m.to === user2) ||
    (m.from === user2 && m.to === user1)
  );
  res.json(convo);
});

app.post('/pm', (req, res) => {
  const { from, to, message } = req.body;
  const pmLog = read('privates.json');
  pmLog.push({ from, to, message, ts: Date.now() });
  write('privates.json', pmLog);
  res.send('OK');
});

// ─── USERS (for sidebar) ────────────────────────────────────────────────────────
app.get('/users', (req, res) => {
  const accounts  = read('accounts.json');
  const blacklist = read('blacklist.json');
  const users = Object.keys(accounts).map(username => {
    const info = accounts[username];
    const profilePic = (typeof info === 'object' && info.profilePic)
      ? info.profilePic
      : 'placeholder.png';
    return {
      username,
      profilePic,
      online: onlineUsers.has(username),
      banned: blacklist.includes(username)
    };
  });
  res.json(users);
});

// ─── PUBLIC CHAT & STATS ────────────────────────────────────────────────────────
app.get('/status',        (req, res) => res.json(read('status.json')));
app.get('/log',           (req, res) => res.json(read('log.json')));
app.get('/ranks.json',    (req, res) => res.json(read('ranks.json')));
app.get('/blacklist.json',(req, res) => res.json(read('blacklist.json')));
app.get('/warn/:user?',    (req, res) => {
  const warns = read('warns.json') || {};
  const user = req.params.user || req.query.user;
  if (!user) return res.send('');
  res.send(warns[user] || '');
});
app.get('/stats/messages', (req,res) => {
  const log = read('log.json');
  const counts = {};
  for(let i=9;i>=0;i--){
    const d = new Date();
    d.setDate(d.getDate()-i);
    counts[d.toISOString().slice(0,10)] = 0;
  }
  log.forEach(l => {
    if(!l.startsWith('<<') && l.includes('>>')) {
      const day = new Date().toISOString().slice(0,10);
      if(counts[day]!==undefined) counts[day]++;
    }
  });
  res.json(counts);
});
app.get('/stats/recent',  (req,res) => {
  const log = read('log.json');
  const last = [...log].reverse().find(l=>l.includes('>>'));
  res.send(last||'');
});
app.get('/stats/ping',    (req,res) => {
  const start = Date.now();
  dns.lookup('google.com', err=>{
    res.json({ ping: err?-1:Date.now()-start });
  });
});
app.get('/stats/traffic', (req,res) => {
  res.json({ requestsPerMinute: trafficCount });
});

// Admin-only helper endpoints
app.get('/showbanned', (req, res) => {
  const admin = req.query.admin;
  const admins = read('admins.json');
  if(!admin || !admins.includes(admin)) return res.status(403).send('forbidden');
  res.json(read('blacklist.json'));
});

app.get('/help', (req, res) => {
  const admin = req.query.admin;
  const admins = read('admins.json');
  if(!admin || !admins.includes(admin)) return res.status(403).send('forbidden');

  const help = {
    "GET /pm/:user1/:user2": "Get private messages between user1 and user2",
    "POST /pm": { body: { from: "user1", to: "user2", message: "..." } },
    "GET /users": "List users for sidebar (username, profilePic, online, banned)",
    "GET /status": "Get server status",
    "GET /log": "Get chat log",
    "GET /ranks.json": "Get ranks.json",
    "GET /blacklist.json": "Get blacklist.json",
    "GET /warn/:user": "Get warning text for a user (URL-encode spaces)",
    "POST /login": { body: { username: "user1", password: "..." } },
    "POST /logoff": { body: { username: "user1" } },
    "POST /send": { body: { user: "user1", message: "..." } },
    "GET /stats/messages": "Get message counts for last 10 days",
    "GET /stats/recent": "Get most recent public message line",
    "GET /stats/ping": "Ping google.com and return ms",
    "GET /stats/traffic": "Requests per minute",
    "POST /clear": "Reset chat log",
    "POST /ban": { body: { user: "user1" } },
    "POST /unban": { body: { user: "user1" } },
    "POST /warn": { body: { user: "user1", reason: "No spamming" } },
    "POST /pause": "Pause public chat",
    "POST /unpause": "Unpause public chat",
    "POST /off": "Turn server off",
    "POST /on": "Turn server on",
    "Notes": "Admin endpoints require ?admin=<username> and that username must be in admins.json"
  };

  res.json(help);
});

// ─── AUTH & CHAT ───────────────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const admins   = read('admins.json');
  const status   = read('status.json');

  if(status.off && username!=='GOD HIMSELF') {
    return res.send({ redirect:'off.html' });
  }
  const info = accounts[username];
  const pass = typeof info==='object' ? info.password : info;
  if(!pass || pass!==password) {
    return res.send({ success:false });
  }

  onlineUsers.add(username);

  // log user in
  const lastlogin = read('lastlogin.json');
  const logArr    = read('log.json');
  logArr.push(`<<${username} Logged on!>>`);
  lastlogin[username] = new Date().toLocaleString();
  write('lastlogin.json', lastlogin);
  write('log.json', logArr);

  res.send({ success:true, isAdmin: admins.includes(username) });
});

app.post('/logoff', (req, res) => {
  const { username } = req.body;
  onlineUsers.delete(username);
  const logArr = read('log.json');
  logArr.push(`<<${username} Logged off>>`);
  write('log.json', logArr);
  res.send('OK');
});

app.post('/send', (req, res) => {
  const { user, message } = req.body;
  const status    = read('status.json');
  const blacklist = read('blacklist.json');
  if(status.paused && user!=='GOD HIMSELF') return res.send('paused');
  if(blacklist.includes(user))               return res.send('banned');
  const logArr = read('log.json');
  logArr.push(`${user}>>${message}`);
  write('log.json', logArr);
  res.send('OK');
});

// ─── ADMIN ACTIONS ─────────────────────────────────────────────────────────────
app.post('/clear', (req, res) => {
  write('log.json', ['<<SYSTEM>> Cleared>>']);
  res.send('OK');
});

app.post('/ban', (req, res) => {
  const t = req.body.user;
  if (t && t !== 'GOD HIMSELF') {
    const b = read('blacklist.json') || [];
    if (!b.includes(t)) write('blacklist.json', [...b, t]);
  }
  res.send('OK');
});

app.post('/unban', (req, res) => {
  const u = req.body.user;
  const b = read('blacklist.json') || [];
  write('blacklist.json', b.filter(x => x !== u));
  res.send('OK');
});

app.post('/warn', (req, res) => {
  const { user: U, reason } = req.body || {};
  if (U && U !== 'GOD HIMSELF') {
    const w = read('warns.json') || {};
    w[U] = reason || '';
    write('warns.json', w);
    const l = read('log.json') || [];
    l.push(`<<SYSTEM>> Warned ${U}: ${reason}>>`);
    write('log.json', l);
  }
  res.send('OK');
});

function appendSystemLog(entry) {
  const l = read('log.json') || [];
  l.push(entry);
  write('log.json', l);
}

app.post('/pause', (req, res) => {
  const s = read('status.json') || { paused: false, off: false };
  s.paused = true;
  write('status.json', s);
  appendSystemLog('<<SYSTEM>> Paused>>');
  res.send('OK');
});

app.post('/unpause', (req, res) => {
  const s = read('status.json') || { paused: false, off: false };
  s.paused = false;
  write('status.json', s);
  appendSystemLog('<<SYSTEM>> Unpaused>>');
  res.send('OK');
});

app.post('/off', (req, res) => {
  const s = read('status.json') || { paused: false, off: false };
  s.off = true;
  write('status.json', s);
  appendSystemLog('<<SYSTEM>> OFF>>');
  res.send('OK');
});

app.post('/on', (req, res) => {
  const s = read('status.json') || { paused: false, off: false };
  s.off = false;
  write('status.json', s);
  appendSystemLog('<<SYSTEM>> ON>>');
  res.send('OK');
});

// ─── THREADS & REPLIES ─────────────────────────────────────────────────────────
// threads.json: [ { id, title, creator, ts, messages: [ { id, user, text, ts, parentId } ] } ]

// GET all threads (summary)
app.get('/threads', (req, res) => {
  let threads = [];
  try { threads = read('threads.json') || []; } catch (e) { threads = []; }
  res.json(threads.map(t => ({
    id: t.id || null,
    title: t.title || '',
    creator: t.creator || '',
    ts: t.ts || 0,
    messageCount: Array.isArray(t.messages) ? t.messages.length : 0
  })));
});

// POST new thread
app.post('/threads', (req, res) => {
  const { title, creator, text } = req.body;
  let threads = [];
  try { threads = read('threads.json'); } catch (e) {}
  const id = Date.now().toString();
  const thread = {
    id,
    title,
    creator,
    ts: Date.now(),
    messages: [
      { id: id + '-msg', user: creator, text, ts: Date.now(), parentId: null }
    ]
  };
  threads.push(thread);
  write('threads.json', threads);
  res.json(thread);
});

// GET messages in a thread
app.get('/threads/:id', (req, res) => {
  let threads = [];
  try { threads = read('threads.json'); } catch (e) {}
  const thread = threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).send('Thread not found');
  res.json(thread.messages);
});

// POST reply to a thread (or to a message in a thread)
app.post('/threads/:id/reply', (req, res) => {
  const { user, text, parentId } = req.body;
  let threads = [];
  try { threads = read('threads.json'); } catch (e) {}
  const thread = threads.find(t => t.id === req.params.id);
  if (!thread) return res.status(404).send('Thread not found');
  const msgId = Date.now().toString() + '-' + Math.floor(Math.random()*1000);
  thread.messages.push({ id: msgId, user, text, ts: Date.now(), parentId: parentId || null });
  write('threads.json', threads);
  res.json({ success: true, id: msgId });
});

// Start server
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));