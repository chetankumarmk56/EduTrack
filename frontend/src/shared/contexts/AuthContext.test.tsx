import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';

// Control what /auth/me resolves to per test. authApi is the only network
// surface AuthContext touches on mount.
const mocked = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/features/auth/api', () => ({
  authApi: { getMe: mocked.getMe, logout: mocked.logout },
}));

function Probe() {
  const { authState, user } = useAuth();
  return (
    <div>
      <span data-testid="state">{authState}</span>
      <span data-testid="user">{user?.name ?? 'none'}</span>
    </div>
  );
}

function renderProvider() {
  return render(
    <MemoryRouter initialEntries={['/parent/dashboard']}>
      <AuthProvider>
        <Probe />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AuthContext hydration', () => {
  beforeEach(() => {
    localStorage.clear();
    mocked.getMe.mockReset();
    // AuthContext reads window.location.pathname (not the router) inside
    // its hydration effect. jsdom defaults to '/', which isPublicPath()
    // treats as the public landing page — hydration short-circuits to
    // 'unauthenticated' and never calls /auth/me. Keep jsdom's URL in
    // sync with the MemoryRouter entry so the effect behaves like a real
    // browser on the dashboard route.
    window.history.pushState({}, '', '/parent/dashboard');
  });

  it('becomes authenticated when /auth/me succeeds', async () => {
    mocked.getMe.mockResolvedValue({
      id: 60,
      name: 'Test Parent',
      role: 'parent',
      institution_id: 1,
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('state').textContent).toBe('authenticated'),
    );
    expect(screen.getByTestId('user').textContent).toBe('Test Parent');
    // The user hint is cached for instant paint on the next load.
    expect(localStorage.getItem('edu_user_parent')).toContain('Test Parent');
  });

  it('becomes unauthenticated when /auth/me rejects (no stale session kept)', async () => {
    mocked.getMe.mockRejectedValue(new Error('401'));

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('state').textContent).toBe('unauthenticated'),
    );
    expect(screen.getByTestId('user').textContent).toBe('none');
    expect(localStorage.getItem('edu_user_parent')).toBeNull();
  });

  it('does not adopt a session whose role mismatches the portal', async () => {
    // A teacher token on the parent portal must NOT authenticate the parent UI.
    mocked.getMe.mockResolvedValue({
      id: 9,
      name: 'Wrong Role',
      role: 'teacher',
      institution_id: 1,
    });

    renderProvider();

    await waitFor(() =>
      expect(screen.getByTestId('state').textContent).toBe('unauthenticated'),
    );
  });
});
