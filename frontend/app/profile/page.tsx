'use client';

import { useEffect, useState } from 'react';
import CollapsibleSidebar from '@/app/sidebar';
import { authService } from '@/services/auth.service';
import { 
  User, 
  Lock, 
  Calendar, 
  Activity, 
  Eye, 
  EyeOff, 
  CheckCircle,
  Mail
} from 'lucide-react';
import './profile.css';

interface UserData {
  _id: string;
  username: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

// Password validation function (same as auth.js)
const validatePassword = (password: string) => {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
  
  return hasUpperCase && hasLowerCase && hasNumber && hasSymbol;
};

const validateEmail = (email: string) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export default function ProfilePage() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  
  const [user, setUser] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  
  // Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Feedback state
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  useEffect(() => {
    // Subscribe to user changes
    const unsubscribe = authService.subscribe((userData) => {
      if (userData) {
        fetchUserProfile();
      }
    });

    // Initialize user immediately
    const currentUser = authService.getUser();
    if (currentUser) {
      fetchUserProfile();
    } else {
      window.location.href = '/';
    }

    return () => unsubscribe();
  }, []);

  const fetchUserProfile = async () => {
    try {
      setIsLoading(true);
      const token = authService.getToken();
      if (!token) {
        window.location.href = '/';
        return;
      }

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data);
        setNewUsername(data.username);
        setNewEmail(data.email);
      } else {
        throw new Error('Failed to fetch profile');
      }
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setMessage('Failed to load profile');
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const clearForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMessage('');
    if (user) {
      setNewUsername(user.username);
      setNewEmail(user.email);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    clearForm();
  };

  const handleSaveChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    const token = authService.getToken();
    if (!token || !user) return;

    // Validate email if changed
    if (newEmail !== user.email && !validateEmail(newEmail)) {
      setMessage('Please enter a valid email address');
      setMessageType('error');
      return;
    }

    // Validate username if changed
    if (newUsername.trim().length < 3) {
      setMessage('Username must be at least 3 characters');
      setMessageType('error');
      return;
    }

    // Validate password if provided
    if (newPassword) {
      if (newPassword.length < 8) {
        setMessage('Password must be at least 8 characters');
        setMessageType('error');
        return;
      }

      if (!validatePassword(newPassword)) {
        setMessage('Password must include uppercase, lowercase, number, and symbol');
        setMessageType('error');
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage('New passwords do not match');
        setMessageType('error');
        return;
      }

      if (!currentPassword) {
        setMessage('Current password is required to change password');
        setMessageType('error');
        return;
      }
    }

    try {
      // Update profile (username, email, and optionally password)
      const updateData: any = {
        username: newUsername,
        email: newEmail
      };

      if (currentPassword && newPassword) {
        updateData.currentPassword = currentPassword;
        updateData.newPassword = newPassword;
      }

      const response = await fetch(`${API_BASE_URL}/users/profile`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        const err = await response.json();
        setMessage(err.error || 'Failed to update profile');
        setMessageType('error');
        return;
      }

      // Success - show modal
      setShowSuccessModal(true);
      setIsEditing(false);
      clearForm();
      
      // Refresh user data
      fetchUserProfile();
      
      // Update auth service with new data
      authService.updateUser({ username: newUsername, email: newEmail });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('An error occurred while saving changes');
      setMessageType('error');
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const isPasswordSectionComplete =
    currentPassword.trim() !== '' &&
    newPassword.trim() !== '' &&
    confirmPassword.trim() !== '';

  const canSave =
    (user && (newUsername.trim() !== user.username || newEmail.trim() !== user.email)) || 
    isPasswordSectionComplete;

  if (isLoading || !user) {
    return (
      <CollapsibleSidebar>
        <div className="profile-page">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading your profile...</p>
          </div>
        </div>
      </CollapsibleSidebar>
    );
  }

  return (
    <CollapsibleSidebar>
      <div className="profile-page">
        {/* Header Section */}
        <div className="profile-header">
          <div className="header-content">
            <div>
              <h1 className="profile-title">Profile Settings</h1>
              <p className="profile-subtitle">
                Manage your account settings and personal information
              </p>
            </div>
          </div>
        </div>

        {/* Profile Card */}
        <div className="profile-card">
          <div className="card-header">
            <div className="card-header-content">
              <User className="card-icon" />
              <h2 className="card-title">Profile Information</h2>
            </div>
            <p className="card-description">Your account details and personal information</p>
          </div>

          {!isEditing ? (
            <>
              <div className="profile-display">
                <div className="profile-avatar">
                  <span className="avatar-text">
                    {user.username.substring(0, 2).toUpperCase()}
                  </span>
                </div>
                
                <div className="profile-info">
                  <div className="info-main">
                    <h3 className="username-display">{user.username}</h3>
                  </div>
                  <p className="username-label">{user.email}</p>
                </div>
              </div>

              <div className="info-grid">
                <div className="info-item">
                  <label className="info-label">Username</label>
                  <div className="info-value">
                    <User className="info-icon" />
                    <span>{user.username}</span>
                  </div>
                </div>

                <div className="info-item">
                  <label className="info-label">Email Address</label>
                  <div className="info-value">
                    <Mail className="info-icon" />
                    <span>{user.email}</span>
                  </div>
                </div>

                <div className="info-item">
                  <label className="info-label">Member Since</label>
                  <div className="info-value">
                    <Calendar className="info-icon" />
                    <span>{formatDate(user.createdAt)}</span>
                  </div>
                </div>
              </div>

              <div className="button-group">
                <button
                  className="edit-button"
                  onClick={() => setIsEditing(true)}
                >
                  <Lock className="button-icon" />
                  Edit Profile
                </button>
              </div>
            </>
          ) : (
            <div className="profile-form">
              <div className="form-section">
                <h3 className="form-section-title">Account Information</h3>
                
                <div className="form-group">
                  <label className="form-label">Username</label>
                  <div className="input-wrapper">
                    <User className="input-icon" size={18} />
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Enter username"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      minLength={3}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div className="input-wrapper">
                    <Mail className="input-icon" size={18} />
                    <input
                      type="email"
                      className="form-input"
                      placeholder="Enter email address"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h3 className="form-section-title">Change Password</h3>
                <p className="form-section-description">
                  Leave password fields empty if you don't want to change it
                </p>

                <div className="form-group">
                  <label className="form-label">Current Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" size={18} />
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      className="form-input"
                      placeholder="Enter current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    >
                      {showCurrentPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">New Password</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={18} />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        className="form-input"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                      >
                        {showNewPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>
                    </div>
                    <p className="form-hint">
                      Min 8 chars, uppercase, lowercase, number, symbol
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Confirm New Password</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={18} />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        className="form-input"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        className="password-toggle"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {message && (
                <div className={`message ${messageType}`}>
                  {message}
                </div>
              )}

              <div className="button-group">
                <button 
                  type="button"
                  className="save-button"
                  disabled={!canSave}
                  onClick={handleSaveChanges}
                >
                  Save Changes
                </button>
                <button type="button" className="cancel-button" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="profile-modal-overlay" onClick={() => setShowSuccessModal(false)}>
          <div className="profile-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="profile-modal-icon">
              <CheckCircle size={48} />
            </div>
            <h3 className="profile-modal-title">Profile Updated</h3>
            <p className="profile-modal-message">
              Your profile has been updated successfully.
            </p>
            <button 
              className="profile-modal-button"
              onClick={() => setShowSuccessModal(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </CollapsibleSidebar>
  );
}
