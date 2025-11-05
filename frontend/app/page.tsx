import React from 'react';
import { ArrowRight, MessageSquare, HelpCircle, TrendingUp, Zap, Clock, BarChart2, BookOpen } from 'lucide-react';
import './page.css';

export default function MemoraLanding() {
  return (
    <div className="landing-page">
      {/* Background */}
      <div className="gradient-bg"></div>
      <div className="bg-overlay"></div>
      <div className="floating-orb orb-1"></div>
      <div className="floating-orb orb-2"></div>
      <div className="floating-orb orb-3"></div>
      <div className="floating-orb orb-4"></div>

      {/* Navigation */}
      <nav className="navbar">
        <div className="nav-container">
          <div className="nav-logo">
            <span className="logo-text">Memora AI</span>
          </div>
          <div className="nav-links">
            <a href="#home" className="nav-link">Home</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#about" className="nav-link">About</a>
            <a href="/auth" className="btn-primary btn-nav">Get Started</a>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {/* Home Section */}
        <section id="home" className="hero-section">
          <div className="container">
            <div className="hero-content">
              <h1 className="hero-title">
                Your Smart
                <span className="title-gradient"> Study Partner</span>
              </h1>
              
              <p className="hero-description">
                Learn smarter, not harder with AI-powered personalized lessons and adaptive quizzes that adapt to your unique learning style.
              </p>
              
              <div className="hero-buttons">
                <a href="/auth" className="btn-primary btn-large">
                  <span>Get Started Free</span>
                  <ArrowRight className="btn-icon" />
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="features-section">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Powerful Features</h2>
              <p className="section-description">
                Everything you need to excel in your studies
              </p>
            </div>
            
            <div className="features-grid">
              <a href="/auth" className="feature-card">
                <div className="feature-icon icon-primary">
                  <MessageSquare size={32} />
                </div>
                <h3 className="feature-title">AI Tutor</h3>
                <p className="feature-description">
                  Get personalized explanations and answers to all your study questions instantly.
                </p>
                <span className="feature-link">Try it now →</span>
              </a>

              <a href="/auth" className="feature-card">
                <div className="feature-icon icon-secondary">
                  <HelpCircle size={32} />
                </div>
                <h3 className="feature-title">Smart Quiz Generator</h3>
                <p className="feature-description">
                  Generate adaptive quizzes from your notes that evolve with your learning progress.
                </p>
                <span className="feature-link">Create quiz →</span>
              </a>

              <a href="/auth" className="feature-card">
                <div className="feature-icon icon-accent">
                  <TrendingUp size={32} />
                </div>
                <h3 className="feature-title">Progress Tracker</h3>
                <p className="feature-description">
                  Visual analytics to track your learning journey and identify areas for improvement.
                </p>
                <span className="feature-link">View progress →</span>
              </a>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="why-section">
          <div className="container">
            <div className="section-header">
              <h2 className="section-title">Why Memora AI?</h2>
              <p className="section-description">
                Revolutionizing the way students learn with cutting-edge AI technology designed for modern education
              </p>
            </div>
            
            <div className="benefits-grid">
              <div className="benefit-card">
                <div className="benefit-icon icon-primary-light">
                  <Zap size={32} />
                </div>
                <h3 className="benefit-title">Personalized Learning</h3>
                <p className="benefit-description">
                  Our AI adapts to your unique learning style and pace, creating customized study plans that maximize retention and understanding.
                </p>
              </div>
              
              <div className="benefit-card">
                <div className="benefit-icon icon-secondary-light">
                  <Clock size={32} />
                </div>
                <h3 className="benefit-title">24/7 Study Support</h3>
                <p className="benefit-description">
                  Get instant answers to your questions anytime, anywhere. No more waiting for office hours or study groups.
                </p>
              </div>
              
              <div className="benefit-card">
                <div className="benefit-icon icon-accent-light">
                  <BarChart2 size={32} />
                </div>
                <h3 className="benefit-title">Smart Analytics</h3>
                <p className="benefit-description">
                  Track your progress with detailed analytics that show exactly where you're excelling and where you need more focus.
                </p>
              </div>
              
              <div className="benefit-card">
                <div className="benefit-icon icon-purple-light">
                  <BookOpen size={32} />
                </div>
                <h3 className="benefit-title">Any Subject, Any Level</h3>
                <p className="benefit-description">
                  From high school biology to graduate-level physics, Memora AI has you covered with comprehensive knowledge across all disciplines.
                </p>
              </div>
            </div>
            
            {/* CTA Section */}
            <div className="cta-section">
              <div className="cta-card">
                <h3 className="cta-title">Ready to Transform Your Learning?</h3>
                <p className="cta-description">
                  Join thousands of students who are already learning smarter with Memora AI
                </p>
                <a href="/auth" className="btn-primary btn-large">
                  <span>Start Learning Free</span>
                  <ArrowRight className="btn-icon" />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}