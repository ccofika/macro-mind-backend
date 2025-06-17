const express = require('express');
const cors = require('cors');
const path = require('path');
const cardRoutes = require('./routes/cardRoutes');
const aiRoutes = require('./routes/aiRoutes'); // Obavezno dodati ovu liniju
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Osigurajmo da direktorijum za podatke postoji
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory:', dataDir);
}

// Middleware
app.use(cors({
  origin: [
    'https://macro-mind-frontend.vercel.app/',  // Vercel URL
    'http://localhost:3000'                // Lokalno razvijanje
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));
app.use(express.json({ limit: '1mb' })); // Povećavamo limit za JSON payload

// Logiranje svih zahtjeva
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// API Routes - Obavezno pravilno konfigurisati
app.use('/api/cards', cardRoutes);
app.use('/api/ai', aiRoutes); // Ovo mora biti tačno kako je konfigurisano u client/src/services/aiService.js

// Proveri da li je ruta poznata
app.use((req, res, next) => {
  console.log(`Unknown route: ${req.method} ${req.url}`);
  next();
});

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'MacroMind API Server' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).json({ success: false, message: err.message || 'Server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`OpenAI API: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
});

module.exports = app;