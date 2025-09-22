// server.js
const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const fs        = require('fs');
const path      = require('path');
const cors      = require('cors');
const multer    = require('multer');
const dns       = require('dns');

const upload    = multer({ dest: 'uploads/' });
const app       = express();
const server    = http.createServer(app);
const io        = socketIo(server);
const PORT      = process.env.PORT || 3000;

// helpers to read/write JSON
function read(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  } catch {
    return Array.isArray(read(file)) ? [] : {};
  }
}
function write(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
}

// cors + JSON + static assets
app.use(cors());
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// 2) Make GET / return your chat page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
// track traffic
let trafficCount = 0;
setInterval(() => (trafficCount = 0), 60_000);
app.use((req, res, next) => { trafficCount++; next(); });

// WebSocket: typing & online list
const onlineUsers = new Set();
io.on('connection', socket => {
  const user = socket.handshake.query.user;
  if (user) {
    onlineUsers.add(user);
    io.emit('online', [...onlineUsers]);
  }
  socket.on('typing', data => socket.broadcast.emit('typing', data));
  socket.on('disconnect', () => {
    if (user) {
      onlineUsers.delete(user);
      io.emit('online', [...onlineUsers]);
    }
  });
});


// ─── AUTH & LOGIN/LOGOFF ───────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const admins   = read('admins.json');
  const status   = read('status.json');

  // off‐mode redirect
  if (status.off && username !== 'GOD HIMSELF') {
    return res.json({ redirect: 'off.html' });
  }

  // check creds
  const stored = accounts[username];
  const pass   = typeof stored === 'object' ? stored.password : stored;
  if (!pass || pass !== password) {
    return res.json({ success: false });
  }

  // log user on
  onlineUsers.add(username);
  const logArr    = read('log.json');
  const lastlogin = read('lastlogin.json');
  logArr.push(`<<${username} Logged on!>>`);
  lastlogin[username] = new Date().toLocaleString();
  write('log.json', logArr);
  write('lastlogin.json', lastlogin);

  res.json({ success: true, isAdmin: admins.includes(username) });
});

app.post('/logoff', (req, res) => {
  const { username } = req.body;
  onlineUsers.delete(username);

  const logArr = read('log.json');
  logArr.push(`<<${username} Logged off>>`);
  write('log.json', logArr);

  res.send('OK');
});


// ─── PUBLIC CHAT ────────────────────────────────────────────────────────────────
app.get('/log',        (req, res) => res.json(read('log.json')));
app.post('/send',      (req, res) => {
  const { user, message, parentId } = req.body;
  const status    = read('status.json');
  const blacklist = read('blacklist.json');

  if (status.paused && user !== 'GOD HIMSELF') return res.send('paused');
  if (blacklist.includes(user))               return res.send('banned');

  const logArr = read('log.json');
  logArr.push(parentId
    ? `${user}>>${message}>>${parentId}`
    : `${user}>>${message}`);
  write('log.json', logArr);

  res.send('OK');
});

// Edit & Delete
app.put('/edit/:id',   (req, res) => {
  const id = parseInt(req.params.id, 10);
  const log = read('log.json').map((line, idx) => {
    if (idx === id) {
      const [u, ...rest] = line.split('>>');
      if (u.trim() === req.body.user) {
        return `${u}>>${req.body.message}`;
      }
    }
    return line;
  });
  write('log.json', log);
  res.send('OK');
});
app.delete('/delete/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const log = read('log.json').filter((_, idx) => idx !== id);
  write('log.json', log);
  res.send('OK');
});


// ─── THREADS (parentId) ─────────────────────────────────────────────────────────
// We encode parentId at end of line as ">>parentId".
// Client will parse it to nest replies.


// ─── REACTIONS ─────────────────────────────────────────────────────────────────
app.get('/reactions.json', (req, res) => res.json(read('reactions.json')));
app.post('/react', (req, res) => {
  const { msgIndex, emoji, user } = req.body;
  const R = read('reactions.json');
  R[msgIndex] = R[msgIndex] || {};
  R[msgIndex][emoji] = R[msgIndex][emoji] || [];
  if (!R[msgIndex][emoji].includes(user)) {
    R[msgIndex][emoji].push(user);
  }
  write('reactions.json', R);
  res.send('OK');
});


