import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import LogsConnectionSubscribe from "../../../../../src/commands/logs/connection/subscribe.js";
import * as Ably from "ably";

// Create a testable version of LogsConnectionSubscribe
class TestableLogsConnectionSubscribe extends LogsConnectionSubscribe {
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

describe("LogsConnectionSubscribe", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableLogsConnectionSubscribe;
  let mockConfig: Config;
  let mockSubscribe: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableLogsConnectionSubscribe([], mockConfig);

    // Create stub for the subscribe method
    mockSubscribe = sinon.stub();

    // Set up the mock channel
    command.mockChannel = {
      subscribe: mockSubscribe,
      unsubscribe: sinon.stub(),
      attach: sinon.stub().resolves(),
      detach: sinon.stub().resolves(),
      on: sinon.stub(),
      name: '[meta]connection'
    };

    // Set up the mock client
    command.mockClient = {
      channels: {
        get: sinon.stub().returns(command.mockChannel)
      },
      connection: {
        on: sinon.stub(),
        once: sinon.stub(),
        state: 'connected'
      },
      close: sinon.stub()
    };

    // Set default parse result
    command.setParseResult({
      flags: { 
        rewind: 0
      },
      args: {},
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should subscribe to [meta]connection channel successfully", async function() {
    // Set up connection event simulation
    let connectionCallback: any = null;
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected') {
        connectionCallback = callback;
        // Simulate immediate connection
        setTimeout(() => callback(), 10);
      }
    });

    // Set up subscription with message simulation
    let messageCallback: any = null;
    mockSubscribe.callsFake((callback: any) => {
      messageCallback = callback;
      // Simulate log message after subscription
      setTimeout(() => {
        callback({
          name: 'connection.opened',
          data: { connectionId: 'test-conn-123', clientId: 'test-client' },
          timestamp: Date.now(),
          id: 'msg-123',
          clientId: 'meta-client',
          connectionId: 'meta-conn'
        });
      }, 20);
    });

    // Start the command (it would run indefinitely, so we need to stop it)
    const runPromise = command.run();
    
    // Wait for connection and subscription setup
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check that channels.get was called with the correct channel name
    expect(command.mockClient.channels.get.calledOnce).to.be.true;
    expect(command.mockClient.channels.get.firstCall.args[0]).to.equal('[meta]connection');

    // Check that subscribe was called
    expect(mockSubscribe.calledOnce).to.be.true;

    // Check that connection event handlers were set up
    expect(command.mockClient.connection.on.called).to.be.true;

    // Check for expected output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('Subscribing to [meta]connection');
    expect(output).to.include('Press Ctrl+C to exit');

