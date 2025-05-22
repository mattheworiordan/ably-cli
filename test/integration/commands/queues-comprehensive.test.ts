import { expect } from "chai";
import nock from "nock";
import { ControlApi } from "../../../src/services/control-api.js";

describe("Queues Integration Tests", function () {
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

  describe("Complete Queue CRUD Lifecycle", function () {
    it("should perform complete queue lifecycle: create → list → update → delete", async function () {
      const queueName = "test-queue";
      const newQueue = {
        id: queueName,
        appId: testAppId,
        name: queueName,
        region: "us-east-1",
        ttl: 3600,
        maxLength: 1000,
        deadletter: false,
        deadletterId: "",
        state: "active",
        amqp: {
          uri: `amqps://example.com/${testAppId}/${queueName}`,
          queueName: `${testAppId}-${queueName}`,
        },
        stomp: {
          uri: `stomp://example.com:61614/${testAppId}/${queueName}`,
          host: "example.com",
          destination: `/queue/${testAppId}-${queueName}`,
        },
        messages: {
          ready: 0,
          total: 0,
          unacknowledged: 0,
        },
        stats: {
          publishRate: 0,
          deliveryRate: 0,
          acknowledgementRate: 0,
        },
      };

      // 1. Create queue
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/queues`, {
          name: queueName,
          region: "us-east-1",
          ttl: 3600,
          maxLength: 1000,
        })
        .reply(201, newQueue);

      const createdQueue = await controlApi.createQueue(testAppId, {
        name: queueName,
        region: "us-east-1",
        ttl: 3600,
        maxLength: 1000,
      });

      expect(createdQueue.name).to.equal(queueName);
      expect(createdQueue.region).to.equal("us-east-1");
      expect(createdQueue.ttl).to.equal(3600);
      expect(createdQueue.maxLength).to.equal(1000);

      // 2. List queues
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(200, [newQueue]);

      const queues = await controlApi.listQueues(testAppId);
      expect(queues).to.have.lengthOf(1);
      expect(queues[0].name).to.equal(queueName);

      // 3. Delete queue
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/queues/${queueName}`)
        .reply(204);

      await controlApi.deleteQueue(testAppId, queueName);

      // Verify all nock interceptors were called
      expect(nock.isDone()).to.be.true;
    });

    it("should handle queue configuration for different regions", async function () {
      const regions = ["us-east-1", "eu-west-1", "ap-southeast-1"];
      
      for (const region of regions) {
        const queueName = `queue-${region}`;
        const queue = {
          id: queueName,
          appId: testAppId,
          name: queueName,
          region,
          ttl: 7200,
          maxLength: 5000,
          deadletter: true,
          deadletterId: `${queueName}-dlq`,
          state: "active",
          amqp: {
            uri: `amqps://${region}.example.com/${testAppId}/${queueName}`,
            queueName: `${testAppId}-${queueName}`,
          },
          stomp: {
            uri: `stomp://${region}.example.com:61614/${testAppId}/${queueName}`,
            host: `${region}.example.com`,
            destination: `/queue/${testAppId}-${queueName}`,
          },
          messages: {
            ready: 0,
            total: 0,
            unacknowledged: 0,
          },
          stats: {
            publishRate: null,
            deliveryRate: null,
            acknowledgementRate: null,
          },
        };

        nock(baseUrl)
          .post(`/v1/apps/${testAppId}/queues`)
          .reply(201, queue);

        const created = await controlApi.createQueue(testAppId, {
          name: queueName,
          region,
          ttl: 7200,
          maxLength: 5000,
        });

        expect(created.region).to.equal(region);
        expect(created.ttl).to.equal(7200);
        expect(created.maxLength).to.equal(5000);
      }
    });

    it("should handle queue configurations for different use cases", async function () {
      const configurations = [
        {
          name: "high-throughput-queue",
          maxLength: 100000,
          ttl: 86400, // 24 hours
          region: "us-east-1",
          useCase: "high volume processing",
        },
        {
          name: "priority-queue",
          maxLength: 1000,
          ttl: 300, // 5 minutes
          region: "eu-west-1",
          useCase: "priority messages",
        },
        {
          name: "batch-processing-queue",
          maxLength: 50000,
          ttl: 604800, // 1 week
          region: "ap-southeast-1",
          useCase: "batch job processing",
        },
      ];

      for (const config of configurations) {
        const queue = {
          id: config.name,
          appId: testAppId,
          name: config.name,
          region: config.region,
          ttl: config.ttl,
          maxLength: config.maxLength,
          deadletter: false,
          deadletterId: "",
          state: "active",
          amqp: {
            uri: `amqps://${config.region}.example.com/${testAppId}/${config.name}`,
            queueName: `${testAppId}-${config.name}`,
          },
          stomp: {
            uri: `stomp://${config.region}.example.com:61614/${testAppId}/${config.name}`,
            host: `${config.region}.example.com`,
            destination: `/queue/${testAppId}-${config.name}`,
          },
          messages: {
            ready: 0,
            total: 0,
            unacknowledged: 0,
          },
          stats: {
            publishRate: null,
            deliveryRate: null,
            acknowledgementRate: null,
          },
        };

        nock(baseUrl)
          .post(`/v1/apps/${testAppId}/queues`)
          .reply(201, queue);

        const created = await controlApi.createQueue(testAppId, {
          name: config.name,
          region: config.region,
          ttl: config.ttl,
          maxLength: config.maxLength,
        });

        expect(created.name).to.equal(config.name);
        expect(created.region).to.equal(config.region);
        expect(created.ttl).to.equal(config.ttl);
        expect(created.maxLength).to.equal(config.maxLength);
      }
    });
  });

  describe("Queue Error Handling and Edge Cases", function () {
    it("should handle queue name conflicts", async function () {
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/queues`)
        .reply(409, { 
          error: "Queue already exists",
          code: 40901,
          statusCode: 409 
        });

      try {
        await controlApi.createQueue(testAppId, {
          name: "existing-queue",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(409);
      }
    });

    it("should handle invalid queue parameters", async function () {
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/queues`)
        .reply(400, { 
          error: "Invalid queue configuration",
          code: 40010,
          statusCode: 400 
        });

      try {
        await controlApi.createQueue(testAppId, {
          name: "invalid-queue",
          maxLength: -1, // Invalid value
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(400);
      }
    });

    it("should handle queue not found", async function () {
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/queues/nonexistent`)
        .reply(404, { 
          error: "Queue not found",
          code: 40401,
          statusCode: 404 
        });

      try {
        await controlApi.deleteQueue(testAppId, "nonexistent");
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(404);
      }
    });

    it("should handle authorization errors", async function () {
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(403, { 
          error: "Insufficient permissions",
          code: 40300,
          statusCode: 403 
        });

      try {
        await controlApi.listQueues(testAppId);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(403);
      }
    });

    it("should handle server errors gracefully", async function () {
      nock(baseUrl)
        .post(`/v1/apps/${testAppId}/queues`)
        .reply(500, { 
          error: "Internal server error",
          code: 50000,
          statusCode: 500 
        });

      try {
        await controlApi.createQueue(testAppId, {
          name: "test-queue",
        });
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(500);
      }
    });

    it("should handle rate limiting", async function () {
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(429, { 
          error: "Rate limit exceeded",
          code: 42900,
          statusCode: 429 
        });

      try {
        await controlApi.listQueues(testAppId);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(429);
      }
    });
  });

  describe("Queue Management Scenarios", function () {
    it("should handle queue with messages", async function () {
      const queueWithMessages = {
        id: "active-queue",
        appId: testAppId,
        name: "active-queue",
        region: "us-east-1",
        ttl: 3600,
        maxLength: 1000,
        deadletter: false,
        deadletterId: "",
        state: "active",
        amqp: {
          uri: `amqps://example.com/${testAppId}/active-queue`,
          queueName: `${testAppId}-active-queue`,
        },
        stomp: {
          uri: `stomp://example.com:61614/${testAppId}/active-queue`,
          host: "example.com",
          destination: `/queue/${testAppId}-active-queue`,
        },
        messages: {
          ready: 150,
          total: 200,
          unacknowledged: 50,
        },
        stats: {
          publishRate: 10.5,
          deliveryRate: 8.2,
          acknowledgementRate: 7.8,
        },
      };

      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(200, [queueWithMessages]);

      const queues = await controlApi.listQueues(testAppId);
      expect(queues).to.have.lengthOf(1);
      
      const queue = queues[0];
      expect(queue.messages.ready).to.equal(150);
      expect(queue.messages.total).to.equal(200);
      expect(queue.messages.unacknowledged).to.equal(50);
      expect(queue.stats.publishRate).to.equal(10.5);
      expect(queue.stats.deliveryRate).to.equal(8.2);
      expect(queue.stats.acknowledgementRate).to.equal(7.8);
    });

    it("should handle dead letter queue configuration", async function () {
      const mainQueue = {
        id: "main-queue",
        appId: testAppId,
        name: "main-queue",
        region: "us-east-1",
        ttl: 3600,
        maxLength: 1000,
        deadletter: true,
        deadletterId: "main-queue-dlq",
        state: "active",
        amqp: {
          uri: `amqps://example.com/${testAppId}/main-queue`,
          queueName: `${testAppId}-main-queue`,
        },
        stomp: {
          uri: `stomp://example.com:61614/${testAppId}/main-queue`,
          host: "example.com",
          destination: `/queue/${testAppId}-main-queue`,
        },
        messages: {
          ready: 0,
          total: 0,
          unacknowledged: 0,
        },
        stats: {
          publishRate: null,
          deliveryRate: null,
          acknowledgementRate: null,
        },
      };

      const deadLetterQueue = {
        id: "main-queue-dlq",
        appId: testAppId,
        name: "main-queue-dlq",
        region: "us-east-1",
        ttl: 86400, // Longer TTL for DLQ
        maxLength: 100,
        deadletter: false,
        deadletterId: "",
        state: "active",
        amqp: {
          uri: `amqps://example.com/${testAppId}/main-queue-dlq`,
          queueName: `${testAppId}-main-queue-dlq`,
        },
        stomp: {
          uri: `stomp://example.com:61614/${testAppId}/main-queue-dlq`,
          host: "example.com",
          destination: `/queue/${testAppId}-main-queue-dlq`,
        },
        messages: {
          ready: 5,
          total: 5,
          unacknowledged: 0,
        },
        stats: {
          publishRate: 0.1,
          deliveryRate: 0,
          acknowledgementRate: 0,
        },
      };

      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(200, [mainQueue, deadLetterQueue]);

      const queues = await controlApi.listQueues(testAppId);
      expect(queues).to.have.lengthOf(2);

      const main = queues.find(q => q.name === "main-queue");
      const dlq = queues.find(q => q.name === "main-queue-dlq");

      expect(main?.deadletter).to.be.true;
      expect(main?.deadletterId).to.equal("main-queue-dlq");
      expect(dlq?.deadletter).to.be.false;
      expect(dlq?.messages.ready).to.equal(5);
    });

    it("should handle multiple queues for different message types", async function () {
      const queues = [
        {
          id: "email-queue",
          name: "email-queue",
          region: "us-east-1",
          ttl: 1800, // 30 minutes
          maxLength: 10000,
        },
        {
          id: "sms-queue", 
          name: "sms-queue",
          region: "us-east-1",
          ttl: 300, // 5 minutes (urgent)
          maxLength: 5000,
        },
        {
          id: "webhook-queue",
          name: "webhook-queue",
          region: "eu-west-1",
          ttl: 3600, // 1 hour
          maxLength: 20000,
        },
      ];

      const mockQueues = queues.map(q => ({
        ...q,
        appId: testAppId,
        deadletter: false,
        deadletterId: "",
        state: "active",
        amqp: {
          uri: `amqps://${q.region}.example.com/${testAppId}/${q.name}`,
          queueName: `${testAppId}-${q.name}`,
        },
        stomp: {
          uri: `stomp://${q.region}.example.com:61614/${testAppId}/${q.name}`,
          host: `${q.region}.example.com`,
          destination: `/queue/${testAppId}-${q.name}`,
        },
        messages: {
          ready: Math.floor(Math.random() * 100),
          total: Math.floor(Math.random() * 150),
          unacknowledged: Math.floor(Math.random() * 50),
        },
        stats: {
          publishRate: Math.random() * 10,
          deliveryRate: Math.random() * 8,
          acknowledgementRate: Math.random() * 7,
        },
      }));

      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(200, mockQueues);

      const result = await controlApi.listQueues(testAppId);
      expect(result).to.have.lengthOf(3);

      const emailQueue = result.find(q => q.name === "email-queue");
      const smsQueue = result.find(q => q.name === "sms-queue");
      const webhookQueue = result.find(q => q.name === "webhook-queue");

      expect(emailQueue?.ttl).to.equal(1800);
      expect(smsQueue?.ttl).to.equal(300);
      expect(webhookQueue?.region).to.equal("eu-west-1");
    });
  });

  describe("Queue Deletion Scenarios", function () {
    it("should handle cascade deletion implications", async function () {
      const queueName = "cascade-test";

      // Mock checking queue exists before deletion (via list)
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(200, [{
          id: queueName,
          appId: testAppId,
          name: queueName,
          region: "us-east-1",
          ttl: 3600,
          maxLength: 1000,
          deadletter: false,
          deadletterId: "",
          state: "active",
          amqp: {
            uri: `amqps://example.com/${testAppId}/${queueName}`,
            queueName: `${testAppId}-${queueName}`,
          },
          stomp: {
            uri: `stomp://example.com:61614/${testAppId}/${queueName}`,
            host: "example.com",
            destination: `/queue/${testAppId}-${queueName}`,
          },
          messages: {
            ready: 0,
            total: 0,
            unacknowledged: 0,
          },
          stats: {
            publishRate: null,
            deliveryRate: null,
            acknowledgementRate: null,
          },
        }]);

      // Mock successful deletion
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/queues/${queueName}`)
        .reply(204);

      // First verify the queue exists
      const queues = await controlApi.listQueues(testAppId);
      expect(queues).to.have.lengthOf(1);
      expect(queues[0].name).to.equal(queueName);

      // Then delete it
      await controlApi.deleteQueue(testAppId, queueName);

      // Mock subsequent list to return empty array
      nock(baseUrl)
        .get(`/v1/apps/${testAppId}/queues`)
        .reply(200, []);

      // Verify it's gone
      const queuesAfterDelete = await controlApi.listQueues(testAppId);
      expect(queuesAfterDelete).to.have.lengthOf(0);
    });

    it("should handle deletion of non-existent queue", async function () {
      nock(baseUrl)
        .delete(`/v1/apps/${testAppId}/queues/nonexistent`)
        .reply(404, { 
          error: "Queue not found",
          code: 40401,
          statusCode: 404 
        });

      try {
        await controlApi.deleteQueue(testAppId, "nonexistent");
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.status).to.equal(404);
      }
    });
  });
});