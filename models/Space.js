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
      console.log(`Adding owner ${this.ownerId} to members of space ${this.name}`);
      this.members.push({
        userId: this.ownerId,
        role: 'owner',
        addedAt: new Date()
      });
    }
  }
  next();
});

// Instance methods for Space
spaceSchema.methods.hasAccess = function(userId) {
  const userIdStr = userId.toString();
  
  // Public spaces are accessible to everyone
  if (this.isPublic) {
    return true;
  }
  
  // Owner has access
  if (this.ownerId === userIdStr) {
    return true;
  }
  
  // Check if user is a member
  return this.members.some(member => member.userId === userIdStr);
};

spaceSchema.methods.isOwner = function(userId) {
  const userIdStr = userId.toString();
  return this.ownerId === userIdStr;
};

spaceSchema.methods.getUserRole = function(userId) {
  const userIdStr = userId.toString();
  
  // Check if user is owner
  if (this.ownerId === userIdStr) {
    return 'owner';
  }
  
  // Find user in members array
  const member = this.members.find(member => member.userId === userIdStr);
  return member ? member.role : null;
};

spaceSchema.methods.addMember = function(userId, role = 'viewer') {
  const userIdStr = userId.toString();
  
  // Check if user is already a member
  const existingMemberIndex = this.members.findIndex(member => member.userId === userIdStr);
  
  if (existingMemberIndex !== -1) {
    // Update existing member's role
    this.members[existingMemberIndex].role = role;
  } else {
    // Add new member
    this.members.push({
      userId: userIdStr,
      role: role,
      addedAt: new Date()
    });
  }
};

spaceSchema.methods.removeMember = function(userId) {
  const userIdStr = userId.toString();
  
  // Cannot remove owner
  if (this.ownerId === userIdStr) {
    throw new Error('Cannot remove the owner of the space');
  }
  
  // Remove member from array
  this.members = this.members.filter(member => member.userId !== userIdStr);
};

spaceSchema.methods.canUserEdit = function(userId) {
  const userIdStr = userId.toString();
  const role = this.getUserRole(userIdStr);
  return role === 'owner' || role === 'editor';
};

spaceSchema.methods.canUserView = function(userId) {
  return this.hasAccess(userId);
};

const Space = mongoose.model('Space', spaceSchema);

module.exports = Space; 