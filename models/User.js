const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const canvasStateSchema = new mongoose.Schema({
  zoom: {
    type: Number,
    default: 1
  },
  pan: {
    type: Object,
    default: { x: 0, y: 0 }
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password is required only if not using Google auth
    }
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  picture: {
    type: String,
    default: null
  },
  googleId: {
    type: String,
    sparse: true,
    unique: true,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'super_admin'],
    default: 'user'
  },
  canvasState: {
    type: canvasStateSchema,
    default: () => ({
      zoom: 1,
      pan: { x: 0, y: 0 },
      updatedAt: new Date()
    })
  },
  navCategories: [{
    id: { type: String, required: true },
    name: { type: String, required: true },
    icon: { type: String, default: 'folder' },
    isDefault: { type: Boolean, default: false }
  }],
  navLinks: [{
    id: { type: String, required: true },
    categoryId: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    action: { type: String, enum: ['open', 'copy'], default: 'open' },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockedUntil: {
    type: Date,
    default: null
  },
  ipAddress: {
    type: String,
    default: null
  },
  sessionTimeout: {
    type: Number,
    default: 30 // minutes
  }
}, { timestamps: true });

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password') || !this.password) return next();
  
  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(10);
    // Hash the password along with the new salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User; 