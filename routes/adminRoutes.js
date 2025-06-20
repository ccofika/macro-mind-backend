const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { adminAuth, auditLog, adminRateLimit, checkSessionTimeout } = require('../middleware/adminMiddleware');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// ===============================
// PUBLIC ADMIN ENDPOINTS (No Auth Required)
// ===============================

// Generate admin credentials (one-time use)
router.post('/generate-credentials', async (req, res) => {
  try {
    // Check if super admin already exists
    const existingAdmin = await User.findOne({ role: 'super_admin' });
    if (existingAdmin) {
      return res.status(409).json({ 
        success: false, 
        message: 'Super admin already exists' 
      });
    }

    // Generate random credentials
    const username = generateRandomString(16);
    const password = generateComplexPassword(24);
    const email = `admin_${username}@mebit.io`;

    // Create admin user
    const adminUser = await User.create({
      email,
      password,
      name: 'Super Admin',
      role: 'super_admin',
      sessionTimeout: 24 * 60 // 24 hours in minutes
    });

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: adminUser._id.toString(),
        email: adminUser.email,
        name: adminUser.name,
        role: adminUser.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Admin credentials generated successfully',
      credentials: {
        username: email,
        password,
        accessUrl: '/admin/dashboard',
        token,
        expiresIn: '24 hours'
      }
    });
  } catch (error) {
    console.error('Generate admin credentials error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin login (separate from regular user login)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user || user.role !== 'super_admin') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    // Check if account is locked
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      return res.status(423).json({ 
        success: false, 
        message: 'Account is locked due to multiple failed attempts' 
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      // Increment login attempts
      user.loginAttempts += 1;
      
      // Lock account after 5 failed attempts
      if (user.loginAttempts >= 5) {
        user.lockedUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      }
      
      await user.save();

      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    // Successful login - reset attempts and update login info
    user.loginAttempts = 0;
    user.lockedUntil = null;
    user.lastLogin = new Date();
    user.ipAddress = req.ip;
    await user.save();

    // Generate JWT token
    const token = jwt.sign(
      { 
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      admin: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Admin token verification
router.get('/auth/verify', adminAuth, async (req, res) => {
  try {
    // If we get here, token is valid (adminAuth middleware verified it)
    res.json({
      success: true,
      admin: {
        id: req.admin.id,
        email: req.admin.email,
        name: req.admin.name,
        role: req.admin.role
      }
    });
  } catch (error) {
    console.error('Admin token verification error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ===============================
// PROTECTED ADMIN ENDPOINTS (Auth Required)
// ===============================

// Apply admin authentication to all protected routes
router.use(adminAuth);
router.use(checkSessionTimeout);
router.use(adminRateLimit(200, 60000)); // 200 requests per minute

// ===============================
// PAGE 1: OVERVIEW DASHBOARD
// ===============================
router.get('/dashboard/overview', 
  auditLog('view_dashboard'), 
  adminController.getDashboardOverview
);

// ===============================
// PAGE 2: USERS & CARDS ANALYTICS
// ===============================
router.get('/analytics/users-cards', 
  auditLog('view_user_data'), 
  adminController.getUsersAndCardsAnalytics
);

router.get('/analytics/users-cards/trends', 
  auditLog('view_user_data'), 
  adminController.getUsersCardsTrends
);

// ===============================
// PAGE 3: AI ANALYTICS
// ===============================
router.get('/analytics/ai', 
  auditLog('view_ai_chats'), 
  adminController.getAIAnalytics
);

// ===============================
// PAGE 4: USER MANAGEMENT
// ===============================
router.get('/users', 
  auditLog('view_user_data'), 
  adminController.getAllUsers
);

router.put('/users/:id', 
  auditLog('edit_user_data', 'user'), 
  adminController.updateUser
);

router.post('/users/:id/toggle-status', 
  auditLog('suspend_user', 'user'), 
  adminController.toggleUserStatus
);

router.delete('/users/:id', 
  auditLog('delete_user', 'user'), 
  adminController.deleteUser
);

router.get('/users/:id/export', 
  auditLog('export_data', 'user'), 
  adminController.exportUserData
);

// ===============================
// EXPORT ROUTES
// ===============================
router.get('/export/users-cards', 
  auditLog('export_data', 'users_cards'), 
  adminController.exportUsersCardsData
);

// ===============================
// PAGE 5: AI MANAGEMENT
// ===============================
router.get('/ai/conversations', 
  auditLog('view_ai_chats'), 
  adminController.getAllAIChats
);

router.get('/ai/conversations/:id', 
  auditLog('view_ai_chats', 'ai_chat'), 
  adminController.getConversationDetails
);

router.delete('/ai/conversations/:id', 
  auditLog('delete_ai_chat', 'ai_chat'), 
  adminController.deleteAIConversation
);

// ===============================
// PAGE 6: DATABASE MANAGEMENT
// ===============================
router.get('/database/overview', 
  auditLog('view_database'), 
  adminController.getDatabaseOverview
);

router.get('/database/:collection', 
  auditLog('database_query', 'database'), 
  adminController.getCollectionData
);

router.post('/database/query', 
  auditLog('database_query', 'database'), 
  adminController.executeQuery
);

// ===============================
// AUDIT LOGS
// ===============================
router.get('/audit/logs', 
  auditLog('view_audit_logs'), 
  adminController.getAuditLogs
);



// Helper functions
function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateComplexPassword(length) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  const allChars = lowercase + uppercase + numbers + symbols;
  
  let password = '';
  
  // Ensure at least one character from each category
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

module.exports = router; 