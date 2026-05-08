import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AuthPage from "@/app/auth/page";
import { login } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/store/auth";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("@/lib/api/endpoints", () => ({
  login: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  signInWithGoogle: vi.fn(),
}));

vi.mock("@/lib/analytics", () => ({
  captureUIError: vi.fn(),
  identifyUser: vi.fn(),
  track: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const mockLogin = vi.mocked(login);

function resetAuthStore() {
  useAuthStore.setState({
    token: null,
    refreshToken: null,
    expiresAt: null,
    profile: null,
    orgId: null,
    propertyId: null,
    _hasHydrated: false,
  });
}

describe("login form", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    resetAuthStore();
  });

  it("renders email and password fields", () => {
    render(<AuthPage />);

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
    expect(screen.getByLabelText(/^password$/i)).toBeTruthy();
  });

  it("shows validation errors when submitted empty", async () => {
    render(<AuthPage />);

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText("Enter a valid email")).toBeTruthy();
    expect(screen.getByText("Password must be at least 8 characters")).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("navigates to dashboard after a successful login response", async () => {
    mockLogin.mockResolvedValue({
      access_token: "not-a-real-jwt",
      token_type: "bearer",
      expires_in: 3600,
      refresh_token: "refresh-token",
      profile: {
        user_id: "user-1",
        email: "chef@example.com",
        full_name: "Test Chef",
        org_id: "org-1",
        org_name: "Neumas Test",
        property_id: "property-1",
        property_name: "Main Kitchen",
        role: "admin",
      },
    });

    render(<AuthPage />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "chef@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "correct-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({
        email: "chef@example.com",
        password: "correct-password",
      });
      expect(replace).toHaveBeenCalledWith("/dashboard");
    });
  });
});
