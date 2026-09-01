import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';

// Mock next/navigation and its internal paths
const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
};

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

vi.mock('next/dist/client/components/navigation', () => ({
  useRouter: () => mockRouter,
}));

// Mock useAuth hook
const mockUseAuth = vi.fn();
vi.mock('../apps/frontend/src/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock react's useEffect to run synchronously
vi.mock('react', async (importOriginal) => {
  const original = await importOriginal<typeof import('react')>();
  return {
    ...original,
    useEffect: (cb: any) => cb(),
  };
});

import AuthGuard from '../apps/frontend/src/components/AuthGuard';

describe('AuthGuard Component Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should redirect to /login when not authenticated and not loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    const result = AuthGuard({
      children: React.createElement('div', null, 'Protected Content'),
    });

    expect(result).toBeNull();
    expect(mockPush).toHaveBeenCalledWith('/login');
  });

  it('should render loading state when loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    const result = AuthGuard({
      children: React.createElement('div', null, 'Protected Content'),
    });

    // Assert that the result is a loading UI
    expect(result).not.toBeNull();
    expect((result as any).props.className).toContain('min-h-screen');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('should render children when authenticated and not loading', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    const children = React.createElement(
      'div',
      { id: 'protected-child' },
      'Protected Content'
    );
    const result = AuthGuard({ children });

    // Should return children wrapped in a fragment
    expect(result).not.toBeNull();
    expect((result as any).props.children).toBe(children);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
