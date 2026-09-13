import { Component, createRef, type ErrorInfo, type JSX, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button, buttonStyles } from '../components/ui/button';
import { CopyButton } from '../components/ui/copy-button';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';

function generateIncidentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `incident-${Math.random().toString(36).slice(2, 10)}`;
}

interface ErrorBoundaryImplProps {
  children: ReactNode;
  pathname: string;
  strings: DashboardStrings['errorBoundary'];
}

interface ErrorBoundaryImplState {
  hasError: boolean;
  incidentId: string;
}

/** Issue #228: React only recognises getDerivedStateFromError and
 *  componentDidCatch on class components, so the catching boundary cannot be
 *  a function component. DashboardErrorBoundary below supplies it with i18n
 *  strings and the current route, keyed by pathname so navigating away from
 *  the broken page (including via this boundary's own "back to the to-do
 *  list" link) remounts a clean instance rather than carrying the error
 *  across routes. */
class ErrorBoundaryImpl extends Component<ErrorBoundaryImplProps, ErrorBoundaryImplState> {
  override state: ErrorBoundaryImplState = { hasError: false, incidentId: '' };

  private headingRef = createRef<HTMLHeadingElement>();

  static getDerivedStateFromError(): ErrorBoundaryImplState {
    return { hasError: true, incidentId: generateIncidentId() };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only, tagged with the same incident id shown on screen. No
    // prospect data, draft text, or tokens ever pass through here - only the
    // thrown error and React's own component stack, which name components
    // and props types, not the values the operator was looking at.
    console.error(`[dashboard error ${this.state.incidentId}]`, error, info.componentStack);
  }

  override componentDidMount(): void {
    // A render that throws on first mount sets hasError via
    // getDerivedStateFromError before the commit React calls this from, so
    // the fallback can already be on screen the first time this fires - the
    // componentDidUpdate case below only covers a later error, once the
    // boundary already mounted successfully once.
    if (this.state.hasError) {
      this.headingRef.current?.focus();
    }
  }

  override componentDidUpdate(
    _prevProps: ErrorBoundaryImplProps,
    prevState: ErrorBoundaryImplState,
  ): void {
    if (!prevState.hasError && this.state.hasError) {
      this.headingRef.current?.focus();
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, incidentId: '' });
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    const { strings, pathname } = this.props;
    const diagnostics = `${strings.routeLabel}: ${pathname}\n${strings.incidentLabel}: ${this.state.incidentId}`;
    return (
      <div
        role="alert"
        className="mx-auto flex w-full max-w-reading flex-col items-start gap-4 rounded-xl border border-line-strong bg-panel p-8"
      >
        <AlertTriangle className="size-6 text-danger" aria-hidden="true" />
        <h1
          ref={this.headingRef}
          tabIndex={-1}
          className="text-xl font-semibold tracking-tight outline-none"
        >
          {strings.heading}
        </h1>
        <p className="text-sm text-ink-muted">{strings.description}</p>
        <dl className="ident space-y-0.5 text-xs text-ink-muted">
          <div>
            <dt className="inline">{strings.routeLabel}: </dt>
            <dd className="inline">{pathname}</dd>
          </div>
          <div>
            <dt className="inline">{strings.incidentLabel}: </dt>
            <dd className="inline">{this.state.incidentId}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={this.handleRetry}>{strings.retryButton}</Button>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            {strings.reloadButton}
          </Button>
          <Link to="/a-traiter" className={buttonStyles('ghost')}>
            {strings.homeButton}
          </Link>
          <CopyButton
            text={diagnostics}
            label={strings.copyButton}
            copiedLabel={strings.copiedLabel}
          />
        </div>
      </div>
    );
  }
}

/** Wraps the routed page content below the shell (nav sidebar, header) stays
 *  up so a broken page still leaves the operator a way to navigate out. Not
 *  placed above the shell or around <App />: the login page renders outside
 *  the shell entirely and is unaffected either way. */
export function DashboardErrorBoundary({ children }: { children: ReactNode }): JSX.Element {
  const { strings } = useI18n();
  const location = useLocation();
  return (
    <ErrorBoundaryImpl
      key={location.pathname}
      pathname={location.pathname}
      strings={strings.errorBoundary}
    >
      {children}
    </ErrorBoundaryImpl>
  );
}