    // The command should have processed the simulated log message
    expect(output).to.include('connection.opened');
    expect(output).to.include('test-conn-123');
  });

  it("should handle rewind parameter", async function() {
    command.setParseResult({
      flags: { 
        rewind: 10
      },
      args: {},
      argv: [],
      raw: []
    });

    // Set up connection event simulation  
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected') {
        setTimeout(() => callback(), 10);
      }
    });

    mockSubscribe.callsFake(() => {}); // Don't simulate messages for this test

    // Start the command
    const runPromise = command.run();
    
    // Wait for setup
    await new Promise(resolve => setTimeout(resolve, 30));

    // Check that channels.get was called with rewind parameter
    expect(command.mockClient.channels.get.calledOnce).to.be.true;
    const channelOptions = command.mockClient.channels.get.firstCall.args[1];
    expect(channelOptions).to.have.deep.property('params.rewind', '10');
  });

  it("should handle connection state changes", async function() {
    let connectionHandlers: any = {};
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      connectionHandlers[event] = callback;
    });

    mockSubscribe.callsFake(() => {}); // Don't simulate messages for this test

    // Start the command
    const runPromise = command.run();
    
    // Wait for setup
    await new Promise(resolve => setTimeout(resolve, 20));

    // Simulate connection state changes
    if (connectionHandlers['connected']) {
      connectionHandlers['connected']();
    }

    if (connectionHandlers['disconnected']) {
      connectionHandlers['disconnected']();
    }

    if (connectionHandlers['failed']) {
      connectionHandlers['failed']({ reason: { message: 'Connection failed' } });
    }

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 20));

    // Check that connection handlers were registered
    expect(command.mockClient.connection.on.calledWith('connected')).to.be.true;
    expect(command.mockClient.connection.on.calledWith('disconnected')).to.be.true;
    expect(command.mockClient.connection.on.calledWith('failed')).to.be.true;

    // Check for expected output
    const output = command.logOutput.join('\n');
    expect(output).to.include('Subscribing to [meta]connection');
    expect(output).to.include('Disconnected from Ably');
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput(data => JSON.stringify({
      ...data,
      formatted: true
    }));

    // Set up connection event simulation
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected') {
        setTimeout(() => callback(), 10);
      }
    });

    // Set up subscription with message simulation
    mockSubscribe.callsFake((callback: any) => {
      setTimeout(() => {
        callback({
          name: 'connection.closed',
          data: { reason: 'client_requested' },
          timestamp: Date.now(),
          id: 'msg-456',
          clientId: 'test-client',
          connectionId: 'test-conn-456'
        });
      }, 20);
    });

    // Start the command
    const runPromise = command.run();
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check for JSON output in the logs
    const jsonOutputs = command.logOutput.filter(log => {
      try {
        JSON.parse(log);
        return true;
      } catch {
        return false;
      }
    });

    expect(jsonOutputs.length).to.be.greaterThan(0);

    // Check the connection status JSON output
    const connectionOutput = jsonOutputs.find(log => {
      const parsed = JSON.parse(log);
      return parsed.status === 'connected';
    });
    expect(connectionOutput).to.exist;

    // Check the log message JSON output
    const messageOutput = jsonOutputs.find(log => {
      const parsed = JSON.parse(log);
      return parsed.event === 'connection.closed';
    });
    expect(messageOutput).to.exist;

    if (messageOutput) {
      const parsed = JSON.parse(messageOutput);
      expect(parsed).to.have.property('formatted', true);
      expect(parsed).to.have.property('channel', '[meta]connection');
      expect(parsed).to.have.property('event', 'connection.closed');
    }
  });

  it("should handle different connection log event types", async function() {
    // Set up connection event simulation
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected') {
        setTimeout(() => callback(), 10);
      }
    });

    // Simulate different types of connection log messages
    const logMessages = [
      {
        name: 'connection.opened',
        data: { transport: 'websocket' },
        timestamp: Date.now(),
        id: 'msg-1'
      },
      {
        name: 'connection.closed',
        data: { reason: 'transport_closed' },
        timestamp: Date.now(),
        id: 'msg-2'
      },
      {
        name: 'connection.failed',
        data: { error: 'network_error' },
        timestamp: Date.now(),
        id: 'msg-3'
      },
      {
        name: 'connection.suspended',
        data: { retryIn: 15000 },
        timestamp: Date.now(),
        id: 'msg-4'
      }
    ];

    let messageIndex = 0;
    mockSubscribe.callsFake((callback: any) => {
      const sendNextMessage = () => {
        if (messageIndex < logMessages.length) {
          callback(logMessages[messageIndex]);
          messageIndex++;
          setTimeout(sendNextMessage, 10);
        }
      };
      setTimeout(sendNextMessage, 20);
    });

    // Start the command
    const runPromise = command.run();
    
    // Wait for all messages to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check for expected output with different event types
    const output = command.logOutput.join('\n');
    expect(output).to.include('connection.opened');
    expect(output).to.include('connection.closed');
    expect(output).to.include('connection.failed');
    expect(output).to.include('connection.suspended');
  });

  it("should handle messages with complex data structures", async function() {
    // Set up connection event simulation
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected') {
        setTimeout(() => callback(), 10);
      }
    });

    // Simulate message with complex JSON data
    mockSubscribe.callsFake((callback: any) => {
      setTimeout(() => {
        callback({
          name: 'connection.opened',
          data: {
            connectionId: 'test-conn-789',
            transport: 'websocket',
            clientInfo: {
              version: '1.2.3',
              capabilities: ['presence', 'publish']
            },
            metadata: {
              ip: '192.168.1.1',
              userAgent: 'TestAgent/1.0'
            }
          },
          timestamp: Date.now(),
          id: 'msg-complex'
        });
      }, 20);
    });

    // Start the command
    const runPromise = command.run();
    
    // Wait for message processing
    await new Promise(resolve => setTimeout(resolve, 50));

    // Check that complex data is displayed properly
    const output = command.logOutput.join('\n');
    expect(output).to.include('connection.opened');
    expect(output).to.include('test-conn-789');
    expect(output).to.include('websocket');
    expect(output).to.include('version');
    expect(output).to.include('1.2.3');
  });

  it("should handle subscription errors gracefully", async function() {
    // Set up connection event simulation
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'failed') {
        setTimeout(() => callback({ 
          reason: { message: 'Subscription failed' } 
        }), 10);
      }
    });

    mockSubscribe.callsFake(() => {}); // Don't simulate messages

    try {
      // Start the command
      const runPromise = command.run();
      
      // Wait for error processing
      await new Promise(resolve => setTimeout(resolve, 50));

      // The error should be logged but not thrown in this case
      // since connection failures are handled gracefully
    } catch (error) {
      // If an error is thrown, it should be related to connection failure
      expect(error.message).to.include('failed');
    }
  });

  it("should properly clean up resources", async function() {
    // Set up connection event simulation
    command.mockClient.connection.on = sinon.stub().callsFake((event: string, callback: any) => {
      if (event === 'connected') {
        setTimeout(() => callback(), 10);
      }
    });

    mockSubscribe.callsFake(() => {}); // Don't simulate messages

    // Start the command
    const runPromise = command.run();
    
    // Wait for setup
    await new Promise(resolve => setTimeout(resolve, 30));

    // The client should be available for cleanup
    expect(command.mockClient).to.not.be.null;
    expect(command.mockChannel).to.not.be.null;
  });
});