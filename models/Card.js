const mongoose = require('mongoose');
const { Schema } = mongoose;

const positionSchema = new mongoose.Schema({
  x: {
    type: Number,
    default: 0
  },
  y: {
    type: Number,
    default: 0
  }
}, { _id: false });

const cardSchema = new mongoose.Schema({
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
  type: {
    type: String,
    required: true,
    enum: ['category', 'answer', 'question', 'note']
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    default: null
  },
  position: {
    type: positionSchema,
    default: () => ({ x: 0, y: 0 }),
    required: true
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

// Create compound index for faster queries
cardSchema.index({ userId: 1, spaceId: 1, type: 1 });

const Card = mongoose.model('Card', cardSchema);

module.exports = Card; 