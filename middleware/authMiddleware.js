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
        
        // Check if user is suspended
        if (user.suspended) {
          return res.status(403).json({ 
            success: false, 
            message: 'Account suspended. Please contact administrator.',
            suspended: true
          });
        }
        
        // Check if account is locked due to failed login attempts
        if (user.lockedUntil && user.lockedUntil > Date.now()) {
          return res.status(423).json({ 
            success: false, 
            message: 'Account temporarily locked due to too many failed login attempts.',
            lockedUntil: user.lockedUntil
          });
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

// Middleware to check if user is suspended
exports.checkSuspended = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    // Check if user is suspended
    if (req.user.suspended) {
      return res.status(403).json({ 
        success: false, 
        message: 'Account suspended. Please contact administrator.',
        suspended: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Suspended check error:', error);
    return res.status(500).json({ success: false, message: 'Error checking user status' });
  }
};

// Middleware to check if user is verified (optional - for future use)
exports.checkVerified = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    // Check if user is verified
    if (!req.user.verified && req.user.role !== 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Account not verified. Please verify your email.',
        unverified: true
      });
    }
    
    next();
  } catch (error) {
    console.error('Verification check error:', error);
    return res.status(500).json({ success: false, message: 'Error checking verification status' });
  }
}; 