// models/ChatSession.js

const mongoose = require('mongoose');

const chatSessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      default: 'New Chat',
    },
    message_count: {
      type: Number,
      default: 0,
    },
    last_message_at: {
      type: Date,
      default: Date.now,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
chatSessionSchema.index({ user_id: 1, is_deleted: 1, last_message_at: -1 });

const ChatSession = mongoose.model('ChatSession', chatSessionSchema);

module.exports = ChatSession;