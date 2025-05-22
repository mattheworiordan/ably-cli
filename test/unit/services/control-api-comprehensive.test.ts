import { expect } from "chai";
import nock from "nock";
import { ControlApi } from "../../../src/services/control-api.js";

describe("ControlApi - Comprehensive CRUD Tests", function () {
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

  describe("App Management", function () {
    describe("#createApp", function () {
      it("should create an app successfully", async function () {
        const accountId = "test-account-id";
        const appData = { name: "Test App", tlsOnly: false };
        const expectedApp = {
          id: "new-app-id",
          name: "Test App",
          accountId,
          status: "active",
          tlsOnly: false,
          created: 1640995200000,
          modified: 1640995200000,
        };

        // Mock /me endpoint to get account ID
        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(200, { account: { id: accountId }, user: { email: "test@example.com" } });

        // Mock app creation
        nock(`https://${controlHost}`)
          .post(`/v1/accounts/${accountId}/apps`, appData)
          .reply(201, expectedApp);

        const result = await api.createApp(appData);
        expect(result).to.deep.equal(expectedApp);
      });

      it("should handle app creation errors", async function () {
        const accountId = "test-account-id";
        const appData = { name: "Invalid App" };

        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(200, { account: { id: accountId } });

        nock(`https://${controlHost}`)
          .post(`/v1/accounts/${accountId}/apps`)
          .reply(400, { message: "Invalid app name" });

        try {
          await api.createApp(appData);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("Invalid app name");
        }
      });

      it("should handle authentication errors", async function () {
        const appData = { name: "Test App" };

        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(401, { message: "Unauthorized" });

        try {
          await api.createApp(appData);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("Unauthorized");
        }
      });
    });

    describe("#listApps", function () {
      it("should list apps successfully", async function () {
        const accountId = "test-account-id";
        const expectedApps = [
          { id: "app1", name: "App 1", accountId, status: "active", tlsOnly: false, created: 1640995200000, modified: 1640995200000 },
          { id: "app2", name: "App 2", accountId, status: "active", tlsOnly: true, created: 1640995300000, modified: 1640995300000 },
        ];

        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(200, { account: { id: accountId } });

        nock(`https://${controlHost}`)
          .get(`/v1/accounts/${accountId}/apps`)
          .reply(200, expectedApps);

        const result = await api.listApps();
        expect(result).to.deep.equal(expectedApps);
      });

      it("should handle empty app list", async function () {
        const accountId = "test-account-id";

        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(200, { account: { id: accountId } });

        nock(`https://${controlHost}`)
          .get(`/v1/accounts/${accountId}/apps`)
          .reply(200, []);

        const result = await api.listApps();
        expect(result).to.be.an("array").that.is.empty;
      });

      it("should handle server errors", async function () {
        const accountId = "test-account-id";

        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(200, { account: { id: accountId } });

        nock(`https://${controlHost}`)
          .get(`/v1/accounts/${accountId}/apps`)
          .reply(500, { message: "Internal server error" });

        try {
          await api.listApps();
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("Internal server error");
        }
      });
    });

    describe("#updateApp", function () {
      it("should update an app successfully", async function () {
        const appId = "test-app-id";
        const updateData = { name: "Updated App", tlsOnly: true };
        const expectedApp = {
          id: appId,
          name: "Updated App",
          accountId: "account-id",
          status: "active",
          tlsOnly: true,
          created: 1640995200000,
          modified: 1640995600000,
        };

        nock(`https://${controlHost}`)
          .patch(`/v1/apps/${appId}`, updateData)
          .reply(200, expectedApp);

        const result = await api.updateApp(appId, updateData);
        expect(result).to.deep.equal(expectedApp);
      });

      it("should handle app not found", async function () {
        const appId = "non-existent-app";
        const updateData = { name: "Updated App" };

        nock(`https://${controlHost}`)
          .patch(`/v1/apps/${appId}`)
          .reply(404, { message: "App not found" });

        try {
          await api.updateApp(appId, updateData);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("App not found");
        }
      });
    });

    describe("#deleteApp", function () {
      it("should delete an app successfully", async function () {
        const appId = "test-app-id";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}`)
          .reply(204);

        await api.deleteApp(appId);
        // No assertion needed, test passes if no error is thrown
      });

      it("should handle deletion errors", async function () {
        const appId = "test-app-id";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}`)
          .reply(403, { message: "Cannot delete app" });

        try {
          await api.deleteApp(appId);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("Cannot delete app");
        }
      });
    });
  });

  describe("API Key Management", function () {
    describe("#createKey", function () {
      it("should create a key successfully", async function () {
        const appId = "test-app-id";
        const keyData = { name: "Test Key", capability: { "*": ["*"] } };
        const expectedKey = {
          id: "key-id",
          name: "Test Key",
          appId,
          key: `${appId}.key-id:secret`,
          capability: { "*": ["*"] },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        };

        nock(`https://${controlHost}`)
          .post(`/v1/apps/${appId}/keys`, keyData)
          .reply(201, expectedKey);

        const result = await api.createKey(appId, keyData);
        expect(result).to.deep.equal(expectedKey);
      });

      it("should handle key creation errors", async function () {
        const appId = "test-app-id";
        const keyData = { name: "Invalid Key" };

        nock(`https://${controlHost}`)
          .post(`/v1/apps/${appId}/keys`)
          .reply(400, { message: "Invalid key data" });

        try {
          await api.createKey(appId, keyData);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("Invalid key data");
        }
      });
    });

    describe("#listKeys", function () {
      it("should list keys successfully", async function () {
        const appId = "test-app-id";
        const expectedKeys = [
          { id: "key1", name: "Key 1", appId, capability: { "*": ["*"] } },
          { id: "key2", name: "Key 2", appId, capability: { "channel:*": ["subscribe"] } },
        ];

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/keys`)
          .reply(200, expectedKeys);

        const result = await api.listKeys(appId);
        expect(result).to.deep.equal(expectedKeys);
      });

      it("should handle empty key list", async function () {
        const appId = "test-app-id";

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/keys`)
          .reply(200, []);

        const result = await api.listKeys(appId);
        expect(result).to.be.an("array").that.is.empty;
      });
    });

    describe("#updateKey", function () {
      it("should update a key successfully", async function () {
        const appId = "test-app-id";
        const keyId = "test-key-id";
        const updateData = { name: "Updated Key", capability: { "channel:*": ["publish"] } };
        const expectedKey = {
          id: keyId,
          name: "Updated Key",
          appId,
          capability: { "channel:*": ["publish"] },
          created: 1640995200000,
          modified: 1640995600000,
        };

        nock(`https://${controlHost}`)
          .patch(`/v1/apps/${appId}/keys/${keyId}`, updateData)
          .reply(200, expectedKey);

        const result = await api.updateKey(appId, keyId, updateData);
        expect(result).to.deep.equal(expectedKey);
      });
    });

    describe("#revokeKey", function () {
      it("should revoke a key successfully", async function () {
        const appId = "test-app-id";
        const keyId = "test-key-id";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}/keys/${keyId}`)
          .reply(204);

        await api.revokeKey(appId, keyId);
        // No assertion needed, test passes if no error is thrown
      });

      it("should handle key revocation errors", async function () {
        const appId = "test-app-id";
        const keyId = "test-key-id";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}/keys/${keyId}`)
          .reply(404, { message: "Key not found" });

        try {
          await api.revokeKey(appId, keyId);
          expect.fail("Should have thrown an error");
        } catch (error) {
          expect(error).to.be.an.instanceOf(Error);
          expect((error as Error).message).to.include("Key not found");
        }
      });
    });
  });

  describe("Integration Management (Rules)", function () {
    describe("#createRule", function () {
      it("should create a rule successfully", async function () {
        const appId = "test-app-id";
        const ruleData = {
          requestMode: "single",
          ruleType: "webhook",
          source: { channelFilter: "channel.*", type: "channel.message" },
          target: { url: "https://example.com/webhook" },
        };
        const expectedRule = {
          id: "rule-id",
          appId,
          ...ruleData,
          created: 1640995200000,
          modified: 1640995200000,
          version: "1.0",
        };

        nock(`https://${controlHost}`)
          .post(`/v1/apps/${appId}/rules`, ruleData)
          .reply(201, expectedRule);

        const result = await api.createRule(appId, ruleData);
        expect(result).to.deep.equal(expectedRule);
      });
    });

    describe("#listRules", function () {
      it("should list rules successfully", async function () {
        const appId = "test-app-id";
        const expectedRules = [
          { id: "rule1", appId, ruleType: "webhook", requestMode: "single" },
          { id: "rule2", appId, ruleType: "kinesis", requestMode: "batch" },
        ];

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/rules`)
          .reply(200, expectedRules);

        const result = await api.listRules(appId);
        expect(result).to.deep.equal(expectedRules);
      });
    });

    describe("#updateRule", function () {
      it("should update a rule successfully", async function () {
        const appId = "test-app-id";
        const ruleId = "rule-id";
        const updateData = { status: "disabled" as const };
        const expectedRule = {
          id: ruleId,
          appId,
          status: "disabled",
          modified: 1640995600000,
        };

        nock(`https://${controlHost}`)
          .patch(`/v1/apps/${appId}/rules/${ruleId}`, updateData)
          .reply(200, expectedRule);

        const result = await api.updateRule(appId, ruleId, updateData);
        expect(result).to.deep.equal(expectedRule);
      });
    });

    describe("#deleteRule", function () {
      it("should delete a rule successfully", async function () {
        const appId = "test-app-id";
        const ruleId = "rule-id";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}/rules/${ruleId}`)
          .reply(204);

        await api.deleteRule(appId, ruleId);
        // No assertion needed, test passes if no error is thrown
      });
    });
  });

  describe("Queue Management", function () {
    describe("#createQueue", function () {
      it("should create a queue successfully", async function () {
        const appId = "test-app-id";
        const queueData = { name: "test-queue", region: "us-east-1", ttl: 3600 };
        const expectedQueue = {
          id: "queue-id",
          appId,
          name: "test-queue",
          region: "us-east-1",
          ttl: 3600,
          maxLength: 10000,
          state: "active",
          deadletter: false,
          deadletterId: "",
          messages: { ready: 0, total: 0, unacknowledged: 0 },
          stats: { acknowledgementRate: null, deliveryRate: null, publishRate: null },
          amqp: { queueName: "test-queue", uri: "amqp://example.com" },
          stomp: { destination: "/queue/test-queue", host: "example.com", uri: "stomp://example.com" },
        };

        nock(`https://${controlHost}`)
          .post(`/v1/apps/${appId}/queues`, queueData)
          .reply(201, expectedQueue);

        const result = await api.createQueue(appId, queueData);
        expect(result).to.deep.equal(expectedQueue);
      });
    });

    describe("#listQueues", function () {
      it("should list queues successfully", async function () {
        const appId = "test-app-id";
        const expectedQueues = [
          { id: "queue1", appId, name: "Queue 1", region: "us-east-1" },
          { id: "queue2", appId, name: "Queue 2", region: "eu-west-1" },
        ];

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/queues`)
          .reply(200, expectedQueues);

        const result = await api.listQueues(appId);
        expect(result).to.deep.equal(expectedQueues);
      });
    });

    describe("#deleteQueue", function () {
      it("should delete a queue successfully", async function () {
        const appId = "test-app-id";
        const queueName = "test-queue";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}/queues/${queueName}`)
          .reply(204);

        await api.deleteQueue(appId, queueName);
        // No assertion needed, test passes if no error is thrown
      });
    });
  });

  describe("Channel Rules (Namespaces)", function () {
    describe("#createNamespace", function () {
      it("should create a namespace successfully", async function () {
        const appId = "test-app-id";
        const namespaceData = {
          channelNamespace: "test.*",
          persisted: true,
          pushEnabled: false,
        };
        const expectedNamespace = {
          id: "namespace-id",
          appId,
          persisted: true,
          pushEnabled: false,
          created: 1640995200000,
          modified: 1640995200000,
        };

        nock(`https://${controlHost}`)
          .post(`/v1/apps/${appId}/namespaces`, namespaceData)
          .reply(201, expectedNamespace);

        const result = await api.createNamespace(appId, namespaceData);
        expect(result).to.deep.equal(expectedNamespace);
      });
    });

    describe("#listNamespaces", function () {
      it("should list namespaces successfully", async function () {
        const appId = "test-app-id";
        const expectedNamespaces = [
          { id: "ns1", appId, persisted: true, pushEnabled: false },
          { id: "ns2", appId, persisted: false, pushEnabled: true },
        ];

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/namespaces`)
          .reply(200, expectedNamespaces);

        const result = await api.listNamespaces(appId);
        expect(result).to.deep.equal(expectedNamespaces);
      });
    });

    describe("#deleteNamespace", function () {
      it("should delete a namespace successfully", async function () {
        const appId = "test-app-id";
        const namespaceId = "namespace-id";

        nock(`https://${controlHost}`)
          .delete(`/v1/apps/${appId}/namespaces/${namespaceId}`)
          .reply(204);

        await api.deleteNamespace(appId, namespaceId);
        // No assertion needed, test passes if no error is thrown
      });
    });
  });

  describe("Statistics", function () {
    describe("#getAppStats", function () {
      it("should get app statistics successfully", async function () {
        const appId = "test-app-id";
        const options = { unit: "hour", limit: 24 };
        const expectedStats = [
          {
            appId,
            intervalId: "2024-01-01:10",
            unit: "hour",
            entries: { messages: 100, connections: 10 },
          },
        ];

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/stats`)
          .query({ unit: "hour", limit: "24" })
          .reply(200, expectedStats);

        const result = await api.getAppStats(appId, options);
        expect(result).to.deep.equal(expectedStats);
      });

      it("should handle stats with time range", async function () {
        const appId = "test-app-id";
        const options = {
          start: 1640995200000,
          end: 1641081600000,
          unit: "day",
        };

        nock(`https://${controlHost}`)
          .get(`/v1/apps/${appId}/stats`)
          .query({
            start: "1640995200000",
            end: "1641081600000",
            unit: "day",
          })
          .reply(200, []);

        const result = await api.getAppStats(appId, options);
        expect(result).to.be.an("array").that.is.empty;
      });
    });

    describe("#getAccountStats", function () {
      it("should get account statistics successfully", async function () {
        const accountId = "test-account-id";
        const options = { unit: "day", limit: 7 };
        const expectedStats = [
          {
            intervalId: "2024-01-01",
            unit: "day",
            entries: { messages: 1000, connections: 50 },
          },
        ];

        nock(`https://${controlHost}`)
          .get("/v1/me")
          .reply(200, { account: { id: accountId } });

        nock(`https://${controlHost}`)
          .get(`/v1/accounts/${accountId}/stats`)
          .query({ unit: "day", limit: "7" })
          .reply(200, expectedStats);

        const result = await api.getAccountStats(options);
        expect(result).to.deep.equal(expectedStats);
      });
    });
  });

  describe("Error Handling", function () {
    it("should handle network errors", async function () {
      const appId = "test-app-id";

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .replyWithError("Network error");

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
        expect((error as Error).message).to.include("Network error");
      }
    });

    it("should handle malformed JSON responses", async function () {
      const appId = "test-app-id";

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/keys`)
        .reply(200, "invalid json");

      try {
        await api.listKeys(appId);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).to.be.an.instanceOf(Error);
      }
    });

    it("should handle 204 No Content responses", async function () {
      const appId = "test-app-id";

      nock(`https://${controlHost}`)
        .delete(`/v1/apps/${appId}`)
        .reply(204);

      const result = await api.deleteApp(appId);
      expect(result).to.deep.equal({});
    });

    describe("HTTP Status Code Handling", function () {
      const statusCodes = [
        { code: 400, message: "Bad Request" },
        { code: 401, message: "Unauthorized" },
        { code: 403, message: "Forbidden" },
        { code: 404, message: "Not Found" },
        { code: 429, message: "Too Many Requests" },
        { code: 500, message: "Internal Server Error" },
        { code: 502, message: "Bad Gateway" },
        { code: 503, message: "Service Unavailable" },
      ];

      statusCodes.forEach(({ code, message }) => {
        it(`should handle ${code} ${message} status code`, async function () {
          const appId = "test-app-id";

          nock(`https://${controlHost}`)
            .get(`/v1/apps/${appId}/keys`)
            .reply(code, { message: `${message} error` });

          try {
            await api.listKeys(appId);
            expect.fail("Should have thrown an error");
          } catch (error) {
            expect(error).to.be.an.instanceOf(Error);
            expect((error as Error).message).to.include(`${code}`);
            expect((error as Error).message).to.include(`${message}`);
          }
        });
      });
    });
  });

  describe("Request Building", function () {
    it("should build correct URL for local development", async function () {
      const localApi = new ControlApi({
        accessToken: "test-token",
        controlHost: "localhost:3000",
        logErrors: false,
      });

      nock("http://localhost:3000")
        .get("/api/v1/me")
        .reply(200, { account: { id: "test-account" } });

      await localApi.getMe();
      // Test passes if no error is thrown
    });

    it("should build correct URL for production", async function () {
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: "test-account" } });

      await api.getMe();
      // Test passes if no error is thrown
    });

    it("should include authorization header", async function () {
      nock(`https://${controlHost}`)
        .get("/v1/me")
        .matchHeader("Authorization", `Bearer ${accessToken}`)
        .reply(200, { account: { id: "test-account" } });

      await api.getMe();
      // Test passes if no error is thrown
    });

    it("should include content-type header for POST requests", async function () {
      const appData = { name: "Test App" };
      const accountId = "test-account-id";

      nock(`https://${controlHost}`)
        .get("/v1/me")
        .reply(200, { account: { id: accountId } });

      nock(`https://${controlHost}`)
        .post(`/v1/accounts/${accountId}/apps`)
        .matchHeader("Content-Type", "application/json")
        .reply(201, { id: "app-id", ...appData });

      await api.createApp(appData);
      // Test passes if no error is thrown
    });
  });

  describe("Pagination", function () {
    it("should handle pagination parameters", async function () {
      const appId = "test-app-id";
      const options = { limit: 50, by: "created" };

      nock(`https://${controlHost}`)
        .get(`/v1/apps/${appId}/stats`)
        .query({ limit: "50", by: "created" })
        .reply(200, []);

      const result = await api.getAppStats(appId, options);
      expect(result).to.be.an("array").that.is.empty;
    });
  });
});