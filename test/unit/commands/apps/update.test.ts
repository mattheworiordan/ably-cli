import { expect } from "chai";
import { Config } from "@oclif/core";
import nock from "nock";
import sinon from "sinon";
import AppsUpdateCommand from "../../../../src/commands/apps/update.js";
import { ControlApi } from "../../../../src/services/control-api.js";

class TestableAppsUpdateCommand extends AppsUpdateCommand {
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

  public override formatDate(timestamp: number): string {
    return new Date(timestamp).toISOString();
  }

  public get testConfigManager() {
    return this.configManager;
  }
}

describe("AppsUpdateCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableAppsUpdateCommand;
  let mockConfig: Config;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let getCurrentAppIdStub: sinon.SinonStub;
  let storeAppInfoStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableAppsUpdateCommand([], mockConfig);

    getCurrentAppIdStub = sandbox.stub(command.testConfigManager, "getCurrentAppId");
    storeAppInfoStub = sandbox.stub(command.testConfigManager, "storeAppInfo");
    controlApiStub = sandbox.createStubInstance(ControlApi);
    sandbox.stub(command, "createControlApi" as any).returns(controlApiStub);

    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should update app name successfully", async function () {
      const updatedApp = {
        id: "test-app-id",
        name: "Updated App Name",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995600000,
      };

      command.setParseResult({
        flags: { app: "test-app-id", name: "Updated App Name" },
      });

      controlApiStub.updateApp.resolves(updatedApp);

      await command.run();

      expect(controlApiStub.updateApp.calledOnce).to.be.true;
      expect(controlApiStub.updateApp.firstCall.args[0]).to.equal("test-app-id");
      expect(controlApiStub.updateApp.firstCall.args[1]).to.deep.equal({
        name: "Updated App Name",
      });

      expect(command.logOutput).to.include('Updating app "test-app-id"...');
      expect(command.logOutput).to.include("App updated successfully!");
      expect(command.logOutput).to.include("Name: Updated App Name");
    });

    it("should update TLS only setting", async function () {
      const updatedApp = {
        id: "test-app-id",
        name: "Test App",
        accountId: "account-id",
        status: "active",
        tlsOnly: true,
        created: 1640995200000,
        modified: 1640995600000,
      };

      command.setParseResult({
        flags: { app: "test-app-id", "tls-only": true },
      });

      controlApiStub.updateApp.resolves(updatedApp);

      await command.run();

      expect(controlApiStub.updateApp.firstCall.args[1]).to.deep.equal({
        tlsOnly: true,
      });

      expect(command.logOutput).to.include("TLS Only: Yes");
    });

    it("should update both name and TLS setting", async function () {
      const updatedApp = {
        id: "test-app-id",
        name: "Secure App",
        accountId: "account-id",
        status: "active",
        tlsOnly: true,
        created: 1640995200000,
        modified: 1640995600000,
      };

      command.setParseResult({
        flags: { app: "test-app-id", name: "Secure App", "tls-only": true },
      });

      controlApiStub.updateApp.resolves(updatedApp);

      await command.run();

      expect(controlApiStub.updateApp.firstCall.args[1]).to.deep.equal({
        name: "Secure App",
        tlsOnly: true,
      });
    });

    it("should use current app when no app flag provided", async function () {
      const updatedApp = {
        id: "current-app-id",
        name: "Updated Current App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995600000,
      };

      command.setParseResult({
        flags: { name: "Updated Current App" },
      });

      getCurrentAppIdStub.returns("current-app-id");
      controlApiStub.updateApp.resolves(updatedApp);

      await command.run();

      expect(controlApiStub.updateApp.calledWith("current-app-id")).to.be.true;
    });

    it("should error when no app specified and no current app", async function () {
      command.setParseResult({
        flags: { name: "New Name" },
      });

      getCurrentAppIdStub.returns(null);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include('No app specified. Please provide --app flag or switch to an app');
      }
    });

    it("should error when no updates specified", async function () {
      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include('Nothing to update. Please specify --name or --tls-only');
      }
    });

    it("should output JSON when json flag is set", async function () {
      const updatedApp = {
        id: "test-app-id",
        name: "JSON App",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995600000,
      };

      command.setParseResult({
        flags: { app: "test-app-id", name: "JSON App", json: true },
      });

      controlApiStub.updateApp.resolves(updatedApp);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", true);
      expect(output).to.have.property("app");
      expect(output.app).to.include({
        id: "test-app-id",
        name: "JSON App",
      });
    });

    it("should update app info in config when name changes", async function () {
      const updatedApp = {
        id: "test-app-id",
        name: "New App Name",
        accountId: "account-id",
        status: "active",
        tlsOnly: false,
        created: 1640995200000,
        modified: 1640995600000,
      };

      command.setParseResult({
        flags: { app: "test-app-id", name: "New App Name" },
      });

      controlApiStub.updateApp.resolves(updatedApp);

      await command.run();

      expect(storeAppInfoStub.calledWith("test-app-id", { appName: "New App Name" })).to.be.true;
    });

    it("should handle API errors gracefully", async function () {
      command.setParseResult({
        flags: { app: "test-app-id", name: "Failed Update" },
      });

      const error = new Error("API request failed (400 Bad Request): Invalid app name");
      controlApiStub.updateApp.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error updating app: API request failed");
      }
    });

    it("should handle API errors gracefully with JSON output", async function () {
      command.setParseResult({
        flags: { app: "test-app-id", name: "Failed Update", json: true },
      });

      const error = new Error("API request failed (400 Bad Request): Invalid app name");
      controlApiStub.updateApp.rejects(error);

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
        it(`should handle ${name} error`, async function () {
          command.setParseResult({
            flags: { app: "test-app-id", name: "Test App" },
          });

          controlApiStub.updateApp.rejects(error);

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