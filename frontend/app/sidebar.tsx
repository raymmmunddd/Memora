'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Home, MessageSquare, ClipboardList, History, Settings, ChevronLeft, ChevronRight, Sparkles, LogOut, Menu, X, Goal } from 'lucide-react';
import { authService } from '@/services/auth.service';
import Swal from 'sweetalert2';

interface SidebarProps {
  children: React.ReactNode;
}

export default function CollapsibleSidebar({ children }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768) {
        setIsCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const menuItems = [
    {
      icon: Home,
      label: 'Dashboard',
      href: '/dashboard',
    },
    {
      icon: MessageSquare,
      label: 'AI Chat',
      href: '/chat',
    },
    {
      icon: ClipboardList,
      label: 'Generate Quiz',
      href: '/quiz',
    },
    {
      icon: History,
      label: 'Quiz History',
      href: '/history',
    },
    {
      icon: Goal,
      label: 'Progress',
      href: '/progress',
    },
    {
      icon: Settings,
      label: 'Profile',
      href: '/profile',
    },
  ];

  const handleLogout = async () => {
    const result = await Swal.fire({
      title: 'Logout Confirmation',
      text: 'Are you sure you want to logout?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#8b5cf6',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel',
      background: '#1f1f1f',
      color: '#ffffff',
      customClass: {
        popup: 'swal-dark-popup',
        title: 'swal-dark-title',
        htmlContainer: 'swal-dark-text',
        confirmButton: 'swal-confirm-button',
        cancelButton: 'swal-cancel-button'
      }
    });

    if (result.isConfirmed) {
      try {
        // Show loading state
        Swal.fire({
          title: 'Logging out...',
          text: 'Please wait',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          background: '#1f1f1f',
          color: '#ffffff',
          didOpen: () => {
            Swal.showLoading();
          }
        });

        await authService.logout();
        
        // Show success message
        await Swal.fire({
          title: 'Logged Out!',
          text: 'You have been successfully logged out.',
          icon: 'success',
          timer: 1500,
          showConfirmButton: false,
          background: '#1f1f1f',
          color: '#ffffff',
          customClass: {
            popup: 'swal-dark-popup'
          }
        });

        router.push('/auth');
      } catch (error) {
        console.error('Logout failed:', error);
        
        // Show error message
        Swal.fire({
          title: 'Error!',
          text: 'Failed to logout. Please try again.',
          icon: 'error',
          confirmButtonColor: '#8b5cf6',
          background: '#1f1f1f',
          color: '#ffffff',
          customClass: {
            popup: 'swal-dark-popup',
            confirmButton: 'swal-confirm-button'
          }
        });
      }
    }
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleLinkClick = () => {
    if (isMobile) {
      setIsCollapsed(true);
    }
  };

  return (
    <div className="sidebar-layout">
      <style jsx global>{`
        .sidebar-layout {
          display: flex;
          min-height: 100vh;
          background-color: #1a1a1a;
          position: relative;
        }

        .mobile-menu-button {
          position: fixed;
          top: 1rem;
          left: 1rem;
          z-index: 1001;
          background-color: rgba(31, 31, 31, 0.8);
          backdrop-filter: blur(8px);
          border: 1px solid rgba(42, 42, 42, 0.6);
          color: #d1d5db;
          padding: 0.75rem;
          border-radius: 0.5rem;
          cursor: pointer;
          display: none;
          align-items: center;
          justify-content: center;
          transition: all 200ms ease;
        }

        .mobile-menu-button:hover {
          background-color: rgba(42, 42, 42, 0.9);
          color: white;
        }

        .sidebar-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background-color: rgba(0, 0, 0, 0.5);
          z-index: 998;
        }

        .sidebar {
          background-color: #1f1f1f;
          border-right: 1px solid #2a2a2a;
          transition: width 300ms cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          display: flex;
          flex-direction: column;
          height: 100vh;
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .sidebar.expanded {
          width: 240px;
        }

        .sidebar.collapsed {
          width: 72px;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          padding: 1.25rem 1rem;
          gap: 0.75rem;
          border-bottom: 1px solid #2a2a2a;
          min-height: 72px;
        }

        .sidebar.collapsed .sidebar-header {
          justify-content: center;
          padding: 1.25rem 0.5rem;
        }

        .sidebar-logo {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          text-decoration: none;
          transition: opacity 300ms ease;
          flex: 1;
        }

        .sidebar.collapsed .sidebar-logo {
          display: none;
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          background: linear-gradient(135deg, #8b5cf6, #ec4899);
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          flex-shrink: 0;
        }

        .logo-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 0.5rem;
        }

        .logo-text {
          font-size: 1.25rem;
          font-weight: 700;
          color: white;
          white-space: nowrap;
          opacity: 1;
          transition: opacity 200ms ease;
        }

        .collapse-toggle {
          background: transparent;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 0.5rem;
          transition: all 300ms ease;
          flex-shrink: 0;
        }

        .collapse-toggle:hover {
          background-color: #2a2a2a;
          color: white;
        }

        .sidebar-nav {
          flex: 1;
          padding: 1rem 0.5rem;
          overflow-y: auto;
        }

        .nav-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .nav-item {
          width: 100%;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          color: #d1d5db;
          text-decoration: none;
          border-radius: 0.75rem;
          transition: all 300ms ease;
          font-size: 0.9375rem;
          font-weight: 500;
          white-space: nowrap;
        }

        .sidebar.collapsed .nav-link {
          justify-content: center;
          padding: 0.75rem;
        }

        .nav-link:hover {
          background-color: #2a2a2a;
          color: white;
        }

        .nav-link.active {
          background-color: #374151;
          color: white;
        }

        .nav-icon {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
        }

        .nav-label {
          opacity: 1;
          transition: opacity 200ms ease;
        }

        .sidebar.collapsed .nav-label {
          opacity: 0;
          width: 0;
          overflow: hidden;
        }

        .sidebar-footer {
          padding: 1rem;
          border-top: 1px solid #2a2a2a;
        }

        .logout-button {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          width: 100%;
          padding: 0.75rem 1rem;
          color: #d1d5db;
          background: transparent;
          border: none;
          border-radius: 0.75rem;
          transition: all 300ms ease;
          font-size: 0.9375rem;
          font-weight: 500;
          cursor: pointer;
          white-space: nowrap;
        }

        .sidebar.collapsed .logout-button {
          justify-content: center;
          padding: 0.75rem;
        }

        .logout-button:hover {
          background-color: #2a2a2a;
          color: white;
        }

        .logout-icon {
          flex-shrink: 0;
          width: 20px;
          height: 20px;
        }

        .logout-label {
          opacity: 1;
          transition: opacity 200ms ease;
        }

        .sidebar.collapsed .logout-label {
          opacity: 0;
          width: 0;
          overflow: hidden;
        }

        .main-content {
          flex: 1;
          min-width: 0;
        }

        /* SweetAlert2 Custom Styles */
        .swal-dark-popup {
          border: 1px solid #2a2a2a !important;
          border-radius: 1rem !important;
        }

        .swal-dark-title {
          font-weight: 600 !important;
          font-size: 1.5rem !important;
        }

        .swal-dark-text {
          color: #d1d5db !important;
        }

        .swal-confirm-button {
          border-radius: 0.5rem !important;
          padding: 0.75rem 1.5rem !important;
          font-weight: 500 !important;
          transition: all 200ms ease !important;
        }

        .swal-confirm-button:hover {
          opacity: 0.9 !important;
          transform: translateY(-1px) !important;
        }

        .swal-cancel-button {
          border-radius: 0.5rem !important;
          padding: 0.75rem 1.5rem !important;
          font-weight: 500 !important;
          transition: all 200ms ease !important;
        }

        .swal-cancel-button:hover {
          opacity: 0.9 !important;
        }

        @media (max-width: 768px) {
          .mobile-menu-button {
            display: flex;
          }

          .sidebar-overlay {
            display: block;
            opacity: 0;
            pointer-events: none;
            transition: opacity 300ms ease;
          }

          .sidebar-overlay.active {
            opacity: 1;
            pointer-events: auto;
          }

          .sidebar {
            position: fixed;
            left: 0;
            top: 0;
            bottom: 0;
            z-index: 999;
            transform: translateX(-100%);
            transition: transform 300ms cubic-bezier(0.4, 0, 0.2, 1);
          }

          .sidebar.expanded {
            width: 280px;
            transform: translateX(0);
          }

          .sidebar.collapsed {
            width: 280px;
            transform: translateX(-100%);
          }

          .main-content {
            width: 100%;
          }

          .collapse-toggle {
            display: none;
          }
        }
      `}</style>

      {/* Mobile menu button */}
      {isMobile && (
        <button 
          className="mobile-menu-button"
          onClick={toggleSidebar}
          aria-label="Toggle menu"
        >
          {!isCollapsed ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}

      {/* Mobile overlay */}
      <div 
        className={`sidebar-overlay ${!isCollapsed && isMobile ? 'active' : ''}`}
        onClick={() => isMobile && setIsCollapsed(true)}
      />

      <aside className={`sidebar ${isCollapsed ? 'collapsed' : 'expanded'}`}>
        <div className="sidebar-header">
          <Link href="/dashboard" className="sidebar-logo" onClick={handleLinkClick}>
            <div className="logo-icon">
              <img src="/memmora.png" alt="Memora AI Logo" className="logo-image" />
            </div>
            <span className="logo-text">Memora AI</span>
          </Link>
          {!isMobile && (
            <button
              className="collapse-toggle"
              onClick={toggleSidebar}
              aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
            </button>
          )}
        </div>

        <nav className="sidebar-nav">
          <ul className="nav-list">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <li key={item.href} className="nav-item">
                  <Link
                    href={item.href}
                    className={`nav-link ${isActive ? 'active' : ''}`}
                    onClick={handleLinkClick}
                  >
                    <Icon className="nav-icon" size={20} />
                    <span className="nav-label">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button className="logout-button" onClick={handleLogout}>
            <LogOut className="logout-icon" size={20} />
            <span className="logout-label">Logout</span>
          </button>
        </div>
      </aside>

      <main className="main-content">{children}</main>
    </div>
  );
}