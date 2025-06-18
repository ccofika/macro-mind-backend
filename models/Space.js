const mongoose = require('mongoose');
const { Schema } = mongoose;

const spaceMemberSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  role: {
    type: String,
    enum: ['owner', 'editor', 'viewer'],
    default: 'viewer'
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const spaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  ownerId: {
    type: String,
    required: true,
    ref: 'User'
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  members: {
    type: [spaceMemberSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: (doc, ret) => {
      delete ret.__v;
      return ret;
    } 
  }
});

// Create compound index for faster queries
spaceSchema.index({ ownerId: 1 });
spaceSchema.index({ 'members.userId': 1 });

// Add owner as a member with owner role automatically
spaceSchema.pre('save', function(next) {
  if (this.isNew) {
    // Check if owner is already in members array
    const ownerExists = this.members.some(member => member.userId === this.ownerId);
    
    if (!ownerExists) {
      this.members.push({
        userId: this.ownerId,
        role: 'owner',
        addedAt: new Date()
      });
    }
  }
  next();
});

const Space = mongoose.model('Space', spaceSchema);

module.exports = Space; 