// ─── PINNED MESSAGES ────────────────────────────────────────────────────────────
app.get('/pins.json', (req, res) => res.json(read('pins.json')));
app.post('/pin',     (req, res) => {
  const { msgIndex } = req.body;
  const P = read('pins.json');
  if (!P.includes(msgIndex)) P.push(msgIndex);
  write('pins.json', P);
  res.send('OK');
});


// ─── SEARCH ─────────────────────────────────────────────────────────────────────
app.get('/search', (req, res) => {
  const term = req.query.term || '';
  const log  = read('log.json');
  const results = log
    .map((line, idx) => ({ line, idx }))
    .filter(item => item.line.includes(term));
  res.json(results);
});


// ─── READ RECEIPTS ──────────────────────────────────────────────────────────────
app.get('/receipts.json', (req, res) => res.json(read('receipts.json')));
app.post('/read', (req, res) => {
  const { msgIndex, user } = req.body;
  const R = read('receipts.json');
  R[msgIndex] = R[msgIndex] || [];
  if (!R[msgIndex].includes(user)) R[msgIndex].push(user);
  write('receipts.json', R);
  res.send('OK');
});


// ─── CUSTOM STATUS & LAST ACTIVE ────────────────────────────────────────────────
app.get('/userstatus.json', (req, res) => res.json(read('userstatus.json')));
app.post('/setstatus', (req, res) => {
  const { user, code, text } = req.body;
  const S = read('userstatus.json');
  S[user] = { code, text };
  write('userstatus.json', S);
  res.send('OK');
});


// ─── KEYWORD ALERTS ─────────────────────────────────────────────────────────────
app.get('/alerts.json', (req, res) => res.json(read('alerts.json')));
app.post('/setalerts', (req, res) => {
  const { user, keywords } = req.body;
  const A = read('alerts.json');
  A[user] = keywords;
  write('alerts.json', A);
  res.send('OK');
});


// ─── EPHEMERAL STORIES ──────────────────────────────────────────────────────────
app.get('/stories.json', (req, res) => {
  const all = read('stories.json');
  const cutoff = Date.now() - 24*60*60*1000;
  res.json(all.filter(s => s.ts > cutoff));
});
app.post('/story', upload.single('file'), (req, res) => {
  const S = read('stories.json');
  S.push({
    user: req.body.user,
    url: `/uploads/${req.file.filename}`,
    ts:  Date.now()
  });
  write('stories.json', S);
  res.send('OK');
});


// ─── ANALYTICS / STATS ─────────────────────────────────────────────────────────
app.get('/stats/messages', (req, res) => {
  const log = read('log.json');
  const counts = {};
  for (let i=9; i>=0; i--) {
    const d = new Date();
    d.setDate(d.getDate()-i);
    counts[d.toISOString().slice(0,10)] = 0;
  }
  log.forEach(l => {
    if (l.includes('>>') && !l.startsWith('<<')) {
      const day = new Date().toISOString().slice(0,10);
      if (counts[day] !== undefined) counts[day]++;
    }
  });
  res.json(counts);
});
app.get('/stats/traffic',    (req,res) => res.json({ requestsPerMinute: trafficCount }));
app.get('/stats/ping',       (req,res) => {
  const start = Date.now();
  dns.lookup('google.com', err => {
    res.json({ ping: err ? -1 : Date.now() - start });
  });
});
app.get('/stats/recent',     (req,res) => {
  const log  = read('log.json');
  const last = [...log].reverse().find(l => l.includes('>>'));
  res.send(last || '');
});


// ─── USERS LIST (with last‐active & profilePic) ────────────────────────────────
app.get('/users', (req, res) => {
  const accts   = read('accounts.json');
  const black   = new Set(read('blacklist.json'));
  const lastlog = read('lastlogin.json');
  const out = Object.entries(accts).map(([u,info]) => ({
    username:   u,
    profilePic: typeof info==='object' && info.profilePic
                 ? info.profilePic
                 : 'placeholder.png',
    online:     onlineUsers.has(u),
    banned:     black.has(u),
    lastActive: lastlog[u] || ''
  }));
  res.json(out);
});


// Start HTTP + WS server
server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
