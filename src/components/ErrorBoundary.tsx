import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { t as translate, getInitialLang } from '../utils/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Styles are inline rather than in App.css on purpose: this screen has to
// render when the app's own render tree just failed, so it must not depend on
// anything the failure could have taken with it — and keeping it out of the
// stylesheet guarantees it cannot affect the normal UI.
const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 99999,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '16px',
  padding: '24px',
  background: '#0a0a0a',
  color: '#e8e8e8',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  textAlign: 'center',
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: '18px',
  letterSpacing: '0.08em',
  color: '#ff5f56',
};

const descStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: '32em',
  fontSize: '13px',
  lineHeight: 1.7,
  opacity: 0.85,
};

const detailStyle: React.CSSProperties = {
  margin: 0,
  maxWidth: '32em',
  fontSize: '11px',
  lineHeight: 1.5,
  opacity: 0.5,
  wordBreak: 'break-word',
};

const buttonStyle: React.CSSProperties = {
  padding: '12px 28px',
  fontSize: '14px',
  fontFamily: 'inherit',
  letterSpacing: '0.08em',
  color: '#0a0a0a',
  background: '#e8e8e8',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
};

/**
 * Catches render errors anywhere below it and offers a way out.
 *
 * Without this, an unexpected exception unmounts the whole tree and leaves a
 * blank white screen — on set that means an operator holding a dead phone
 * mid-take with no button to press and no indication of what happened. The
 * fallback is deliberately minimal: a statement of what happened and a reload
 * control, in the operator's own language.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Unhandled render error', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Read the language at render time rather than holding it in state: the
    // provider persists every change, so this reflects whatever the operator
    // last selected, even though the boundary sits outside the provider.
    const lang = getInitialLang();

    return (
      <div style={overlayStyle} role="alert">
        <h1 style={titleStyle}>{translate('error.boundaryTitle', lang)}</h1>
        <p style={descStyle}>{translate('error.boundaryDesc', lang)}</p>
        {error.message && <p style={detailStyle}>{error.message}</p>}
        <button type="button" style={buttonStyle} onClick={this.handleReload}>
          {translate('error.boundaryReload', lang)}
        </button>
      </div>
    );
  }
}
