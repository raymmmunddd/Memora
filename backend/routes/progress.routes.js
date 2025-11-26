// routes/progress.routes.js

const express = require('express');
const router = express.Router();
const QuizAttempt = require('../models/QuizAttempt');
const authMiddleware = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get progress data with time range filter
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const { range = 'all' } = req.query;

    // Calculate date filter
    let dateFilter = {};
    const now = new Date();
    
    if (range === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      dateFilter = { completed_at: { $gte: weekAgo } };
    } else if (range === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      dateFilter = { completed_at: { $gte: monthAgo } };
    }

    // Fetch all attempts for the user
    const attempts = await QuizAttempt.find({
      user_id: userId,
      is_deleted: false,
      ...dateFilter
    })
      .populate('quiz_id', 'title subject')
      .sort({ completed_at: -1 });

    if (attempts.length === 0) {
      return res.json({
        attempts: [],
        statistics: {
          totalAttempts: 0,
          averageScore: 0,
          averageTime: 0,
          improvement: 0,
          strongSubjects: [],
          weakSubjects: []
        }
      });
    }

    // Calculate statistics
    const totalAttempts = attempts.length;
    const totalScore = attempts.reduce((sum, attempt) => sum + attempt.score, 0);
    const averageScore = Math.round(totalScore / totalAttempts);
    const totalTime = attempts.reduce((sum, attempt) => sum + attempt.time_taken, 0);
    const averageTime = Math.round(totalTime / totalAttempts);

    // Calculate improvement (compare first half vs second half)
    let improvement = 0;
    if (attempts.length >= 4) {
      const halfPoint = Math.floor(attempts.length / 2);
      const recentAttempts = attempts.slice(0, halfPoint);
      const olderAttempts = attempts.slice(halfPoint);
      
      const recentAvg = recentAttempts.reduce((sum, a) => sum + a.score, 0) / recentAttempts.length;
      const olderAvg = olderAttempts.reduce((sum, a) => sum + a.score, 0) / olderAttempts.length;
      
      improvement = Math.round(recentAvg - olderAvg);
    }

    // Calculate subject performance
    const subjectScores = {};
    attempts.forEach(attempt => {
      const subject = attempt.quiz_id?.subject || 'General';
      if (!subjectScores[subject]) {
        subjectScores[subject] = { total: 0, count: 0 };
      }
      subjectScores[subject].total += attempt.score;
      subjectScores[subject].count += 1;
    });

    const subjectAverages = Object.entries(subjectScores)
      .map(([subject, data]) => ({
        subject,
        average: data.total / data.count
      }))
      .sort((a, b) => b.average - a.average);

    const strongSubjects = subjectAverages.slice(0, 2).map(s => s.subject);
    const weakSubjects = subjectAverages.slice(-2).map(s => s.subject).reverse();

    res.json({
      attempts,
      statistics: {
        totalAttempts,
        averageScore,
        averageTime,
        improvement,
        strongSubjects,
        weakSubjects
      }
    });
  } catch (error) {
    console.error('Error fetching progress stats:', error);
    res.status(500).json({ error: 'Failed to fetch progress statistics' });
  }
});

// Generate AI insights
router.post('/ai-insights', async (req, res) => {
  try {
    const { progressData } = req.body;

    if (!progressData || !progressData.attempts || progressData.attempts.length === 0) {
      return res.status(400).json({ error: 'No progress data provided' });
    }

    // Prepare data for AI analysis
    const analysisData = {
      totalAttempts: progressData.statistics.totalAttempts,
      averageScore: progressData.statistics.averageScore,
      improvement: progressData.statistics.improvement,
      strongSubjects: progressData.statistics.strongSubjects,
      weakSubjects: progressData.statistics.weakSubjects,
      recentScores: progressData.attempts.slice(0, 10).map(a => ({
        title: a.quiz_id.title,
        subject: a.quiz_id.subject,
        score: a.score,
        date: a.completed_at
      })),
      subjectPerformance: {}
    };

    // Calculate detailed subject performance
    progressData.attempts.forEach(attempt => {
      const subject = attempt.quiz_id.subject || 'General';
      if (!analysisData.subjectPerformance[subject]) {
        analysisData.subjectPerformance[subject] = {
          scores: [],
          avgTime: 0,
          totalAttempts: 0
        };
      }
      analysisData.subjectPerformance[subject].scores.push(attempt.score);
      analysisData.subjectPerformance[subject].avgTime += attempt.time_taken;
      analysisData.subjectPerformance[subject].totalAttempts += 1;
    });

    // Calculate averages for each subject
    Object.keys(analysisData.subjectPerformance).forEach(subject => {
      const data = analysisData.subjectPerformance[subject];
      data.avgScore = Math.round(
        data.scores.reduce((sum, s) => sum + s, 0) / data.scores.length
      );
      data.avgTime = Math.round(data.avgTime / data.totalAttempts / 60); // Convert to minutes
      delete data.scores; // Remove individual scores to reduce payload
    });

    // Call Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const prompt = `You are an educational AI assistant analyzing a student's learning progress. Based on the following data, provide personalized insights:

Student Progress Data:
${JSON.stringify(analysisData, null, 2)}

Please provide a comprehensive analysis in the following JSON format (respond ONLY with valid JSON, no markdown or additional text):

{
  "overallAnalysis": "A 2-3 sentence summary of the student's overall learning journey and progress",
  "strengths": [
    "Specific strength 1 with evidence from the data",
    "Specific strength 2 with evidence from the data",
    "Specific strength 3 with evidence from the data"
  ],
  "weaknesses": [
    "Specific area for improvement 1 with evidence",
    "Specific area for improvement 2 with evidence",
    "Specific area for improvement 3 with evidence"
  ],
  "recommendations": [
    "Actionable recommendation 1 based on the data",
    "Actionable recommendation 2 based on the data",
    "Actionable recommendation 3 based on the data",
    "Actionable recommendation 4 based on the data"
  ]
}

Focus on being specific, actionable, and encouraging. Use the actual data provided to support your insights.`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error('Failed to generate AI insights');
    }

    const data = await response.json();
    const aiResponse = data.candidates[0].content.parts[0].text;

    // Parse the AI response (remove any markdown formatting if present)
    let cleanedResponse = aiResponse.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
    }

    const insights = JSON.parse(cleanedResponse);

    res.json(insights);
  } catch (error) {
    console.error('Error generating AI insights:', error);
    res.status(500).json({ 
      error: 'Failed to generate AI insights',
      details: error.message 
    });
  }
});

module.exports = router;