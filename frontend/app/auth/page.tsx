'use client'

import { useState } from 'react'
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react'
import { authService } from '@/services/auth.service'
import Swal from 'sweetalert2'
import './auth-namespaced.css'
import { useAuthRedirect } from '@/app/hooks/useAuthRedirect';

type FormMode = 'login' | 'register'

interface FormData {
  email: string
  username: string
  password: string
  confirmPassword: string
}

interface FieldErrors {
  email: string
  username: string
  password: string
  confirmPassword: string
}

interface PasswordStrength {
  score: number
  label: string
  color: string
}

export default function AuthPage() {
  useAuthRedirect('/dashboard');
  const [formMode, setFormMode] = useState<FormMode>('login')
  const [formData, setFormData] = useState<FormData>({
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({
    email: '',
    username: '',
    password: '',
    confirmPassword: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const calculatePasswordStrength = (password: string): PasswordStrength => {
    if (!password) return { score: 0, label: '', color: '' }

    let score = 0
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    const isLongEnough = password.length >= 8

    if (hasUpperCase) score++
    if (hasLowerCase) score++
    if (hasNumber) score++
    if (hasSymbol) score++
    if (isLongEnough) score++

    if (score === 5) return { score: 5, label: 'Strong', color: '#22c55e' }
    if (score >= 3) return { score: 3, label: 'Medium', color: '#f59e0b' }
    return { score: 1, label: 'Weak', color: '#ef4444' }
  }

  const validatePasswordRequirements = (password: string) => {
    const hasUpperCase = /[A-Z]/.test(password)
    const hasLowerCase = /[a-z]/.test(password)
    const hasNumber = /\d/.test(password)
    const hasSymbol = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)

    if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSymbol) {
      return 'Password must include uppercase, lowercase, number, and symbol'
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters'
    }
    return ''
  }

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address'
    }
    return ''
  }

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setFieldErrors(prev => ({ ...prev, [field]: '' }))
  }

  const handleModeChange = (mode: FormMode) => {
    setFormMode(mode)
    setFormData({
      email: '',
      username: '',
      password: '',
      confirmPassword: ''
    })
    setFieldErrors({
      email: '',
      username: '',
      password: '',
      confirmPassword: ''
    })
    setShowPassword(false)
    setShowConfirmPassword(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFieldErrors({ email: '', username: '', password: '', confirmPassword: '' })
    setIsLoading(true)

    let hasErrors = false

    if (formMode === 'register') {
      const emailError = validateEmail(formData.email)
      if (emailError) {
        setFieldErrors(prev => ({ ...prev, email: emailError }))
        hasErrors = true
      }

      if (formData.username.length < 3) {
        setFieldErrors(prev => ({ ...prev, username: 'Username must be at least 3 characters' }))
        hasErrors = true
      }

      const passwordError = validatePasswordRequirements(formData.password)
      if (passwordError) {
        setFieldErrors(prev => ({ ...prev, password: passwordError }))
        hasErrors = true
      }

      if (formData.password !== formData.confirmPassword) {
        setFieldErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }))
        hasErrors = true
      }

      if (hasErrors) {
        setIsLoading(false)
        return
      }
    }

    try {
      if (formMode === 'register') {
        const response = await authService.register({
          email: formData.email,
          username: formData.username,
          password: formData.password
        })

        if (response.success) {
          await Swal.fire({
            icon: 'success',
            title: 'Account Created!',
            text: 'Your account has been created successfully. Please login to continue.',
            confirmButtonText: 'Login Now',
            confirmButtonColor: '#6366f1',
            showClass: {
              popup: 'animate__animated animate__fadeInDown'
            },
            hideClass: {
              popup: 'animate__animated animate__fadeOutUp'
            }
          })
          handleModeChange('login')
        }
      } else {
        const response = await authService.login({
          email: formData.email,
          password: formData.password
        })

        if (response.success && response.data?.user) {
          await Swal.fire({
            icon: 'success',
            title: 'Welcome Back!',
            text: 'Login successful!',
            timer: 1000,
            showConfirmButton: false,
            confirmButtonColor: '#6366f1',
            showClass: {
              popup: 'animate__animated animate__fadeInDown'
            },
            hideClass: {
              popup: 'animate__animated animate__fadeOutUp'
            }
          })
          setTimeout(() => {
            window.location.href = '/dashboard'
          }, 2000)
        }
      }
    } catch (error) {
      console.error('Authentication error:', error)

      let errorMessage = 'An unexpected error occurred. Please try again.'
      
      if (error instanceof Error) {
        errorMessage = error.message
      }

      await Swal.fire({
        icon: 'error',
        title: 'Oops...',
        text: errorMessage,
        confirmButtonText: 'Try Again',
        confirmButtonColor: '#6366f1',
        showClass: {
          popup: 'animate__animated animate__shakeX'
        }
      })

      setFieldErrors(prev => ({ ...prev, email: errorMessage }))
    } finally {
      setIsLoading(false)
    }
  }

  const passwordStrength = formMode === 'register' ? calculatePasswordStrength(formData.password) : null

  return (
    <div className="auth-page">
      <div className="gradient-bg"></div>
      <div className="bg-overlay"></div>
      
      <div className="floating-orb orb-1"></div>
      <div className="floating-orb orb-2"></div>
      <div className="floating-orb orb-3"></div>
      <div className="floating-orb orb-4"></div>
      
      <div className="auth-container">
        <div className="auth-card">
          <div className="two-column-layout">
            {/* Left Column - Logo */}
            <div className="logo-column">
              <div className="logo-container">
                <img src="/logo.png" alt="Memora AI Logo" className="logo-image" />
              </div>
            </div>

            {/* Right Column - Form */}
            <div className="form-column">
              <div className="auth-header">
                <h2 className="auth-title">
                  {formMode === 'login' ? 'Login to your account' : 'Create Account'}
                </h2>
                <p className="auth-subtitle">
                  {formMode === 'login' 
                    ? 'Your journey to mental wellness starts here'
                    : 'Sign up to get started with your account'
                  }
                </p>
              </div>

              <div className="mode-toggle">
                <button
                  onClick={() => handleModeChange('login')}
                  className={`mode-button ${formMode === 'login' ? 'active' : ''}`}
                >
                  Login
                </button>
                <button
                  onClick={() => handleModeChange('register')}
                  className={`mode-button ${formMode === 'register' ? 'active' : ''}`}
                >
                  Register
                </button>
              </div>

              <form onSubmit={handleSubmit} className="auth-form">
                {formMode === 'register' && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Email Address</label>
                      <div className="input-wrapper">
                        <Mail className="input-icon" size={18} />
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          placeholder="email@gmail.com"
                          className={`form-input ${fieldErrors.email ? 'input-error' : ''}`}
                          required
                          disabled={isLoading}
                        />
                      </div>
                      {fieldErrors.email && (
                        <div className="error-message">{fieldErrors.email}</div>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label">Username</label>
                      <div className="input-wrapper">
                        <User className="input-icon" size={18} />
                        <input
                          type="text"
                          value={formData.username}
                          onChange={(e) => handleInputChange('username', e.target.value)}
                          placeholder="Username"
                          className={`form-input ${fieldErrors.username ? 'input-error' : ''}`}
                          required
                          disabled={isLoading}
                          minLength={3}
                        />
                      </div>
                      {fieldErrors.username && (
                        <div className="error-message">{fieldErrors.username}</div>
                      )}
                    </div>
                  </>
                )}

                {formMode === 'login' && (
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <div className="input-wrapper">
                      <User className="input-icon" size={18} />
                      <input
                        type="text"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="Email"
                        className={`form-input ${fieldErrors.email ? 'input-error' : ''}`}
                        required
                        disabled={isLoading}
                      />
                    </div>
                    {fieldErrors.email && (
                      <div className="error-message">{fieldErrors.email}</div>
                    )}
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="input-wrapper">
                    <Lock className="input-icon" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="Password"
                      className={`form-input ${fieldErrors.password ? 'input-error' : ''}`}
                      required
                      disabled={isLoading}
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="password-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <div className="error-message">{fieldErrors.password}</div>
                  )}
                </div>

                {formMode === 'register' && (
                  <div className="form-group">
                    <label className="form-label">Confirm Password</label>
                    <div className="input-wrapper">
                      <Lock className="input-icon" size={18} />
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={formData.confirmPassword}
                        onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                        placeholder="Confirm password"
                        className={`form-input ${fieldErrors.confirmPassword ? 'input-error' : ''}`}
                        required
                        disabled={isLoading}
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="password-toggle"
                        aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    {fieldErrors.confirmPassword && (
                      <div className="error-message">{fieldErrors.confirmPassword}</div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  className="submit-button"
                  disabled={isLoading}  
                >
                  {isLoading ? 'Please wait...' : 
                    formMode === 'login' ? 'Login' : 'Sign Up'
                  }
                </button>
              </form>

              <div className="auth-footer">
                <p className="footer-text">
                  {formMode === 'login' 
                    ? "Don't have an account? " 
                    : "Already have an account? "
                  }
                  <button 
                    onClick={() => handleModeChange(formMode === 'login' ? 'register' : 'login')}
                    className="footer-link"
                  >
                    {formMode === 'login' ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}