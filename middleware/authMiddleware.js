const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to verify JWT token
exports.authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN format
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
      }
      
      // Verify user exists in database
      try {
        const user = await User.findOne({ email: decoded.email }).select('-password');
        
        if (!user) {
          return res.status(403).json({ success: false, message: 'User not found' });
        }
        
        req.user = user; // Add full user object to request
        next();
      } catch (error) {
        console.error('Error verifying user:', error);
        return res.status(500).json({ success: false, message: 'Error verifying user' });
      }
    });
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

// Check if user email belongs to mebit.io domain
exports.validateMebitDomain = (email) => {
  if (!email) return false;
  return email.endsWith('@mebit.io');
}; 