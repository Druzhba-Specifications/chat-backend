// server.js
const express   = require('express');
const http      = require('http');
const socketIo  = require('socket.io');
const fs        = require('fs');
const path      = require('path');      // ← Only one declaration!
const cors      = require('cors');
const multer    = require('multer');
const dns       = require('dns');

const upload    = multer({ dest: 'uploads/' });
const app       = express();
const server    = http.createServer(app);
const io        = socketIo(server);
const PORT      = process.env.PORT || 3000;

// Serve your front-end
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// JSON helpers
function read(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
}
function write(file, data) {
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
}

// Track traffic
let trafficCount = 0;
setInterval(() => trafficCount = 0, 60_000);
app.use((req, res, next) => { trafficCount++; next(); });

// WebSocket for typing indicators & online list
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

// ─── AUTH: LOGIN / LOGOFF ─────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const admins   = read('admins.json');
  const status   = read('status.json');

  if (status.off && username !== 'GOD HIMSELF') {
    return res.json({ redirect: 'off.html' });
  }

  const stored = accounts[username];
  const pass   = typeof stored === 'object' ? stored.password : stored;
  if (!pass || pass !== password) {
    return res.json({ success: false });
  }

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

// ─── PUBLIC CHAT ───────────────────────────────────────────────────────────────
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

// ─── EDIT & DELETE ────────────────────────────────────────────────────────────
app.put('/edit/:id', (req, res) => {
  const id = +req.params.id;
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
  const id = +req.params.id;
  const log = read('log.json').filter((_, idx) => idx !== id);
  write('log.json', log);
  res.send('OK');
});

// ─── THREADS, REACTIONS, PINS, SEARCH, RECEIPTS, STATUS, ALERTS, STORIES, STATS ─
app.get('/reactions.json',(req,res)=>res.json(read('reactions.json')));
app.post('/react',(req,res)=>{ /* ... */ });
app.get('/pins.json', (req,res)=>res.json(read('pins.json')));
app.post('/pin',       (req,res)=>{ /* ... */ });
app.get('/search',      (req,res)=>{ /* ... */ });
app.get('/receipts.json',(req,res)=>res.json(read('receipts.json')));
app.post('/read',       (req,res)=>{ /* ... */ });
app.get('/userstatus.json',(req,res)=>res.json(read('userstatus.json')));
app.post('/setstatus',  (req,res)=>{ /* ... */ });
app.get('/alerts.json', (req,res)=>res.json(read('alerts.json')));
app.post('/setalerts',  (req,res)=>{ /* ... */ });
app.get('/stories.json',(req,res)=>{ /* ... */ });
app.post('/story',upload.single('file'), (req,res)=>{ /* ... */ });
app.get('/stats/messages',(req,res)=>{ /* ... */ });
app.get('/stats/traffic',(req,res)=>res.json({ requestsPerMinute: trafficCount }));
app.get('/stats/ping',   (req,res)=>{ /* ... */ });
app.get('/stats/recent', (req,res)=>{ /* ... */ });

// ─── PRIVATE MESSAGES ─────────────────────────────────────────────────────────
app.get('/pm/:u1/:u2',  (req,res)=>{ /* ... */ });
app.post('/pm',         (req,res)=>{ /* ... */ });

// ─── ADMIN ACTIONS ─────────────────────────────────────────────────────────────
app.post('/clear',   (req,res)=>{ /* ... */ });
app.post('/ban',     (req,res)=>{ /* ... */ });
app.post('/unban',   (req,res)=>{ /* ... */ });
app.post('/warn',    (req,res)=>{ /* ... */ });
app.post('/pause',   (req,res)=>{ /* ... */ });
app.post('/unpause', (req,res)=>{ /* ... */ });
app.post('/off',     (req,res)=>{ /* ... */ });
app.post('/on',      (req,res)=>{ /* ... */ });

// Start HTTP + WS server
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
