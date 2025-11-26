// routes/tutorRoutes.js

const express = require('express');
const router = express.Router();
const tutorController = require('../controllers/tutorController');
const authMiddleware = require('../middleware/auth'); 

// Apply authentication to all tutor routes
router.use(authMiddleware);

// =============================
// File Upload Routes
// =============================

/**
 * @route   POST /api/tutor/upload
 * @desc    Upload a PDF or Word document
 * @access  Private
 */
router.post('/upload', tutorController.uploadFile);

/**
 * @route   GET /api/tutor/files
 * @desc    Get user's uploaded files
 * @access  Private
 */
router.get('/files', tutorController.getUserFiles);

// =============================
// Tutor Chat Routes
// =============================

/**
 * @route   POST /api/tutor/chat
 * @desc    Send a message to the AI tutor and get a response
 * @access  Private
 */
router.post('/chat', tutorController.chat);

/**
 * @route   GET /api/tutor/sessions/recent
 * @desc    Get user's recent chat sessions
 * @access  Private
 */
router.get('/sessions/recent', tutorController.getRecentSessions);

/**
 * @route   GET /api/tutor/sessions/:sessionId
 * @desc    Get a specific chat session with all messages
 * @access  Private
 */
router.get('/sessions/:sessionId', tutorController.getSession);

/**
 * @route   DELETE /api/tutor/sessions/:sessionId
 * @desc    Delete a chat session
 * @access  Private
 */
router.delete('/sessions/:sessionId', tutorController.deleteSession);

/**
 * @route   GET /api/tutor/stats
 * @desc    Get chat statistics for the user
 * @access  Private
 */
router.get('/stats', tutorController.getChatStats);

module.exports = router;