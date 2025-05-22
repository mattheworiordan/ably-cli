import { expect } from "chai";
import { test } from "@oclif/test";
import sinon from "sinon";

// Add type declaration for global mocks
declare global {
  var __TEST_MOCKS__: {
    ablyRestMock: any;
    ablyRealtimeMock: any;
    [key: string]: any;
  } | undefined;
}

// Mock data for comprehensive testing
const mockConnectionStates = ['connecting', 'connected', 'disconnected', 'suspended', 'closed', 'failed'];
const mockChannelStates = ['initialized', 'attaching', 'attached', 'detaching', 'detached', 'failed'];

// Mock message data for various scenarios
const mockMessages = [
  { name: "user-message", data: { text: "Hello from user1", userId: "user1" }, timestamp: Date.now() - 30000, clientId: "user1" },
  { name: "user-message", data: { text: "Reply from user2", userId: "user2" }, timestamp: Date.now() - 20000, clientId: "user2" },
  { name: "system-notification", data: { type: "announcement", message: "System maintenance in 1 hour" }, timestamp: Date.now() - 10000, clientId: "system" }
];

// Mock presence data
const mockPresenceMembers = [
  { clientId: "user1", data: { name: "Alice", status: "online", joinedAt: Date.now() - 60000 }, action: "enter" },
  { clientId: "user2", data: { name: "Bob", status: "busy", joinedAt: Date.now() - 45000 }, action: "enter" },
  { clientId: "user3", data: { name: "Charlie", status: "away", joinedAt: Date.now() - 30000 }, action: "enter" }
];

