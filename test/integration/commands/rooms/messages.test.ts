import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";

import MessagesSend from "../../../../src/commands/rooms/messages/send.js";
import MessagesSubscribe from "../../../../src/commands/rooms/messages/subscribe.js";
import { registerMock } from "../../test-utils.js";

describe("Chat Messages Integration", function () {
  let sandbox: sinon.SinonSandbox;
  let mockConfig: Config;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;

    // Set test mode
    process.env.ABLY_CLI_TEST_MODE = "true";

    // Register comprehensive mocks for Chat SDK
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
      occupancy: {
        get: sandbox.stub().resolves({ connections: 5, presenceMembers: 2 }),
        subscribe: sandbox.stub().returns({ unsubscribe: sandbox.stub() }),
      },
      presence: {
        enter: sandbox.stub().resolves(),
        leave: sandbox.stub().resolves(),
        get: sandbox.stub().resolves([]),
        subscribe: sandbox.stub().returns({ unsubscribe: sandbox.stub() }),
      },
      reactions: {
        send: sandbox.stub().resolves(),
        subscribe: sandbox.stub().returns({ unsubscribe: sandbox.stub() }),
        get: sandbox.stub().resolves([]),
      },
      typing: {
        start: sandbox.stub().resolves(),
        stop: sandbox.stub().resolves(),
        get: sandbox.stub().resolves(new Set()),
        subscribe: sandbox.stub().returns({ unsubscribe: sandbox.stub() }),
      },
    };

    const mockChatClient = {
      rooms: {
        get: sandbox.stub().resolves(mockChatRoom),
        release: sandbox.stub().resolves(),
      },
    };

    const mockRealtimeClient = {
      connection: {
        on: sandbox.stub(),
        state: "connected",
        close: sandbox.stub(),
      },
      channels: {
        get: sandbox.stub().returns({
          publish: sandbox.stub().resolves(),
          subscribe: sandbox.stub(),
          presence: {
            enter: sandbox.stub().resolves(),
            get: sandbox.stub().resolves([]),
            subscribe: sandbox.stub(),
          },
          on: sandbox.stub(),
        }),
      },
      close: sandbox.stub(),
    };

    registerMock("chatClient", mockChatClient);
    registerMock("chatRoom", mockChatRoom);
    registerMock("realtimeClient", mockRealtimeClient);
  });

  afterEach(function () {
    sandbox.restore();
    delete process.env.ABLY_CLI_TEST_MODE;
    delete (globalThis as any).__TEST_MOCKS__;
  });

  describe("Message Send Flow", function () {
    it("should complete full message send lifecycle", async function () {
      const command = new MessagesSend(
        ["test-room", "Hello World!"],
        mockConfig
      );

      // Mock successful CLI flow
      const logStub = sandbox.stub(command, "log");

      await command.run();

      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      
      // Verify room lifecycle
      expect(chatRoom.attach).to.have.been.calledOnce;
      expect(chatRoom.messages.send).to.have.been.calledOnce;
      expect(chatRoom.messages.send).to.have.been.calledWith({
        text: "Hello World!",
      });

      // Verify Chat client cleanup
      const chatClient = (globalThis as any).__TEST_MOCKS__.chatClient;
      expect(chatClient.rooms.release).to.have.been.calledWith("test-room");
    });

    it("should handle message send with metadata", async function () {
      const command = new MessagesSend(
        ["test-room", "Important message", "--metadata", '{"priority": "high"}'],
        mockConfig
      );

      await command.run();

      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      expect(chatRoom.messages.send).to.have.been.calledWith({
        text: "Important message",
        metadata: { priority: "high" },
      });
    });

    it("should handle multiple messages with interpolation", async function () {
      const clock = sandbox.useFakeTimers();
      
      const command = new MessagesSend(
        [
          "test-room", 
          "Message {{.Count}}", 
          "--count", "3",
          "--delay", "100"
        ],
        mockConfig
      );

      const runPromise = command.run();
      
      // Fast-forward time to complete all delays
      clock.tick(1000);
      
      await runPromise;

      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      expect(chatRoom.messages.send).to.have.been.calledThrice;
      
      // Check interpolated content
      expect(chatRoom.messages.send.getCall(0)).to.have.been.calledWith(
        sinon.match({ text: "Message 1" })
      );
      expect(chatRoom.messages.send.getCall(1)).to.have.been.calledWith(
        sinon.match({ text: "Message 2" })
      );
      expect(chatRoom.messages.send.getCall(2)).to.have.been.calledWith(
        sinon.match({ text: "Message 3" })
      );

      clock.restore();
    });

    it("should handle room attachment failure gracefully", async function () {
      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      chatRoom.attach.rejects(new Error("Room not found"));

      const command = new MessagesSend(
        ["nonexistent-room", "Hello", "--json"],
        mockConfig
      );

      const logStub = sandbox.stub(command, "log");

      await command.run();

      expect(chatRoom.attach).to.have.been.calledOnce;
      expect(chatRoom.messages.send).to.not.have.been.called;
    });
  });

  describe("Message Subscribe Flow", function () {
    it("should establish subscription and handle messages", async function () {
      const command = new MessagesSubscribe(
        ["test-room", "--no-prompt"],
        mockConfig
      );

      let messageListener: any;
      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      chatRoom.messages.subscribe.callsFake((listener: any) => {
        messageListener = listener;
        return { unsubscribe: sandbox.stub() };
      });

      const logStub = sandbox.stub(command, "log");

      await command.run();

      // Verify subscription was established
      expect(chatRoom.attach).to.have.been.calledOnce;
      expect(chatRoom.messages.subscribe).to.have.been.calledOnce;

      // Simulate receiving a message
      if (messageListener) {
        messageListener({
          text: "Test message",
          clientId: "test-client",
          timestamp: new Date(),
          metadata: { source: "test" },
        });

        expect(logStub).to.have.been.called;
      }

      // Verify cleanup
      const chatClient = (globalThis as any).__TEST_MOCKS__.chatClient;
      expect(chatClient.rooms.release).to.have.been.calledWith("test-room");
    });

    it("should handle subscription with JSON output", async function () {
      const command = new MessagesSubscribe(
        ["test-room", "--json", "--no-prompt"],
        mockConfig
      );

      let messageListener: any;
      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      chatRoom.messages.subscribe.callsFake((listener: any) => {
        messageListener = listener;
        return { unsubscribe: sandbox.stub() };
      });

      const logStub = sandbox.stub(command, "log");

      await command.run();

      // Simulate message reception
      if (messageListener) {
        messageListener({
          text: "JSON message",
          clientId: "json-client",
          timestamp: new Date(),
        });

        // Verify JSON output
        expect(logStub).to.have.been.calledWith(
          sinon.match((output: string) => {
            try {
              const parsed = JSON.parse(output);
              return parsed.text === "JSON message" && parsed.clientId === "json-client";
            } catch {
              return false;
            }
          })
        );
      }
    });
  });

  describe("Error Handling", function () {
    it("should handle Chat client creation failure", async function () {
      // Override mock to simulate client creation failure
      registerMock("chatClient", null);

      const command = new MessagesSend(
        ["test-room", "Hello", "--json"],
        mockConfig
      );

      const errorStub = sandbox.stub(command, "error");

      await command.run();

      expect(errorStub).to.have.been.called;
    });

    it("should handle connection state changes", async function () {
      const command = new MessagesSend(
        ["test-room", "Hello"],
        mockConfig
      );

      let connectionListener: any;
      const realtimeClient = (globalThis as any).__TEST_MOCKS__.realtimeClient;
      realtimeClient.connection.on.callsFake((event: string, listener: any) => {
        if (event === "statechange") {
          connectionListener = listener;
        }
      });

      await command.run();

      // Simulate connection state change
      if (connectionListener) {
        connectionListener({
          current: "disconnected",
          previous: "connected",
          reason: "Connection lost",
        });
      }

      expect(realtimeClient.connection.on).to.have.been.called;
    });

    it("should handle message send failures with retry logic", async function () {
      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      
      // First call fails, subsequent calls succeed
      chatRoom.messages.send
        .onFirstCall().rejects(new Error("Network error"))
        .resolves();

      const command = new MessagesSend(
        ["test-room", "Retry message", "--count", "2"],
        mockConfig
      );

      const clock = sandbox.useFakeTimers();
      const runPromise = command.run();
      
      clock.tick(1000);
      await runPromise;

      expect(chatRoom.messages.send).to.have.been.calledTwice;
      
      clock.restore();
    });
  });

  describe("Resource Management", function () {
    it("should properly clean up resources on command completion", async function () {
      const command = new MessagesSend(
        ["test-room", "Cleanup test"],
        mockConfig
      );

      await command.run();

      const chatClient = (globalThis as any).__TEST_MOCKS__.chatClient;
      const realtimeClient = (globalThis as any).__TEST_MOCKS__.realtimeClient;

      // Verify cleanup
      expect(chatClient.rooms.release).to.have.been.calledWith("test-room");
      expect(realtimeClient.close).to.have.been.calledOnce;
    });

    it("should handle cleanup on command interruption", async function () {
      const command = new MessagesSend(
        ["test-room", "Interrupt test"],
        mockConfig
      );

      // Simulate error during execution
      const chatRoom = (globalThis as any).__TEST_MOCKS__.chatRoom;
      chatRoom.messages.send.rejects(new Error("Interrupted"));

      const logStub = sandbox.stub(command, "log");

      await command.run();

      // Cleanup should still occur
      const realtimeClient = (globalThis as any).__TEST_MOCKS__.realtimeClient;
      expect(realtimeClient.close).to.have.been.calledOnce;
    });
  });

  describe("Output Formats", function () {
    it("should handle default output format", async function () {
      const command = new MessagesSend(
        ["test-room", "Default format"],
        mockConfig
      );

      const logStub = sandbox.stub(command, "log");

      await command.run();

      expect(logStub).to.have.been.calledWith("Message sent successfully.");
    });

    it("should handle pretty JSON output format", async function () {
      const command = new MessagesSend(
        ["test-room", "Pretty JSON", "--pretty-json"],
        mockConfig
      );

      const logStub = sandbox.stub(command, "log");

      await command.run();

      expect(logStub).to.have.been.calledWith(
        sinon.match((output: string) => {
          try {
            const parsed = JSON.parse(output);
            return parsed.success === true && output.includes('\n'); // Pretty formatted
          } catch {
            return false;
          }
        })
      );
    });
  });
});