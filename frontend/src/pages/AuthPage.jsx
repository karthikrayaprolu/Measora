import { useState, useId } from 'react';
import { useNavigate, Link, Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FormInput({ label, id, type, value, onChange, error, hint, icon, autoComplete, autoFocus }) {
  const [showPassword, setShowPassword] = useState(false);
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  
  const isPassword = type === 'password';
  const inputType = isPassword && showPassword ? 'text' : type;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', position: 'relative' }}>
      <label htmlFor={inputId} className="text-label" style={{ marginBottom: 'var(--space-1)' }}>
        {label}
      </label>
      
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          type={inputType}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          aria-invalid={!!error}
          aria-describedby={`${error ? errorId : ''} ${hint ? hintId : ''}`.trim()}
          style={{
            width: '100%',
            height: '50px',
            padding: '13px 16px',
            paddingRight: isPassword ? '48px' : '16px',
            background: 'var(--color-surface)',
            border: `1px solid ${error ? 'var(--color-danger)' : 'var(--color-border-strong)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-ink)',
            fontSize: 'var(--text-base)',
            fontFamily: 'var(--font-sans)',
            transition: 'border-color 150ms ease, box-shadow 150ms ease'
          }}
        />
        
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            style={{
              position: 'absolute',
              right: '4px',
              top: '4px',
              bottom: '4px',
              width: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-ink-muted)',
              cursor: 'pointer',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        )}
      </div>

      {error ? (
        <span id={errorId} style={{ color: 'var(--color-danger)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: '4px' }}>
          <AlertCircle size={14} />
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className="text-caption" style={{ marginTop: '4px' }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [successMsg, setSuccessMsg] = useState(null);
  
  const navigate = useNavigate();
  const { user } = useAuth();
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const handleForgotPassword = async () => {
    if (!email) {
      setFieldErrors(prev => ({ ...prev, email: 'Enter your email address first' }));
      return;
    }
    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (err) {
      setFormError(err.message || 'Could not send reset email. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  if (user) {
    return <Navigate to="/app" replace />;
  }

  const validateForm = () => {
    const errors = {};
    let isValid = true;

    if (!isLogin && !name.trim()) {
      errors.name = 'Please enter your full name';
      isValid = false;
    }
    
    if (!email) {
      errors.email = 'Email address is required';
      isValid = false;
    } else if (!EMAIL_REGEX.test(email)) {
      errors.email = 'Enter a valid email address';
      isValid = false;
    }
    
    if (!password) {
      errors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 8 && !isLogin) {
      errors.password = 'Password must be at least 8 characters';
      isValid = false;
    }

    setFieldErrors(errors);
    return isValid;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);
    
    if (!validateForm()) return;
    
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Abstract authentication errors for security
          throw new Error('Incorrect email or password');
        }
        navigate('/app', { replace: true });
      } else {
        const { error } = await supabase.auth.signUp({ 
          email, 
          password,
          options: { data: { full_name: name } }
        });
        if (error) throw error;
        setSuccessMsg("Account created! Check your email to confirm your account.");
        setIsLogin(true); // Switch to login view gracefully
      }
    } catch (err) {
      setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFormError(null);
    setFieldErrors({});
    setSuccessMsg(null);
    setPassword('');
  };

  return (
    <div className="app-page" style={{ display: 'grid', placeItems: 'center', padding: 'var(--space-6)', minHeight: '100dvh' }}>
      
      <div style={{ width: '100%', maxWidth: '440px' }}>
        
        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
          <Link to="/" className="brand" aria-label="Return to Measora home" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="brand-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <path d="M4 12h16" />
                <path d="M12 4v16" />
              </svg>
            </div>
            Measora
          </Link>
          <h1 className="text-display-md" style={{ color: 'var(--color-ink)', textAlign: 'center' }}>
            {isLogin ? 'Sign in to your account' : 'Create an account'}
          </h1>
          <p className="text-body-sm" style={{ color: 'var(--color-ink-muted)', marginTop: 'var(--space-2)' }}>
            {isLogin ? 'Enter your details to continue' : 'Start measuring with precision'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="card" style={{ position: 'relative' }}>
          {/* Subtle signature element bounding the top of the interaction */}
          <div className="ruler-ticks" style={{ height: '14px', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-6)' }} aria-hidden="true" />
          
          <div style={{ padding: '0 var(--space-6) var(--space-6)' }}>
            
            <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              
              {/* Form-level Messaging */}
              {formError && (
                <div style={{ padding: 'var(--space-3)', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)' }} role="alert">
                  <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{formError}</span>
                </div>
              )}

              {successMsg && (
                <div style={{ padding: 'var(--space-3)', background: 'var(--color-success-bg)', color: 'var(--color-success)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)' }} role="status">
                  {successMsg}
                </div>
              )}

              {/* Fields */}
              {!isLogin && (
                <FormInput
                  label="Full name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  error={fieldErrors.name}
                  autoComplete="name"
                  autoFocus
                />
              )}

              <FormInput
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={fieldErrors.email}
                autoComplete="email"
                autoFocus={isLogin}
              />
              
              <FormInput
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={fieldErrors.password}
                hint={!isLogin ? "Minimum 8 characters" : null}
                autoComplete={isLogin ? "current-password" : "new-password"}
              />

              {isLogin && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
                  {resetSent ? (
                    <span style={{ color: 'var(--color-success)', fontSize: 'var(--text-sm)' }}>
                      Reset link sent — check your inbox.
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={resetLoading}
                      style={{ background: 'none', border: 'none', color: 'var(--color-brass)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      {resetLoading ? 'Sending…' : 'Forgot password?'}
                    </button>
                  )}
                </div>
              )}

              {/* Submit Button */}
              <button 
                type="submit" 
                className="button button--primary button--full" 
                disabled={loading}
                style={{ marginTop: 'var(--space-2)' }}
              >
                {loading && <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>}
                {loading ? 'Please wait...' : (isLogin ? 'Sign in' : 'Create account')}
              </button>
            </form>

            <div style={{ marginTop: 'var(--space-6)', paddingTop: 'var(--space-5)', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
              <span className="text-body-sm" style={{ color: 'var(--color-ink-muted)' }}>
                {isLogin ? "Don't have an account? " : "Already have an account? "}
              </span>
              <button 
                onClick={toggleMode}
                style={{ background: 'none', border: 'none', color: 'var(--color-ink)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                className="text-body-sm"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}
