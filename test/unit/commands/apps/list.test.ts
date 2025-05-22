import { expect } from "chai";
import { Config } from "@oclif/core";
import nock from "nock";
import sinon from "sinon";
import AppsListCommand from "../../../../src/commands/apps/list.js";
import { ControlApi } from "../../../../src/services/control-api.js";

class TestableAppsListCommand extends AppsListCommand {
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

describe("AppsListCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableAppsListCommand;
  let mockConfig: Config;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let getCurrentAppIdStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableAppsListCommand([], mockConfig);

    getCurrentAppIdStub = sandbox.stub(command.testConfigManager, "getCurrentAppId");
    controlApiStub = sandbox.createStubInstance(ControlApi);
    sandbox.stub(command, "createControlApi" as any).returns(controlApiStub);

    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should list apps successfully", async function () {
      const appsData = [
        {
          id: "app-1",
          name: "First App",
          accountId: "account-id",
          status: "active",
          tlsOnly: false,
          created: 1640995200000,
          modified: 1640995300000,
        },
        {
          id: "app-2", 
          name: "Second App",
          accountId: "account-id",
          status: "active",
          tlsOnly: true,
          created: 1640995400000,
          modified: 1640995500000,
        },
      ];

      command.setParseResult({ flags: {} });
      getCurrentAppIdStub.returns("app-1");
      controlApiStub.listApps.resolves(appsData);

      await command.run();

      expect(controlApiStub.listApps.calledOnce).to.be.true;
      expect(command.logOutput).to.include("Found 2 apps:");
      expect(command.logOutput.join(" ")).to.include("First App");
      expect(command.logOutput.join(" ")).to.include("Second App");
      expect(command.logOutput.join(" ")).to.include("(current)");
    });

    it("should handle empty app list", async function () {
      command.setParseResult({ flags: {} });
      controlApiStub.listApps.resolves([]);

      await command.run();

      expect(controlApiStub.listApps.calledOnce).to.be.true;
      expect(command.logOutput).to.include("No apps found.");
    });

    it("should output JSON when json flag is set", async function () {
      const appsData = [
        {
          id: "app-1",
          name: "JSON App",
          accountId: "account-id",
          status: "active",
          tlsOnly: false,
          created: 1640995200000,
          modified: 1640995300000,
        },
      ];

      command.setParseResult({ flags: { json: true } });
      controlApiStub.listApps.resolves(appsData);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", true);
      expect(output).to.have.property("apps");
      expect(output.apps).to.have.lengthOf(1);
      expect(output.apps[0]).to.include({
        id: "app-1",
        name: "JSON App",
      });
    });

    it("should handle API errors gracefully", async function () {
      command.setParseResult({ flags: {} });
      
      const error = new Error("API request failed (401 Unauthorized): Invalid access token");
      controlApiStub.listApps.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error listing apps: API request failed");
      }
    });

    it("should handle API errors gracefully with JSON output", async function () {
      command.setParseResult({ flags: { json: true } });
      
      const error = new Error("API request failed (403 Forbidden): Insufficient permissions");
      controlApiStub.listApps.rejects(error);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", false);
      expect(output.error).to.include("API request failed");
    });

    it("should mark current app when no current app is set", async function () {
      const appsData = [
        {
          id: "app-1",
          name: "First App",
          accountId: "account-id",
          status: "active",
          tlsOnly: false,
          created: 1640995200000,
          modified: 1640995300000,
        },
      ];

      command.setParseResult({ flags: {} });
      getCurrentAppIdStub.returns(null);
      controlApiStub.listApps.resolves(appsData);

      await command.run();

      expect(command.logOutput.join(" ")).to.not.include("(current)");
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
          command.setParseResult({ flags: {} });
          controlApiStub.listApps.rejects(error);

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