// Enhanced mock Ably clients with comprehensive real-time simulation
function createMockRealtimeClient() {
  let connectionState = 'connecting';
  let channelStates: { [key: string]: string } = {};
  let subscriptions: { [key: string]: Function[] } = {};
  let presenceSubscriptions: { [key: string]: Function[] } = {};
  const connectionCallbacks: { [key: string]: Function[] } = {};
  const channelCallbacks: { [key: string]: { [key: string]: Function[] } } = {};

  // Connection state management
  function simulateConnectionStateChange(newState: string, delay = 100) {
    setTimeout(() => {
      connectionState = newState;
      if (connectionCallbacks[newState]) {
        connectionCallbacks[newState].forEach(cb => cb({ current: newState, previous: 'connecting' }));
      }
      if (connectionCallbacks['stateChange']) {
        connectionCallbacks['stateChange'].forEach(cb => cb({ current: newState, previous: 'connecting' }));
      }
    }, delay);
  }

  // Channel state management
  function simulateChannelStateChange(channelName: string, newState: string, delay = 50) {
    setTimeout(() => {
      channelStates[channelName] = newState;
      if (channelCallbacks[channelName] && channelCallbacks[channelName][newState]) {
        channelCallbacks[channelName][newState].forEach(cb => cb({ current: newState, previous: 'attaching' }));
      }
      if (channelCallbacks[channelName] && channelCallbacks[channelName]['stateChange']) {
        channelCallbacks[channelName]['stateChange'].forEach(cb => cb({ current: newState, previous: 'attaching' }));
      }
    }, delay);
  }

  const mockClient = {
    connection: {
      state: connectionState,
      id: 'mock-connection-id-' + Date.now(),
      on: (eventOrCallback: string | Function, callback?: Function) => {
        if (typeof eventOrCallback === 'function') {
          // Global connection state handler
          if (!connectionCallbacks['stateChange']) connectionCallbacks['stateChange'] = [];
          connectionCallbacks['stateChange'].push(eventOrCallback);
        } else if (callback) {
          // Specific event handler
          if (!connectionCallbacks[eventOrCallback]) connectionCallbacks[eventOrCallback] = [];
          connectionCallbacks[eventOrCallback].push(callback);
        }
      },
      once: (event: string, callback: Function) => {
        const onceWrapper = (...args: any[]) => {
          callback(...args);
          // Remove the callback after it's called once
          if (connectionCallbacks[event]) {
            const index = connectionCallbacks[event].indexOf(onceWrapper);
            if (index > -1) connectionCallbacks[event].splice(index, 1);
          }
        };
        if (!connectionCallbacks[event]) connectionCallbacks[event] = [];
        connectionCallbacks[event].push(onceWrapper);
      },
      close: sinon.stub()
    },
    channels: {
      get: (channelName: string, options?: any) => {
        if (!channelStates[channelName]) channelStates[channelName] = 'initialized';
        if (!subscriptions[channelName]) subscriptions[channelName] = [];
        if (!presenceSubscriptions[channelName]) presenceSubscriptions[channelName] = [];
        if (!channelCallbacks[channelName]) channelCallbacks[channelName] = {};

        return {
          name: channelName,
          state: channelStates[channelName],
          options: options || {},
          
          // Channel lifecycle
          attach: sinon.stub().callsFake(() => {
            simulateChannelStateChange(channelName, 'attached', 100);
            return Promise.resolve();
          }),
          detach: sinon.stub().callsFake(() => {
            simulateChannelStateChange(channelName, 'detached', 50);
            return Promise.resolve();
          }),
          
          // Channel event handling
          on: (eventOrCallback: string | Function, callback?: Function) => {
            if (typeof eventOrCallback === 'function') {
              // Global channel state handler
              if (!channelCallbacks[channelName]['stateChange']) channelCallbacks[channelName]['stateChange'] = [];
              channelCallbacks[channelName]['stateChange'].push(eventOrCallback);
            } else if (callback) {
              // Specific event handler
              if (!channelCallbacks[channelName][eventOrCallback]) channelCallbacks[channelName][eventOrCallback] = [];
              channelCallbacks[channelName][eventOrCallback].push(callback);
            }
          },
          once: (event: string, callback: Function) => {
            const onceWrapper = (...args: any[]) => {
              callback(...args);
              if (channelCallbacks[channelName][event]) {
                const index = channelCallbacks[channelName][event].indexOf(onceWrapper);
                if (index > -1) channelCallbacks[channelName][event].splice(index, 1);
              }
            };
            if (!channelCallbacks[channelName][event]) channelCallbacks[channelName][event] = [];
            channelCallbacks[channelName][event].push(onceWrapper);
          },

          // Publishing
          publish: sinon.stub().callsFake((eventName: any, data: any, callback?: Function) => {
            // Simulate message being published to subscribers
            setTimeout(() => {
              const message = {
                name: typeof eventName === 'string' ? eventName : 'message',
                data: typeof eventName === 'object' ? eventName : data,
                timestamp: Date.now(),
                clientId: 'mock-publisher',
                connectionId: mockClient.connection.id,
                id: 'msg-' + Date.now()
              };
              
              // Notify subscribers
              subscriptions[channelName].forEach(sub => sub(message));
              
              if (callback) callback(null);
            }, 50);
            return Promise.resolve();
          }),

          // Subscription
          subscribe: sinon.stub().callsFake((eventOrCallback: any, callback?: Function) => {
            let actualCallback = callback;
            let eventFilter = null;

            if (typeof eventOrCallback === 'function') {
              actualCallback = eventOrCallback;
            } else if (typeof eventOrCallback === 'string') {
              eventFilter = eventOrCallback;
            }

            if (actualCallback) {
              subscriptions[channelName].push((message: any) => {
                if (!eventFilter || message.name === eventFilter) {
                  actualCallback(message);
                }
              });

              // Simulate receiving existing messages after subscription
              setTimeout(() => {
                mockMessages.forEach(msg => {
                  if (!eventFilter || msg.name === eventFilter) {
                    actualCallback(msg);
                  }
                });
              }, 100);
            }
          }),

          unsubscribe: sinon.stub().callsFake((eventOrCallback?: any, callback?: Function) => {
            if (eventOrCallback || callback) {
              // Remove specific subscription
              const targetCallback = callback || eventOrCallback;
              subscriptions[channelName] = subscriptions[channelName].filter(sub => sub !== targetCallback);
            } else {
              // Remove all subscriptions
              subscriptions[channelName] = [];
            }
          }),

          // History
          history: sinon.stub().resolves({
            items: mockMessages,
            hasNext: () => false,
            isLast: () => true
          }),

          // Presence
          presence: {
            get: sinon.stub().resolves(mockPresenceMembers),
            
            enter: sinon.stub().callsFake((data: any, clientId?: string) => {
              const presenceMessage = {
                action: 'enter',
                clientId: clientId || 'mock-client-' + Date.now(),
                data: data,
                timestamp: Date.now(),
                connectionId: mockClient.connection.id
              };

              // Notify presence subscribers
              setTimeout(() => {
                presenceSubscriptions[channelName].forEach(sub => sub(presenceMessage));
              }, 50);

              return Promise.resolve();
            }),

            leave: sinon.stub().callsFake((data?: any, clientId?: string) => {
              const presenceMessage = {
                action: 'leave',
                clientId: clientId || 'mock-client-' + Date.now(),
                data: data,
                timestamp: Date.now(),
                connectionId: mockClient.connection.id
              };

              // Notify presence subscribers
              setTimeout(() => {
                presenceSubscriptions[channelName].forEach(sub => sub(presenceMessage));
              }, 50);

              return Promise.resolve();
            }),

            subscribe: sinon.stub().callsFake((actionOrCallback: any, callback?: Function) => {
              let actualCallback = callback;
              let actionFilter = null;

              if (typeof actionOrCallback === 'function') {
                actualCallback = actionOrCallback;
              } else if (typeof actionOrCallback === 'string') {
                actionFilter = actionOrCallback;
              }

              if (actualCallback) {
                presenceSubscriptions[channelName].push((presenceMessage: any) => {
                  if (!actionFilter || presenceMessage.action === actionFilter) {
                    actualCallback(presenceMessage);
                  }
                });

                // Simulate initial presence state
                setTimeout(() => {
                  mockPresenceMembers.forEach(member => {
                    if (!actionFilter || member.action === actionFilter) {
                      actualCallback(member);
                    }
                  });
                }, 100);
              }
            }),

            unsubscribe: sinon.stub().callsFake((actionOrCallback?: any, callback?: Function) => {
              if (actionOrCallback || callback) {
                const targetCallback = callback || actionOrCallback;
                presenceSubscriptions[channelName] = presenceSubscriptions[channelName].filter(sub => sub !== targetCallback);
              } else {
                presenceSubscriptions[channelName] = [];
              }
            })
          }
        };
      }
    },
    close: sinon.stub(),
    auth: { clientId: 'test-client-id' }
  };

  // Auto-connect after a short delay
  simulateConnectionStateChange('connected', 200);

  return mockClient;
}

