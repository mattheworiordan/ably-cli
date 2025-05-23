/**
 * Test utilities for integration tests
 *
 * This file provides utilities to help with integration testing of the CLI
 */


// --- Basic Mock Interfaces ---
// Define basic interfaces for common mock structures to replace 'any'

interface MockPresence {
  get: () => Promise<unknown[]>; // Use unknown[] for presence data flexibility
  subscribe: (...args: unknown[]) => void;
  enter: (...args: unknown[]) => Promise<unknown>;
  leave: (...args: unknown[]) => Promise<unknown>;
  // Add other presence methods if needed
}

interface MockChannel {
  name: string;
  publish: (...args: unknown[]) => Promise<unknown>;
  subscribe: (...args: unknown[]) => void;
  presence: MockPresence;
  history: (...args: unknown[]) => Promise<{ items: unknown[] }>; // Use unknown[] for history data flexibility
  attach: () => Promise<unknown>;
  detach: () => Promise<unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow additional properties for specific tests
}

interface MockAuth {
  clientId?: string;
  requestToken: (...args: unknown[]) => Promise<unknown>; // Token structure can vary
  createTokenRequest: (...args: unknown[]) => Promise<unknown>; // Token request structure can vary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow additional properties
}

interface MockOptions {
  key?: string;
  clientId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Allow additional properties
}

// --- Main Mock Interfaces ---

// Type declaration for global mocks
interface AblyRestMock {
  // Allow any for flexibility in mocks, specific tests should override/validate
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request: (...args: any[]) => any;
  channels: {
    get: (channelName: string) => MockChannel; // Use MockChannel interface
  };
  auth: MockAuth; // Use MockAuth interface
  options: MockOptions; // Use MockOptions interface
  close: () => void;
  connection?: {
    once: (event: string, cb: (...args: unknown[]) => void) => void; // Use unknown[]
    on: (event: string, cb: (...args: unknown[]) => void) => void; // Use unknown[]
    off: (event: string, cb: (...args: unknown[]) => void) => void; // Use unknown[]
    close: () => void;
    state: string;
    id?: string;
    key?: string;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Keep index signature for flexibility
}

interface TestMocks {
  ablyRestMock: AblyRestMock;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any; // Keep index signature for flexibility
}

// Define the global variable type
declare global {

  var __TEST_MOCKS__: TestMocks | undefined;
}

/**
 * Returns true if we're running in test mode
 */
export function isTestMode(): boolean {
  return process.env.ABLY_CLI_TEST_MODE === 'true';
}

/**
 * Gets the mock Ably Rest client from the global test mocks
 */
export function getMockAblyRest(): AblyRestMock {
  if (!isTestMode() || !globalThis.__TEST_MOCKS__) {
    throw new Error('Not running in test mode or test mocks not set up');
  }
  return globalThis.__TEST_MOCKS__.ablyRestMock;
}

/**
 * Registers a mock for use in tests
 * @param key The key to register the mock under
 * @param mock The mock object
 */
export function registerMock<T>(key: string, mock: T): void {
  if (!globalThis.__TEST_MOCKS__) {
    // Provide a more structured default mock
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: {
        // Default successful empty list response for Control API usually
        request: () => Promise.resolve({ statusCode: 200, items: [], headers: new Map(), status: 200 }),
        channels: {
          // Provide a default channel mock that can be overridden
          get: (channelName: string): MockChannel => ({
            name: channelName,
            publish: async () => ({}), // Mock publish
            subscribe: () => {},      // Mock subscribe
            presence: {              // Mock presence
              get: async () => ([]),
              subscribe: () => {},
              enter: async () => ({}),
              leave: async () => ({}),
            },
            history: async () => ({ items: [] }), // Mock history
            attach: async () => ({}),
            detach: async () => ({}),
          }),
        },
        auth: { // Add a basic auth object
          clientId: "mock-clientId",
          requestToken: async () => ({ token: "mock-token" }),
          createTokenRequest: async () => ({ keyName: "mock-keyName" }),
        },
        options: { // Add basic options
          key: "mock-app.key:secret",
          clientId: "mock-clientId",
        },
        close: () => {},
        connection: { // Add basic connection mock for Realtime tests
          once: (event: string, cb: () => void) => { if (event === 'connected') setTimeout(cb, 0); },
          on: () => {}, // Mock .on() as well
          off: () => {}, // Mock .off()
          close: () => {}, // Mock connection.close()
          state: 'initialized', // Provide a default state
          id: 'mock-connection-id',
          key: 'mock-connection-key'
        }
      }
    };
  }
  globalThis.__TEST_MOCKS__[key] = mock;
}

/**
 * Gets a registered mock
 * @param key The key of the mock to get
 */
export function getMock<T>(key: string): T {
  // Check for test mode first
  if (!isTestMode()) {
    throw new Error('Attempted to get mock outside of test mode');
  }
  // Check if mocks object exists and has the key
  if (!globalThis.__TEST_MOCKS__ || !(key in globalThis.__TEST_MOCKS__)) {
    throw new Error(`Mock not found for key: ${key}`);
  }
  return globalThis.__TEST_MOCKS__[key] as T;
}
