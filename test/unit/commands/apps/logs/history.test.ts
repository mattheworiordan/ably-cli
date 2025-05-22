import { expect } from "chai";
import { Config } from "@oclif/core";
import sinon from "sinon";
import AppsLogsHistoryCommand from "../../../../../src/commands/apps/logs/history.js";

class TestableAppsLogsHistoryCommand extends AppsLogsHistoryCommand {
  public logOutput: string[] = [];
  public errorOutput: string = "";
  private _parseResult: any;
  private _mockAblyClient: any = null;

  public override log(message?: string): void {
    if (message) {
      this.logOutput.push(message);
    }
  }

  public override error(message: string): never {
    this.errorOutput = message;
    throw new Error(message);
  }

  public setParseResult(result: any): void {
    this._parseResult = result;
  }

  public override async parse(): Promise<any> {
    return this._parseResult || {
      flags: {},
      args: {},
      argv: [],
      raw: [],
    };
  }

  public override shouldOutputJson(_flags: any): boolean {
    return this._parseResult?.flags?.json || false;
  }

  public override formatJsonOutput(data: any, _flags: any): string {
    return JSON.stringify(data, null, 2);
  }

  public setMockAblyClient(client: any): void {
    this._mockAblyClient = client;
  }

  public override createAblyRestClient(_options: any): any {
    return this._mockAblyClient;
  }

  public get testConfigManager() {
    return this.configManager;
  }
}

