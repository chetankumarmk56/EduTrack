import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import GuestRoute from './GuestRoute';

// Mutable auth value the mocked useAuth returns; each test sets it.
const mocked = vi.hoisted(() => ({
  auth: { authState: 'loading' as string, user: null as { role: string } | null },
}));

vi.mock('@/shared/contexts/AuthContext', () => ({
  useAuth: () => mocked.auth,
}));

beforeEach(() => {
  mocked.auth = { authState: 'loading', user: null };
});

/** Render a ProtectedRoute at `path` with marker routes for the redirect targets. */
function renderProtected(path: string, allowedRoles: string[]) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute allowedRoles={allowedRoles as never}>
              <div>PROTECTED_CONTENT</div>
            </ProtectedRoute>
          }
        />
        <Route path="/admin-login" element={<div>ADMIN_LOGIN</div>} />
        <Route path="/parent/dashboard" element={<div>PARENT_HOME</div>} />
        <Route path="/teacher/dashboard" element={<div>TEACHER_HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProtectedRoute', () => {
  it('shows a loading spinner (no content) while auth is resolving', () => {
    mocked.auth = { authState: 'loading', user: null };
    const { container } = renderProtected('/admin/directory', ['admin']);
    expect(screen.queryByText('PROTECTED_CONTENT')).toBeNull();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('redirects unauthenticated users to the role-appropriate login', () => {
    mocked.auth = { authState: 'unauthenticated', user: null };
    renderProtected('/admin/directory', ['admin']);
    expect(screen.getByText('ADMIN_LOGIN')).toBeInTheDocument();
    expect(screen.queryByText('PROTECTED_CONTENT')).toBeNull();
  });

  it('renders children when authenticated with an allowed role', () => {
    mocked.auth = { authState: 'authenticated', user: { role: 'admin' } };
    renderProtected('/admin/directory', ['admin']);
    expect(screen.getByText('PROTECTED_CONTENT')).toBeInTheDocument();
  });

  it('redirects an authenticated user whose role is NOT allowed (no content leak)', () => {
    mocked.auth = { authState: 'authenticated', user: { role: 'parent' } };
    renderProtected('/admin/directory', ['admin']);
    expect(screen.queryByText('PROTECTED_CONTENT')).toBeNull();
    expect(screen.getByText('PARENT_HOME')).toBeInTheDocument();
  });
});

describe('GuestRoute', () => {
  function renderGuest() {
    return render(
      <MemoryRouter initialEntries={['/admin-login']}>
        <Routes>
          <Route
            path="/admin-login"
            element={
              <GuestRoute>
                <div>LOGIN_FORM</div>
              </GuestRoute>
            }
          />
          <Route path="/admin/directory" element={<div>ADMIN_HOME</div>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('shows the login form for unauthenticated visitors', () => {
    mocked.auth = { authState: 'unauthenticated', user: null };
    renderGuest();
    expect(screen.getByText('LOGIN_FORM')).toBeInTheDocument();
  });

  it('bounces an already-authenticated user away from the login page', () => {
    mocked.auth = { authState: 'authenticated', user: { role: 'admin' } };
    renderGuest();
    expect(screen.queryByText('LOGIN_FORM')).toBeNull();
    expect(screen.getByText('ADMIN_HOME')).toBeInTheDocument();
  });
});
