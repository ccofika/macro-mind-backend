const mongoose = require('mongoose');
const { Schema } = mongoose;

const invitationSchema = new mongoose.Schema({
  spaceId: {
    type: String,
    required: true,
    ref: 'Space'
  },
  inviterUserId: {
    type: String,
    required: true,
    ref: 'User'
  },
  inviteeEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  inviteeUserId: {
    type: String,
    ref: 'User'
  },
  role: {
    type: String,
    enum: ['editor', 'viewer'],
    default: 'viewer'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending'
  },
  message: {
    type: String,
    trim: true,
    maxlength: 500
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
  },
  respondedAt: {
    type: Date
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

// Create compound indexes for performance
invitationSchema.index({ spaceId: 1, status: 1 });
invitationSchema.index({ inviteeEmail: 1, status: 1 });
invitationSchema.index({ inviterUserId: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index to auto-delete expired invitations

// Ensure unique pending invitations per space/email combination
invitationSchema.index(
  { spaceId: 1, inviteeEmail: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: 'pending' },
    name: 'unique_pending_invitation'
  }
);

// Virtual for checking if invitation is expired
invitationSchema.virtual('isExpired').get(function() {
  return this.status === 'pending' && new Date() > this.expiresAt;
});

// Virtual for populated space
invitationSchema.virtual('space', {
  ref: 'Space',
  localField: 'spaceId',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated inviter
invitationSchema.virtual('inviter', {
  ref: 'User',
  localField: 'inviterUserId',
  foreignField: '_id',
  justOne: true
});

// Virtual for populated invitee
invitationSchema.virtual('invitee', {
  ref: 'User',
  localField: 'inviteeUserId',
  foreignField: '_id',
  justOne: true
});

// Pre-save middleware to update respondedAt when status changes
invitationSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status !== 'pending' && !this.respondedAt) {
    this.respondedAt = new Date();
  }
  next();
});

// Instance methods
invitationSchema.methods.accept = function() {
  this.status = 'accepted';
  this.respondedAt = new Date();
  return this.save();
};

invitationSchema.methods.reject = function() {
  this.status = 'rejected';
  this.respondedAt = new Date();
  return this.save();
};

invitationSchema.methods.isValid = function() {
  return this.status === 'pending' && new Date() <= this.expiresAt;
};

// Static methods
invitationSchema.statics.findPendingByEmail = function(email) {
  return this.find({
    inviteeEmail: email.toLowerCase(),
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).populate('space inviter');
};

invitationSchema.statics.findBySpaceAndEmail = function(spaceId, email) {
  return this.findOne({
    spaceId: spaceId,
    inviteeEmail: email.toLowerCase(),
    status: 'pending'
  });
};

const Invitation = mongoose.model('Invitation', invitationSchema);

module.exports = Invitation; 