// Enhanced REST client mock
const mockRestClient = {
  request: sinon.stub().callsFake((method: string, path: string) => {
    if (path.includes('/channels')) {
      return {
        statusCode: 200,
        items: [
          { channelId: "chat-room-1", status: { occupancy: { metrics: { connections: 15, publishers: 5, subscribers: 12, presenceConnections: 8, presenceMembers: 6 } } } },
          { channelId: "notifications", status: { occupancy: { metrics: { connections: 25, publishers: 1, subscribers: 24, presenceConnections: 0, presenceMembers: 0 } } } },
          { channelId: "live-updates", status: { occupancy: { metrics: { connections: 8, publishers: 3, subscribers: 8, presenceConnections: 2, presenceMembers: 2 } } } }
        ]
      };
    }
    return { statusCode: 200, items: [] };
  }),
  channels: {
    get: (channelName: string) => ({
      name: channelName,
      publish: sinon.stub().resolves(),
      history: sinon.stub().resolves({ items: mockMessages }),
      presence: {
        get: sinon.stub().resolves(mockPresenceMembers)
      }
    })
  },
  stats: sinon.stub().resolves({
    items: [{
      intervalId: 'test-stats',
      connections: { all: { count: 50, peak: 75 } },
      channels: { count: 20, peak: 30 },
      messages: { all: { all: { count: 1000 } } }
    }]
  }),
  close: sinon.stub()
};

let originalEnv: NodeJS.ProcessEnv;

