'use client';

import { useEffect, useState } from 'react';
import CollapsibleSidebar from '@/app/sidebar';
import { authService } from '@/services/auth.service';
import { 
  TrendingUp, 
  TrendingDown,
  Award,
  Clock,
  Target,
  BarChart2,
  Calendar,
  BookOpen,
  Zap,
  AlertCircle
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';
import './progress-namespaced.css';

interface QuizAttempt {
  _id: string;
  quiz_id: {
    _id: string;
    title: string;
    subject: string;
  };
  score: number;
  total_questions: number;
  correct_answers: number;
  time_taken: number;
  completed_at: string;
  answers: Array<{
    question_id: string;
    user_answer: string;
    is_correct: boolean;
    time_spent: number;
  }>;
}

interface ProgressData {
  attempts: QuizAttempt[];
  statistics: {
    totalAttempts: number;
    averageScore: number;
    averageTime: number;
    improvement: number;
    strongSubjects: string[];
    weakSubjects: string[];
  };
}

interface AIInsight {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  overallAnalysis: string;
}

export default function ProgressPage() {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const [progressData, setProgressData] = useState<ProgressData | null>(null);
  const [aiInsights, setAiInsights] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string>('');
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'all'>('all');

  const COLORS = ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  useEffect(() => {
    fetchProgressData();
  }, [timeRange]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);
      const token = authService.getToken();
      if (!token) {
        throw new Error('No authentication token found');
      }

      const response = await fetch(`${API_BASE_URL}/progress/stats?range=${timeRange}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch progress data');
      }

      const data = await response.json();
      setProgressData(data);
      setError('');
    } catch (err) {
      console.error('Error fetching progress:', err);
      setError('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const generateAIInsights = async () => {
    if (!progressData || progressData.attempts.length === 0) {
      return;
    }

    try {
      setAiLoading(true);
      const token = authService.getToken();

      const response = await fetch(`${API_BASE_URL}/progress/ai-insights`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ progressData })
      });

      if (!response.ok) {
        throw new Error('Failed to generate AI insights');
      }

      const insights = await response.json();
      setAiInsights(insights);
    } catch (err) {
      console.error('Error generating AI insights:', err);
    } finally {
      setAiLoading(false);
    }
  };

  // Prepare chart data
  const getScoreTrendData = () => {
    if (!progressData) return [];
    
    return progressData.attempts
      .slice(-10)
      .map((attempt, index) => ({
        name: `Quiz ${index + 1}`,
        score: attempt.score,
        date: new Date(attempt.completed_at).toLocaleDateString(),
        time: Math.round(attempt.time_taken / 60)
      }));
  };

  const getSubjectPerformanceData = () => {
    if (!progressData) return [];

    const subjectScores: { [key: string]: { total: number; count: number } } = {};
    
    progressData.attempts.forEach(attempt => {
      const subject = attempt.quiz_id.subject || 'General';
      if (!subjectScores[subject]) {
        subjectScores[subject] = { total: 0, count: 0 };
      }
      subjectScores[subject].total += attempt.score;
      subjectScores[subject].count += 1;
    });

    return Object.entries(subjectScores).map(([subject, data]) => ({
      subject,
      averageScore: Math.round(data.total / data.count),
      attempts: data.count
    }));
  };

  const getAccuracyDistribution = () => {
    if (!progressData) return [];

    const ranges = [
      { name: '0-20%', min: 0, max: 20, count: 0 },
      { name: '21-40%', min: 21, max: 40, count: 0 },
      { name: '41-60%', min: 41, max: 60, count: 0 },
      { name: '61-80%', min: 61, max: 80, count: 0 },
      { name: '81-100%', min: 81, max: 100, count: 0 }
    ];

    progressData.attempts.forEach(attempt => {
      const range = ranges.find(r => attempt.score >= r.min && attempt.score <= r.max);
      if (range) range.count++;
    });

    return ranges.filter(r => r.count > 0);
  };

  return (
    <CollapsibleSidebar>
      <div className="progress-page">
        {/* Header */}
        <div className="progress-header">
          <div>
            <h1 className="progress-title">Learning Progress</h1>
            <p className="progress-subtitle">Track your performance and get AI-powered insights</p>
          </div>
          
          <div className="header-actions">
            <select 
              className="time-range-select"
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as any)}
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="all">All Time</option>
            </select>
            
            <button 
              className="ai-insights-btn"
              onClick={generateAIInsights}
              disabled={aiLoading || !progressData || progressData.attempts.length === 0}
            >
              <Zap size={18} />
              {aiLoading ? 'Analyzing...' : 'Get AI Insights'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-banner">
            <AlertCircle size={20} />
            <p>{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading your progress data...</p>
          </div>
        ) : progressData && progressData.attempts.length === 0 ? (
          <div className="empty-state">
            <BarChart2 size={64} className="empty-icon" />
            <h2 className="empty-title">No Progress Data Yet</h2>
            <p className="empty-text">
              Complete some quizzes to see your learning progress and get personalized insights.
            </p>
          </div>
        ) : progressData ? (
          <>
            {/* Statistics Cards */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-card-icon stat-icon-primary">
                  <Award size={24} />
                </div>
                <div className="stat-card-content">
                  <p className="stat-label">Average Score</p>
                  <p className="stat-value">{progressData.statistics.averageScore}%</p>
                  {progressData.statistics.improvement !== 0 && (
                    <p className={`stat-change ${progressData.statistics.improvement > 0 ? 'positive' : 'negative'}`}>
                      {progressData.statistics.improvement > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                      {Math.abs(progressData.statistics.improvement)}% from last period
                    </p>
                  )}
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon stat-icon-secondary">
                  <BookOpen size={24} />
                </div>
                <div className="stat-card-content">
                  <p className="stat-label">Total Attempts</p>
                  <p className="stat-value">{progressData.statistics.totalAttempts}</p>
                  <p className="stat-description">Quizzes completed</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon stat-icon-accent">
                  <Clock size={24} />
                </div>
                <div className="stat-card-content">
                  <p className="stat-label">Avg. Time</p>
                  <p className="stat-value">{Math.round(progressData.statistics.averageTime / 60)}m</p>
                  <p className="stat-description">Per quiz</p>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-card-icon stat-icon-purple">
                  <Target size={24} />
                </div>
                <div className="stat-card-content">
                  <p className="stat-label">Best Subject</p>
                  <p className="stat-value-small">
                    {progressData.statistics.strongSubjects[0] || 'N/A'}
                  </p>
                  <p className="stat-description">Top performing</p>
                </div>
              </div>
            </div>

            {/* AI Insights Section */}
            {aiInsights && (
              <div className="ai-insights-section">
                <div className="section-header">
                  <Zap className="section-icon" size={24} />
                  <h2 className="section-title">AI-Powered Insights</h2>
                </div>

                <div className="insights-grid">
                  {/* Overall Analysis */}
                  <div className="insight-card insight-card-full">
                    <h3 className="insight-title">Overall Analysis</h3>
                    <p className="insight-text">{aiInsights.overallAnalysis}</p>
                  </div>

                  {/* Strengths */}
                  <div className="insight-card">
                    <h3 className="insight-title">Your Strengths</h3>
                    <ul className="insight-list strength-list">
                      {aiInsights.strengths.map((strength, index) => (
                        <li key={index} className="insight-item">
                          <div className="insight-bullet strength-bullet"></div>
                          {strength}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Weaknesses */}
                  <div className="insight-card">
                    <h3 className="insight-title">Areas for Improvement</h3>
                    <ul className="insight-list weakness-list">
                      {aiInsights.weaknesses.map((weakness, index) => (
                        <li key={index} className="insight-item">
                          <div className="insight-bullet weakness-bullet"></div>
                          {weakness}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommendations */}
                  <div className="insight-card insight-card-full">
                    <h3 className="insight-title">Personalized Recommendations</h3>
                    <ul className="insight-list recommendation-list">
                      {aiInsights.recommendations.map((rec, index) => (
                        <li key={index} className="insight-item">
                          <div className="insight-bullet recommendation-bullet"></div>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Charts Section */}
            <div className="charts-grid">
              {/* Score Trend */}
              <div className="chart-card chart-card-large">
                <h3 className="chart-title">Score Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={getScoreTrendData()}>
                    <defs>
                      <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px'
                      }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="score" 
                      stroke="#8b5cf6" 
                      strokeWidth={2}
                      fill="url(#colorScore)" 
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Subject Performance */}
              <div className="chart-card">
                <h3 className="chart-title">Performance by Subject</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={getSubjectPerformanceData()}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="subject" stroke="#6b7280" />
                    <YAxis stroke="#6b7280" domain={[0, 100]} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: '#fff', 
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        padding: '12px'
                      }}
                    />
                    <Bar dataKey="averageScore" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Score Distribution */}
              <div className="chart-card">
                <h3 className="chart-title">Score Distribution</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={getAccuracyDistribution()}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry: any) => `${entry.name}: ${entry.count}`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="count"
                    >
                      {getAccuracyDistribution().map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Attempts */}
            <div className="recent-attempts-section">
              <h2 className="section-title">Recent Quiz Attempts</h2>
              <div className="attempts-list">
                {progressData.attempts.slice(0, 5).map((attempt) => (
                  <div key={attempt._id} className="attempt-card">
                    <div className="attempt-header">
                      <div>
                        <h4 className="attempt-title">{attempt.quiz_id.title}</h4>
                        <p className="attempt-subject">{attempt.quiz_id.subject}</p>
                      </div>
                      <div className="attempt-score-badge" style={{
                        backgroundColor: attempt.score >= 80 ? '#10b98120' : attempt.score >= 60 ? '#f59e0b20' : '#ef444420',
                        color: attempt.score >= 80 ? '#059669' : attempt.score >= 60 ? '#d97706' : '#dc2626'
                      }}>
                        {attempt.score}%
                      </div>
                    </div>
                    <div className="attempt-details">
                      <div className="attempt-detail">
                        <Target size={16} />
                        <span>{attempt.correct_answers}/{attempt.total_questions} correct</span>
                      </div>
                      <div className="attempt-detail">
                        <Clock size={16} />
                        <span>{Math.round(attempt.time_taken / 60)} minutes</span>
                      </div>
                      <div className="attempt-detail">
                        <Calendar size={16} />
                        <span>{new Date(attempt.completed_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </CollapsibleSidebar>
  );
}