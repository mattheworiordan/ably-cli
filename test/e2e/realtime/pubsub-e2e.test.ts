import { expect, test } from "@oclif/test";
import { execSync } from "child_process";
import * as Ably from "ably";
import {
  E2E_API_KEY,
  SHOULD_SKIP_E2E,
  getUniqueChannelName,
  createAblyClient,
  publishTestMessage,
  forceExit,
  skipTestsIfNeeded
} from "../../helpers/e2e-test-helper.js";

// Skip tests if API key not available
skipTestsIfNeeded('Real-time Pub/Sub E2E Tests');

// Helper functions for E2E testing
async function waitForCondition(checkFn: () => Promise<boolean>, maxWaitMs = 10000, intervalMs = 500): Promise<boolean> {
  let totalWait = 0;
  while (totalWait < maxWaitMs) {
    if (await checkFn()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    totalWait += intervalMs;
  }
  return false;
}

async function publishMessage(channel: string, message: any): Promise<void> {
  const client = createAblyClient();
  const ch = client.channels.get(channel);
  await ch.publish('test-event', message);
  (client as any).close?.();
}

async function getChannelHistory(channel: string): Promise<Ably.Message[]> {
  const client = createAblyClient();
  const ch = client.channels.get(channel);
  const history = await ch.history({ limit: 100 });
  (client as any).close?.();
  return history.items;
}

async function enterPresence(channel: string, clientId: string, data: any): Promise<void> {
  const client = createAblyClient();
  const ch = client.channels.get(channel);
  const presenceChannel = ch.presence as any;
  await presenceChannel.enterClient(clientId, data);
  (client as any).close?.();
}

async function getPresenceMembers(channel: string): Promise<any[]> {
  const client = createAblyClient();
  const ch = client.channels.get(channel);
  const members = await ch.presence.get();
  (client as any).close?.();
  return members.items || members;
}

// Only run the test suite if we should not skip E2E tests
if (!SHOULD_SKIP_E2E) {
  describe('Real-time Pub/Sub E2E Tests', function() {
    this.timeout(30000); // Increase timeout for E2E tests

    before(async function() {
      // Add handler for interrupt signal
      process.on('SIGINT', forceExit);
    });

    after(function() {
      // Remove interrupt handler
      process.removeListener('SIGINT', forceExit);
    });

    describe('Message Ordering and Delivery', function() {
      let orderingChannel: string;

      beforeEach(function() {
        orderingChannel = getUniqueChannelName("ordering");
      });

      it('should maintain message order in rapid succession publishing', async function() {
        const messages = [
          { sequence: 1, data: "First message", timestamp: Date.now() },
          { sequence: 2, data: "Second message", timestamp: Date.now() + 1 },
          { sequence: 3, data: "Third message", timestamp: Date.now() + 2 },
          { sequence: 4, data: "Fourth message", timestamp: Date.now() + 3 },
          { sequence: 5, data: "Fifth message", timestamp: Date.now() + 4 }
        ];

        // Publish messages rapidly using CLI
        const publishPromises = messages.map((message) => 
          test
            .timeout(10000)
            .env({ ABLY_API_KEY: E2E_API_KEY || "" })
            .stdout()
            .command(['channels', 'publish', orderingChannel, JSON.stringify(message)])
            .it(`publishes message ${message.sequence}`, ctx => {
              expect(ctx.stdout).to.contain('Message published successfully');
            })
        );

        await Promise.all(publishPromises);

        // Wait for messages to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify order using history
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'history', orderingChannel, '--json'])
          .it('retrieves messages in correct order', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result.messages).to.be.an('array');
            expect(result.messages.length).to.be.at.least(5);

            // Check that messages are ordered (Ably returns newest first)
            const sequences = result.messages
              .filter((msg: any) => msg.data && msg.data.sequence)
              .map((msg: any) => msg.data.sequence)
              .reverse(); // Reverse to get chronological order

            expect(sequences).to.deep.equal([1, 2, 3, 4, 5]);
          });
      });

      it('should handle concurrent publishing from multiple sources', async function() {
        const publishPromises: Promise<any>[] = [];
        const sources = ['source-A', 'source-B', 'source-C'];

        // Publish concurrently from multiple sources
        sources.forEach((source, index) => {
          for (let i = 1; i <= 3; i++) {
            const message = { source, messageId: `${source}-${i}`, index: index * 3 + i };
            
            const promise = test
              .timeout(10000)
              .env({ ABLY_API_KEY: E2E_API_KEY || "" })
              .stdout()
              .command(['channels', 'publish', orderingChannel, JSON.stringify(message)])
              .it(`publishes from ${source} message ${i}`, ctx => {
                expect(ctx.stdout).to.contain('Message published successfully');
              });
            
            publishPromises.push(promise);
          }
        });

        // Wait for all publishes to complete
        await Promise.all(publishPromises);

        // Wait for message processing
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Verify all messages were received
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'history', orderingChannel, '--json'])
          .it('retrieves all concurrent messages', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result.messages).to.be.an('array');
            expect(result.messages.length).to.be.at.least(9);

            // Verify we have messages from all sources
            const sourceMessages = {
              'source-A': result.messages.filter((msg: any) => msg.data && msg.data.source === 'source-A'),
              'source-B': result.messages.filter((msg: any) => msg.data && msg.data.source === 'source-B'),
              'source-C': result.messages.filter((msg: any) => msg.data && msg.data.source === 'source-C')
            };

            expect(sourceMessages['source-A'].length).to.equal(3);
            expect(sourceMessages['source-B'].length).to.equal(3);
            expect(sourceMessages['source-C'].length).to.equal(3);
          });
      });

      it('should handle large message payload delivery', async function() {
        // Create a large message (but within Ably limits)
        const largeData = {
          type: 'large-payload',
          content: 'x'.repeat(10000), // 10KB of data
          metadata: {
            chunks: Array.from({length: 100}, (_, i) => ({ id: i, data: `chunk-${i}` })),
            timestamp: Date.now(),
            size: 10000
          }
        };

        await test
          .timeout(15000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'publish', orderingChannel, JSON.stringify(largeData)])
          .it('publishes large message successfully', ctx => {
            expect(ctx.stdout).to.contain('Message published successfully');
          });

        // Wait for message processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify large message retrieval
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'history', orderingChannel, '--json'])
          .it('retrieves large message correctly', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result.messages).to.be.an('array');
            
            const largeMessage = result.messages.find((msg: any) => 
              msg.data && msg.data.type === 'large-payload'
            );
            
            expect(largeMessage).to.exist;
            expect(largeMessage.data.content.length).to.equal(10000);
            expect(largeMessage.data.metadata.chunks.length).to.equal(100);
          });
      });
    });

    describe('Presence Synchronization', function() {
      let presenceChannel: string;

      beforeEach(function() {
        presenceChannel = getUniqueChannelName("presence");
      });

      it('should synchronize presence state across multiple clients', async function() {
        const clients = [
          { id: 'client-alpha', name: 'Alice', status: 'online' },
          { id: 'client-beta', name: 'Bob', status: 'busy' },
          { id: 'client-gamma', name: 'Charlie', status: 'away' }
        ];

        // Enter presence for multiple clients
        for (const client of clients) {
          await test
            .timeout(10000)
            .env({ ABLY_API_KEY: E2E_API_KEY || "" })
            .stdout()
            .command([
              'channels', 'presence', 'enter', 
              presenceChannel, 
              JSON.stringify({ name: client.name, status: client.status }),
              '--client-id', client.id
            ])
            .it(`enters presence for ${client.id}`, ctx => {
              expect(ctx.stdout).to.contain('Entered presence');
              expect(ctx.stdout).to.contain(client.id);
            });

          // Small delay between entries
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Wait for presence synchronization
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify all clients are present
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'presence', 'list', presenceChannel, '--json'])
          .it('lists all presence members', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result.members).to.be.an('array');
            expect(result.members.length).to.be.at.least(3);

            const memberIds = result.members.map((member: any) => member.clientId);
            expect(memberIds).to.include('client-alpha');
            expect(memberIds).to.include('client-beta');
            expect(memberIds).to.include('client-gamma');

            // Verify member data
            const alice = result.members.find((m: any) => m.clientId === 'client-alpha');
            expect(alice.data.name).to.equal('Alice');
            expect(alice.data.status).to.equal('online');
          });
      });

      it('should handle presence updates and state changes', async function() {
        const clientId = 'update-client';
        const initialData = { name: 'Update User', status: 'online', version: 1 };
        const updatedData = { name: 'Update User', status: 'busy', version: 2 };

        // Initial presence enter
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command([
            'channels', 'presence', 'enter',
            presenceChannel,
            JSON.stringify(initialData),
            '--client-id', clientId
          ])
          .it('enters presence initially', ctx => {
            expect(ctx.stdout).to.contain('Entered presence');
          });

        // Wait for initial state
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Update presence data
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command([
            'channels', 'presence', 'enter',
            presenceChannel,
            JSON.stringify(updatedData),
            '--client-id', clientId
          ])
          .it('updates presence data', ctx => {
            expect(ctx.stdout).to.contain('Entered presence');
          });

        // Wait for update propagation
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify updated state
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'presence', 'list', presenceChannel, '--json'])
          .it('shows updated presence data', ctx => {
            const result = JSON.parse(ctx.stdout);
            const member = result.members.find((m: any) => m.clientId === clientId);
            
            expect(member).to.exist;
            expect(member.data.status).to.equal('busy');
            expect(member.data.version).to.equal(2);
          });
      });

      it('should track presence events in real-time', async function() {
        const eventClientId = 'event-client';
        const eventData = { name: 'Event User', status: 'active' };

        // Use SDK to set up presence subscription for verification
        const verificationClient = createAblyClient();
        const verificationChannel = verificationClient.channels.get(presenceChannel);
        
        const presenceEvents: any[] = [];
        await new Promise<void>((resolve) => {
          (verificationChannel.presence as any).subscribe((message: any) => {
            presenceEvents.push(message);
            if (presenceEvents.length >= 1) {
              resolve();
            }
          });

          // Trigger presence enter via CLI after subscription is set up
          setTimeout(async () => {
            await test
              .timeout(10000)
              .env({ ABLY_API_KEY: E2E_API_KEY || "" })
              .stdout()
              .command([
                'channels', 'presence', 'enter',
                presenceChannel,
                JSON.stringify(eventData),
                '--client-id', eventClientId
              ])
              .it('triggers presence event', ctx => {
                expect(ctx.stdout).to.contain('Entered presence');
              });
          }, 500);
        });

        // Verify the event was captured
        expect(presenceEvents.length).to.be.at.least(1);
        const enterEvent = presenceEvents.find(e => e.action === 'enter' && e.clientId === eventClientId);
        expect(enterEvent).to.exist;
        expect(enterEvent.data.name).to.equal('Event User');

        (verificationClient as any).close?.();
      });
    });

    describe('Connection Recovery Scenarios', function() {
      let recoveryChannel: string;

      beforeEach(function() {
        recoveryChannel = getUniqueChannelName("recovery");
      });

      it('should handle connection test scenarios', async function() {
        // Test full connection capabilities
        await test
          .timeout(15000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['connections', 'test'])
          .it('tests both REST and WebSocket connections', ctx => {
            expect(ctx.stdout).to.contain('Testing');
            expect(ctx.stdout).to.contain('connection');
            // Should show both REST and WebSocket results
            expect(ctx.stdout).to.match(/(REST|WebSocket)/);
          });

        // Test REST only
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['connections', 'test', '--rest-only'])
          .it('tests REST connection only', ctx => {
            expect(ctx.stdout).to.contain('REST');
            expect(ctx.stdout).to.not.contain('WebSocket');
          });

        // Test WebSocket only
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['connections', 'test', '--ws-only'])
          .it('tests WebSocket connection only', ctx => {
            expect(ctx.stdout).to.contain('WebSocket');
            expect(ctx.stdout).to.not.contain('REST');
          });
      });

      it('should retrieve connection statistics', async function() {
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['connections', 'stats', '--unit', 'hour', '--limit', '3'])
          .it('retrieves connection statistics', ctx => {
            expect(ctx.stdout).to.contain('Connection Statistics');
          });

        // Test JSON output
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['connections', 'stats', '--unit', 'day', '--limit', '1', '--json'])
          .it('retrieves statistics in JSON format', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result).to.have.property('success', true);
          });
      });

      it('should handle message persistence across connection events', async function() {
        const persistenceMessage = { 
          type: 'persistence-test', 
          data: 'This message should persist',
          timestamp: Date.now() 
        };

        // Publish message
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'publish', recoveryChannel, JSON.stringify(persistenceMessage)])
          .it('publishes persistence test message', ctx => {
            expect(ctx.stdout).to.contain('Message published successfully');
          });

        // Wait for persistence
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Retrieve from different connection (simulating recovery)
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'history', recoveryChannel, '--json'])
          .it('retrieves persisted message after reconnection', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result.messages).to.be.an('array');
            
            const persistedMessage = result.messages.find((msg: any) => 
              msg.data && msg.data.type === 'persistence-test'
            );
            
            expect(persistedMessage).to.exist;
            expect(persistedMessage.data.data).to.equal('This message should persist');
          });
      });

      it('should verify channel occupancy metrics accuracy', async function() {
        // Publish some messages to create activity
        for (let i = 1; i <= 3; i++) {
          await publishMessage(recoveryChannel, { messageNumber: i, type: 'occupancy-test' });
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Enter presence to affect occupancy
        await enterPresence(recoveryChannel, 'occupancy-client', { name: 'Occupancy User' });

        // Wait for metrics update
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Check occupancy
        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'occupancy', 'get', recoveryChannel, '--json'])
          .it('shows accurate occupancy metrics', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result).to.have.property('success', true);
            expect(result).to.have.property('channel', recoveryChannel);
            expect(result).to.have.property('metrics');
            
            // Should have some connections and presence members
            expect(result.metrics).to.have.property('connections');
            expect(result.metrics).to.have.property('presenceMembers');
          });
      });
    });

    describe('Multi-Channel Operations', function() {
      let multiChannels: string[];

      beforeEach(function() {
        multiChannels = [
          getUniqueChannelName("multi-1"),
          getUniqueChannelName("multi-2"),
          getUniqueChannelName("multi-3")
        ];
      });

      it('should handle batch publishing across multiple channels', async function() {
        const batchMessage = { 
          type: 'batch-test', 
          timestamp: Date.now(),
          batchId: 'batch-' + Date.now()
        };

        await test
          .timeout(15000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command([
            'channels', 'batch-publish',
            '--channels', multiChannels.join(','),
            JSON.stringify(batchMessage)
          ])
          .it('batch publishes to multiple channels', ctx => {
            expect(ctx.stdout).to.contain('Batch publish successful');
          });

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify message was delivered to all channels
        for (const channel of multiChannels) {
          await test
            .timeout(10000)
            .env({ ABLY_API_KEY: E2E_API_KEY || "" })
            .stdout()
            .command(['channels', 'history', channel, '--json'])
            .it(`verifies message in channel ${channel}`, ctx => {
              const result = JSON.parse(ctx.stdout);
              const batchMsg = result.messages.find((msg: any) => 
                msg.data && msg.data.type === 'batch-test'
              );
              expect(batchMsg).to.exist;
              expect(batchMsg.data.batchId).to.equal(batchMessage.batchId);
            });
        }
      });

      it('should list channels and show activity', async function() {
        // Create activity on channels
        for (const channel of multiChannels) {
          await publishMessage(channel, { channel, activity: 'test' });
        }

        // Wait for activity to register
        await new Promise(resolve => setTimeout(resolve, 2000));

        await test
          .timeout(10000)
          .env({ ABLY_API_KEY: E2E_API_KEY || "" })
          .stdout()
          .command(['channels', 'list', '--json'])
          .it('lists channels with activity', ctx => {
            const result = JSON.parse(ctx.stdout);
            expect(result.channels).to.be.an('array');
            expect(result.channels.length).to.be.greaterThan(0);

            // Check if any of our test channels appear in the list
            const channelIds = result.channels.map((ch: any) => ch.channelId);
            const foundChannels = multiChannels.filter(ch => channelIds.includes(ch));
            expect(foundChannels.length).to.be.greaterThan(0);
          });
      });
    });
  });
}