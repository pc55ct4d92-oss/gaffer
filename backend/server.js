require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/seasons', require('./routes/seasons'));
app.use('/api/players', require('./routes/players'));
app.use('/api/games', require('./routes/games'));
app.use('/api/blocks', require('./routes/blocks'));
app.use('/api/blockplayers', require('./routes/blockPlayers'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', app: 'gaffer' });
});

app.listen(PORT, () => {
  console.log(`Gaffer backend running on port ${PORT}`);
});
