const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { validateMebitDomain } = require('../middleware/authMiddleware');

// Create Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id.toString(), // Convert ObjectId to string for consistency
      email: user.email,
      name: user.name
    },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Login with email and password
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Return user info without password
    const userObject = user.toObject();
    delete userObject.password;
    
    res.json({
      success: true,
      token,
      user: userObject
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Google OAuth login
exports.googleLogin = async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }
    
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    
    // Check if email is from mebit.io domain
    if (!validateMebitDomain(email)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied. Only @mebit.io email addresses are allowed.' 
      });
    }
    
    // Check if user exists
    let user = await User.findOne({ email: email.toLowerCase() });
    
    // If user doesn't exist, create a new one
    if (!user) {
      user = await User.create({
        email,
        name,
        picture,
        googleId: payload.sub,
        role: 'user'
      });
    } else {
      // Update existing user with latest Google info
      user.name = name;
      user.picture = picture;
      user.googleId = payload.sub;
      await user.save();
    }
    
    // Generate JWT token
    const jwtToken = generateToken(user);
    
    // Return user without password
    const userObject = user.toObject();
    delete userObject.password;
    
    res.json({
      success: true,
      token: jwtToken,
      user: userObject
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Register new user (for testing purposes)
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email, password, and name are required' 
      });
    }
    
    // Check if email is from mebit.io domain
    if (!validateMebitDomain(email)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Only @mebit.io email addresses are allowed' 
      });
    }
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }
    
    // Create new user
    const user = await User.create({
      email,
      password,
      name,
      role: 'user'
    });
    
    // Generate JWT token
    const token = generateToken(user);
    
    // Return user without password
    const userObject = user.toObject();
    delete userObject.password;
    
    res.status(201).json({
      success: true,
      token,
      user: userObject
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get current user info
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email }).select('-password');
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}; 