const express = require('express');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  fs.readFile('accounts.json', (err, data) => {
    if (err) return res.status(500).send('Error reading accounts');
    const accounts = JSON.parse(data);
    if (accounts[username] === password) {
      res.send({ success: true });
    } else {
      res.send({ success: false });
    }
  });
});

app.get('/log', (req, res) => {
  fs.readFile('log.json', (err, data) => {
    if (err) return res.status(500).send('Error reading log');
    res.json(JSON.parse(data));
  });
});

app.post('/send', (req, res) => {
  const { message } = req.body;
  fs.readFile('log.json', (err, data) => {
    if (err) return res.status(500).send('Error reading log');
    const log = JSON.parse(data);
    log.push(message);
    fs.writeFile('log.json', JSON.stringify(log, null, 2), err => {
      if (err) return res.status(500).send('Error writing log');
      res.send('Message saved');
    });
  });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.get('/', (req, res) => {
  res.send('Welcome to the chat backend!');
});

