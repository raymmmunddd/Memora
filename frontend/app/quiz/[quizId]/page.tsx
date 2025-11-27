'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CollapsibleSidebar from '@/app/sidebar';
import { authService } from '@/services/auth.service';
import {
  Clock,
  CheckCircle,
  XCircle,
  ArrowRight,
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import './take-quiz-namespaced.css';

interface Question {
  _id: string;
  question_text: string;
  question_type: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
}

interface Quiz {
  _id: string;
  title: string;
  quiz_type: string;
  difficulty: string;
  time_limit: number | null;
  questions: Question[];
}

interface Answer {
  question_id: string;
  user_answer: string;
  time_spent: number;
}

interface CurrentUser {
  name: string;
  email: string;
}

const TakeQuizPage: React.FC = () => {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
  const params = useParams();
  const router = useRouter();
  const quizId = params.quizId as string;

  const [user, setUser] = useState<CurrentUser | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [answers, setAnswers] = useState<Map<string, string>>(new Map());
  const [startTime, setStartTime] = useState<Date>(new Date());
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [showIncompleteWarning, setShowIncompleteWarning] = useState<boolean>(false);
  const [progressLoaded, setProgressLoaded] = useState<boolean>(false);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to auth changes
  useEffect(() => {
    const currentToken = authService.getToken();
    setToken(currentToken);

    if (!currentToken) {
      setError('You must be logged in to take a quiz.');
      setLoading(false);
      router.push('/auth');
      return;
    }

    const unsubscribe = authService.subscribe((u) => {
      if (u) {
        setUser({ name: u.username, email: u.email });
      } else {
        setUser(null);
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (token) {
      fetchQuiz();
    } else if (token === null) {
      setLoading(false);
      setError('You must be logged in to take a quiz.');
    }
  }, [quizId, token]);

  // Load saved progress when quiz loads - FIXED VERSION
  useEffect(() => {
    if (quiz && token && !progressLoaded) {
      loadQuizProgress();
    }
  }, [quiz, token, progressLoaded]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining !== null && timeRemaining > 0 && !isSubmitting && progressLoaded) {
      timerRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev === null || prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            handleSubmitQuiz(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else if (timeRemaining === 0 && !isSubmitting) {
      handleSubmitQuiz(true);
    }
  }, [timeRemaining, isSubmitting, progressLoaded]);

  // Auto-save progress every 10 seconds
  useEffect(() => {
    if (quiz && !isSubmitting && progressLoaded) {
      saveIntervalRef.current = setInterval(() => {
        saveQuizProgress();
      }, 10000);

      return () => {
        if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
      };
    }
  }, [quiz, currentQuestionIndex, answers, timeRemaining, isSubmitting, progressLoaded]);

  const fetchQuiz = async () => {
    if (!token) {
      setError('You must be logged in to view this quiz.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/quiz/${quizId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        setError('Unauthorized. Please log in again.');
        router.push('/auth');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch quiz');
      }

      const data = await response.json();
      setQuiz(data.quiz);
      setError('');
    } catch (err) {
      setError('Failed to load quiz. Please try again.');
      console.error('Fetch quiz error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadQuizProgress = async () => {
    try {
      console.log('🔄 Loading saved progress...');
      const response = await fetch(`${API_BASE_URL}/quiz/${quizId}/progress`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.progress && !data.progress.is_completed) {
          console.log('✅ Loaded saved progress:', data.progress);
          
          // Restore question index
          setCurrentQuestionIndex(data.progress.current_question_index || 0);
          
          // Restore answers
          const answersMap = new Map();
          if (data.progress.answers) {
            Object.entries(data.progress.answers).forEach(([key, value]) => {
              answersMap.set(key, value as string);
            });
          }
          setAnswers(answersMap);
          console.log('✅ Restored', answersMap.size, 'answers');
          
          // Restore time remaining
          if (data.progress.time_remaining !== null && data.progress.time_remaining !== undefined) {
            setTimeRemaining(data.progress.time_remaining);
            console.log('✅ Restored time remaining:', data.progress.time_remaining);
          } else if (quiz?.time_limit) {
            // If no saved time, initialize with quiz time limit
            setTimeRemaining(quiz.time_limit * 60);
            console.log('⏱️ Initialized time with quiz limit:', quiz.time_limit * 60);
          }
          
          // Restore start time
          if (data.progress.start_time) {
            setStartTime(new Date(data.progress.start_time));
            console.log('✅ Restored start time:', data.progress.start_time);
          }
        } else {
          console.log('ℹ️ No saved progress found or quiz already completed');
          // Initialize time for new attempt
          if (quiz?.time_limit && timeRemaining === null) {
            setTimeRemaining(quiz.time_limit * 60);
            console.log('⏱️ Initialized time for new attempt:', quiz.time_limit * 60);
          }
        }
      } else {
        console.log('ℹ️ No saved progress available');
        // Initialize time for new attempt
        if (quiz?.time_limit && timeRemaining === null) {
          setTimeRemaining(quiz.time_limit * 60);
          console.log('⏱️ Initialized time for new attempt:', quiz.time_limit * 60);
        }
      }
    } catch (err) {
      console.error('❌ Failed to load progress:', err);
      // Initialize time even on error
      if (quiz?.time_limit && timeRemaining === null) {
        setTimeRemaining(quiz.time_limit * 60);
      }
    } finally {
      setProgressLoaded(true);
      console.log('✅ Progress loading complete');
    }
  };

  const saveQuizProgress = async () => {
    if (!token || !quiz || isSubmitting) return;

    try {
      const answersObj: Record<string, string> = {};
      answers.forEach((value, key) => {
        answersObj[key] = value;
      });

      await fetch(`${API_BASE_URL}/quiz/${quizId}/save-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentQuestionIndex,
          answers: answersObj,
          startTime: startTime.toISOString(),
          timeRemaining,
        }),
      });
      
      console.log('💾 Progress auto-saved');
    } catch (err) {
      console.error('❌ Failed to save progress:', err);
    }
  };

  const handleAnswerChange = (questionId: string, answer: string) => {
    setAnswers((prev) => new Map(prev).set(questionId, answer));
    setShowIncompleteWarning(false);
    
    // Save immediately when answer changes
    setTimeout(() => saveQuizProgress(), 100);
  };

  const handleNextQuestion = () => {
    if (quiz && currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
    }
  };

  const areAllQuestionsAnswered = (): boolean => {
    if (!quiz) return false;
    return quiz.questions.every((q) => {
      const answer = answers.get(q._id);
      return answer !== undefined && answer.trim() !== '';
    });
  };

  const getUnansweredQuestions = (): number[] => {
    if (!quiz) return [];
    return quiz.questions
      .map((q, index) => {
        const answer = answers.get(q._id);
        return answer === undefined || answer.trim() === '' ? index : -1;
      })
      .filter((index) => index !== -1);
  };

  const handleSubmitQuiz = async (forceSubmit: boolean = false) => {
    if (!quiz || !token || isSubmitting) return;

    // Only show warning if NOT forced by timer and questions are incomplete
    if (!forceSubmit && !areAllQuestionsAnswered()) {
      setShowIncompleteWarning(true);
      const unanswered = getUnansweredQuestions();
      if (unanswered.length > 0) {
        setCurrentQuestionIndex(unanswered[0]);
      }
      return;
    }

    setIsSubmitting(true);
    setError('');

    if (timerRef.current) clearInterval(timerRef.current);
    if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);

    try {
      const completedAt = new Date();
      
      // Create answer array - ensure all questions have an entry
      // For unanswered questions, use empty string as user_answer
      const answerArray: Answer[] = quiz.questions.map((q) => {
        const userAnswer = answers.get(q._id);
        return {
          question_id: q._id,
          user_answer: userAnswer !== undefined && userAnswer !== null ? userAnswer.trim() : '',
          time_spent: 0,
        };
      });

      console.log('Submitting answers:', {
        total: answerArray.length,
        answered: answerArray.filter(a => a.user_answer !== '').length,
        unanswered: answerArray.filter(a => a.user_answer === '').length,
        forcedByTimer: forceSubmit
      });

      const response = await fetch(`${API_BASE_URL}/quiz/${quizId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          answers: answerArray,
          startedAt: startTime.toISOString(),
          completedAt: completedAt.toISOString(),
          forcedByTimer: forceSubmit,
        }),
      });

      if (response.status === 401) {
        setError('Unauthorized. Please log in again.');
        router.push('/auth');
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Submit error:', errorData);
        throw new Error(errorData.error || 'Failed to submit quiz');
      }

      const data = await response.json();
      
      await clearQuizProgress();
      
      router.push(`/quiz/${quizId}/results?attemptId=${data.attempt._id}`);
    } catch (err) {
      console.error('Submit quiz error:', err);
      setError('Failed to submit quiz. Please try again.');
      setIsSubmitting(false);
    }
  };

  const clearQuizProgress = async () => {
    if (!token) return;
    
    try {
      await fetch(`${API_BASE_URL}/quiz/${quizId}/save-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentQuestionIndex: 0,
          answers: {},
          startTime: new Date().toISOString(),
          timeRemaining: null,
          isCompleted: true,
        }),
      });
      console.log('🗑️ Progress cleared');
    } catch (err) {
      console.error('Failed to clear progress:', err);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgress = (): number => {
    if (!quiz) return 0;
    return Math.round(((currentQuestionIndex + 1) / quiz.questions.length) * 100);
  };

  if (loading) {
    return (
      <CollapsibleSidebar>
        <div className="quiz-loading">
          <Loader2 className="spinner" />
          <p>Loading quiz...</p>
        </div>
      </CollapsibleSidebar>
    );
  }

  if (error || !quiz) {
    return (
      <CollapsibleSidebar>
        <div className="quiz-error">
          <XCircle className="error-icon" />
          <p>{error || 'Quiz not found'}</p>
          {error.includes('log in') && (
            <button 
              className="btn-primary" 
              onClick={() => router.push('/auth')}
              style={{ marginTop: '1rem' }}
            >
              Go to Login
            </button>
          )}
        </div>
      </CollapsibleSidebar>
    );
  }

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const currentAnswer = answers.get(currentQuestion._id) || '';
  const allAnswered = areAllQuestionsAnswered();
  const unansweredCount = getUnansweredQuestions().length;

  return (
    <CollapsibleSidebar>
      <div className="take-quiz-page">
        <div className="quiz-header-bar">
          <div className="quiz-info">
            <h1 className="quiz-title">{quiz.title}</h1>
            <div className="quiz-meta">
              <span className={`difficulty-badge difficulty-${quiz.difficulty}`}>
                {quiz.difficulty}
              </span>
              <span className="question-count">
                Question {currentQuestionIndex + 1} of {quiz.questions.length}
              </span>
            </div>
          </div>

          {timeRemaining !== null && (
            <div className="timer">
              <Clock className="timer-icon" />
              <span className={timeRemaining < 60 ? 'timer-warning' : ''}>
                {formatTime(timeRemaining)}
              </span>
            </div>
          )}
        </div>

        <div className="progress-container">
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${getProgress()}%` }} />
          </div>
          <span className="progress-text">{getProgress()}% Complete</span>
        </div>

        {showIncompleteWarning && (
          <div className="incomplete-warning" style={{
            backgroundColor: '#fef3c7',
            border: '1px solid #f59e0b',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <AlertCircle style={{ color: '#f59e0b', flexShrink: 0 }} size={20} />
            <div>
              <strong style={{ color: '#92400e' }}>Incomplete Quiz</strong>
              <p style={{ margin: '4px 0 0 0', color: '#78350f', fontSize: '14px' }}>
                Please answer all questions before submitting. You have {unansweredCount} unanswered question{unansweredCount !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        )}

        <div className="question-card">
          <div className="question-header">
            <span className="question-number">Question {currentQuestionIndex + 1}</span>
            <span className="question-type-badge">
              {currentQuestion.question_type === 'multiple-choice' ? 'Multiple Choice' : 'Fill in the Blank'}
            </span>
          </div>

          <p className="question-text">{currentQuestion.question_text}</p>

          <div className="answer-section">
            {currentQuestion.question_type === 'multiple-choice' ? (
              <div className="options-grid">
                {currentQuestion.options?.map((option, index) => (
                  <button
                    key={index}
                    className={`option-button ${
                      currentAnswer === option ? 'selected' : ''
                    }`}
                    onClick={() => handleAnswerChange(currentQuestion._id, option)}
                  >
                    <div className="option-radio">
                      {currentAnswer === option && <div className="option-radio-selected" />}
                    </div>
                    <span className="option-text">{option}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="fill-blank-section">
                <input
                  type="text"
                  className="fill-blank-input"
                  placeholder="Type your answer here..."
                  value={currentAnswer}
                  onChange={(e) => handleAnswerChange(currentQuestion._id, e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="question-navigation">
            <button
              className="nav-button"
              onClick={handlePreviousQuestion}
              disabled={currentQuestionIndex === 0}
            >
              <ArrowLeft className="nav-icon" />
              Previous
            </button>

            {currentQuestionIndex === quiz.questions.length - 1 ? (
              <button
                className="submit-button"
                onClick={() => handleSubmitQuiz(false)}
                disabled={isSubmitting || !allAnswered}
                style={{
                  opacity: !allAnswered && !isSubmitting ? 0.5 : 1,
                  cursor: !allAnswered && !isSubmitting ? 'not-allowed' : 'pointer'
                }}
                title={!allAnswered ? 'Please answer all questions before submitting' : ''}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="nav-icon animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="nav-icon" />
                    Submit Quiz {!allAnswered && `(${unansweredCount} unanswered)`}
                  </>
                )}
              </button>
            ) : (
              <button className="nav-button nav-button-primary" onClick={handleNextQuestion}>
                Next
                <ArrowRight className="nav-icon" />
              </button>
            )}
          </div>
        </div>

        <div className="question-grid-card">
          <h3 className="grid-title">
            Questions Overview 
            <span style={{ fontSize: '14px', fontWeight: 'normal', marginLeft: '8px', color: '#6b7280' }}>
              ({answers.size}/{quiz.questions.length} answered)
            </span>
          </h3>
          <div className="question-grid">
            {quiz.questions.map((q, index) => (
              <button
                key={q._id}
                className={`grid-item ${index === currentQuestionIndex ? 'current' : ''} ${
                  answers.has(q._id) && answers.get(q._id)?.trim() !== '' ? 'answered' : ''
                }`}
                onClick={() => setCurrentQuestionIndex(index)}
              >
                <span>{index + 1}</span>
                {answers.has(q._id) && answers.get(q._id)?.trim() !== '' && (
                  <CheckCircle className="answered-icon" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </CollapsibleSidebar>
  );
};

export default TakeQuizPage;
