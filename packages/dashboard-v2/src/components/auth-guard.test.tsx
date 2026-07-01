// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthGuard } from "./auth-guard";
import { removeStoredToken, setStoredToken, getStoredToken } from "@/lib/api";

describe("AuthGuard Component", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    removeStoredToken();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    cleanup();
  });

  const renderGuard = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <div data-testid="protected-content">Secret Operations</div>
        </AuthGuard>
      </QueryClientProvider>
    );

  it("renders login screen when no API token is stored", () => {
    renderGuard();
    expect(screen.queryByTestId("protected-content")).toBeNull();
    expect(screen.getByText("JiGit Control Room")).toBeDefined();
    expect(screen.getByPlaceholderText(/jgt_live_/)).toBeDefined();
  });

  it("renders protected children when valid token is present", () => {
    setStoredToken("test-token-123");
    renderGuard();
    expect(screen.getByTestId("protected-content")).toBeDefined();
    expect(screen.queryByText("JiGit Control Room")).toBeNull();
  });

  it("authenticates and saves token on form submit", () => {
    renderGuard();
    const input = screen.getByPlaceholderText(/jgt_live_/);
    const submitBtn = screen.getByRole("button", { name: /Authenticate Access/i });

    fireEvent.change(input, { target: { value: "my-secret-key" } });
    fireEvent.click(submitBtn);

    expect(getStoredToken()).toBe("my-secret-key");
    expect(screen.getByTestId("protected-content")).toBeDefined();
  });

  it("shows error if form submitted with empty token", () => {
    renderGuard();
    const submitBtn = screen.getByRole("button", { name: /Authenticate Access/i });

    fireEvent.click(submitBtn);

    expect(screen.getByText("API token cannot be empty.")).toBeDefined();
    expect(screen.queryByTestId("protected-content")).toBeNull();
  });

  it("transitions to login screen when jigit:auth-unauthorized event is dispatched", () => {
    setStoredToken("valid-key");
    renderGuard();
    expect(screen.getByTestId("protected-content")).toBeDefined();

    fireEvent(window, new CustomEvent("jigit:auth-unauthorized"));

    expect(screen.queryByTestId("protected-content")).toBeNull();
    expect(screen.getByText(/Session expired or invalid API token/i)).toBeDefined();
  });
});
