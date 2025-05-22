import { expect } from "chai";
import nock from "nock";
import { ControlApi } from "../../../src/services/control-api.js";

describe("Channel Rules (Namespaces) Integration Tests", function () {
  let controlApi: ControlApi;
  const baseUrl = "https://control.ably.net";
  const testAppId = "test-app-id";
  const testToken = "test-token";

  beforeEach(function () {
    controlApi = new ControlApi({ accessToken: testToken });
    nock.cleanAll();
  });

  afterEach(function () {
    nock.cleanAll();
  });

  describe("Complete Channel Rules CRUD Lifecycle", function () {
    it("should perform complete namespace lifecycle: create → list → update → delete", async function () {
      const namespaceId = "test-namespace";
      const newNamespace = {
        id: namespaceId,
        appId: testAppId,
        name: "test-namespace",
        persisted: true,
        persistLast: false,
        pushEnabled: false,
        tlsOnly: false,
        exposeTimeserial: false,
        created: Date.now(),
        modified: Date.now(),
      };

      const updatedNamespace = {
        ...newNamespace,
        persisted: false,
        pushEnabled: true,
        modified: Date.now() + 1000,
      };

      // 1. Create namespace
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`, {
          channelNamespace: namespaceId,
          persisted: true,
          persistLast: false,
          pushEnabled: false,
          tlsOnly: false,
          exposeTimeSerial: false,
        })
        .reply(201, newNamespace);

      const createdNamespace = await controlApi.createNamespace(testAppId, {
        channelNamespace: namespaceId,
        persisted: true,
        persistLast: false,
        pushEnabled: false,
        tlsOnly: false,
        exposeTimeSerial: false,
      });

      expect(createdNamespace.id).to.equal(namespaceId);
      expect(createdNamespace.persisted).to.be.true;

      // 2. List namespaces
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces`)
        .reply(200, [newNamespace]);

      const namespaces = await controlApi.listNamespaces(testAppId);
      expect(namespaces).to.have.lengthOf(1);
      expect(namespaces[0].id).to.equal(namespaceId);

      // 3. Get specific namespace
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(200, newNamespace);

      const fetchedNamespace = await controlApi.getNamespace(testAppId, namespaceId);
      expect(fetchedNamespace.id).to.equal(namespaceId);
      expect(fetchedNamespace.persisted).to.be.true;

      // 4. Update namespace
      nock(baseUrl)
        .patch(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(200, updatedNamespace);

      const updated = await controlApi.updateNamespace(testAppId, namespaceId, {
        persisted: false,
        pushEnabled: true,
      });

      expect(updated.persisted).to.be.false;
      expect(updated.pushEnabled).to.be.true;

      // 5. Delete namespace
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(204);

      await controlApi.deleteNamespace(testAppId, namespaceId);

      // Verify all nock interceptors were called
      expect(nock.isDone()).to.be.true;
    });

    it("should handle namespace patterns and wildcard channels", async function () {
      const wildcardNamespace = {
        id: "events:*",
        appId: testAppId,
        name: "events:*",
        persisted: true,
        persistLast: true,
        pushEnabled: true,
        tlsOnly: true,
        exposeTimeserial: true,
        created: Date.now(),
        modified: Date.now(),
      };

      // Create namespace with wildcard pattern
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`)
        .reply(201, wildcardNamespace);

      const created = await controlApi.createNamespace(testAppId, {
        id: "events:*",
        persisted: true,
        persistLast: true,
        pushEnabled: true,
        tlsOnly: true,
        exposeTimeserial: true,
      });

      expect(created.id).to.equal("events:*");
      expect(created.persistLast).to.be.true;
      expect(created.tlsOnly).to.be.true;
      expect(created.exposeTimeserial).to.be.true;
    });

    it("should handle multiple namespaces with pagination", async function () {
      const namespaces = Array.from({ length: 25 }, (_, i) => ({
        id: `namespace-${i}`,
        appId: testAppId,
        name: `namespace-${i}`,
        persisted: i % 2 === 0,
        persistLast: false,
        pushEnabled: i % 3 === 0,
        tlsOnly: false,
        exposeTimeserial: false,
        created: Date.now() - i * 1000,
        modified: Date.now() - i * 1000,
      }));

      // First page
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces`)
        .query({ limit: 10 })
        .reply(200, namespaces.slice(0, 10));

      const firstPage = await controlApi.listNamespaces(testAppId, { limit: 10 });
      expect(firstPage).to.have.lengthOf(10);

      // Second page
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces`)
        .query({ limit: 10, skip: 10 })
        .reply(200, namespaces.slice(10, 20));

      const secondPage = await controlApi.listNamespaces(testAppId, { 
        limit: 10, 
        skip: 10 
      });
      expect(secondPage).to.have.lengthOf(10);
      expect(secondPage[0].id).to.equal("namespace-10");
    });
  });

  describe("Channel Rules Configuration Scenarios", function () {
    it("should configure namespace for real-time messaging", async function () {
      const realtimeNamespace = {
        id: "realtime:*",
        appId: testAppId,
        name: "realtime:*",
        persisted: false,        // No persistence for real-time
        persistLast: false,      // No last message persistence
        pushEnabled: true,       // Enable push notifications
        tlsOnly: true,          // Require TLS
        exposeTimeserial: false, // No timeserial exposure
        created: Date.now(),
        modified: Date.now(),
      };

      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`)
        .reply(201, realtimeNamespace);

      const created = await controlApi.createNamespace(testAppId, {
        id: "realtime:*",
        persisted: false,
        persistLast: false,
        pushEnabled: true,
        tlsOnly: true,
        exposeTimeserial: false,
      });

      expect(created.persisted).to.be.false;
      expect(created.pushEnabled).to.be.true;
      expect(created.tlsOnly).to.be.true;
    });

    it("should configure namespace for data persistence", async function () {
      const persistentNamespace = {
        id: "logs:*",
        appId: testAppId,
        name: "logs:*",
        persisted: true,         // Enable full persistence
        persistLast: true,       // Keep last message
        pushEnabled: false,      // No push notifications
        tlsOnly: true,          // Require TLS for security
        exposeTimeserial: true,  // Expose timeserial for ordering
        created: Date.now(),
        modified: Date.now(),
      };

      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`)
        .reply(201, persistentNamespace);

      const created = await controlApi.createNamespace(testAppId, {
        id: "logs:*",
        persisted: true,
        persistLast: true,
        pushEnabled: false,
        tlsOnly: true,
        exposeTimeserial: true,
      });

      expect(created.persisted).to.be.true;
      expect(created.persistLast).to.be.true;
      expect(created.exposeTimeserial).to.be.true;
    });

    it("should handle multiple namespace configurations", async function () {
      const configurations = [
        {
          id: "public:*",
          persisted: false,
          persistLast: false,
          pushEnabled: true,
          tlsOnly: false,
          exposeTimeserial: false,
        },
        {
          id: "secure:*",
          persisted: true,
          persistLast: true,
          pushEnabled: false,
          tlsOnly: true,
          exposeTimeserial: true,
        },
        {
          id: "notifications:*",
          persisted: false,
          persistLast: true,
          pushEnabled: true,
          tlsOnly: true,
          exposeTimeserial: false,
        },
      ];

      for (const config of configurations) {
        const namespace = {
          ...config,
          appId: testAppId,
          name: config.id,
          created: Date.now(),
          modified: Date.now(),
        };

        nock(baseUrl)
          .post(`/v1/apps/${testAppId}/namespaces`)
          .reply(201, namespace);

        const created = await controlApi.createNamespace(testAppId, config);
        expect(created.id).to.equal(config.id);
        expect(created.persisted).to.equal(config.persisted);
        expect(created.tlsOnly).to.equal(config.tlsOnly);
      }
    });
  });

  describe("Error Handling and Edge Cases", function () {
    it("should handle namespace conflicts", async function () {
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`)
        .reply(409, { 
          error: "Namespace already exists",
          code: 40901,
          statusCode: 409 
        });

      try {
        await controlApi.createNamespace(testAppId, {
          id: "existing-namespace",
          persisted: true,
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(409);
      }
    });

    it("should handle invalid namespace patterns", async function () {
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`)
        .reply(400, { 
          error: "Invalid namespace pattern",
          code: 40010,
          statusCode: 400 
        });

      try {
        await controlApi.createNamespace(testAppId, {
          id: "invalid:pattern:*:*",
          persisted: true,
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(400);
      }
    });

    it("should handle namespace not found", async function () {
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces/nonexistent`)
        .reply(404, { 
          error: "Namespace not found",
          code: 40401,
          statusCode: 404 
        });

      try {
        await controlApi.getNamespace(testAppId, "nonexistent");
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(404);
      }
    });

    it("should handle authorization errors", async function () {
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces`)
        .reply(403, { 
          error: "Insufficient permissions",
          code: 40300,
          statusCode: 403 
        });

      try {
        await controlApi.listNamespaces(testAppId);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(403);
      }
    });

    it("should handle server errors gracefully", async function () {
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/namespaces`)
        .reply(500, { 
          error: "Internal server error",
          code: 50000,
          statusCode: 500 
        });

      try {
        await controlApi.createNamespace(testAppId, {
          id: "test-namespace",
          persisted: true,
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(500);
      }
    });

    it("should handle rate limiting", async function () {
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces`)
        .reply(429, { 
          error: "Rate limit exceeded",
          code: 42900,
          statusCode: 429 
        });

      try {
        await controlApi.listNamespaces(testAppId);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(429);
      }
    });
  });

  describe("Namespace Update Scenarios", function () {
    it("should update individual namespace properties", async function () {
      const namespaceId = "update-test";
      const originalNamespace = {
        id: namespaceId,
        appId: testAppId,
        name: namespaceId,
        persisted: false,
        persistLast: false,
        pushEnabled: false,
        tlsOnly: false,
        exposeTimeserial: false,
        created: Date.now(),
        modified: Date.now(),
      };

      // Test updating each property individually
      const updates = [
        { persisted: true },
        { persistLast: true },
        { pushEnabled: true },
        { tlsOnly: true },
        { exposeTimeserial: true },
      ];

      for (const update of updates) {
        const updatedNamespace = { ...originalNamespace, ...update, modified: Date.now() };

        nock(baseUrl)
          .patch(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
          .reply(200, updatedNamespace);

        const result = await controlApi.updateNamespace(testAppId, namespaceId, update);
        
        // Check that the updated property matches
        const key = Object.keys(update)[0] as keyof typeof update;
        expect(result[key]).to.equal(update[key]);
      }
    });

    it("should handle bulk property updates", async function () {
      const namespaceId = "bulk-update";
      const originalNamespace = {
        id: namespaceId,
        appId: testAppId,
        name: namespaceId,
        persisted: false,
        persistLast: false,
        pushEnabled: false,
        tlsOnly: false,
        exposeTimeserial: false,
        created: Date.now(),
        modified: Date.now(),
      };

      const bulkUpdate = {
        persisted: true,
        persistLast: true,
        pushEnabled: true,
        tlsOnly: true,
        exposeTimeserial: true,
      };

      const updatedNamespace = {
        ...originalNamespace,
        ...bulkUpdate,
        modified: Date.now(),
      };

      nock(baseUrl)
        .patch(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(200, updatedNamespace);

      const result = await controlApi.updateNamespace(testAppId, namespaceId, bulkUpdate);

      expect(result.persisted).to.be.true;
      expect(result.persistLast).to.be.true;
      expect(result.pushEnabled).to.be.true;
      expect(result.tlsOnly).to.be.true;
      expect(result.exposeTimeserial).to.be.true;
    });
  });

  describe("Namespace Deletion Scenarios", function () {
    it("should handle cascade deletion implications", async function () {
      const namespaceId = "cascade-test";

      // Mock checking namespace exists before deletion
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(200, {
          id: namespaceId,
          appId: testAppId,
          name: namespaceId,
          persisted: true,
          created: Date.now(),
          modified: Date.now(),
        });

      // Mock successful deletion
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(204);

      // First verify the namespace exists
      const namespace = await controlApi.getNamespace(testAppId, namespaceId);
      expect(namespace.id).to.equal(namespaceId);

      // Then delete it
      await controlApi.deleteNamespace(testAppId, namespaceId);

      // Mock subsequent get to return 404
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/namespaces/${namespaceId}`)
        .reply(404, { error: "Namespace not found" });

      // Verify it's gone
      try {
        await controlApi.getNamespace(testAppId, namespaceId);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(404);
      }
    });

    it("should handle deletion of non-existent namespace", async function () {
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/namespaces/nonexistent`)
        .reply(404, { 
          error: "Namespace not found",
          code: 40401,
          statusCode: 404 
        });

      try {
        await controlApi.deleteNamespace(testAppId, "nonexistent");
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(404);
      }
    });
  });
});