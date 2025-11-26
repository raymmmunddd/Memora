// routes/users.js

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const authMiddleware = require('../middleware/auth');

// Protected routes - apply auth middleware to all routes
router.use(authMiddleware);

// GET - Fetch user profile
router.get('/profile', async (req, res) => {
  try {
    // req.user should be set by your authMiddleware
    const user = await User.findById(req.user.id).select('-password -remember_token');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    res.json({
      _id: user._id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      last_login: user.last_login
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch profile' 
    });
  }
});

// PUT - Update user profile
router.put('/profile', async (req, res) => {
  try {
    const { username, email, currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    // Validate username
    if (username && username.trim().length < 3) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username must be at least 3 characters' 
      });
    }

    // Validate email format
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ 
          success: false, 
          error: 'Please enter a valid email address' 
        });
      }

      // Check if email is already taken by another user
      if (email !== user.email) {
        const existingUser = await User.findOne({ email, _id: { $ne: user._id } });
        if (existingUser) {
          return res.status(400).json({ 
            success: false, 
            error: 'Email is already in use' 
          });
        }
      }
    }

    // If changing password, validate it
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ 
          success: false, 
          error: 'Current password is required to change password' 
        });
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ 
          success: false, 
          error: 'Current password is incorrect' 
        });
      }

      // Validate new password requirements
      if (newPassword.length < 8) {
        return res.status(400).json({ 
          success: false, 
          error: 'Password must be at least 8 characters' 
        });
      }

      const hasUpperCase = /[A-Z]/.test(newPassword);
      const hasLowerCase = /[a-z]/.test(newPassword);
      const hasNumber = /\d/.test(newPassword);
      const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

      if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSymbol) {
        return res.status(400).json({ 
          success: false, 
          error: 'Password must include uppercase, lowercase, number, and symbol' 
        });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(newPassword, salt);
    }

    // Update username and email
    if (username) user.username = username.trim();
    if (email) user.email = email.trim();

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: {
          id: user._id,
          username: user.username,
          email: user.email
        }
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update profile' 
    });
  }
});

module.exports = router;