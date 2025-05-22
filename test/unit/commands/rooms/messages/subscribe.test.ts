import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import MessagesSubscribe from "../../../../../src/commands/rooms/messages/subscribe.js";

// Lightweight testable subclass to intercept parsing and client creation
class TestableMessagesSubscribe extends MessagesSubscribe {
  private _parseResult: any;
  public mockRealtimeClient: any;
  public mockChatClient: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  public override async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  public override async createChatClient(_flags: any) {
    return this.mockChatClient;
  }

  protected override async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  protected override interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

describe("rooms messages subscribe", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableMessagesSubscribe;
  let mockConfig: Config;
  let mockRoom: any;
  let subscribeStub: sinon.SinonStub;
  let attachStub: sinon.SinonStub;
  let unsubscribeStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableMessagesSubscribe([], mockConfig);

    subscribeStub = sandbox.stub().returns({ unsubscribe: sandbox.stub() });
    attachStub = sandbox.stub().resolves();
    unsubscribeStub = sandbox.stub();

    // Mock Chat Room
    mockRoom = {
      attach: attachStub,
      messages: {
        subscribe: subscribeStub,
        unsubscribeAll: unsubscribeStub,
        send: sandbox.stub(),
        get: sandbox.stub().resolves([]),
        delete: sandbox.stub(),
        update: sandbox.stub(),
        reactions: {
          send: sandbox.stub(),
          subscribe: sandbox.stub(),
          get: sandbox.stub(),
        },
      },
    };

    // Mock Chat Client
    command.mockChatClient = {
      rooms: {
        get: sandbox.stub().resolves(mockRoom),
        release: sandbox.stub().resolves(),
      },
    };

    // Mock Realtime Client
    command.mockRealtimeClient = {
      connection: {
        on: sandbox.stub(),
        state: "connected",
        close: sandbox.stub(),
      },
      close: sandbox.stub(),
    };

    command.setParseResult({
      flags: {
        json: false,
        "pretty-json": false,
        "no-prompt": false,
      },
      args: { 
        roomId: "test-room"
      },
      argv: [],
      raw: [],
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("should subscribe to room messages successfully", async function () {
    // Mock process.stdin to simulate user pressing Ctrl+C
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    // Simulate immediate exit to avoid hanging test
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 100);

    await command.run();

    expect(attachStub).to.have.been.calledOnce;
    expect(subscribeStub).to.have.been.calledOnce;
    expect(command.mockChatClient.rooms.get).to.have.been.calledWith("test-room");
  });

  it("should handle subscription with listener callback", async function () {
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    const logStub = sandbox.stub(command, "log");

    // Mock a message being received
    subscribeStub.callsFake((listener: any) => {
      // Simulate receiving a message
      setTimeout(() => {
        listener({
          text: "Hello World!",
          clientId: "test-client",
          timestamp: new Date(),
          metadata: { test: true },
        });
      }, 50);
      return { unsubscribe: unsubscribeStub };
    });

    // Exit after receiving message
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 150);

    await command.run();

    expect(subscribeStub).to.have.been.calledOnce;
    expect(logStub).to.have.been.called;
  });

  it("should handle room attachment failure", async function () {
    attachStub.rejects(new Error("Failed to attach to room"));
    
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: { json: true },
      args: { roomId: "test-room" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(attachStub).to.have.been.calledOnce;
    expect(subscribeStub).to.not.have.been.called;
  });

  it("should output JSON format when requested", async function () {
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: { json: true },
      args: { roomId: "test-room" },
      argv: [],
      raw: [],
    });

    // Mock a message being received
    subscribeStub.callsFake((listener: any) => {
      setTimeout(() => {
        listener({
          text: "Hello World!",
          clientId: "test-client",
          timestamp: new Date(),
        });
      }, 50);
      return { unsubscribe: unsubscribeStub };
    });

    // Exit after receiving message
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 150);

    await command.run();

    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        try {
          const parsed = JSON.parse(output);
          return typeof parsed === 'object';
        } catch {
          return false;
        }
      })
    );
  });

  it("should clean up resources in finally block", async function () {
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    // Immediate exit
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 50);

    await command.run();

    expect(command.mockRealtimeClient.close).to.have.been.calledOnce;
    expect(command.mockChatClient.rooms.release).to.have.been.calledWith("test-room");
  });

  it("should handle no-prompt flag", async function () {
    command.setParseResult({
      flags: {
        json: false,
        "no-prompt": true,
      },
      args: { roomId: "test-room" },
      argv: [],
      raw: [],
    });

    // Should exit immediately with no-prompt flag
    await command.run();

    expect(attachStub).to.have.been.calledOnce;
    expect(subscribeStub).to.have.been.calledOnce;
    expect(command.mockChatClient.rooms.release).to.have.been.calledWith("test-room");
  });
});