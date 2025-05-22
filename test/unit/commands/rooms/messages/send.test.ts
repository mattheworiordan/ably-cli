import { expect } from "chai";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import chai from "chai";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import MessagesSend from "../../../../../src/commands/rooms/messages/send.js";

// Configure Chai to use sinon-chai
chai.use(sinonChai);

// Lightweight testable subclass to intercept parsing and client creation
class TestablMessagesSend extends MessagesSend {
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

describe("rooms messages send", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestablMessagesSend;
  let mockConfig: Config;
  let mockRoom: any;
  let sendStub: sinon.SinonStub;
  let attachStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestablMessagesSend([], mockConfig);

    sendStub = sandbox.stub().resolves();
    attachStub = sandbox.stub().resolves();

    // Mock Chat Room
    mockRoom = {
      attach: attachStub,
      messages: {
        send: sendStub,
        subscribe: sandbox.stub(),
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
        count: 1,
        delay: 0,
      },
      args: { 
        roomId: "test-room",
        text: "Hello World!"
      },
      argv: [],
      raw: [],
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("should send a single message successfully", async function () {
    await command.run();

    expect(attachStub).to.have.been.calledOnce;
    expect(sendStub).to.have.been.calledOnce;
    expect(sendStub).to.have.been.calledWith({
      text: "Hello World!",
    });
    expect(command.mockChatClient.rooms.get).to.have.been.calledWith("test-room");
    expect(command.mockChatClient.rooms.release).to.have.been.calledWith("test-room");
  });

  it("should send message with metadata when provided", async function () {
    command.setParseResult({
      flags: {
        json: false,
        "pretty-json": false,
        count: 1,
        delay: 0,
        metadata: '{"isImportant": true}',
      },
      args: { 
        roomId: "test-room",
        text: "Important message"
      },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(sendStub).to.have.been.calledWith({
      text: "Important message",
      metadata: { isImportant: true },
    });
  });

  it("should handle invalid metadata JSON", async function () {
    command.setParseResult({
      flags: {
        json: true,
        count: 1,
        delay: 0,
        metadata: 'invalid-json',
      },
      args: { 
        roomId: "test-room",
        text: "Hello"
      },
      argv: [],
      raw: [],
    });

    // Mock log to capture output
    const logStub = sandbox.stub(command, "log");

    await command.run();

    expect(sendStub).to.not.have.been.called;
    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        const parsed = JSON.parse(output);
        return parsed.error.includes("Invalid metadata JSON") && parsed.success === false;
      })
    );
  });

  it("should send multiple messages with delay", async function () {
    command.setParseResult({
      flags: {
        json: false,
        count: 3,
        delay: 50,
      },
      args: { 
        roomId: "test-room",
        text: "Message {{.Count}}"
      },
      argv: [],
      raw: [],
    });

    // Speed up the test by stubbing setTimeout
    const clock = sandbox.useFakeTimers();

    const runPromise = command.run();
    
    // Fast-forward timers to complete delays
    clock.tick(1000);
    
    await runPromise;

    expect(sendStub).to.have.been.calledThrice;
    expect(sendStub.getCall(0)).to.have.been.calledWith({ text: "Message 1" });
    expect(sendStub.getCall(1)).to.have.been.calledWith({ text: "Message 2" });
    expect(sendStub.getCall(2)).to.have.been.calledWith({ text: "Message 3" });

    clock.restore();
  });

  it("should interpolate timestamp in messages", async function () {
    const clock = sandbox.useFakeTimers(1234567890000);
    
    command.setParseResult({
      flags: {
        json: false,
        count: 1,
        delay: 0,
      },
      args: { 
        roomId: "test-room",
        text: "Message at {{.Timestamp}}"
      },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(sendStub).to.have.been.calledWith({
      text: "Message at 1234567890000",
    });

    clock.restore();
  });

  it("should enforce minimum delay for multiple messages", async function () {
    command.setParseResult({
      flags: {
        json: false,
        count: 2,
        delay: 5, // Less than minimum 10ms
      },
      args: { 
        roomId: "test-room",
        text: "Hello"
      },
      argv: [],
      raw: [],
    });

    const clock = sandbox.useFakeTimers();
    const runPromise = command.run();
    
    // The delay should be enforced to 10ms minimum
    clock.tick(100);
    await runPromise;

    expect(sendStub).to.have.been.calledTwice;
    
    clock.restore();
  });

  it("should handle room attachment failure", async function () {
    attachStub.rejects(new Error("Failed to attach to room"));
    
    const logStub = sandbox.stub(command, "log");
    const errorStub = sandbox.stub(command, "error");

    command.setParseResult({
      flags: { json: true },
      args: { roomId: "test-room", text: "Hello" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(attachStub).to.have.been.calledOnce;
    expect(sendStub).to.not.have.been.called;
  });

  it("should handle message send failure", async function () {
    sendStub.rejects(new Error("Failed to send message"));
    
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: { json: true },
      args: { roomId: "test-room", text: "Hello" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(sendStub).to.have.been.calledOnce;
    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        const parsed = JSON.parse(output);
        return parsed.error.includes("Failed to send message") && parsed.success === false;
      })
    );
  });

  it("should output JSON format when requested", async function () {
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: { json: true },
      args: { roomId: "test-room", text: "Hello" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        const parsed = JSON.parse(output);
        return parsed.success === true && parsed.roomId === "test-room";
      })
    );
  });

  it("should clean up resources in finally block", async function () {
    await command.run();

    expect(command.mockRealtimeClient.close).to.have.been.calledOnce;
    expect(command.mockChatClient.rooms.release).to.have.been.calledWith("test-room");
  });
});