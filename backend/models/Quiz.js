// models/Quiz.js

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question_text: {
    type: String,
    required: true,
  },
  question_type: {
    type: String,
    enum: ['multiple-choice', 'fill-blank'],
    required: true,
  },
  options: [{
    type: String,
  }],
  correct_answer: {
    type: String,
    required: true,
  },
  explanation: {
    type: String,
    default: '',
  },
});

const quizSchema = new mongoose.Schema(
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
      trim: true,
    },
    quiz_type: {
      type: mongoose.Schema.Types.Mixed, 
      required: true,
      validate: {
        validator: function(v) {
          if (typeof v === 'string') {
            return ['multiple-choice', 'fill-blank'].includes(v);
          }
          if (Array.isArray(v)) {
            return v.length > 0 && v.every(type => 
              ['multiple-choice', 'fill-blank'].includes(type)
            );
          }
          return false;
        },
        message: 'Invalid quiz type(s)'
      }
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: true,
    },
    time_limit: {
      type: Number,
      default: null, 
    },
    questions: [questionSchema],
    source_files: [{
      filename: String,
      original_name: String,
      file_path: String,
      uploaded_at: {
        type: Date,
        default: Date.now,
      },
    }],
    status: {
      type: String,
      enum: ['generating', 'completed', 'failed'],
      default: 'generating',
    },
    generation_error: {
      type: String,
      default: null,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

quizSchema.virtual('quiz_types').get(function() {
  return Array.isArray(this.quiz_type) ? this.quiz_type : [this.quiz_type];
});

quizSchema.set('toJSON', { virtuals: true });
quizSchema.set('toObject', { virtuals: true });

// Index for efficient queries
quizSchema.index({ user_id: 1, createdAt: -1 });
quizSchema.index({ status: 1 });

module.exports = mongoose.model('Quiz', quizSchema);