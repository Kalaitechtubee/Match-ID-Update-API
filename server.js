const express = require('express');
const mysql = require('mysql2/promise'); // Using promise-based mysql2 for better async handling
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// MySQL Connection Pool Setup for Clever Cloud
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  connectionLimit: 10, // Pool size
  connectTimeout: 20000,
  acquireTimeout: 20000,
  timeout: 20000,
};

const dbPool = mysql.createPool(dbConfig);

(async () => {
  try {
    const connection = await dbPool.getConnection();
    console.log('Connected to Clever Cloud MySQL database');

    // Create table if it doesn't exist
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        match_id VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    await connection.query(createTableQuery);
    console.log('Settings table ready');

    // Check and insert default data
    const [rows] = await connection.query('SELECT COUNT(*) AS count FROM settings');
    if (rows[0].count === 0) {
      await connection.query('INSERT INTO settings (match_id) VALUES (?)', ['114996']);
      console.log('Default match_id inserted: 114996');
    }
    connection.release();
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  }
})();

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    const connection = await dbPool.getConnection();
    await connection.query('SELECT 1');
    connection.release();
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
  } catch (err) {
    connection?.release();
    res.status(500).json({ status: 'error', message: 'Database connection failed' });
  }
});

// GET: Fetch the current matchId
app.get('/api/match', async (req, res) => {
  try {
    const [results] = await dbPool.query('SELECT match_id, updated_at FROM settings ORDER BY id DESC LIMIT 1');
    if (results.length === 0) {
      return res.status(404).json({ error: 'No match found' });
    }
    res.json({ matchId: results[0].match_id, updatedAt: results[0].updated_at });
  } catch (err) {
    console.error('Error fetching match:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// PUT: Update the matchId
app.put('/api/match', async (req, res) => {
  const { matchId } = req.body;
  if (!matchId) {
    return res.status(400).json({ error: 'matchId is required' });
  }

  try {
    const [results] = await dbPool.query('SELECT COUNT(*) AS count FROM settings');
    const query = results[0].count === 0
      ? 'INSERT INTO settings (match_id) VALUES (?)'
      : 'UPDATE settings SET match_id = ?, updated_at = NOW() ORDER BY id DESC LIMIT 1';
    
    await dbPool.query(query, [matchId]);
    res.json({ matchId, updatedAt: new Date().toISOString(), action: results[0].count === 0 ? 'inserted' : 'updated' });
  } catch (err) {
    console.error('Error updating match:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Proxy endpoint for Cricbuzz API
app.get('/api/cricbuzz/:matchId', async (req, res) => {
  try {
    const matchId = req.params.matchId;
    if (!matchId) {
      return res.status(400).json({ error: 'Match ID is required' });
    }

    console.log(`Fetching Cricbuzz data for match: ${matchId}`);
    const response = await axios.get(`https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    res.json(response.data);
  } catch (err) {
    console.error('Error fetching Cricbuzz data:', err.message);
    if (err.response) {
      res.status(err.response.status).json({ error: 'Cricbuzz API error', status: err.response.status, message: err.response.data || 'Unknown error' });
    } else if (err.request) {
      res.status(503).json({ error: 'Failed to reach Cricbuzz API', message: 'Network timeout or connection error' });
    } else {
      res.status(500).json({ error: 'Failed to fetch Cricbuzz data', message: err.message });
    }
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});