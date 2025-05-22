import { expect } from "chai";
import { Config } from "@oclif/core";
import nock from "nock";
import sinon from "sinon";
import AppsDeleteCommand from "../../../../src/commands/apps/delete.js";
import { ControlApi } from "../../../../src/services/control-api.js";

class TestableAppsDeleteCommand extends AppsDeleteCommand {
  public logOutput: string[] = [];
  public errorOutput: string = "";
  private _parseResult: any;

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

  public get testConfigManager() {
    return this.configManager;
  }
}

describe("AppsDeleteCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableAppsDeleteCommand;
  let mockConfig: Config;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let getCurrentAppIdStub: sinon.SinonStub;
  let promptForConfirmationStub: sinon.SinonStub;
  let promptForAppNameStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableAppsDeleteCommand([], mockConfig);

    getCurrentAppIdStub = sandbox.stub(command.testConfigManager, "getCurrentAppId");
    controlApiStub = sandbox.createStubInstance(ControlApi);
    sandbox.stub(command, "createControlApi" as any).returns(controlApiStub);
    
    // Stub the private methods
    promptForConfirmationStub = sandbox.stub(command as any, "promptForConfirmation");
    promptForAppNameStub = sandbox.stub(command as any, "promptForAppName");

    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should delete app successfully with confirmation", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: {},
      });

      promptForConfirmationStub.resolves(true);
      promptForAppNameStub.resolves(true);
      controlApiStub.getApp.resolves(appData);
      controlApiStub.deleteApp.resolves();

      await command.run();

      expect(controlApiStub.getApp.calledWith("test-app-id")).to.be.true;
      expect(controlApiStub.deleteApp.calledWith("test-app-id")).to.be.true;
      expect(command.logOutput).to.include("App deleted successfully");
    });

    it("should skip deletion when user declines confirmation", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: {},
      });

      promptForConfirmationStub.resolves(false);
      promptForAppNameStub.resolves(true);
      controlApiStub.getApp.resolves(appData);

      await command.run();

      expect(controlApiStub.getApp.calledWith("test-app-id")).to.be.true;
      expect(controlApiStub.deleteApp.called).to.be.false;
      expect(command.logOutput).to.include("Deletion cancelled");
    });

    it("should skip deletion when user declines name confirmation", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: {},
      });

      promptForAppNameStub.resolves(false);
      controlApiStub.getApp.resolves(appData);

      await command.run();

      expect(controlApiStub.getApp.calledWith("test-app-id")).to.be.true;
      expect(controlApiStub.deleteApp.called).to.be.false;
      expect(command.logOutput).to.include("Deletion cancelled - app name did not match");
    });

    it("should delete app with --force flag without confirmation", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: { force: true },
      });

      controlApiStub.getApp.resolves(appData);
      controlApiStub.deleteApp.resolves();

      await command.run();

      expect(controlApiStub.deleteApp.calledWith("test-app-id")).to.be.true;
      expect(command.logOutput).to.include("App deleted successfully");
    });

    it("should use current app when no app ID provided", async function () {
      const appData = {
        id: "current-app-id",
        name: "Current App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: {},
        flags: { force: true },
      });

      getCurrentAppIdStub.returns("current-app-id");
      controlApiStub.getApp.resolves(appData);
      controlApiStub.deleteApp.resolves();

      await command.run();

      expect(controlApiStub.deleteApp.calledWith("current-app-id")).to.be.true;
    });

    it("should error when no app specified and no current app", async function () {
      command.setParseResult({
        args: {},
        flags: {},
      });

      getCurrentAppIdStub.returns(null);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", false);
      expect(output.error).to.include('No app ID provided and no current app selected');
    });

    it("should output JSON when json flag is set", async function () {
      const appData = {
        id: "test-app-id",
        name: "JSON App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: { force: true, json: true },
      });

      controlApiStub.getApp.resolves(appData);
      controlApiStub.deleteApp.resolves();

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", true);
      expect(output).to.have.property("app");
      expect(output.app.id).to.equal("test-app-id");
    });

    it("should handle app not found error", async function () {
      command.setParseResult({
        args: { id: "non-existent-app" },
        flags: {},
      });

      const error = new Error('App with ID "non-existent-app" not found');
      controlApiStub.getApp.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("not found");
      }
    });

    it("should handle deletion API errors gracefully", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: { force: true },
      });

      controlApiStub.getApp.resolves(appData);
      const error = new Error("API request failed (500 Internal Server Error): Deletion failed");
      controlApiStub.deleteApp.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error deleting app: API request failed");
      }
    });

    it("should handle deletion API errors gracefully with JSON output", async function () {
      const appData = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { id: "test-app-id" },
        flags: { force: true, json: true },
      });

      controlApiStub.getApp.resolves(appData);
      const error = new Error("API request failed (403 Forbidden): Cannot delete app");
      controlApiStub.deleteApp.rejects(error);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", false);
      expect(output.error).to.include("API request failed");
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
          error: new Error("API request failed (404 Not Found): App not found"),
          expectedMessage: "App not found",
        },
        {
          name: "500 Internal Server Error",
          error: new Error("API request failed (500 Internal Server Error): Internal server error"),
          expectedMessage: "Internal server error",
        },
      ];

      errorScenarios.forEach(({ name, error, expectedMessage }) => {
        it(`should handle ${name} error during deletion`, async function () {
          const appData = {
            id: "test-app-id",
            name: "Test App",
            accountId: "account-id",
            status: "active",
            tlsOnly: false,
            created: 1640995200000,
            modified: 1640995300000,
          };

          command.setParseResult({
            args: { id: "test-app-id" },
            flags: { force: true },
          });

          controlApiStub.getApp.resolves(appData);
          controlApiStub.deleteApp.rejects(error);

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