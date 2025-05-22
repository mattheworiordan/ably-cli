import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import ConnectionsStats from "../../../../src/commands/connections/stats.js";
import * as Ably from "ably";

// Create a testable version of ConnectionsStats
class TestableConnectionsStats extends ConnectionsStats {
  public logOutput: string[] = [];
  public errorOutput: string = '';
  private _parseResult: any;
  private _shouldOutputJson = false;
  private _formatJsonOutputFn: ((data: Record<string, unknown>) => string) | null = null;

  constructor(argv: string[], config: Config) {
    super(argv, config);
    
    // Override configManager to return mock API key
    this.configManager = {
      getApiKey: () => Promise.resolve('test.key:secret'),
      getApplicationId: () => Promise.resolve('test-app-id'),
      getToken: () => Promise.resolve(null)
    } as any;
  }

  // Override parse to simulate parse output
  public override async parse() {
    return this._parseResult;
  }

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  // Mock client object
  public mockRestClient: any = null;

  // Override client creation method
  public override createAblyRestClient(_options: Ably.ClientOptions | any): Ably.Rest {
    this.debug('Using mock REST client');
    return this.mockRestClient as unknown as Ably.Rest;
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
}

describe("ConnectionsStats", function() {
  let sandbox: sinon.SinonSandbox;
  let command: TestableConnectionsStats;
  let mockConfig: Config;
  let mockStats: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableConnectionsStats([], mockConfig);

    // Create stub for the stats method
    mockStats = sinon.stub().resolves({
      items: [{
        intervalId: 'stats_1',
        intervalTime: Date.now(),
        connections: {
          all: { count: 10, peak: 15, min: 5, mean: 8.5, opened: 20, refused: 2 }
        },
        channels: { count: 5, peak: 8, min: 2, mean: 4.2, opened: 12, refused: 1 },
        messages: {
          all: { all: { count: 100, data: 50000 } },
          inbound: { all: { messages: { count: 50 } } },
          outbound: { all: { messages: { count: 45 } } }
        },
        apiRequests: { count: 25, succeeded: 24, failed: 1 },
        tokenRequests: { count: 8, succeeded: 8, failed: 0 }
      }]
    });

    // Set up the mock REST client
    command.mockRestClient = {
      stats: mockStats,
      close: sinon.stub()
    };

    // Set default parse result for one-time stats
    command.setParseResult({
      flags: { 
        unit: 'hour', 
        limit: 100, 
        live: false, 
        interval: 6,
        start: undefined,
        end: undefined,
        'api-key': 'test.key:secret' // Add API key to flags
      },
      args: {},
      argv: [],
      raw: []
    });
  });

  afterEach(function() {
    sandbox.restore();
  });

  it("should fetch and display connection stats successfully", async function() {
    await command.run();

    expect(mockStats.calledOnce).to.be.true;
    
    // Check that stats were called with correct parameters
    const statsCall = mockStats.firstCall.args[0];
    expect(statsCall).to.have.property('unit', 'hour');
    expect(statsCall).to.have.property('limit', 100);
    expect(statsCall).to.have.property('direction', 'backwards');

    // Check for expected output in logs
    const output = command.logOutput.join('\n');
    expect(output).to.include('Connection Statistics');
  });

  it("should handle different time units", async function() {
    command.setParseResult({
      flags: { 
        unit: 'day', 
        limit: 50, 
        live: false, 
        interval: 6,
        start: undefined,
        end: undefined,
        'api-key': 'test.key:secret'
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    const statsCall = mockStats.firstCall.args[0];
    expect(statsCall).to.have.property('unit', 'day');
    expect(statsCall).to.have.property('limit', 50);
  });

  it("should handle custom start and end times", async function() {
    const startTime = Date.now() - 86400000; // 24 hours ago
    const endTime = Date.now();

    command.setParseResult({
      flags: { 
        unit: 'hour', 
        limit: 100, 
        live: false, 
        interval: 6,
        start: startTime,
        end: endTime,
        'api-key': 'test.key:secret'
      },
      args: {},
      argv: [],
      raw: []
    });

    await command.run();

    const statsCall = mockStats.firstCall.args[0];
    expect(statsCall).to.have.property('start', startTime);
    expect(statsCall).to.have.property('end', endTime);
  });

  it("should output JSON when requested", async function() {
    command.setShouldOutputJson(true);
    command.setFormatJsonOutput(data => JSON.stringify({
      ...data,
      success: true,
      timestamp: new Date().toISOString()
    }));

    await command.run();

    expect(mockStats.calledOnce).to.be.true;

    // Check for JSON output in the logs
    const jsonOutput = command.logOutput.find(log => log.includes('success'));
    expect(jsonOutput).to.exist;

    if (jsonOutput) {
      const parsed = JSON.parse(jsonOutput);
      expect(parsed).to.have.property('success', true);
      expect(parsed).to.have.property('timestamp');
    }
  });

  it("should handle API errors", async function() {
    const apiError = new Error("Stats API Error");
    mockStats.rejects(apiError);

    try {
      await command.run();
      expect.fail('Command should have thrown an error');
    } catch (error: any) {
      expect(mockStats.called).to.be.true;
      expect(error.message).to.include('Stats API Error');
    }
  });

  it("should handle empty stats response", async function() {
    mockStats.resolves({ items: [] });

    await command.run();

    expect(mockStats.calledOnce).to.be.true;
    const output = command.logOutput.join('\n');
    expect(output).to.include('No connection stats available');
  });

  it("should handle live stats mode setup", async function() {
    // Mock setInterval to prevent actual polling in tests
    const originalSetInterval = global.setInterval;
    const mockSetInterval = sinon.stub(global, 'setInterval').returns({} as any);

    command.setParseResult({
      flags: { 
        unit: 'minute', 
        limit: 100, 
        live: true, 
        interval: 5,
        start: undefined,
        end: undefined,
        'api-key': 'test.key:secret'
      },
      args: {},
      argv: [],
      raw: []
    });

    // Override the runLiveStats method to avoid infinite polling in tests
    const mockRunLiveStats = sinon.stub(command as any, 'runLiveStats').resolves();

    await command.run();

    expect(mockRunLiveStats.calledOnce).to.be.true;

    // Restore
    mockSetInterval.restore();
    global.setInterval = originalSetInterval;
  });

  it("should properly clean up resources", async function() {
    await command.run();

    expect(command.mockRestClient.close.calledOnce).to.be.true;
  });
});