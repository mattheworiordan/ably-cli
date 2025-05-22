import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ConnectionsTest from "../../../../src/commands/connections/test.js";
import * as Ably from "ably";

// Create a testable version of ConnectionsTest
class TestableConnectionsTest extends ConnectionsTest {
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

  // Mock client objects
  public mockRestClient: any = null;
  public mockRealtimeClient: any = null;

  // Override client creation methods
  public override createAblyRestClient(_options: Ably.ClientOptions | any): Ably.Rest {
    this.debug('Using mock REST client');
    return this.mockRestClient as unknown as Ably.Rest;
  }

  // Override the private testWebSocketConnection method by mocking Ably.Realtime constructor
  public mockAblyRealtime(mockClient: any) {
    this.mockRealtimeClient = mockClient;
    // Mock the constructor by stubbing the prototype
    sinon.stub(Ably, 'Realtime').returns(mockClient);
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

describe("ConnectionsTest", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableConnectionsTest;
  let mockConfig: Config;
  let mockRequest: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableConnectionsTest([], mockConfig);

    // Create stub for the request method (REST API test)
    mockRequest = sinon.stub().resolves({
      statusCode: 200,
      items: []
    });

    // Set up the mock REST client
    command.mockRestClient = {
      request: mockRequest,
      close: sinon.stub()
    };

    // Set default parse result
    command.setParseResult({
      flags: { 
        'rest-only': false,
        'ws-only': false
      },
      args: {},
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should test both REST and WebSocket connections by default", async function() {
    // Set up mock WebSocket client
    const mockWsClient = {
      connection: {
        on: sinon.stub(),
        once: sinon.stub().callsArgAsync(1), // Simulate successful connection
        id: 'test-connection-id',
        state: 'connected'
      },
      close: sinon.stub()
    };

    command.mockAblyRealtime(mockWsClient);

    await command.run();

    // Check that REST request was made
    expect(mockRequest.calledOnce).to.be.true;
    expect(mockRequest.firstCall.args[0]).to.equal('get');
    expect(mockRequest.firstCall.args[1]).to.include('/channels');

    // Check that WebSocket connection was attempted
    expect(mockWsClient.connection.once.called).to.be.true;

    // Check for expected output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('REST API connection successful');
    expect(output).to.include('WebSocket connection successful');
    expect(output).to.include('Connection ID: test-connection-id');

    // Check that both clients were closed
    expect(command.mockRestClient.close.calledOnce).to.be.true;
    expect(mockWsClient.close.calledOnce).to.be.true;
  });

  it("should test only REST connection when --rest-only flag is used", async function() {
    command.setParseResult({
      flags: { 
        'rest-only': true,
        'ws-only': false
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    // Check that REST request was made
    expect(mockRequest.calledOnce).to.be.true;

    // Check for expected output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('REST API connection successful');
    expect(output).to.not.include('WebSocket');

    expect(command.mockRestClient.close.calledOnce).to.be.true;
  });

  it("should test only WebSocket connection when --ws-only flag is used", async function() {
    command.setParseResult({
      flags: { 
        'rest-only': false,
        'ws-only': true
      },
      args: {},
      argv: [],
      raw: []
    });

    // Set up mock WebSocket client
    const mockWsClient = {
      connection: {
        on: sinon.stub(),
        once: sinon.stub().callsArgAsync(1), // Simulate successful connection
        id: 'test-ws-connection-id',
        state: 'connected'
      },
      close: sinon.stub()
    };

    command.mockAblyRealtime(mockWsClient);

    await command.run();

    // Check that REST request was NOT made
    expect(mockRequest.called).to.be.false;

    // Check that WebSocket connection was attempted
    expect(mockWsClient.connection.once.called).to.be.true;

    // Check for expected output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.not.include('REST API');
    expect(output).to.include('WebSocket connection successful');
    expect(output).to.include('Connection ID: test-ws-connection-id');

    expect(mockWsClient.close.calledOnce).to.be.true;
  });

  it("should handle REST API connection failures", async function() {
    const apiError = new Error("REST API connection failed");
    mockRequest.rejects(apiError);

    command.setParseResult({
      flags: { 
        'rest-only': true,
        'ws-only': false
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockRequest.calledOnce).to.be.true;

    // Check for error output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('REST API connection failed');
    expect(output).to.include('REST API connection failed');
  });

  it("should handle WebSocket connection failures", async function() {
    // Set up mock WebSocket client that fails
    const mockWsClient = {
      connection: {
        on: sinon.stub(),
        once: sinon.stub().callsArgWithAsync(1, { reason: new Error('WebSocket failed') }), // Simulate failed connection
        id: null,
        state: 'failed'
      },
      close: sinon.stub()
    };

    command.mockAblyRealtime(mockWsClient);

    command.setParseResult({
      flags: { 
        'rest-only': false,
        'ws-only': true
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    // Check that WebSocket connection was attempted
    expect(mockWsClient.connection.once.called).to.be.true;

    // Check for error output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('WebSocket connection failed');
  });

  it("should handle WebSocket connection timeout", async function() {
    // Set up mock WebSocket client that times out
    const mockWsClient = {
      connection: {
        on: sinon.stub(),
        once: sinon.stub(), // Don't call the callback to simulate timeout
        id: null,
        state: 'connecting'
      },
      close: sinon.stub()
    };

    command.mockAblyRealtime(mockWsClient);

    command.setParseResult({
      flags: { 
        'rest-only': false,
        'ws-only': true
      },
      args: {},
      argv: [],
      raw: []
    });

    // Mock setTimeout to trigger timeout immediately
    const originalSetTimeout = global.setTimeout;
    sandbox.stub(global, 'setTimeout').callsArg(0);

    await command.run();

    // Check for timeout error output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('WebSocket connection failed');
    expect(output).to.include('timeout');

    // Restore setTimeout
    global.setTimeout = originalSetTimeout;
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput(data => JSON.stringify({
      ...data,
      timestamp: new Date().toISOString()
    }));

    command.setParseResult({
      flags: { 
        'rest-only': true,
        'ws-only': false
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    expect(mockRequest.calledOnce).to.be.true;

    // Check for JSON output in the logs
    const jsonOutput = command.logOutput.find(log => log.includes('timestamp'));
    expect(jsonOutput).to.exist;

    if (jsonOutput) {
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).to.have.property('timestamp');
    }
  });

  it("should provide summary when both connections are tested", async function() {
    // Set up mock WebSocket client
    const mockWsClient = {
      connection: {
        on: sinon.stub(),
        once: sinon.stub().callsArgAsync(1), // Simulate successful connection
        id: 'test-connection-id',
        state: 'connected'
      },
      close: sinon.stub()
    };

    command.mockAblyRealtime(mockWsClient);

    await command.run();

    // Check for summary output
    const output = command.logOutput.join('\n');
    expect(output).to.include('Connection Test Summary');
    expect(output).to.include('REST API: ✓');
    expect(output).to.include('WebSocket: ✓');
  });

  it("should properly clean up resources", async function() {
    // Set up mock WebSocket client
    const mockWsClient = {
      connection: {
        on: sinon.stub(),
        once: sinon.stub().callsArgAsync(1),
        id: 'test-connection-id',
        state: 'connected'
      },
      close: sinon.stub()
    };

    command.mockAblyRealtime(mockWsClient);

    await command.run();

    // Check that both clients were closed
    expect(command.mockRestClient.close.calledOnce).to.be.true;
    expect(mockWsClient.close.calledOnce).to.be.true;
  });
});