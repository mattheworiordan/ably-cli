import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ChannelsPresenceEnter from "../../../../../src/commands/channels/presence/enter.js";
import * as Ably from "ably";

// Create a testable version of ChannelsPresenceEnter
class TestableChannelsPresenceEnter extends ChannelsPresenceEnter {
  public logOutput: string[] = [];
  public errorOutput: string = '';
  private _parseResult: any;
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  // Override parse to simulate parse output
  public override async parse() {
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Mock client object
  public mockClient: any = null;
  public mockChannel: any = null;
  public mockPresence: any = null;

  // Override client creation method
  public override async createAblyClient(_flags: any): Promise<Ably.Realtime | null> {
    this.debug('Using mock Realtime client');
    return this.mockClient as unknown as Ably.Realtime;
  }

  // Override logging methods
  public override log(message?: string | undefined, ...args: any[]): void {
    if (message) {
      this.logOutput.push(message);
    }
  }

  public override error(message: string | Error, _options?: { code?: string; exit?: number | false }): never {
    this.errorOutput = typeof message === 'string' ? message : message.message;
    throw new Error(this.errorOutput);
  }

  // Override JSON output methods
  public override shouldOutputJson(_flags?: any): boolean {
    return this._shouldOutputJson;
  }

  public setShouldOutputJson(value: boolean) {
    this._shouldOutputJson = value;
  }

  public override formatJsonOutput(data: Record<string, unknown>, _flags?: Record<string, unknown>): string {
    return this._formatJsonOutputFn ? this._formatJsonOutputFn(data) : JSON.stringify(data);
  }

  public setFormatJsonOutput(fn: (data: Record<string, unknown>) => string) {
    this._formatJsonOutputFn = fn;
  }

  // Override ensureAppAndKey to prevent real auth checks in unit tests
  protected override async ensureAppAndKey(_flags: any): Promise<{ apiKey: string; appId: string } | null> {
    this.debug('Skipping ensureAppAndKey in test mode');
    return { apiKey: 'dummy-key-value:secret', appId: 'dummy-app' };
  }
}

describe("ChannelsPresenceEnter", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableChannelsPresenceEnter;
  let mockConfig: Config;
  let mockPresenceEnter: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableChannelsPresenceEnter([], mockConfig);

    // Create stubs for the presence enter method
    mockPresenceEnter = sinon.stub().resolves();

    // Set up the mock presence object
    command.mockPresence = {
      enter: mockPresenceEnter,
      leave: sinon.stub().resolves(),
      get: sinon.stub().resolves([])
    };

    // Set up the mock channel
    command.mockChannel = {
      presence: command.mockPresence,
      attach: sinon.stub().resolves(),
      detach: sinon.stub().resolves(),
      on: sinon.stub(),
      once: sinon.stub()
    };

    // Set up the mock client
    command.mockClient = {
      channels: {
        get: sinon.stub().returns(command.mockChannel)
      },
      connection: {
        on: sinon.stub(),
        once: sinon.stub().callsArg(1), // Simulate immediate connection
        state: 'connected'
      },
      close: sinon.stub()
    };

    // Set default parse result
    command.setParseResult({
      flags: { 
        'client-id': 'test-client-123',
        wait: false
      },
      args: { 
        channel: 'test-presence-channel', 
        data: '{"name":"Test User","status":"online"}' 
      },
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should enter presence successfully", async function() {
    await command.run();

    // Check that channels.get was called with the right channel name
    expect(command.mockClient.channels.get.calledOnce).to.be.true;
    expect(command.mockClient.channels.get.firstCall.args[0]).to.equal('test-presence-channel');

    // Check that presence.enter was called with correct data and client ID
    expect(mockPresenceEnter.calledOnce).to.be.true;
    const enterArgs = mockPresenceEnter.firstCall.args;
    expect(enterArgs[0]).to.deep.equal({ name: "Test User", status: "online" });
    expect(enterArgs[1]).to.equal('test-client-123');

    // Check for expected output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('Entered presence on channel "test-presence-channel"');
    expect(output).to.include('Client ID: test-client-123');
  });

  it("should handle string data input", async function() {
    command.setParseResult({
      flags: { 
        'client-id': 'test-client-123',
        wait: false
      },
      args: { 
        channel: 'test-presence-channel', 
        data: 'simple string data' 
      },
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockPresenceEnter.calledOnce).to.be.true;
    const enterArgs = mockPresenceEnter.firstCall.args;
    expect(enterArgs[0]).to.equal('simple string data');
    expect(enterArgs[1]).to.equal('test-client-123');
  });

  it("should handle null/empty data", async function() {
    command.setParseResult({
      flags: { 
        'client-id': 'test-client-123',
        wait: false
      },
      args: { 
        channel: 'test-presence-channel', 
        data: '' 
      },
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockPresenceEnter.calledOnce).to.be.true;
    const enterArgs = mockPresenceEnter.firstCall.args;
    expect(enterArgs[0]).to.be.null;
    expect(enterArgs[1]).to.equal('test-client-123');
  });

  it("should wait for presence enter when --wait flag is used", async function() {
    command.setParseResult({
      flags: { 
        'client-id': 'test-client-123',
        wait: true
      },
      args: { 
        channel: 'test-presence-channel', 
        data: '{"name":"Test User"}' 
      },
      argv: [],
      raw: []
    });

    // Set up presence event simulation
    let presenceCallback: any = null;
    command.mockPresence.subscribe = sinon.stub().callsFake((eventOrCallback: any, callback?: any) => {
      if (typeof eventOrCallback === 'function') {
        presenceCallback = eventOrCallback;
      } else if (callback) {
        presenceCallback = callback;
      }
      // Simulate presence enter event after a short delay
      setTimeout(() => {
        if (presenceCallback) {
          presenceCallback({
            action: 'enter',
            clientId: 'test-client-123',
            data: { name: 'Test User' }
          });
        }
      }, 10);
    });

    command.mockPresence.unsubscribe = sinon.stub();

    await command.run();

    expect(mockPresenceEnter.calledOnce).to.be.true;
    expect(command.mockPresence.subscribe.called).to.be.true;
    expect(command.mockPresence.unsubscribe.called).to.be.true;

    const output = command.logOutput.join('\n');
    expect(output).to.include('Waiting for presence confirmation');
    expect(output).to.include('Presence confirmed');
  });

  it("should handle presence enter failures", async function() {
    const presenceError = new Error("Presence enter failed");
    mockPresenceEnter.rejects(presenceError);

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch (error: any) {
      expect(mockPresenceEnter.called).to.be.true;
      expect(error.message).to.include('Presence enter failed');
    }
  });

  it("should handle connection state changes", async function() {
    // Set up connection state change handlers
    let connectionCallback: any = null;
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected' || typeof event === 'function') {
        connectionCallback = typeof event === 'function' ? event : callback;
      }
    });

    await command.run();

    expect(command.mockClient.connection.on.called).to.be.true;
    expect(mockPresenceEnter.calledOnce).to.be.true;
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput(data => JSON.stringify({
      ...data,
      success: true,
      timestamp: new Date().toISOString()
    }));

    await command.run();

    expect(mockPresenceEnter.calledOnce).to.be.true;

    // Check for JSON output in the logs
    const jsonOutput = command.logOutput.find(log => log.includes('success'));
    expect(jsonOutput).to.exist;

    if (jsonOutput) {
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).to.have.property('success', true);
      expect(parsed).to.have.property('channel', 'test-presence-channel');
      expect(parsed).to.have.property('clientId', 'test-client-123');
    }
  });

  it("should handle invalid JSON data", async function() {
    command.setParseResult({
      flags: { 
        'client-id': 'test-client-123',
        wait: false
      },
      args: { 
        channel: 'test-presence-channel', 
        data: '{"invalid": json}' 
      },
      argv: [],
      raw: []
    });

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch (error: any) {
      expect(error.message).to.include('Invalid JSON');
    }
  });

  it("should properly clean up resources", async function() {
    await command.run();

    expect(command.mockClient.close.calledOnce).to.be.true;
  });

  it("should handle channel attachment", async function() {
    // Set up channel state change handler
    let channelCallback: any = null;
    command.mockChannel.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'attached' || typeof event === 'function') {
        channelCallback = typeof event === 'function' ? event : callback;
      }
    });

    await command.run();

    expect(command.mockChannel.attach.called).to.be.true;
    expect(mockPresenceEnter.calledOnce).to.be.true;
  });
});