describe("AppsLogsHistoryCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableAppsLogsHistoryCommand;
  let mockConfig: Config;
  let mockChannel: any;
  let mockAblyClient: any;
  let getApiKeyStub: sinon.SinonStub;
  let ensureAppAndKeyStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableAppsLogsHistoryCommand([], mockConfig);

    // Mock the channel and client
    mockChannel = {
      history: sandbox.stub(),
    };

    mockAblyClient = {
      channels: {
        get: sandbox.stub().returns(mockChannel),
      },
    };

    command.setMockAblyClient(mockAblyClient);

    // Stub config manager methods
    getApiKeyStub = sandbox.stub(command.testConfigManager, "getApiKey").resolves("test-api-key");
    ensureAppAndKeyStub = sandbox.stub(command, "ensureAppAndKey" as any).resolves({ apiKey: "test-api-key" });
    sandbox.stub(command, "showAuthInfoIfNeeded" as any);
    sandbox.stub(command, "getClientOptions" as any).returns({});
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("#run", function () {
    it("should retrieve and display log messages", async function () {
      const mockMessages = [
        {
          name: "connection.opened",
          data: { clientId: "client-1", connectionId: "conn-1" },
          timestamp: 1640995200000,
        },
        {
          name: "message.published",
          data: { channel: "test-channel", size: 123 },
          timestamp: 1640995300000,
        },
      ];

      command.setParseResult({
        flags: { limit: 100, direction: "backwards" },
      });

      mockChannel.history.resolves({ items: mockMessages });

      await command.run();

      expect(mockAblyClient.channels.get.calledWith("[meta]log:app")).to.be.true;
      expect(mockChannel.history.calledOnce).to.be.true;
      expect(mockChannel.history.firstCall.args[0]).to.deep.equal({
        direction: "backwards",
        limit: 100,
      });

      expect(command.logOutput).to.include("Found 2 application log messages:");
      expect(command.logOutput.join(" ")).to.include("connection.opened");
      expect(command.logOutput.join(" ")).to.include("message.published");
    });

    it("should handle empty log history", async function () {
      command.setParseResult({
        flags: { limit: 100, direction: "backwards" },
      });

      mockChannel.history.resolves({ items: [] });

      await command.run();

      expect(command.logOutput).to.include("No application log messages found.");
    });

    it("should output JSON when json flag is set", async function () {
      const mockMessages = [
        {
          name: "test.event",
          data: { test: "data" },
          timestamp: 1640995200000,
        },
      ];

      command.setParseResult({
        flags: { json: true, limit: 50 },
      });

      mockChannel.history.resolves({ items: mockMessages });

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("messages");
      expect(output.messages).to.have.lengthOf(1);
      expect(output.messages[0]).to.include({
        name: "test.event",
      });
    });

    it("should use custom limit and direction", async function () {
      command.setParseResult({
        flags: { limit: 50, direction: "forwards" },
      });

      mockChannel.history.resolves({ items: [] });

      await command.run();

      expect(mockChannel.history.firstCall.args[0]).to.deep.equal({
        direction: "forwards",
        limit: 50,
      });
    });

    it("should format different message data types", async function () {
      const mockMessages = [
        {
          name: "string.message",
          data: "Simple string message",
          timestamp: 1640995200000,
        },
        {
          name: "object.message",
          data: { complex: "object", nested: { value: 123 } },
          timestamp: 1640995300000,
        },
        {
          name: "number.message",
          data: 42,
          timestamp: 1640995400000,
        },
      ];

      command.setParseResult({
        flags: { limit: 100 },
      });

      mockChannel.history.resolves({ items: mockMessages });

      await command.run();

      const output = command.logOutput.join(" ");
      expect(output).to.include("Simple string message");
      expect(output).to.include("complex");
      expect(output).to.include("42");
    });

    it("should show limit warning when maximum messages returned", async function () {
      const mockMessages = Array.from({ length: 50 }, (_, i) => ({
        name: `message-${i}`,
        data: `data-${i}`,
        timestamp: 1640995200000 + i * 1000,
      }));

      command.setParseResult({
        flags: { limit: 50 },
      });

      mockChannel.history.resolves({ items: mockMessages });

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Showing maximum of 50 messages");
    });

    it("should handle API key from flags", async function () {
      command.setParseResult({
        flags: { "api-key": "flag-api-key", limit: 10 },
      });

      mockChannel.history.resolves({ items: [] });

      await command.run();

      // Should not call getApiKey or ensureAppAndKey when API key is in flags
      expect(getApiKeyStub.called).to.be.false;
    });

    it("should handle missing API key gracefully", async function () {
      command.setParseResult({
        flags: { limit: 10 },
      });

      // Make getApiKey return null and ensureAppAndKey return null
      getApiKeyStub.resolves(null);
      ensureAppAndKeyStub.resolves(null);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch {
        expect(command.errorOutput).to.include('No API key provided');
      }
    });

    it("should handle channel history errors", async function () {
      command.setParseResult({
        flags: { limit: 10 },
      });

      mockChannel.history.rejects(new Error("Channel history failed"));

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error retrieving application logs");
        expect(command.errorOutput).to.include("Channel history failed");
      }
    });

    it("should handle messages without names", async function () {
      const mockMessages = [
        {
          data: "Message without name",
          timestamp: 1640995200000,
        },
      ];

      command.setParseResult({
        flags: { limit: 10 },
      });

      mockChannel.history.resolves({ items: mockMessages });

      await command.run();

      expect(command.logOutput.join(" ")).to.include("[message]");
      expect(command.logOutput.join(" ")).to.include("Message without name");
    });

    it("should format timestamps correctly", async function () {
      const mockMessages = [
        {
          name: "timestamp.test",
          data: "test",
          timestamp: 1640995200000, // Known timestamp
        },
      ];

      command.setParseResult({
        flags: { limit: 10 },
      });

      mockChannel.history.resolves({ items: mockMessages });

      await command.run();

      // Check that timestamp is formatted as ISO string
      expect(command.logOutput.join(" ")).to.include("2022-01-01T00:00:00.000Z");
    });

    describe("parameter validation", function () {
      it("should use default parameters when none provided", async function () {
        command.setParseResult({
          flags: {},
        });

        mockChannel.history.resolves({ items: [] });

        await command.run();

        expect(mockChannel.history.firstCall.args[0]).to.deep.equal({
          direction: "backwards",
          limit: 100,
        });
      });

      it("should validate direction parameter", async function () {
        command.setParseResult({
          flags: { direction: "forwards" },
        });

        mockChannel.history.resolves({ items: [] });

        await command.run();

        expect(mockChannel.history.firstCall.args[0].direction).to.equal("forwards");
      });
    });

    describe("error handling scenarios", function () {
      const errorScenarios = [
        {
          name: "Network error",
          error: new Error("Network connection failed"),
          expectedMessage: "Network connection failed",
        },
        {
          name: "Authentication error", 
          error: new Error("Invalid API key"),
          expectedMessage: "Invalid API key",
        },
        {
          name: "Rate limit error",
          error: new Error("Too many requests"),
          expectedMessage: "Too many requests",
        },
      ];

      errorScenarios.forEach(({ name, error, expectedMessage }) => {
        it(`should handle ${name}`, async function () {
          command.setParseResult({
            flags: { limit: 10 },
          });

          mockChannel.history.rejects(error);

          try {
            await command.run();
            expect.fail("Should have thrown an error");
          } catch (err) {
            expect(command.errorOutput).to.include(expectedMessage);
          }
        });
      });
    });
  });
});