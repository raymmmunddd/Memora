'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import CollapsibleSidebar from '@/app/sidebar';
import { Send, Bot, User, Loader2, Sparkles, BookOpen, FileText, Upload, X, File } from 'lucide-react';
import { authService } from '@/services/auth.service';
import './ai-tutor-namespaced.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  attachedFiles?: AttachedFile[];
}

interface AttachedFile {
  id: string;
  name: string;
  size: number;
}

interface UploadedFile {
  _id: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  is_processed: boolean;
  createdAt: string;
}

interface ChatSession {
  _id: string;
  title: string;
  createdAt: string;
  messageCount: number;
}

interface CurrentUser {
  name: string;
  email: string;
}

const AITutorPage: React.FC = () => {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your Memora AI Tutor. I can help explain concepts, solve problems, and quiz you on any subject. You can also upload PDF or Word documents for me to read and reference. What would you like to learn about today?",
      timestamp: new Date(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<ChatSession[]>([]);
  
  // File upload states
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Subscribe to auth changes
  useEffect(() => {
    setToken(authService.getToken());

    const unsubscribe = authService.subscribe((u) => {
      if (u) setUser({ name: u.username, email: u.email });
      else setUser(null);
    });

    return () => unsubscribe();
  }, []);

  // Fetch recent chat sessions and uploaded files
  useEffect(() => {
    if (token) {
      fetchRecentSessions().catch(err => {
        console.error('Failed to load recent sessions:', err);
      });
      fetchUploadedFiles().catch(err => {
        console.error('Failed to load uploaded files:', err);
      });
    }
  }, [token]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [inputMessage]);

  const fetchRecentSessions = async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/tutor/sessions/recent', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setRecentSessions(data.sessions || []);
      }
    } catch (err) {
      console.error('Failed to fetch recent sessions:', err);
    }
  };

  const fetchUploadedFiles = async () => {
    if (!token) return;

    try {
      const response = await fetch('/api/tutor/files', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUploadedFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to fetch uploaded files:', err);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ];
      return validTypes.includes(file.type);
    });

    if (validFiles.length !== files.length) {
      setError('Only PDF and Word documents are allowed');
      setTimeout(() => setError(''), 3000);
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    if (selectedFiles.length === 0 || !token) return [];

    setIsUploading(true);
    const uploadedFileIds: string[] = [];

    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/tutor/upload', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          uploadedFileIds.push(data.file._id);
        } else {
          throw new Error(`Failed to upload ${file.name}`);
        }
      }

      setSelectedFiles([]);
      await fetchUploadedFiles();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload files');
    } finally {
      setIsUploading(false);
    }

    return uploadedFileIds;
  };

  const handleSendMessage = async () => {
    if (!token) {
      setError('You must be logged in to chat.');
      return;
    }

    if ((!inputMessage.trim() && selectedFiles.length === 0) || isLoading || isUploading) return;

    // Upload files first if any are selected
    let fileIds: string[] = [];
    if (selectedFiles.length > 0) {
      fileIds = await uploadFiles();
      if (fileIds.length === 0 && selectedFiles.length > 0) {
        setError('Failed to upload files. Please try again.');
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim() || '📎 Uploaded files',
      timestamp: new Date(),
      attachedFiles: fileIds.length > 0 ? fileIds.map((id, idx) => ({
        id,
        name: selectedFiles[idx]?.name || 'file',
        size: selectedFiles[idx]?.size || 0,
      })) : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage('');
    setSelectedFiles([]);
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/tutor/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage.content,
          sessionId: sessionId,
          fileIds: fileIds.length > 0 ? fileIds : undefined,
          conversationHistory: messages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (response.status === 401) {
        setError('Unauthorized. Please log in again.');
        return;
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to get response');
      }

      const data = await response.json();

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      fetchRecentSessions();
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message.');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "I'm sorry, I encountered an error. Please try again.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = () => {
    setSessionId(null);
    setMessages([
      {
        id: '1',
        role: 'assistant',
        content: "Hello! I'm your Memora AI Tutor. I can help explain concepts, solve problems, and quiz you on any subject. You can also upload PDF or Word documents for me to read and reference. What would you like to learn about today?",
        timestamp: new Date(),
      },
    ]);
    setError('');
    setSelectedFiles([]);
  };

  const handleLoadSession = async (session: ChatSession) => {
    if (!token) return;

    try {
      const response = await fetch(`${API_BASE_URL}/tutor/sessions/${session._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok) {
        const data = await response.json();
        setSessionId(session._id);
        setMessages(
          data.messages.map((m: any) => ({
            id: m._id,
            role: m.role,
            content: m.content,
            timestamp: new Date(m.timestamp),
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load session:', err);
      setError('Failed to load chat session.');
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Today';
    if (diffDays === 2) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <CollapsibleSidebar>
      <div className="tutor-page">
        {/* Header */}
        <div className="tutor-header">
          <div className="header-content">
            <div className="header-text">
              <div className="title-wrapper">
                <h1 className="page-title">AI Tutor</h1>
              </div>
              <p className="page-subtitle">
                Ask me anything about your lessons
              </p>
            </div>
            <button className="btn-new-chat" onClick={handleNewChat}>
              <BookOpen className="btn-icon" />
              New Chat
            </button>
          </div>
        </div>

        <div className="tutor-container">
          {/* Sidebar with recent chats */}
          {recentSessions.length > 0 && (
            <div className="recent-chats-sidebar">
              <h3 className="sidebar-title">Recent Chats</h3>
              <div className="sessions-list">
                {recentSessions.map((session) => (
                  <button
                    key={session._id}
                    className={`session-item ${sessionId === session._id ? 'active' : ''}`}
                    onClick={() => handleLoadSession(session)}
                  >
                    <FileText className="session-icon" />
                    <div className="session-info">
                      <p className="session-title">{session.title}</p>
                      <p className="session-date">{formatDate(session.createdAt)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Main chat area */}
          <div className="chat-main">
            {error && (
              <div className="error-message">
                <p>{error}</p>
              </div>
            )}

            {/* Messages container */}
            <div className="messages-container">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.role === 'user' ? 'message-user' : 'message-assistant'}`}
                >
                  <div className="message-avatar">
                    {message.role === 'user' ? (
                      <User className="avatar-icon" />
                    ) : (
                      <Bot className="avatar-icon" />
                    )}
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-role">
                        {message.role === 'user' ? 'You' : 'AI Tutor'}
                      </span>
                      <span className="message-time">
                        {formatTime(message.timestamp)}
                      </span>
                    </div>
                    <div className="message-text">{message.content}</div>
                    {message.attachedFiles && message.attachedFiles.length > 0 && (
                      <div className="attached-files">
                        {message.attachedFiles.map((file) => (
                          <div key={file.id} className="attached-file-badge">
                            <File className="file-badge-icon" />
                            <span>{file.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="message message-assistant">
                  <div className="message-avatar">
                    <Bot className="avatar-icon" />
                  </div>
                  <div className="message-content">
                    <div className="message-header">
                      <span className="message-role">AI Tutor</span>
                    </div>
                    <div className="message-loading">
                      <Loader2 className="loading-icon animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input area */}
            <div className="input-container">
              {/* Selected files preview */}
              {selectedFiles.length > 0 && (
                <div className="selected-files-preview">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="selected-file-item">
                      <File className="file-icon" />
                      <div className="file-details">
                        <span className="file-name">{file.name}</span>
                        <span className="file-size">{formatFileSize(file.size)}</span>
                      </div>
                      <button
                        className="remove-file-btn"
                        onClick={() => removeSelectedFile(index)}
                        disabled={isUploading}
                      >
                        <X className="remove-icon" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="input-wrapper">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  multiple
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <textarea
                  ref={textareaRef}
                  className="message-input"
                  placeholder="Type your question here or upload a document..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  disabled={isLoading || isUploading || !token}
                  rows={1}
                />
                <button
                  className="btn-send"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading || !token}
                  title="Upload PDF or Word document"
                >
                  <Upload className="btn-icon" />
                </button>
                <button
                  className="btn-send"
                  onClick={handleSendMessage}
                  disabled={(!inputMessage.trim() && selectedFiles.length === 0) || isLoading || isUploading || !token}
                >
                  {isLoading || isUploading ? (
                    <Loader2 className="btn-icon animate-spin" />
                  ) : (
                    <Send className="btn-icon" />
                  )}
                </button>
              </div>
              {!token && (
                <p className="input-hint error">Please log in to use the AI Tutor</p>
              )}
              <p className="input-hint">
                Press Enter to send, Shift+Enter for new line • Upload PDF or Word files
              </p>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSidebar>
  );
};

export default AITutorPage;
