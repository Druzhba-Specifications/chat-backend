// server.js
const express  = require('express');
const fs       = require('fs');
const cors     = require('cors');
const dns      = require('dns');
const path     = require('path');        // ← for static‐serve & catch-all
const app      = express();
const PORT     = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── 1) STATIC FRONT-END ──────────────────────────────────────────────────────
// Place your chat.html, users.html, stats.html, CSS/JS files and assets/
// under a folder named `public/`.  Rename chat.html → public/index.html
app.use(express.static(path.join(__dirname, 'public')));

// ─── HELPER FUNCTIONS ─────────────────────────────────────────────────────────
const read     = file => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const write    = (file, data) => fs.writeFileSync(path.join(__dirname, file), JSON.stringify(data, null, 2));
const sanitize = str => decodeURIComponent(str).trim();

// traffic counter (requests per last minute)
let trafficCount = 0;
setInterval(() => (trafficCount = 0), 60_000);
app.use((req, res, next) => { trafficCount++; next(); });

// ─── GET ROUTES (status, log, ranks, warns, blacklist, stats) ────────────────
// e.g.:
app.get('/status',    (req,res) => res.json(read('status.json')));
app.get('/log',       (req,res) => res.json(read('log.json')));
app.get('/ranks.json',(req,res) => res.json(read('ranks.json')));
app.get('/warns.json',(req,res) => res.json(read('warns.json')));
app.get('/blacklist.json',(req,res)=>res.json(read('blacklist.json')));
app.get('/stats/messages',(req,res)=>{
  const log = read('log.json');
  const counts = {};
  for(let i=9;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    counts[d.toISOString().slice(0,10)] = 0;
  }
  log.forEach(l => {
    if(!l.startsWith('<<') && l.includes('>>')){
      const day = new Date().toISOString().slice(0,10);
      if(counts[day]!==undefined) counts[day]++;
    }
  });
  res.json(counts);
});
app.get('/stats/traffic',(req,res)=>res.json({ requestsPerMinute: trafficCount }));
app.get('/stats/ping',(req,res)=>{
  const start=Date.now();
  dns.lookup('google.com', err=>{
    res.json({ ping: err?-1:Date.now()-start });
  });
});

// ─── LOGIN ───────────────────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const accounts = read('accounts.json');
  const status   = read('status.json');

  if (status.off && username !== 'GOD HIMSELF') {
    return res.json({ redirect:'off.html' });
  }
  if (accounts[username] !== password) {
    return res.json({ success:false });
  }

  // log login event
  const lastlogin = read('lastlogin.json');
  const now       = new Date().toLocaleString();
  const logArr    = read('log.json');
  logArr.push(`<<${username} Logged on! Last logged in: ${lastlogin[username]||'Never'}>>`);

  write('lastlogin.json', { ...lastlogin, [username]: now });
  write('log.json', logArr);

  const isAdmin = read('admins.json').includes(username);
  res.json({ success:true, isAdmin });
});

// ─── LOGOFF ──────────────────────────────────────────────────────────────────
app.post('/logoff', (req, res) => {
  const { username } = req.body;
  const logArr = read('log.json');
  logArr.push(`<<${username} Logged off>>`);
  write('log.json', logArr);
  res.send('OK');
});

// ─── SEND MESSAGE ─────────────────────────────────────────────────────────────
app.post('/send', (req, res) => {
  const { user, message } = req.body;
  const status    = read('status.json');
  const blacklist = read('blacklist.json');

  if (status.paused && user !== 'GOD HIMSELF') {
    return res.send('Chat is paused');
  }
  if (blacklist.includes(user)) {
    return res.send('You are banned');
  }

  const logArr = read('log.json');
  logArr.push(`${user}>>${message}`);
  write('log.json', logArr);
  res.send('Message saved');
});

// ─── ADMIN ACTIONS ────────────────────────────────────────────────────────────
app.post('/ban', (req,res) => {
  const target = sanitize(req.body.user);
  if (target === 'GOD HIMSELF') {
    return res.json({ success:false, message:'Cannot ban GOD HIMSELF' });
  }
  const list = read('blacklist.json');
  if (!list.includes(target)) write('blacklist.json',[...list,target]);
  res.json({ success:true });
});

app.post('/unban', (req,res) => {
  const target = sanitize(req.body.user);
  const list   = read('blacklist.json').filter(u=>u!==target);
  write('blacklist.json', list);
  res.json({ success:true });
});

app.post('/warn', (req,res) => {
  const { user:target, reason } = req.body;
  if (target === 'GOD HIMSELF') {
    return res.json({ success:false, message:'Cannot warn GOD HIMSELF' });
  }
  const warns = read('warns.json');
  warns[target] = reason;
  write('warns.json', warns);

  const logArr = read('log.json');
  logArr.push(`<<SYSTEM>> ${target} was warned: ${reason}`);
  write('log.json', logArr);

  res.json({ success:true });
});

app.post('/off', (req,res) => {
  const status = read('status.json');
  status.off = true;
  write('status.json', status);

  const logArr = read('log.json');
  logArr.push('<<SYSTEM>> Chat turned OFF by admin. Only GOD HIMSELF may return.');
  write('log.json', logArr);

  res.send('OK');
});

app.post('/on', (req,res) => {
  const status = read('status.json');
  status.off = false;
  write('status.json', status);

  const logArr = read('log.json');
  logArr.push('<<SYSTEM>> Chat turned ON by admin.');
  write('log.json', logArr);

  res.send('OK');
});

// ─── PAUSE / UNPAUSE ──────────────────────────────────────────────────────────
app.post('/pause', (req,res) => {
  const st = read('status.json'); st.paused = true; write('status.json', st);
  const logArr = read('log.json'); logArr.push('<<SYSTEM>> Chat paused>>'); write('log.json', logArr);
  res.send('OK');
});
app.post('/unpause',(req,res) => {
  const st = read('status.json'); st.paused = false; write('status.json', st);
  const logArr = read('log.json'); logArr.push('<<SYSTEM>> Chat unpaused>>'); write('log.json', logArr);
  res.send('OK');
});

// ─── CATCH-ALL: SEND INDEX.HTML FOR ANY OTHER PATH ────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
