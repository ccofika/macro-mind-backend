const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminAuditLog = require('../models/AdminAuditLog');

// Admin authentication middleware
const adminAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid token. User not found.' });
    }

    if (user.role !== 'super_admin') {
      await logAdminAction(user._id, user.email, 'unauthorized_access_attempt', null, null, null, null, req.ip, req.get('User-Agent'), false, 'Insufficient privileges');
      return res.status(403).json({ success: false, message: 'Access denied. Admin privileges required.' });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return res.status(423).json({ success: false, message: 'Account is locked. Please try again later.' });
    }

    // Update last login and IP
    user.lastLogin = new Date();
    user.ipAddress = req.ip;
    user.loginAttempts = 0;
    user.lockedUntil = null;
    await user.save();

    req.admin = user;
    next();
  } catch (error) {
    console.error('Admin auth error:', error);
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// Admin audit logging middleware
const auditLog = (action, targetType = null) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    let responseData = null;

    // Capture response data
    res.send = function(data) {
      responseData = typeof data === 'string' ? JSON.parse(data) : data;
      originalSend.call(this, data);
    };

    // Store original request data for comparison
    req.originalBody = { ...req.body };
    req.originalParams = { ...req.params };
    req.originalQuery = { ...req.query };

    // Continue to next middleware
    next();

    // Log after response is sent
    res.on('finish', async () => {
      try {
        const success = res.statusCode >= 200 && res.statusCode < 400;
        
        await logAdminAction(
          req.admin?._id,
          req.admin?.email,
          action,
          targetType,
          req.params?.id || req.body?.id || req.query?.id,
          req.originalBody,
          responseData?.data || responseData,
          req.ip,
          req.get('User-Agent'),
          success,
          success ? null : responseData?.message || 'Operation failed'
        );
      } catch (error) {
        console.error('Audit log error:', error);
      }
    });
  };
};

// Helper function to log admin actions
const logAdminAction = async (adminUserId, adminEmail, action, targetType, targetId, oldValue, newValue, ipAddress, userAgent, success = true, errorMessage = null) => {
  try {
    const logEntry = new AdminAuditLog({
      adminUserId: adminUserId?.toString(),
      adminEmail,
      action,
      targetType,
      targetId: targetId?.toString(),
      targetDetails: targetType && targetId ? { type: targetType, id: targetId } : null,
      oldValue,
      newValue,
      ipAddress,
      userAgent,
      sessionId: generateSessionId(),
      success,
      errorMessage,
      metadata: {
        timestamp: new Date(),
        serverTime: new Date().toLocaleString()
      }
    });

    await logEntry.save();
  } catch (error) {
    console.error('Failed to log admin action:', error);
  }
};

// Generate unique session ID
const generateSessionId = () => {
  return `admin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Rate limiting middleware for admin actions
const adminRateLimit = (maxRequests = 100, windowMs = 60000) => {
  const requests = new Map();

  return (req, res, next) => {
    const key = `${req.admin._id}_${req.ip}`;
    const now = Date.now();
    const requestsInWindow = requests.get(key) || [];

    // Remove old requests outside the window
    const validRequests = requestsInWindow.filter(time => now - time < windowMs);

    if (validRequests.length >= maxRequests) {
      return res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down.'
      });
    }

    validRequests.push(now);
    requests.set(key, validRequests);

    next();
  };
};

// Session timeout check
const checkSessionTimeout = async (req, res, next) => {
  try {
    const admin = req.admin;
    const sessionTimeout = admin.sessionTimeout || 30; // minutes
    const lastActivity = admin.lastLogin || admin.updatedAt;
    const now = new Date();
    const timeDiff = (now - lastActivity) / (1000 * 60); // minutes

    if (timeDiff > sessionTimeout) {
      await logAdminAction(admin._id, admin.email, 'session_timeout', null, null, null, null, req.ip, req.get('User-Agent'), false, 'Session expired due to inactivity');
      return res.status(401).json({
        success: false,
        message: 'Session expired due to inactivity. Please login again.'
      });
    }

    // Update last activity
    admin.lastLogin = now;
    await admin.save();

    next();
  } catch (error) {
    console.error('Session timeout check error:', error);
    next();
  }
};

module.exports = {
  adminAuth,
  auditLog,
  logAdminAction,
  adminRateLimit,
  checkSessionTimeout
}; 