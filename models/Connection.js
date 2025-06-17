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

// Create compound index for faster queries and to ensure uniqueness
connectionSchema.index({ userId: 1, sourceId: 1, targetId: 1 }, { unique: true });

const Connection = mongoose.model('Connection', connectionSchema);

module.exports = Connection; 