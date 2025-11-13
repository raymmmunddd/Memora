// routes/dashboard.routes.js

const express = require('express');
const router = express.Router();
const Quiz = require('../models/Quiz');
const QuizAttempt = require('../models/QuizAttempt');
const ChatSession = require('../models/ChatSession');
const ChatMessage = require('../models/ChatMessage');
const UploadedFile = require('../models/UploadedFile');
const authMiddleware = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch all statistics in parallel
    const [
      totalQuizzes,
      completedQuizzes,
      averageScore,
      accuracy,
      recentActivities,
      recentQuizScore
    ] = await Promise.all([
      // Total quizzes created
      Quiz.countDocuments({ user_id: userId, is_deleted: false }),
      
      // Completed quizzes
      QuizAttempt.countDocuments({ user_id: userId, is_deleted: false }),
      
      // Average score
      QuizAttempt.aggregate([
        { $match: { user_id: userId, is_deleted: false } },
        { $group: { _id: null, avgScore: { $avg: '$score' } } }
      ]),
      
      // Overall accuracy
      QuizAttempt.aggregate([
        { $match: { user_id: userId, is_deleted: false } },
        {
          $group: {
            _id: null,
            totalCorrect: { $sum: '$correct_answers' },
            totalQuestions: { $sum: '$total_questions' }
          }
        }
      ]),
      
      // Recent activities
      getRecentActivities(userId),
      
      // Most recent quiz score
      QuizAttempt.findOne({ user_id: userId, is_deleted: false })
        .sort({ completed_at: -1 })
        .populate('quiz_id', 'title')
    ]);

    // Calculate statistics
    const stats = {
      totalQuizzes: totalQuizzes || 0,
      completedQuizzes: completedQuizzes || 0,
      averageScore: averageScore.length > 0 ? Math.round(averageScore[0].avgScore) : 0,
      accuracy: accuracy.length > 0 && accuracy[0].totalQuestions > 0
        ? Math.round((accuracy[0].totalCorrect / accuracy[0].totalQuestions) * 100)
        : 0,
      recentQuizScore: recentQuizScore ? {
        score: Math.round(recentQuizScore.score),
        title: recentQuizScore.quiz_id?.title || 'Unknown Quiz',
        completedAt: recentQuizScore.completed_at,
        percentageChange: await calculateScoreChange(userId, recentQuizScore.score)
      } : null,
      recentActivities: recentActivities || []
    };

    return res.status(200).json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
  }
});

// Helper function to get recent activities
async function getRecentActivities(userId) {
  try {
    console.log('🔍 Fetching activities for userId:', userId);
    const activities = [];

    // Get recent quiz attempts
    const recentAttempts = await QuizAttempt.find({
      user_id: userId,
      is_deleted: false
    })
      .sort({ completed_at: -1 })
      .limit(5)
      .populate('quiz_id', 'title');

    console.log('📊 Quiz attempts found:', recentAttempts.length);

    recentAttempts.forEach(attempt => {
      activities.push({
        type: 'quiz_completed',
        title: `Completed Quiz: ${attempt.quiz_id?.title || 'Unknown'}`,
        description: `Score: ${Math.round(attempt.score)}% | ${formatTimeAgo(attempt.completed_at)}`,
        timestamp: attempt.completed_at,
        icon: 'CheckCircle'
      });
    });

    // Get recent chat sessions
    const recentChats = await ChatSession.find({
      user_id: userId,
      is_deleted: false,
      message_count: { $gt: 0 }
    })
      .sort({ last_message_at: -1 })
      .limit(5);

    console.log('💬 Chat sessions found:', recentChats.length);

    recentChats.forEach(chat => {
      activities.push({
        type: 'chat_message',
        title: `Asked AI about ${chat.title}`,
        description: formatTimeAgo(chat.last_message_at),
        timestamp: chat.last_message_at,
        icon: 'MessageSquare'
      });
    });

    // Get recent quiz creations
    const recentQuizzes = await Quiz.find({
      user_id: userId,
      is_deleted: false,
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .limit(5);

    console.log('📝 Quizzes created found:', recentQuizzes.length);

    recentQuizzes.forEach(quiz => {
      activities.push({
        type: 'quiz_created',
        title: `Created Quiz: ${quiz.title}`,
        description: `${quiz.questions.length} questions | ${formatTimeAgo(quiz.createdAt)}`,
        timestamp: quiz.createdAt,
        icon: 'Book'
      });
    });

    // Get recent file uploads
    const recentUploads = await UploadedFile.find({
      user_id: userId,
      is_deleted: false
    })
      .sort({ createdAt: -1 })
      .limit(5);

    console.log('📎 File uploads found:', recentUploads.length);

    recentUploads.forEach(file => {
      activities.push({
        type: 'file_uploaded',
        title: `Uploaded ${file.original_name}`,
        description: `${formatFileSize(file.file_size)} | ${formatTimeAgo(file.createdAt)}`,
        timestamp: file.createdAt,
        icon: 'Upload'
      });
    });

    // Sort all activities by timestamp and take top 10
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    console.log('✅ Total activities returned:', activities.length);
    return activities.slice(0, 10);
  } catch (error) {
    console.error('Error fetching recent activities:', error);
    return [];
  }
}

// Helper function to calculate score change percentage
async function calculateScoreChange(userId, currentScore) {
  try {
    const previousAttempts = await QuizAttempt.find({
      user_id: userId,
      is_deleted: false
    })
      .sort({ completed_at: -1 })
      .skip(1)
      .limit(5);

    if (previousAttempts.length === 0) return 0;

    const avgPreviousScore = previousAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / previousAttempts.length;
    const change = currentScore - avgPreviousScore;
    return Math.round(change);
  } catch (error) {
    console.error('Error calculating score change:', error);
    return 0;
  }
}

// Helper function to format time ago
function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  
  const intervals = {
    year: 31536000,
    month: 2592000,
    week: 604800,
    day: 86400,
    hour: 3600,
    minute: 60
  };

  for (const [unit, secondsInUnit] of Object.entries(intervals)) {
    const interval = Math.floor(seconds / secondsInUnit);
    if (interval >= 1) {
      return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
    }
  }

  return 'Just now';
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = router;