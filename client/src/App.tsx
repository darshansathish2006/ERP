import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { MastersProvider } from './context/MastersContext';
import { FeedbackProvider } from './components/feedback';
import { PageLoading } from './components/ui';
import { AppShell } from './layout/AppShell';
import { LoginPage, RegisterPage, ResetPasswordPage } from './pages/auth/AuthPages';

const DashboardPage = lazy(() => import('./pages/Dashboard'));
const OpportunityListPage = lazy(() => import('./pages/opportunity/OpportunityList'));
const OpportunityFormPage = lazy(() => import('./pages/opportunity/OpportunityForm'));
const QuotesListPage = lazy(() => import('./pages/QuotesList'));
const QuotePage = lazy(() => import('./pages/quote/QuotePage'));
const ContactsPage = lazy(() => import('./pages/Contacts'));
const MastersPage = lazy(() => import('./pages/Masters'));
const SettingsPage = lazy(() => import('./pages/Settings'));
const ProfilePage = lazy(() => import('./pages/Profile'));
const ReportViewerPage = lazy(() => import('./reports/ReportViewer'));
const SmartQuotePublicPage = lazy(() => import('./pages/SmartQuotePublic'));
const NotFoundPage = lazy(() => import('./pages/NotFound'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div style={{ height: '100vh' }}><PageLoading /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ height: '100vh' }}><PageLoading /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

const fullPage = <div style={{ height: '100vh' }}><PageLoading /></div>;

export default function App() {
  return (
    <BrowserRouter>
      <FeedbackProvider>
        <AuthProvider>
          <Suspense fallback={fullPage}>
            <Routes>
              <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
              <Route path="/register" element={<PublicOnly><RegisterPage /></PublicOnly>} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/sq/:token" element={<SmartQuotePublicPage />} />
              <Route
                element={
                  <RequireAuth>
                    <MastersProvider>
                      <Suspense fallback={fullPage}>
                        <Outlet />
                      </Suspense>
                    </MastersProvider>
                  </RequireAuth>
                }
              >
                <Route path="/report/:quoteId/:reportKey" element={<ReportViewerPage />} />
                <Route path="/quote/:id" element={<QuotePage />} />
                <Route element={<AppShell />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Suspense fallback={<PageLoading />}><DashboardPage /></Suspense>} />
                  <Route path="/opportunity" element={<Suspense fallback={<PageLoading />}><OpportunityListPage /></Suspense>} />
                  <Route path="/opportunity/create" element={<Suspense fallback={<PageLoading />}><OpportunityFormPage /></Suspense>} />
                  <Route path="/opportunity/:id/edit" element={<Suspense fallback={<PageLoading />}><OpportunityFormPage /></Suspense>} />
                  <Route path="/quotes" element={<Suspense fallback={<PageLoading />}><QuotesListPage /></Suspense>} />
                  <Route path="/contacts" element={<Suspense fallback={<PageLoading />}><ContactsPage /></Suspense>} />
                  <Route path="/masters" element={<Suspense fallback={<PageLoading />}><MastersPage /></Suspense>} />
                  <Route path="/settings" element={<Suspense fallback={<PageLoading />}><SettingsPage /></Suspense>} />
                  <Route path="/profile" element={<Suspense fallback={<PageLoading />}><ProfilePage /></Suspense>} />
                  <Route path="*" element={<Suspense fallback={<PageLoading />}><NotFoundPage /></Suspense>} />
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </FeedbackProvider>
    </BrowserRouter>
  );
}
