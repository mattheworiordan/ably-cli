import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import BenchPublisher from "../../../../src/commands/bench/publisher.js";

// Lightweight testable subclass to intercept parsing and client creation
class TestableBenchPublisher extends BenchPublisher {
  private _parseResult: any;
  public mockRealtimeClient: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  public override async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
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

describe("bench publisher", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableBenchPublisher;
  let mockConfig: Config;
  let publishStub: sinon.SinonStub;
  let mockChannel: any;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableBenchPublisher([], mockConfig);

    publishStub = sandbox.stub().resolves();

    // Mock channel
    mockChannel = {
      publish: publishStub,
      subscribe: sandbox.stub(),
      presence: {
        enter: sandbox.stub().resolves(),
        get: sandbox.stub().resolves([]),
        subscribe: sandbox.stub(),
        unsubscribe: sandbox.stub(),
      },
      on: sandbox.stub(),
    };

    command.mockRealtimeClient = {
      channels: { get: sandbox.stub().returns(mockChannel) },
      connection: { on: sandbox.stub(), state: "connected" },
      close: sandbox.stub(),
    };

    // Speed up test by stubbing out internal delay utility
    sandbox.stub(command as any, "delay").resolves();

    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 10,
        rate: 5,
        "message-size": 100,
        "wait-for-subscribers": false,
        json: false,
        "pretty-json": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("should publish control envelopes in correct order", async function () {
    await command.run();

    const publishedPayloads = publishStub.getCalls().map((c) => c.args[1]);

    expect(publishedPayloads[0]).to.have.property("type", "start");
    
    const messagePayload = publishedPayloads.find((p) => p.type === "message");
    expect(messagePayload).to.not.be.undefined;
    
    const lastPayload = publishedPayloads.at(-1);
    expect(lastPayload).to.have.property("type", "end");
  });

  it("should generate messages with correct size", async function () {
    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 2,
        rate: 2,
        "message-size": 50,
        "wait-for-subscribers": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    await command.run();

    const messagePayloads = publishStub.getCalls()
      .map((c) => c.args[1])
      .filter((p) => p.type === "message");

    messagePayloads.forEach((payload) => {
      expect(payload.data).to.be.a("string");
      expect(payload.data.length).to.be.approximately(50, 10); // Allow some variance
    });
  });

  it("should respect rate limiting", async function () {
    const clock = sandbox.useFakeTimers();
    
    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 5,
        rate: 2, // 2 messages per second
        "message-size": 50,
        "wait-for-subscribers": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    const runPromise = command.run();
    
    // Fast forward time to allow rate limiting to work
    clock.tick(5000); // 5 seconds should be enough for 5 messages at 2/sec
    
    await runPromise;

    const messagePayloads = publishStub.getCalls()
      .map((c) => c.args[1])
      .filter((p) => p.type === "message");
    
    expect(messagePayloads).to.have.length(5);
    
    clock.restore();
  });

  it("should include metrics in end control envelope", async function () {
    const clock = sandbox.useFakeTimers();
    const startTime = Date.now();
    
    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 3,
        rate: 10,
        "message-size": 100,
        "wait-for-subscribers": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    const runPromise = command.run();
    clock.tick(1000);
    await runPromise;

    const endPayload = publishStub.getCalls()
      .map((c) => c.args[1])
      .find((p) => p.type === "end");

    expect(endPayload).to.have.property("metrics");
    expect(endPayload.metrics).to.have.property("totalMessages", 3);
    expect(endPayload.metrics).to.have.property("messageSize", 100);
    expect(endPayload.metrics).to.have.property("duration");
    
    clock.restore();
  });

  it("should wait for subscribers when flag is set", async function () {
    const presenceGetStub = sandbox.stub(mockChannel.presence, "get").resolves([
      { clientId: "subscriber-1" },
      { clientId: "subscriber-2" },
    ]);

    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 2,
        rate: 5,
        "message-size": 50,
        "wait-for-subscribers": true,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(presenceGetStub).to.have.been.called;
    
    const startPayload = publishStub.getCalls()
      .map((c) => c.args[1])
      .find((p) => p.type === "start");
    
    expect(startPayload).to.have.property("waitingForSubscribers", true);
  });

  it("should handle realtime transport errors", async function () {
    publishStub.rejects(new Error("Connection failed"));
    
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 1,
        rate: 1,
        "message-size": 50,
        json: true,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(logStub).to.have.been.called;
  });

  it("should output JSON format when requested", async function () {
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 2,
        rate: 5,
        "message-size": 50,
        json: true,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        try {
          const parsed = JSON.parse(output);
          return parsed.success !== undefined && parsed.metrics !== undefined;
        } catch {
          return false;
        }
      })
    );
  });

  it("should handle custom message patterns", async function () {
    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 3,
        rate: 5,
        "message-size": 0, // Use pattern instead of size
        pattern: "Hello {{.Index}} at {{.Timestamp}}",
        "wait-for-subscribers": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    await command.run();

    const messagePayloads = publishStub.getCalls()
      .map((c) => c.args[1])
      .filter((p) => p.type === "message");

    messagePayloads.forEach((payload, index) => {
      expect(payload.data).to.include(`Hello ${index + 1}`);
      expect(payload.data).to.match(/\d{13}/); // Timestamp pattern
    });
  });

  it("should clean up resources in finally block", async function () {
    await command.run();

    expect(command.mockRealtimeClient.close).to.have.been.calledOnce;
  });

  it("should handle connection state changes", async function () {
    const connectionOnStub = sandbox.stub(command.mockRealtimeClient.connection, "on");

    await command.run();

    expect(connectionOnStub).to.have.been.called;
    
    // Test connection state change handler
    const stateChangeHandler = connectionOnStub.getCalls()
      .find(call => call.args[0] === "statechange")?.args[1];
    
    if (stateChangeHandler) {
      stateChangeHandler({ current: "disconnected", previous: "connected" });
    }
  });

  it("should calculate correct throughput metrics", async function () {
    const clock = sandbox.useFakeTimers();
    
    command.setParseResult({
      flags: {
        transport: "realtime",
        messages: 10,
        rate: 10,
        "message-size": 100,
        "wait-for-subscribers": false,
      },
      args: { channel: "test-channel" },
      argv: [],
      raw: [],
    });

    const runPromise = command.run();
    clock.tick(2000); // 2 seconds
    await runPromise;

    const endPayload = publishStub.getCalls()
      .map((c) => c.args[1])
      .find((p) => p.type === "end");

    expect(endPayload.metrics).to.have.property("messagesPerSecond");
    expect(endPayload.metrics).to.have.property("bytesPerSecond");
    expect(endPayload.metrics.totalMessages).to.equal(10);
    
    clock.restore();
  });
});