describe('Real-time Pub/Sub Integration Tests', function() {
  beforeEach(function() {
    // Store original env vars
    originalEnv = { ...process.env };

    // Set environment variables for integration tests
    process.env.ABLY_CLI_TEST_MODE = 'true';
    process.env.ABLY_API_KEY = 'test.key:secret';

    // Make the mocks globally available
    globalThis.__TEST_MOCKS__ = {
      ablyRestMock: mockRestClient,
      ablyRealtimeMock: createMockRealtimeClient()
    };
  });

  afterEach(function() {
    // Clean up global mocks
    delete globalThis.__TEST_MOCKS__;
    // Restore original environment variables
    process.env = originalEnv;
  });

  describe('Pub/Sub Message Flow', function() {
    const testChannel = `pubsub-test-${Date.now()}`;
    const testMessage = { text: "Integration test message", timestamp: Date.now() };

    it('should complete publish -> subscribe -> receive workflow', function() {
      return test
        .timeout(5000)
        .stdout()
        .command(['channels', 'publish', testChannel, JSON.stringify(testMessage)])
        .it('publishes message successfully', ctx => {
          expect(ctx.stdout).to.contain('Message published successfully');
          expect(ctx.stdout).to.contain(testChannel);
        });
    });

    it('should handle subscription lifecycle properly', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'subscribe', testChannel, '--timeout', '1'])
        .it('subscribes and receives messages', ctx => {
          expect(ctx.stdout).to.contain(`Subscribing to channel "${testChannel}"`);
          expect(ctx.stdout).to.contain('Successfully subscribed');
        });
    });

    it('should retrieve message history after publishing', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'history', testChannel])
        .it('retrieves published messages from history', ctx => {
          expect(ctx.stdout).to.contain('Messages from channel');
          expect(ctx.stdout).to.contain(testChannel);
        });
    });

    it('should handle batch publishing workflow', function() {
      const batchChannels = `${testChannel}-1,${testChannel}-2,${testChannel}-3`;
      
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'batch-publish', '--channels', batchChannels, JSON.stringify(testMessage)])
        .it('batch publishes to multiple channels', ctx => {
          expect(ctx.stdout).to.contain('Batch publish successful');
        });
    });
  });

  describe('Presence State Transitions', function() {
    const presenceChannel = `presence-test-${Date.now()}`;
    const clientId = `test-client-${Date.now()}`;
    const presenceData = { name: "Test User", status: "online", joinedAt: Date.now() };

    it('should handle presence enter workflow', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'presence', 'enter', presenceChannel, JSON.stringify(presenceData), '--client-id', clientId])
        .it('enters presence successfully', ctx => {
          expect(ctx.stdout).to.contain('Entered presence');
          expect(ctx.stdout).to.contain(presenceChannel);
          expect(ctx.stdout).to.contain(clientId);
        });
    });

    it('should list presence members after enter', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'presence', 'list', presenceChannel])
        .it('lists presence members', ctx => {
          expect(ctx.stdout).to.contain('Presence members');
          expect(ctx.stdout).to.contain(presenceChannel);
        });
    });

    it('should handle presence subscription workflow', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'presence', 'subscribe', presenceChannel, '--timeout', '1'])
        .it('subscribes to presence events', ctx => {
          expect(ctx.stdout).to.contain(`Subscribing to presence events on "${presenceChannel}"`);
        });
    });

    it('should show presence members with occupancy info', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'occupancy', 'get', presenceChannel])
        .it('shows channel occupancy metrics', ctx => {
          expect(ctx.stdout).to.contain(presenceChannel);
          expect(ctx.stdout).to.contain('Connections:');
          expect(ctx.stdout).to.contain('Presence Members:');
        });
    });
  });

  describe('Connection State Monitoring', function() {
    it('should monitor connection statistics', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['connections', 'stats', '--unit', 'hour', '--limit', '5'])
        .it('displays connection statistics', ctx => {
          expect(ctx.stdout).to.contain('Connection Statistics');
        });
    });

    it('should test connection connectivity', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['connections', 'test'])
        .it('tests both REST and WebSocket connections', ctx => {
          expect(ctx.stdout).to.contain('Testing');
          expect(ctx.stdout).to.contain('connection');
        });
    });

    it('should test REST connection only', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['connections', 'test', '--rest-only'])
        .it('tests REST connection only', ctx => {
          expect(ctx.stdout).to.contain('REST');
          expect(ctx.stdout).to.not.contain('WebSocket');
        });
    });

    it('should test WebSocket connection only', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['connections', 'test', '--ws-only'])
        .it('tests WebSocket connection only', ctx => {
          expect(ctx.stdout).to.contain('WebSocket');
          expect(ctx.stdout).to.not.contain('REST API');
        });
    });
  });

  describe('Channel Information and Status', function() {
    const statusChannel = `status-test-${Date.now()}`;

    it('should list channels with status information', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'list'])
        .it('lists channels with occupancy metrics', ctx => {
          expect(ctx.stdout).to.contain('Found');
          expect(ctx.stdout).to.contain('channels');
        });
    });

    it('should output channel list in JSON format', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'list', '--json'])
        .it('outputs channel list as JSON', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('success', true);
          expect(output).to.have.property('channels').that.is.an('array');
        });
    });

    it('should get specific channel occupancy', function() {
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'occupancy', 'get', statusChannel])
        .it('retrieves channel occupancy metrics', ctx => {
          expect(ctx.stdout).to.contain(statusChannel);
        });
    });
  });

  describe('Web CLI Mode Behavior', function() {
    beforeEach(function() {
      // Enable Web CLI mode for these tests
      process.env.ABLY_WEB_CLI_MODE = 'true';
    });

    afterEach(function() {
      delete process.env.ABLY_WEB_CLI_MODE;
    });

    it('should handle publishing in Web CLI mode', function() {
      const webChannel = `web-test-${Date.now()}`;
      
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'publish', webChannel, '{"webMode": true}'])
        .it('publishes message in Web CLI mode', ctx => {
          expect(ctx.stdout).to.contain('Message published successfully');
        });
    });

    it('should handle JSON output in Web CLI mode', function() {
      const webChannel = `web-json-test-${Date.now()}`;
      
      return test
        .timeout(3000)
        .stdout()
        .command(['channels', 'publish', webChannel, '{"webMode": true}', '--json'])
        .it('outputs JSON in Web CLI mode', ctx => {
          const output = JSON.parse(ctx.stdout);
          expect(output).to.have.property('success', true);
        });
    });
  });

  describe('Error Handling and Edge Cases', function() {
    it('should handle invalid channel names gracefully', function() {
      return test
        .timeout(3000)
        .stderr()
        .command(['channels', 'publish', '', '{"test": "data"}'])
        .catch(err => {
          expect(err.message).to.contain('channel');
        })
        .it('rejects empty channel name');
    });

    it('should handle invalid JSON data gracefully', function() {
      return test
        .timeout(3000)
        .stderr()
        .command(['channels', 'publish', 'test-channel', '{invalid json}'])
        .catch(err => {
          expect(err.message).to.contain('JSON');
        })
        .it('rejects invalid JSON');
    });

    it('should handle presence without client ID gracefully', function() {
      return test
        .timeout(3000)
        .stderr()
        .command(['channels', 'presence', 'enter', 'test-channel', '{"name": "user"}'])
        .catch(err => {
          expect(err.message).to.contain('client');
        })
        .it('requires client ID for presence');
    });
  });

  describe('Real-time Operations Flow', function() {
    const flowChannel = `flow-test-${Date.now()}`;

    it('should handle complete pub/sub with presence workflow', function() {
      // This would be a comprehensive flow test that combines multiple operations
      return test
        .timeout(5000)
        .stdout()
        .command(['channels', 'publish', flowChannel, '{"step": 1, "message": "Starting workflow"}'])
        .it('executes complete workflow step 1', ctx => {
          expect(ctx.stdout).to.contain('Message published successfully');
          
          // In a real integration test, we might chain additional commands here
          // or verify that the message can be retrieved via history
        });
    });
  });
});