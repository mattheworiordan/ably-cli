import { expect } from "chai";
import { Config } from "@oclif/core";
import nock from "nock";
import sinon from "sinon";
import AppsCreateCommand from "../../../../src/commands/apps/create.js";
import { ControlApi } from "../../../../src/services/control-api.js";

// Testable version of AppsCreateCommand
class TestableAppsCreateCommand extends AppsCreateCommand {
  public logOutput: string[] = [];
  public errorOutput: string = "";
  private _parseResult: any;

  // Override log method to capture output
  public override log(message?: string): void {
    if (message) {
      this.logOutput.push(message);
    }
  }

  // Override error method to capture errors
  public override error(message: string): never {
    this.errorOutput = message;
    throw new Error(message);
  }

  // Method to set parse result for testing
  public setParseResult(result: any): void {
    this._parseResult = result;
  }

  // Override parse method to return test data
  public override async parse(): Promise<any> {
    return this._parseResult || {
      flags: { name: "Test App" },
      args: {},
      argv: [],
      raw: [],
    };
  }

  // Override shouldOutputJson for testing
  public override shouldOutputJson(_flags: any): boolean {
    return this._parseResult?.flags?.json || false;
  }

  // Override formatJsonOutput for testing
  public override formatJsonOutput(data: any, _flags: any): string {
    return JSON.stringify(data, null, 2);
  }

  // Override formatDate for testing
  public override formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  // Expose configManager for testing
  public get testConfigManager() {
    return this.configManager;
  }
}

describe("AppsCreateCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableAppsCreateCommand;
  let mockConfig: Config;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let setCurrentAppStub: sinon.SinonStub;
  let storeAppInfoStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableAppsCreateCommand([], mockConfig);

    // Stub config manager methods
    setCurrentAppStub = sandbox.stub(command.testConfigManager, "setCurrentApp");
    storeAppInfoStub = sandbox.stub(command.testConfigManager, "storeAppInfo");

    // Mock Control API
    controlApiStub = sandbox.createStubInstance(ControlApi);
    sandbox.stub(command, "createControlApi" as any).returns(controlApiStub);

    // Clean up nock before each test
    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should create an app successfully", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "test-account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995200000,
      };

      command.setParseResult({
        flags: { name: "Test App", "tls-only": false },
      });

      controlApiStub.createApp.resolves(appData);

      await command.run();

      expect(controlApiStub.createApp.calledOnce).to.be.true;
      expect(controlApiStub.createApp.firstCall.args[0]).to.deep.equal({
        name: "Test App",
        tlsOnly: false,
      });

      expect(command.logOutput).to.include.members([
        'Creating app "Test App"...',
        "\nApp created successfully!",
        "App ID: test-app-id",
        "Name: Test App",
        "Status: active",
        "Account ID: test-account-id",
        "TLS Only: No",
      ]);
    });

    it("should create an app with TLS only enabled", async function () {
      const appData = {
        id: "test-app-id",
        name: "TLS App",
        accountId: "test-account-id",
        status: "active",
        tlsOnly: true,
        created: 1640995200000,
        modified: 1640995200000,
      };

      command.setParseResult({
        flags: { name: "TLS App", "tls-only": true },
      });

      controlApiStub.createApp.resolves(appData);

      await command.run();

      expect(controlApiStub.createApp.firstCall.args[0]).to.deep.equal({
        name: "TLS App",
        tlsOnly: true,
      });

      expect(command.logOutput).to.include("TLS Only: Yes");
    });

    it("should output JSON when json flag is set", async function () {
      const appData = {
        id: "test-app-id",
        name: "JSON App",
        accountId: "test-account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995200000,
      };

      command.setParseResult({
        flags: { name: "JSON App", json: true },
      });

      controlApiStub.createApp.resolves(appData);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", true);
      expect(output).to.have.property("app");
      expect(output.app).to.include({
        id: "test-app-id",
        name: "JSON App",
        accountId: "test-account-id",
      });
    });

    it("should handle API errors gracefully", async function () {
      command.setParseResult({
        flags: { name: "Failed App" },
      });

      const error = new Error("API request failed (400 Bad Request): App name already exists");
      controlApiStub.createApp.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error creating app: API request failed");
      }
    });

    it("should handle API errors gracefully with JSON output", async function () {
      command.setParseResult({
        flags: { name: "Failed App", json: true },
      });

      const error = new Error("API request failed (400 Bad Request): App name already exists");
      controlApiStub.createApp.rejects(error);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", false);
      expect(output).to.have.property("status", "error");
      expect(output.error).to.include("API request failed");
    });

    it("should automatically switch to the newly created app", async function () {
      const appData = {
        id: "test-app-id",
        name: "Switch App",
        accountId: "test-account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995200000,
      };

      command.setParseResult({
        flags: { name: "Switch App" },
      });

      controlApiStub.createApp.resolves(appData);

      await command.run();

      expect(setCurrentAppStub.calledWith("test-app-id")).to.be.true;
      expect(storeAppInfoStub.calledWith("test-app-id", { appName: "Switch App" })).to.be.true;
      expect(command.logOutput).to.include("Automatically switched to app: Switch App (test-app-id)");
    });

    describe("parameter validation", function () {
      it("should validate required name parameter", async function () {
        command.setParseResult({
          flags: {},
        });

        // This test simulates what would happen if the name flag was missing
        // In actual usage, oclif would prevent this, but we test the scenario
        controlApiStub.createApp.rejects(new Error("Name is required"));

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch (err) {
          expect(command.errorOutput).to.include("Name is required");
        }
      });
    });

    describe("error handling scenarios", function () {
      const errorScenarios = [
        {
          name: "401 Unauthorized",
          error: new Error("API request failed (401 Unauthorized): Invalid access token"),
          expectedMessage: "Invalid access token",
        },
        {
          name: "403 Forbidden", 
          error: new Error("API request failed (403 Forbidden): Insufficient permissions"),
          expectedMessage: "Insufficient permissions",
        },
        {
          name: "404 Not Found",
          error: new Error("API request failed (404 Not Found): Account not found"),
          expectedMessage: "Account not found",
        },
        {
          name: "500 Internal Server Error",
          error: new Error("API request failed (500 Internal Server Error): Internal server error"),
          expectedMessage: "Internal server error",
        },
      ];

      errorScenarios.forEach(({ name, error, expectedMessage }) => {
        it(`should handle ${name} error`, async function () {
          command.setParseResult({
            flags: { name: "Test App" },
          });

          controlApiStub.createApp.rejects(error);

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