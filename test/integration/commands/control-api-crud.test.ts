import { expect } from "chai";
import nock from "nock";
import { ControlApi } from "../../../src/services/control-api.js";

// Skip tests if we're in CI without API keys
const SHOULD_SKIP_TESTS = process.env.SKIP_E2E_TESTS === 'true';

if (SHOULD_SKIP_TESTS) {
  describe("Control API CRUD Integration (skipped)", function() {
    it("tests skipped due to missing API key", function() {
      this.skip();
    });
  });
} else {
describe("Control API CRUD Integration Tests", function () {
  const accessToken = "test-access-token";
  const controlHost = "control.ably.test";
  let api: ControlApi;

  beforeEach(function () {
    api = new ControlApi({ accessToken, controlHost, logErrors: false });
    nock.cleanAll();
  });

  afterEach(function () {
    nock.cleanAll();
  });

  describe("App Lifecycle", function () {
    it("should handle complete app CRUD lifecycle", async function () {
      const accountId = "test-account-id";
      const appName = "Test Integration App";
      const updatedAppName = "Updated Integration App";

      // Mock the account info
      nock(`https://${controlHost}`)
        .persist()
        .get("/v1/me")
        .reply(200, { 
          account: { id: accountId, name: "Test Account" }, 
          user: { email: "test@example.com" } 
        });

      // 1. Create App
      const createAppResponse = {
        id: "integration-app-id",
        name: appName,
        accountId,
        status: "active",
        tlsOnly: false,
        created: Date.now(),
        modified: Date.now(),
      };

      nock(`https://${controlHost}`)
        .post(`/v1/accounts/${accountId}/apps`, { name: appName, tlsOnly: false })
        .reply(201, createAppResponse);

      const createdApp = await api.createApp({ name: appName, tlsOnly: false });
      expect(createdApp).to.deep.equal(createAppResponse);

      // 2. List Apps (should include our created app)
      const listAppsResponse = [createAppResponse];

      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/apps`)
        .reply(200, listAppsResponse);

      const apps = await api.listApps();
      expect(apps).to.have.lengthOf(1);
      expect(apps[0].id).to.equal("integration-app-id");

      // 3. Update App
      const updateAppResponse = {
        ...createAppResponse,
        name: updatedAppName,
        tlsOnly: true,
        modified: Date.now(),
      };

      nock(`https://${controlHost}`)
        .patch(`/v1/apps/integration-app-id`, { name: updatedAppName, tlsOnly: true })
        .reply(200, updateAppResponse);

      const updatedApp = await api.updateApp("integration-app-id", { 
        name: updatedAppName, 
        tlsOnly: true 
      });
      expect(updatedApp.name).to.equal(updatedAppName);
      expect(updatedApp.tlsOnly).to.be.true;

      // 4. Delete App
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/integration-app-id`)
        .reply(204);

      await api.deleteApp("integration-app-id");
      // Test passes if no error is thrown
    });
  });

  describe("API Key Lifecycle", function () {
    it("should handle complete API key CRUD lifecycle", async function () {
      const appId = "test-app-id";
      const keyName = "Integration Test Key";
      const updatedKeyName = "Updated Integration Key";

      // 1. Create Key
      const createKeyResponse = {
        id: "integration-key-id",
        name: keyName,
        appId,
        key: `${appId}.integration-key-id:secret`,
        capability: { "*": ["*"] },
        created: Date.now(),
        modified: Date.now(),
        revocable: true,
        status: "enabled",
      };

      nock(`https://${controlHost}`)
        .post(`/v1/apps/${appId}/keys`, { 
          name: keyName, 
          capability: { "*": ["*"] } 
        })
        .reply(201, createKeyResponse);

      const createdKey = await api.createKey(appId, { 
        name: keyName, 
        capability: { "*": ["*"] } 
      });
      expect(createdKey).to.deep.equal(createKeyResponse);

      // 2. List Keys (should include our created key)
      const listKeysResponse = [createKeyResponse];

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(200, listKeysResponse);

      const keys = await api.listKeys(appId);
      expect(keys).to.have.lengthOf(1);
      expect(keys[0].id).to.equal("integration-key-id");

      // 3. Update Key
      const updateKeyResponse = {
        ...createKeyResponse,
        name: updatedKeyName,
        capability: { "channel:*": ["publish", "subscribe"] },
        modified: Date.now(),
      };

      nock(`https://${controlHost}`)
        .patch(`/v1/apps/${appId}/keys/integration-key-id`, { 
          name: updatedKeyName,
          capability: { "channel:*": ["publish", "subscribe"] }
        })
        .reply(200, updateKeyResponse);

      const updatedKey = await api.updateKey(appId, "integration-key-id", { 
        name: updatedKeyName,
        capability: { "channel:*": ["publish", "subscribe"] }
      });
      expect(updatedKey.name).to.equal(updatedKeyName);
      expect(updatedKey.capability).to.deep.equal({ "channel:*": ["publish", "subscribe"] });

      // 4. Revoke Key
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}/keys/integration-key-id`)
        .reply(204);

      await api.revokeKey(appId, "integration-key-id");
      // Test passes if no error is thrown
    });
  });

  describe("Integration (Rules) Lifecycle", function () {
    it("should handle complete integration CRUD lifecycle", async function () {
      const appId = "test-app-id";
      const ruleData = {
        requestMode: "single" as const,
        ruleType: "webhook",
        source: { channelFilter: "test.*", type: "channel.message" },
        target: { url: "https://example.com/webhook" },
      };

      // 1. Create Rule
      const createRuleResponse = {
        id: "integration-rule-id",
        appId,
        ...ruleData,
        created: Date.now(),
        modified: Date.now(),
        version: "1.0",
      };

      nock(`https://${controlHost}`)
        .post(`/v1/apps/${appId}/rules`, ruleData)
        .reply(201, createRuleResponse);

      const createdRule = await api.createRule(appId, ruleData);
      expect(createdRule).to.deep.equal(createRuleResponse);

      // 2. List Rules (should include our created rule)
      const listRulesResponse = [createRuleResponse];

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/rules`)
        .reply(200, listRulesResponse);

      const rules = await api.listRules(appId);
      expect(rules).to.have.lengthOf(1);
      expect(rules[0].id).to.equal("integration-rule-id");

      // 3. Update Rule
      const updateRuleResponse = {
        ...createRuleResponse,
        modified: Date.now(),
      };

      nock(`https://${controlHost}`)
        .patch(`/v1/apps/${appId}/rules/integration-rule-id`, { requestMode: "batch" })
        .reply(200, updateRuleResponse);

      const updatedRule = await api.updateRule(appId, "integration-rule-id", { 
        requestMode: "batch" 
      });
      expect(updatedRule.requestMode).to.equal("batch");

      // 4. Delete Rule
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}/rules/integration-rule-id`)
        .reply(204);

      await api.deleteRule(appId, "integration-rule-id");
      // Test passes if no error is thrown
    });
  });

  describe("Queue Lifecycle", function () {
    it("should handle complete queue CRUD lifecycle", async function () {
      const appId = "test-app-id";
      const queueName = "integration-test-queue";

      // 1. Create Queue
      const createQueueResponse = {
        id: "integration-queue-id",
        appId,
        name: queueName,
        region: "us-east-1",
        ttl: 3600,
        maxLength: 10000,
        state: "active",
        deadletter: false,
        deadletterId: "",
        messages: { ready: 0, total: 0, unacknowledged: 0 },
        stats: { acknowledgementRate: null, deliveryRate: null, publishRate: null },
        amqp: { queueName, uri: "amqp://example.com" },
        stomp: { destination: `/queue/${queueName}`, host: "example.com", uri: "stomp://example.com" },
      };

      nock(`https://${controlHost}`)
        .post(`/v1/apps/${appId}/queues`, { 
          name: queueName, 
          region: "us-east-1", 
          ttl: 3600 
        })
        .reply(201, createQueueResponse);

      const createdQueue = await api.createQueue(appId, { 
        name: queueName, 
        region: "us-east-1", 
        ttl: 3600 
      });
      expect(createdQueue).to.deep.equal(createQueueResponse);

      // 2. List Queues (should include our created queue)
      const listQueuesResponse = [createQueueResponse];

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/queues`)
        .reply(200, listQueuesResponse);

      const queues = await api.listQueues(appId);
      expect(queues).to.have.lengthOf(1);
      expect(queues[0].id).to.equal("integration-queue-id");

      // 3. Delete Queue
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}/queues/${queueName}`)
        .reply(204);

      await api.deleteQueue(appId, queueName);
      // Test passes if no error is thrown
    });
  });

  describe("Channel Rules (Namespace) Lifecycle", function () {
    it("should handle complete namespace CRUD lifecycle", async function () {
      const appId = "test-app-id";
      const namespaceData = {
        channelNamespace: "integration.*",
        persisted: true,
        pushEnabled: false,
        tlsOnly: true,
      };

      // 1. Create Namespace
      const createNamespaceResponse = {
        id: "integration-namespace-id",
        appId,
        persisted: true,
        pushEnabled: false,
        tlsOnly: true,
        created: Date.now(),
        modified: Date.now(),
      };

      nock(`https://${controlHost}`)
        .post(`/v1/apps/${appId}/namespaces`, namespaceData)
        .reply(201, createNamespaceResponse);

      const createdNamespace = await api.createNamespace(appId, namespaceData);
      expect(createdNamespace).to.deep.equal(createNamespaceResponse);

      // 2. List Namespaces (should include our created namespace)
      const listNamespacesResponse = [createNamespaceResponse];

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/namespaces`)
        .reply(200, listNamespacesResponse);

      const namespaces = await api.listNamespaces(appId);
      expect(namespaces).to.have.lengthOf(1);
      expect(namespaces[0].id).to.equal("integration-namespace-id");

      // 3. Update Namespace
      const updateNamespaceResponse = {
        ...createNamespaceResponse,
        pushEnabled: true,
        modified: Date.now(),
      };

      nock(`https://${controlHost}`)
        .patch(`/v1/apps/${appId}/namespaces/integration-namespace-id`, { 
          pushEnabled: true 
        })
        .reply(200, updateNamespaceResponse);

      const updatedNamespace = await api.updateNamespace(appId, "integration-namespace-id", { 
        pushEnabled: true 
      });
      expect(updatedNamespace.pushEnabled).to.be.true;

      // 4. Delete Namespace
      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}/namespaces/integration-namespace-id`)
        .reply(204);

      await api.deleteNamespace(appId, "integration-namespace-id");
      // Test passes if no error is thrown
    });
  });

  describe("Statistics Integration", function () {
    it("should retrieve app and account statistics", async function () {
      const appId = "test-app-id";
      const accountId = "test-account-id";

      // Mock account info for account stats
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId } });

      // 1. Get App Statistics
      const appStatsResponse = [
        {
          appId,
          intervalId: "2024-01-01:10",
          unit: "hour",
          entries: { messages: 100, connections: 10, channels: 5 },
        },
      ];

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/stats`)
        .query({ unit: "hour", limit: "24" })
        .reply(200, appStatsResponse);

      const appStats = await api.getAppStats(appId, { unit: "hour", limit: 24 });
      expect(appStats).to.have.lengthOf(1);
      expect(appStats[0].entries.messages).to.equal(100);

      // 2. Get Account Statistics
      const accountStatsResponse = [
        {
          intervalId: "2024-01-01",
          unit: "day",
          entries: { messages: 1000, connections: 50, channels: 25 },
        },
      ];

      nock(`https://${controlHost}`)
        .get(`/v1/accounts/${accountId}/stats`)
        .query({ unit: "day", limit: "7" })
        .reply(200, accountStatsResponse);

      const accountStats = await api.getAccountStats({ unit: "day", limit: 7 });
      expect(accountStats).to.have.lengthOf(1);
      expect(accountStats[0].entries.messages).to.equal(1000);
    });
  });

  describe("Error Recovery and Resilience", function () {
    it("should handle network failures gracefully", async function () {
      const appId = "test-app-id";

      // Mock network failure
      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .replyWithError("ECONNREFUSED");

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("ECONNREFUSED");
      }
    });

    it("should handle rate limiting", async function () {
      const appId = "test-app-id";

      // Mock rate limiting response
      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(429, { 
          message: "Too Many Requests",
          retryAfter: 60,
        });

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("429");
        expect((error as Error).message).to.include("Too Many Requests");
      }
    });

    it("should handle service unavailable", async function () {
      const appId = "test-app-id";

      // Mock service unavailable response
      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(503, { 
          message: "Service Unavailable",
        });

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("503");
        expect((error as Error).message).to.include("Service Unavailable");
      }
    });
  });

  describe("Data Transformation and Output Formatting", function () {
    it("should handle different data formats correctly", async function () {
      const appId = "test-app-id";

      // Test with various capability formats
      const keysWithDifferentCapabilities = [
        {
          id: "key1",
          name: "Global Key",
          appId,
          capability: { "*": ["*"] },
          created: Date.now(),
          modified: Date.now(),
        },
        {
          id: "key2", 
          name: "Channel Key",
          appId,
          capability: { "channel:test": ["publish", "subscribe"] },
          created: Date.now(),
          modified: Date.now(),
        },
        {
          id: "key3",
          name: "Multi Channel Key", 
          appId,
          capability: { 
            "channel:chat-*": ["publish", "subscribe"],
            "channel:updates": ["subscribe"],
            "presence:*": ["enter", "leave", "get"]
          },
          created: Date.now(),
          modified: Date.now(),
        },
      ];

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(200, keysWithDifferentCapabilities);

      const keys = await api.listKeys(appId);
      expect(keys).to.have.lengthOf(3);
      
      // Verify different capability structures are preserved
      expect(keys[0].capability).to.deep.equal({ "*": ["*"] });
      expect(keys[1].capability).to.deep.equal({ "channel:test": ["publish", "subscribe"] });
      expect(keys[2].capability).to.have.property("channel:chat-*");
      expect(keys[2].capability).to.have.property("presence:*");
    });

    it("should handle timestamp formatting", async function () {
      const appId = "test-app-id";
      const testTimestamp = 1640995200000; // Known timestamp

      const keyWithTimestamp = {
        id: "timestamp-key",
        name: "Timestamp Test Key",
        appId,
        capability: { "*": ["*"] },
        created: testTimestamp,
        modified: testTimestamp,
      };

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(200, [keyWithTimestamp]);

      const keys = await api.listKeys(appId);
      expect(keys[0].created).to.equal(testTimestamp);
      expect(keys[0].modified).to.equal(testTimestamp);
    });
  });

  describe("Authorization Header Handling", function () {
    it("should include correct authorization headers", async function () {
      const appId = "test-app-id";

      // Verify authorization header is included
      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .matchHeader("Authorization", `Bearer ${accessToken}`)
        .reply(200, []);

      await api.listKeys(appId);
      // Test passes if request was made with correct header
    });

    it("should handle authorization errors", async function () {
      const appId = "test-app-id";

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(401, { message: "Invalid or expired token" });

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Invalid or expired token");
      }
    });
  });
});
}