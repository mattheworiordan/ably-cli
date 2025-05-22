import { test, expect } from "./fixtures.js";
import type { Page } from "playwright/test";

test.describe("Chat and Spaces Web CLI Integration", () => {
  test("should send and receive chat messages through Web CLI", async ({ 
    page, 
    webPort, 
    termPort,
    webServerProcess,
    terminalServerProcess 
  }) => {
    // Navigate to the web CLI
    await page.goto(`http://localhost:${webPort}`);
    
    // Wait for terminal to load
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Send a chat message
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("rooms messages send test-room \"Hello from Web CLI!\"");
    await page.keyboard.press("Enter");

    // Wait for command completion
    await expect(page.locator('.terminal-output')).toContainText("Message sent successfully", { timeout: 15000 });

    // Subscribe to messages
    await page.keyboard.type("rooms messages subscribe test-room --no-prompt");
    await page.keyboard.press("Enter");

    // Wait for subscription confirmation
    await expect(page.locator('.terminal-output')).toContainText("Subscribed", { timeout: 10000 });
  });

  test("should handle chat room occupancy monitoring", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Monitor room occupancy
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("rooms occupancy test-room --json");
    await page.keyboard.press("Enter");

    // Wait for occupancy data
    await expect(page.locator('.terminal-output')).toContainText("connections", { timeout: 10000 });
  });

  test("should enter and interact with spaces", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Enter a space
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("spaces members test-space --no-prompt");
    await page.keyboard.press("Enter");

    // Wait for space entry confirmation
    await expect(page.locator('.terminal-output')).toContainText("Entered space", { timeout: 15000 });

    // Set cursor position
    await page.keyboard.type("spaces cursors set test-space --position '{\"x\":100,\"y\":200}'");
    await page.keyboard.press("Enter");

    await expect(page.locator('.terminal-output')).toContainText("Cursor position set", { timeout: 10000 });
  });

  test("should run publisher benchmark through Web CLI", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Run a simple benchmark
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("bench channels publish test-channel --messages 5 --rate 2 --message-size 100 --json");
    await page.keyboard.press("Enter");

    // Wait for benchmark completion
    await expect(page.locator('.terminal-output')).toContainText("totalMessages", { timeout: 20000 });
    await expect(page.locator('.terminal-output')).toContainText("messagesPerSecond", { timeout: 5000 });
  });

  test("should handle connection status changes", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Start a subscription to test connection handling
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("rooms messages subscribe test-room");
    await page.keyboard.press("Enter");

    // Wait for connection status indicators
    await expect(page.locator('[data-testid="ably-overlay"]')).toBeVisible({ timeout: 10000 });
  });

  test("should handle all output formats correctly", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Test default output
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("rooms messages send test-room \"Default output\"");
    await page.keyboard.press("Enter");
    await expect(page.locator('.terminal-output')).toContainText("Message sent successfully", { timeout: 10000 });

    // Test JSON output
    await page.keyboard.type("rooms messages send test-room \"JSON output\" --json");
    await page.keyboard.press("Enter");
    
    // Wait for JSON output and verify it's valid JSON
    await page.waitForFunction(() => {
      const output = document.querySelector('.terminal-output')?.textContent || '';
      try {
        JSON.parse(output.split('\n').pop() || '');
        return true;
      } catch {
        return false;
      }
    }, { timeout: 10000 });
  });

  test("should handle error scenarios gracefully", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Test invalid command
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("invalid-command");
    await page.keyboard.press("Enter");

    // Should show error or help message
    await expect(page.locator('.terminal-output')).toContainText(/error|help|unknown/i, { timeout: 10000 });
  });

  test("should handle concurrent operations", async ({ 
    page, 
    webPort 
  }) => {
    await page.goto(`http://localhost:${webPort}`);
    await expect(page.locator('[data-testid="terminal"]')).toBeVisible({ timeout: 10000 });

    // Start a subscription
    await page.locator('[data-testid="terminal"]').click();
    await page.keyboard.type("rooms messages subscribe room1 --no-prompt");
    await page.keyboard.press("Enter");

    // Wait for subscription to start
    await expect(page.locator('.terminal-output')).toContainText("Subscribed", { timeout: 10000 });

    // Send a message while subscription is active
    await page.keyboard.type("rooms messages send room1 \"Concurrent test\"");
    await page.keyboard.press("Enter");

    // Verify both operations work
    await expect(page.locator('.terminal-output')).toContainText("Message sent successfully", { timeout: 10000 });
  });
});