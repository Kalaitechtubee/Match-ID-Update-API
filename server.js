const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Debug: Log environment variables
console.log('Environment Variables:', {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.PORT
});

// MySQL Connection Setup
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// Connect to MySQL
db.connect((err) => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database');

  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      match_id VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;
  db.query(createTableQuery, (err) => {
    if (err) {
      console.error('Error creating table:', err);
      return;
    }
    db.query('SELECT COUNT(*) AS count FROM settings', (err, results) => {
      if (err) {
        console.error('Error checking table:', err);
        return;
      }
      if (results[0].count === 0) {
        db.query('INSERT INTO settings (match_id) VALUES (?)', ['114996'], (err) => {
          if (err) console.error('Error inserting default row:', err);
          else console.log('Default match_id inserted: 114996');
        });
      }
    });
  });
});

// GET: Fetch the current matchId
app.get('/api/match', (req, res) => {
  const query = 'SELECT match_id, updated_at FROM settings LIMIT 1';
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error fetching match:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'No match found' });
    }
    res.json({
      matchId: results[0].match_id,
      updatedAt: results[0].updated_at
    });
  });
});

// PUT: Update the matchId
app.put('/api/match', (req, res) => {
  const { matchId } = req.body;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId is required' });
  }

  const query = 'UPDATE settings SET match_id = ?, updated_at = NOW() WHERE id = 1';
  db.query(query, [matchId], (err, results) => {
    if (err) {
      console.error('Error updating match:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'No record to update' });
    }
    res.json({ matchId, updatedAt: new Date().toISOString() });
  });
});

// Proxy endpoint for Cricbuzz API
app.get('/api/cricbuzz/:matchId', async (req, res) => {
  try {
    const matchId = req.params.matchId;
    const response = await axios.get(`https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`, {
      // Add headers if required by Cricbuzz API (e.g., API key)
      // headers: { 'Authorization': 'Bearer your-api-key' }
    });
    res.json(response.data);
  } catch (err) {
    console.error('Error fetching Cricbuzz data:', err);
    res.status(500).json({ error: 'Failed to fetch Cricbuzz data' });
  }
});

const PORT = process.env.PORT || 3306;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});