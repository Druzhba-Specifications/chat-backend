// server.js
const express  = require('express');
const fs       = require('fs');
const cors     = require('cors');
const dns      = require('dns');
const path     = require('path');
const app      = express();
const PORT     = process.env.PORT || 3000;

// Enable CORS + JSON body parsing
app.use(cors());
app.use(express.json());

// ─── 1) SERVE YOUR FRONT-END SUBMODULE ─────────────────────────────────────────
//   public/ is your front-end repo, containing:
//     public/index.html   ← login page
//     public/chat.html    ← chat UI
//     public/assets/...   ← images, notify.mp3, etc.
app.use(express.static(path.join(__dirname, 'public')));
app.get('/',   (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat',(req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const readFile = file => 
  JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
  
const writeFile = (file, data) =>
  fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
  
const sanitize = str => decodeURIComponent(str).trim();

// traffic counter (requests per minute)
let trafficCount = 0;
setInterval(() => trafficCount = 0, 60_000);
app.use((req, res, next) => { trafficCount++; next(); });

// ─── JSON‐BACKED GET ROUTES ────────────────────────────────────────────────────
app.get('/status',         (req,res) => res.json(readFile('status.json')));
app.get('/log',            (req,res) => res.json(readFile('log.json')));
app.get('/ranks.json',     (req,res) => res.json(readFile('ranks.json')));
app.get('/warns.json',     (req,res) => res.json(readFile('warns.json')));
app.get('/blacklist.json', (req,res) => res.json(readFile('blacklist.json')));
app.get('/lastlogin.json', (req,res) => res.json(readFile('lastlogin.json')));

// ─── STATS / ANALYTICS ───────────────────────────────────────────────────────
app.get('/stats/messages', (req,res) => {
  const log = readFile('log.json');
  const counts = {};
  for (let i = 9; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    counts[d.toISOString().slice(0,10)] = 0;
  }
  log.forEach(l => {
    if (!l.startsWith('<<') && l.includes('>>')) {
      const today = new Date().toISOString().slice(0,10);
      if (counts[today] !== undefined) counts[today]++;
    }
  });
  res.json(counts);
});
app.get('/stats/traffic', (req,res) =>
  res.json({ requestsPerMinute: trafficCount })
);
app.get('/stats/ping', (req,res) => {
  const start = Date.now();
  dns.lookup('google.com', err => {
    res.json({ ping: err ? -1 : Date.now() - start });
  });
});

// ─── AUTH: LOGIN & LOGOFF ────────────────────────────────────────────────────
app.post('/login', (req,res) => {
  const { username, password } = req.body;
  const accounts  = readFile('accounts.json');
  const status    = readFile('status.json');
  const admins    = readFile('admins.json');

  if (status.off && username !== 'GOD HIMSELF') {
    return res.json({ redirect: 'off.html' });
  }
  if (accounts[username] !== password) {
    return res.json({ success: false });
  }

  // record login
  const lastlogin = readFile('lastlogin.json');
  const log       = readFile('log.json');
  const now       = new Date().toLocaleString();
  log.push(`<<${username} Logged on! Last login: ${lastlogin[username] || 'Never'}>>`);

  writeFile('lastlogin.json', { ...lastlogin, [username]: now });
  writeFile('log.json', log);

  res.json({ success: true, isAdmin: admins.includes(username) });
});

app.post('/logoff', (req,res) => {
  const { username } = req.body;
  const log = readFile('log.json');
  log.push(`<<${username} Logged off>>`);
  writeFile('log.json', log);
  res.send('OK');
});

// ─── CHAT: SEND MESSAGE ───────────────────────────────────────────────────────
app.post('/send', (req,res) => {
  const { user, message } = req.body;
  const status    = readFile('status.json');
  const blacklist = readFile('blacklist.json');

  if (status.paused && user !== 'GOD HIMSELF') {
    return res.send('Chat is paused');
  }
  if (blacklist.includes(user)) {
    return res.send('You are banned');
  }

  const log = readFile('log.json');
  log.push(`${user}>>${message}`);
  writeFile('log.json', log);
  res.send('Message saved');
});

// ─── ADMIN ACTIONS ────────────────────────────────────────────────────────────
app.post('/ban', (req,res) => {
  const target = sanitize(req.body.user);
  if (target === 'GOD HIMSELF') {
    return res.json({ success:false, message:'Cannot ban GOD HIMSELF' });
  }
  const list = readFile('blacklist.json');
  if (!list.includes(target)) writeFile('blacklist.json', [...list, target]);
  res.json({ success:true });
});

app.post('/unban', (req,res) => {
  const target = sanitize(req.body.user);
  const list   = readFile('blacklist.json').filter(u => u !== target);
  writeFile('blacklist.json', list);
  res.json({ success:true });
});

app.post('/warn', (req,res) => {
  const { user:target, reason } = req.body;
  if (target === 'GOD HIMSELF') {
    return res.json({ success:false, message:'Cannot warn GOD HIMSELF' });
  }
  const warns = readFile('warns.json');
  warns[target] = reason;
  writeFile('warns.json', warns);

  const log = readFile('log.json');
  log.push(`<<SYSTEM>> ${target} was warned: ${reason}`);
  writeFile('log.json', log);

  res.json({ success:true });
});

app.post('/off', (req,res) => {
  const status = readFile('status.json');
  status.off = true;
  writeFile('status.json', status);

  const log = readFile('log.json');
  log.push('<<SYSTEM>> Chat turned OFF by admin. Only GOD HIMSELF may return.');
  writeFile('log.json', log);

  res.send('OK');
});

app.post('/on', (req,res) => {
  const status = readFile('status.json');
  status.off = false;
  writeFile('status.json', status);

  const log = readFile('log.json');
  log.push('<<SYSTEM>> Chat turned ON by admin.');
  writeFile('log.json', log);

  res.send('OK');
});

app.post('/pause', (req,res) => {
  const st = readFile('status.json'); st.paused = true; writeFile('status.json', st);
  const log = readFile('log.json'); log.push('<<SYSTEM>> Chat paused>>'); writeFile('log.json', log);
  res.send('OK');
});

app.post('/unpause', (req,res) => {
  const st = readFile('status.json'); st.paused = false; writeFile('status.json', st);
  const log = readFile('log.json'); log.push('<<SYSTEM>> Chat unpaused>>'); writeFile('log.json', log);
  res.send('OK');
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
