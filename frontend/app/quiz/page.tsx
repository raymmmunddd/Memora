'use client';

import React, { useState, useEffect, ChangeEvent, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import CollapsibleSidebar from '@/app/sidebar';
import { Upload, FileText, Play, CheckSquare, Edit, Zap, Loader2, Trash2, Check } from 'lucide-react';
import { authService } from '@/services/auth.service';
import Swal from 'sweetalert2';
import './quiz-namespaced.css';

interface UploadedFile {
  _id: string;
  original_name: string;
  createdAt: string;
  file_type: string;
}

interface CurrentUser {
  name: string;
  email: string;
}

const QuizPage: React.FC = () => {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const router = useRouter();

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);
  const [recentUploads, setRecentUploads] = useState<UploadedFile[]>([]);
  const [quizTypes, setQuizTypes] = useState<string[]>(['multiple-choice']);
  const [numQuestions, setNumQuestions] = useState<string>('10');
  const [customQuestions, setCustomQuestions] = useState<string>('');
  const [difficulty, setDifficulty] = useState<string>('medium');
  const [timeLimit, setTimeLimit] = useState<string>('none');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  // Subscribe to auth changes
  useEffect(() => {
    setToken(authService.getToken());

    const unsubscribe = authService.subscribe((u) => {
      if (u) setUser({ name: u.username, email: u.email });
      else setUser(null);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (token) fetchRecentFiles();
  }, [token]);

  const fetchRecentFiles = async () => {
    if (!token) {
      setError('You must be logged in to view recent files.');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/files/recent`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        setError('Unauthorized. Please log in again.');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setRecentUploads(data.files.slice(0, 4));
      } else {
        setError('Failed to fetch recent files.');
      }
    } catch (err) {
      console.error('Failed to fetch recent files:', err);
      setError('Error fetching recent files.');
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length) handleFiles(e.target.files);
  };

  const handleFiles = async (files: FileList) => {
    if (!token) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'You must be logged in to upload files.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    setIsUploading(true);
    setError('');

    try {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_BASE_URL}/quiz/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (response.status === 401) {
        Swal.fire({
          icon: 'error',
          title: 'Unauthorized',
          text: 'Please log in again.',
          confirmButtonColor: '#3b82f6',
        });
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to upload files');
      }

      const data = await response.json();
      const fileIds = data.files.map((f: UploadedFile) => f._id);

      setUploadedFileIds((prev) => [...prev, ...fileIds]);
      setSelectedFiles((prev) => [...prev, ...Array.from(files)]);

      fetchRecentFiles();

      Swal.fire({
        icon: 'success',
        title: 'Upload Successful',
        text: `Successfully uploaded ${files.length} file(s)`,
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('Upload error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        text: err instanceof Error ? err.message : 'Failed to upload files.',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleUseRecentFile = (fileId: string) => {
    if (!uploadedFileIds.includes(fileId)) {
      setUploadedFileIds((prev) => [...prev, fileId]);
    } else {
      setUploadedFileIds((prev) => prev.filter(id => id !== fileId));
    }
  };

  const handleDeleteFile = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!token) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'You must be logged in to delete files.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    const result = await Swal.fire({
      title: 'Delete File?',
      text: 'Are you sure you want to delete this file?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
    });

    if (!result.isConfirmed) return;

    setDeletingFileId(fileId);

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        Swal.fire({
          icon: 'error',
          title: 'Unauthorized',
          text: 'Please log in again.',
          confirmButtonColor: '#3b82f6',
        });
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete file');
      }

      setUploadedFileIds((prev) => prev.filter(id => id !== fileId));
      fetchRecentFiles();

      Swal.fire({
        icon: 'success',
        title: 'Deleted',
        text: 'File deleted successfully',
        timer: 2000,
        showConfirmButton: false,
      });
    } catch (err) {
      console.error('Delete error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Delete Failed',
        text: err instanceof Error ? err.message : 'Failed to delete file.',
        confirmButtonColor: '#3b82f6',
      });
    } finally {
      setDeletingFileId(null);
    }
  };

  const toggleQuizType = (type: string) => {
    setQuizTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow deselecting if it's the only selected type
        if (prev.length === 1) return prev;
        return prev.filter(t => t !== type);
      } else {
        return [...prev, type];
      }
    });
  };

  const handleGenerateQuiz = async () => {
    if (!token) {
      Swal.fire({
        icon: 'error',
        title: 'Authentication Required',
        text: 'You must be logged in to generate a quiz.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    if (uploadedFileIds.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Files Selected',
        text: 'Please upload or select at least one file.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    if (quizTypes.length === 0) {
      Swal.fire({
        icon: 'warning',
        title: 'No Quiz Type Selected',
        text: 'Please select at least one quiz type.',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    // Validate custom questions
    const finalNumQuestions = numQuestions === 'custom' ? customQuestions : numQuestions;
    const questionsNum = parseInt(finalNumQuestions);
    
    if (numQuestions === 'custom' && (!customQuestions || questionsNum < 1 || questionsNum > 100)) {
      Swal.fire({
        icon: 'warning',
        title: 'Invalid Question Count',
        text: 'Please enter a valid number of questions (1-100).',
        confirmButtonColor: '#3b82f6',
      });
      return;
    }

    setIsGenerating(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fileIds: uploadedFileIds,
          quizTypes: quizTypes,
          numQuestions: finalNumQuestions,
          difficulty,
          timeLimit,
        }),
      });

      if (response.status === 401) {
        Swal.fire({
          icon: 'error',
          title: 'Unauthorized',
          text: 'Please log in again.',
          confirmButtonColor: '#3b82f6',
        });
        setIsGenerating(false);
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to generate quiz');
      }

      const data = await response.json();
      const quizId = data.quizId;

      // Show loading alert
      Swal.fire({
        title: 'Generating Quiz...',
        text: 'Please wait while we create your quiz',
        allowOutsideClick: false,
        allowEscapeKey: false,
        didOpen: () => {
          Swal.showLoading();
        }
      });

      const checkStatus = async () => {
        const statusResponse = await fetch(`${API_BASE_URL}/quiz/${quizId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        const statusData = await statusResponse.json();

        if (statusData.status === 'completed') {
          Swal.close();
          router.push(`/quiz/${quizId}`);
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Quiz generation failed');
        } else {
          setTimeout(checkStatus, 2000);
        }
      };

      checkStatus();
    } catch (err) {
      console.error('Generate quiz error:', err);
      Swal.fire({
        icon: 'error',
        title: 'Generation Failed',
        text: err instanceof Error ? err.message : 'Failed to generate quiz.',
        confirmButtonColor: '#3b82f6',
      });
      setIsGenerating(false);
    }
  };

  const getFileIcon = (fileType: string) => {
    const colors: { [key: string]: string } = {
      '.pdf': 'blue',
      '.docx': 'purple',
      '.pptx': 'accent',
      '.txt': 'secondary',
    };
    return colors[fileType] || 'blue';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  return (
    <CollapsibleSidebar>
      <div className="quiz-page">
        {/* Header */}
        <div className="quiz-header">
          <div className="header-content">
            <div className="header-text">
              <h1 className="page-title">Quiz Generator</h1>
              <p className="page-subtitle">
                Create personalized quizzes from your study materials
              </p>
            </div>
          </div>
        </div>

        {error && <div className="error-message"><p>{error}</p></div>}

        {/* Upload Section */}
        <div className="card upload-card">
          <h3 className="card-title">Upload Study Materials</h3>
          <p className="card-description">
            Upload your notes, textbooks, or presentations to generate a customized quiz
          </p>

          <div
            className={`upload-area ${isDragging ? 'upload-area-active' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (!token) {
                Swal.fire({
                  icon: 'error',
                  title: 'Authentication Required',
                  text: 'Please log in to upload files.',
                  confirmButtonColor: '#3b82f6',
                });
                return;
              }
              const input = document.getElementById('fileInput');
              if (input) input.click();
            }}
          >
            <div className="upload-icon-wrapper">
              {isUploading ? <Loader2 className="upload-icon animate-spin" /> : <Upload className="upload-icon" />}
            </div>
            <h4 className="upload-title">{isUploading ? 'Uploading...' : 'Drag & drop files here'}</h4>
            <p className="upload-subtitle">Supports PDF, DOCX, PPTX, and TXT files (Max 10MB)</p>
            <button className="btn-upload" disabled={isUploading || !token}>
              {isUploading ? 'Uploading...' : 'Select Files'}
            </button>
            <input
              id="fileInput"
              type="file"
              multiple
              accept=".pdf,.docx,.pptx,.txt"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>

          {/* Recent Uploads */}
          {recentUploads.length > 0 && (
            <div className="recent-uploads">
              <h4 className="recent-uploads-title">Recent Uploads</h4>
              <div className="uploads-grid">
                {recentUploads.map((file) => {
                  const isSelected = uploadedFileIds.includes(file._id);
                  return (
                    <div 
                      key={file._id} 
                      className={`upload-item ${isSelected ? 'upload-item-selected' : ''}`}
                      onClick={() => {
                        if (!token) {
                          Swal.fire({
                            icon: 'error',
                            title: 'Authentication Required',
                            text: 'Please log in to select files.',
                            confirmButtonColor: '#3b82f6',
                          });
                          return;
                        }
                        handleUseRecentFile(file._id);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={`upload-item-icon icon-${getFileIcon(file.file_type)}`}>
                        <FileText className="icon" />
                      </div>
                      <div className="upload-item-info">
                        <p className="upload-item-name">{file.original_name}</p>
                        <p className="upload-item-date">Uploaded {formatDate(file.createdAt)}</p>
                      </div>
                      {isSelected && (
                        <div className="selected-indicator">
                          <Check className="icon-sm" />
                        </div>
                      )}
                      <button
                        className="btn-delete"
                        onClick={(e) => handleDeleteFile(file._id, e)}
                        disabled={deletingFileId === file._id}
                        title="Delete file"
                      >
                        {deletingFileId === file._id ? (
                          <Loader2 className="icon-sm animate-spin" />
                        ) : (
                          <Trash2 className="icon-sm" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Quiz Settings Section */}
        <div className="card settings-card">
          <h3 className="card-title">Quiz Settings</h3>
          <div className="settings-grid">
            <div className="setting-group setting-group-full">
              <label className="setting-label">Quiz Types (Select one or more)</label>
              <div className="quiz-type-grid">
                <button 
                  className={`quiz-type-btn ${quizTypes.includes('multiple-choice') ? 'active' : ''}`} 
                  onClick={() => toggleQuizType('multiple-choice')}
                >
                  <CheckSquare className="quiz-type-icon" />
                  <span className="quiz-type-text">Multiple Choice</span>
                </button>
                <button 
                  className={`quiz-type-btn ${quizTypes.includes('fill-blank') ? 'active' : ''}`} 
                  onClick={() => toggleQuizType('fill-blank')}
                >
                  <Edit className="quiz-type-icon" />
                  <span className="quiz-type-text">Identification</span>
                </button>
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">Number of Questions</label>
              <select 
                className="setting-select" 
                value={numQuestions} 
                onChange={(e) => {
                  setNumQuestions(e.target.value);
                  if (e.target.value !== 'custom') {
                    setCustomQuestions('');
                  }
                }}
              >
                <option value="5">5 Questions</option>
                <option value="10">10 Questions</option>
                <option value="15">15 Questions</option>
                <option value="20">20 Questions</option>
                <option value="custom">Custom</option>
              </select>
              {numQuestions === 'custom' && (
                <input
                  type="number"
                  className="setting-input"
                  placeholder="Enter number (1-100)"
                  min="1"
                  max="100"
                  value={customQuestions}
                  onChange={(e) => setCustomQuestions(e.target.value)}
                />
              )}
            </div>

            <div className="setting-group">
              <label className="setting-label">Difficulty Level</label>
              <select className="setting-select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            <div className="setting-group">
              <label className="setting-label">Time Limit (optional)</label>
              <select className="setting-select" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)}>
                <option value="none">No time limit</option>
                <option value="5">5 minutes</option>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="20">20 minutes</option>
                <option value="30">30 minutes</option>
              </select>
            </div>
          </div>

          <div className="settings-footer">
            <button
              className="btn-generate"
              onClick={handleGenerateQuiz}
              disabled={isGenerating || uploadedFileIds.length === 0 || !token || quizTypes.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="btn-icon animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Zap className="btn-icon" />
                  Generate Quiz ({uploadedFileIds.length} {uploadedFileIds.length === 1 ? 'file' : 'files'})
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </CollapsibleSidebar>
  );
};

export default QuizPage;