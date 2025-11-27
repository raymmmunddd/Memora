// models/QuizProgress.js

const mongoose = require('mongoose');

const quizProgressSchema = new mongoose.Schema(
  {
    quiz_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quiz',
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    current_question_index: {
      type: Number,
      default: 0,
    },
    answers: {
      type: Map,
      of: String,
      default: {},
    },
    start_time: {
      type: Date,
      required: true,
    },
    time_remaining: {
      type: Number,
      default: null,
    },
    is_completed: {
      type: Boolean,
      default: false,
    },
    last_updated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
quizProgressSchema.index({ quiz_id: 1, user_id: 1, is_completed: 1 });

module.exports = mongoose.model('QuizProgress', quizProgressSchema);
