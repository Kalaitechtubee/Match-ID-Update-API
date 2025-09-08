const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// MySQL Connection Setup
let db;

async function initializeDb() {
  if (db) return db; // Return existing connection
  
  try {
    db = await mysql.createPool({
      host: process.env.DB_HOST || 'b4eol7oiojv8ubxs2umj-mysql.services.clever-cloud.com',
      user: process.env.DB_USER || 'ukwiuke69kspv7kb',
      password: process.env.DB_PASSWORD || 'nJaklmJMuqvCukFHHgUs',
      database: process.env.DB_NAME || 'b4eol7oiojv8ubxs2umj',
      port: process.env.DB_PORT || 3306,
      waitForConnections: true,
      queueLimit: 0,
      ssl: {
        rejectUnauthorized: false
      },
      connectTimeout: 60000,
      connectionLimit: 1
    });

    console.log('Connected to MySQL database');

    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        match_id VARCHAR(255) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `;
    await db.query(createTableQuery);

    const [rows] = await db.query('SELECT COUNT(*) AS count FROM settings');
    if (rows[0].count === 0) {
      await db.query('INSERT INTO settings (match_id) VALUES (?)', ['114996']);
      console.log('Default match_id inserted: 114996');
    }
    
    return db;
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  }
}

// Root route
app.all('/', (req, res) => {
  res.status(200).json({ 
    message: "Cricket Backend API", 
    status: "running",
    endpoints: [
      "GET /api/match",
      "PUT /api/match", 
      "GET /api/cricbuzz/:matchId",
      "GET /health"
    ]
  });
});

// GET: Fetch the current matchId
app.get('/api/match', async (req, res) => {
  try {
    const connection = await initializeDb();
    const query = 'SELECT match_id, updated_at FROM settings LIMIT 1';
    const [results] = await connection.query(query);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'No match found' });
    }
    
    res.json({
      matchId: results[0].match_id,
      updatedAt: results[0].updated_at
    });
  } catch (err) {
    console.error('Error fetching match:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// PUT: Update the matchId
app.put('/api/match', async (req, res) => {
  try {
    const connection = await initializeDb();
    const { matchId } = req.body;
    
    if (!matchId) {
      return res.status(400).json({ error: 'matchId is required' });
    }

    const query = 'UPDATE settings SET match_id = ?, updated_at = NOW() WHERE id = 1';
    const [results] = await connection.query(query, [matchId]);
    
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'No record to update' });
    }
    
    res.json({ matchId, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error('Error updating match:', err);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

// Proxy endpoint for Cricbuzz API
app.get('/api/cricbuzz/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;
    const response = await axios.get(`https://www.cricbuzz.com/api/cricket-match/commentary/${matchId}`);
    res.json(response.data);
  } catch (err) {
    console.error('Error fetching Cricbuzz data:', err.message);
    res.status(500).json({ error: 'Failed to fetch Cricbuzz data', details: err.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: db ? 'connected' : 'not connected'
  });
});

// Use Catalyst's port for serverless
app.listen(process.env.X_ZOHO_CATALYST_LISTEN_PORT || 9000, () => {
  console.log("Cricket Backend Server Started");
});