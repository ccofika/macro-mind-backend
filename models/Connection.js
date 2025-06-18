const mongoose = require('mongoose');

const connectionSchema = new mongoose.Schema({
  _id: {
    type: String,
    default: () => new mongoose.Types.ObjectId().toString()
  },
  userId: {
    type: String,
    required: true,
    index: true
  },
  spaceId: {
    type: String,
    required: true,
    default: 'public',
    index: true
  },
  sourceId: {
    type: String,
    required: true
  },
  targetId: {
    type: String,
    required: true
  },
  label: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { 
  timestamps: true,
  _id: false, // Allow custom _id
  toJSON: { 
    virtuals: true,
    transform: (doc, ret) => {
      // Convert _id to id for client compatibility
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      return ret;
    } 
  }
});

// Create indexes for faster queries (removed unique constraint to allow bidirectional connections)
connectionSchema.index({ userId: 1, spaceId: 1 });
connectionSchema.index({ sourceId: 1, targetId: 1 });
connectionSchema.index({ spaceId: 1, sourceId: 1 });
connectionSchema.index({ spaceId: 1, targetId: 1 });

// Pre-save validation to prevent duplicate connections
connectionSchema.pre('save', async function(next) {
  // Check if a connection already exists in either direction
  const existingConnection = await this.constructor.findOne({
    spaceId: this.spaceId,
    $or: [
      { sourceId: this.sourceId, targetId: this.targetId },
      { sourceId: this.targetId, targetId: this.sourceId }
    ]
  });
  
  if (existingConnection) {
    const error = new Error('Connection already exists between these cards');
    error.code = 'DUPLICATE_CONNECTION';
    return next(error);
  }
  
  next();
});

const Connection = mongoose.model('Connection', connectionSchema);

module.exports = Connection; 