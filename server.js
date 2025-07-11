const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const cardRoutes = require('./routes/cardRoutes');
const aiRoutes = require('./routes/aiRoutes');
const aiChatRoutes = require('./routes/aiChatRoutes');
const authRoutes = require('./routes/authRoutes');
const spaceRoutes = require('./routes/spaceRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { authenticateToken } = require('./middleware/authMiddleware');
const fs = require('fs');
const connectDB = require('./utils/dbConnect');
const WebSocketServer = require('./websocket/websocketServer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server
const server = http.createServer(app);

// Ensure JWT secret is set
if (!process.env.JWT_SECRET) {
  // For development, set a random JWT secret if not provided
  if (process.env.NODE_ENV !== 'production') {
    process.env.JWT_SECRET = require('crypto').randomBytes(64).toString('hex');
    console.warn('JWT_SECRET not found in environment. Using a random secret for development.');
  } else {
    console.error('JWT_SECRET must be set in production environment!');
    process.exit(1);
  }
}

// Connect to MongoDB
connectDB();

// Initialize WebSocket server
const wss = new WebSocketServer(server);

// Ensure data directory exists for files that still need it (like agent-guidelines.txt)
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Created data directory:', dataDir);
}

// Middleware
  const corsOptions = {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://macro-mind-frontend.vercel.app'] // Your actual Vercel frontend URL
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' })); // Increased limit for JSON payload

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Public routes
app.use('/api/auth', authRoutes);

// Admin routes (some public, some protected)
app.use('/api/admin', adminRoutes);

// Protected API routes
app.use('/api/cards', authenticateToken, cardRoutes);
app.use('/api/ai', authenticateToken, aiRoutes);
app.use('/api/ai-chat', authenticateToken, aiChatRoutes);
app.use('/api/spaces', authenticateToken, spaceRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/invitations', authenticateToken, require('./routes/invitationRoutes'));

// Check for unknown routes
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
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket server initialized`);
  console.log(`Data directory: ${dataDir}`);
  console.log(`MongoDB: ${process.env.MONGODB_URI ? 'Configured' : 'Not configured'}`);
  console.log(`OpenAI API: ${process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured'}`);
  console.log(`JWT Authentication: ${process.env.JWT_SECRET ? 'Configured' : 'Not configured'}`);
  console.log(`Google OAuth: ${process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured'}`);
});

module.exports = app;