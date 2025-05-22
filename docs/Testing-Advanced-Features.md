# Advanced Features Test Coverage Documentation

This document outlines the comprehensive test coverage implemented for Ably CLI's advanced features including Chat (Rooms), Spaces, benchmarking tools, MCP server, and Web CLI functionality.

## Overview

The test coverage follows a three-tier approach:
- **Unit Tests (45%)**: Mock SDK methods and test command logic
- **Integration Tests (35%)**: Test feature lifecycle and state synchronization  
- **E2E/Playwright Tests (20%)**: Browser automation and real workflow testing

## Test Structure

### Unit Tests

Located in `test/unit/commands/` with the following structure:

```
test/unit/commands/
├── rooms/
│   └── messages/
│       ├── send.test.ts
│       └── subscribe.test.ts
├── spaces/
│   └── members.test.ts
├── bench/
│   └── publisher.test.ts
└── mcp/
    └── start-server.test.ts
```

#### Chat/Rooms Unit Tests

**File**: `test/unit/commands/rooms/messages/send.test.ts`
- Tests message sending with and without metadata
- Validates message interpolation ({{.Count}}, {{.Timestamp}})
- Tests multiple message sending with rate limiting
- Validates error handling for room attachment failures
- Tests JSON and pretty-JSON output formats
- Ensures proper resource cleanup

**File**: `test/unit/commands/rooms/messages/subscribe.test.ts`
- Tests message subscription establishment
- Validates message reception and callbacks
- Tests subscription cleanup and error handling
- Validates no-prompt flag behavior

#### Spaces Unit Tests

**File**: `test/unit/commands/spaces/members.test.ts`
- Tests space entry with profile data
- Validates member presence subscription
- Tests profile data JSON parsing
- Ensures proper space cleanup and resource management

#### Benchmarking Unit Tests

**File**: `test/unit/commands/bench/publisher.test.ts`
- Tests control envelope ordering (start, message, end)
- Validates message size generation
- Tests rate limiting compliance
- Validates metrics calculation (throughput, timing)
- Tests subscriber presence detection
- Ensures proper error handling

#### MCP Server Unit Tests

**File**: `test/unit/commands/mcp/start-server.test.ts`
- Tests MCP protocol implementation
- Validates JSON-RPC message handling
- Tests initialize, tools/list, and tools/call methods
- Validates error responses for unknown methods
- Tests graceful shutdown

### Integration Tests

Located in `test/integration/commands/` testing real SDK interactions:

**File**: `test/integration/commands/rooms/messages.test.ts`
- Tests complete Chat room lifecycle
- Validates message flow between send and subscribe
- Tests connection state change handling
- Validates resource cleanup under failure conditions
- Tests output format consistency

### E2E/Playwright Tests

Located in `test/e2e/web-cli/` for browser automation testing:

**File**: `test/e2e/web-cli/chat-spaces-integration.test.ts`
- Tests Web CLI terminal interaction
- Validates Chat commands in browser environment
- Tests Spaces collaboration scenarios
- Validates connection status handling
- Tests concurrent operations
- Validates output format rendering

### React Component Tests

Located in `packages/react-web-cli/src/` using Vitest:

**File**: `packages/react-web-cli/src/TerminalOverlay.test.tsx`
- Tests overlay rendering for different connection states
- Validates spinner animations
- Tests ASCII box border rendering
- Validates variant-specific styling
- Tests HTML content sanitization

## Mock Patterns

### Chat SDK Mocking

```typescript
const mockChatRoom = {
  attach: sandbox.stub().resolves(),
  messages: {
    send: sandbox.stub().resolves(),
    subscribe: sandbox.stub().returns({ unsubscribe: sandbox.stub() }),
    get: sandbox.stub().resolves([]),
    unsubscribeAll: sandbox.stub(),
    delete: sandbox.stub(),
    update: sandbox.stub(),
    reactions: {
      send: sandbox.stub(),
      subscribe: sandbox.stub(),
      get: sandbox.stub(),
    },
  },
  // ... other room features
};
```

### Spaces SDK Mocking

```typescript
const mockSpace = {
  members: {
    enter: sandbox.stub().resolves(),
    get: sandbox.stub().resolves([]),
    subscribe: sandbox.stub().returns({ unsubscribe: sandbox.stub() }),
    leave: sandbox.stub().resolves(),
  },
  cursors: {
    set: sandbox.stub(),
    get: sandbox.stub().resolves([]),
    subscribe: sandbox.stub(),
  },
  // ... other space features
};
```

## Test Configuration

### Prerequisites

Tests require:
- Node.js 18+
- All dependencies installed via `pnpm install`
- Environment variables for integration tests (see `.env.example`)

### Running Tests

```bash
# Run all advanced feature unit tests
pnpm test test/unit/commands/rooms test/unit/commands/spaces test/unit/commands/bench

# Run React component tests
pnpm --filter @ably/react-web-cli test

# Run Playwright E2E tests
pnpm test:playwright

# Run integration tests
pnpm test test/integration/commands/rooms
```

### Test Utilities

#### Chai + Sinon Setup

```typescript
import { expect } from "chai";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import chai from "chai";

chai.use(sinonChai);
```

#### Mock Registration for Integration Tests

```typescript
import { registerMock } from "../../test-utils.js";

// Register mocks for Chat SDK
registerMock("chatClient", mockChatClient);
registerMock("chatRoom", mockChatRoom);
registerMock("realtimeClient", mockRealtimeClient);
```

## Coverage Goals

The implemented tests achieve:
- **>70% coverage** for all advanced features
- **Unit test coverage** for all command parsing and business logic
- **Integration test coverage** for SDK interactions and lifecycles
- **E2E test coverage** for user workflows and browser compatibility
- **Component test coverage** for React UI elements

## Testing Best Practices

### Resource Management
- Always clean up Ably clients in `afterEach` hooks
- Use `sandbox.restore()` to reset all stubs
- Set `ABLY_CLI_TEST_MODE=true` for test environment

### Timing and Async Handling
- Use `sandbox.useFakeTimers()` for time-dependent tests
- Properly await async operations
- Handle Promise rejections explicitly

### Mock Validation
- Verify SDK methods are called with correct parameters
- Test both success and failure scenarios
- Validate output formats (default, JSON, pretty-JSON)

### Error Scenarios
- Test invalid input handling
- Validate connection failure recovery
- Test resource cleanup under error conditions

## Debugging Tests

For test debugging:
```bash
# Show test output
ABLY_CLI_TEST_SHOW_OUTPUT=true pnpm test

# Run single test file
pnpm test test/unit/commands/rooms/messages/send.test.ts

# Debug Playwright tests
pnpm test:playwright --debug
```

## Future Enhancements

Potential areas for expansion:
- Performance benchmarking validation
- Cross-browser compatibility testing
- Mobile device testing
- Load testing for concurrent operations
- Visual regression testing for UI components

## Troubleshooting

Common issues and solutions:
- **Timeout errors**: Check for proper async/await usage and resource cleanup
- **Mock assertion failures**: Ensure sinon-chai is properly imported and configured
- **Playwright failures**: Verify terminal server is running and accessible
- **React component errors**: Check for proper mock setup in Vitest configuration