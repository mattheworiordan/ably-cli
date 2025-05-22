import { expect } from "chai";
import { Config } from "@oclif/core";
import nock from "nock";
import sinon from "sinon";
import KeysListCommand from "../../../../../src/commands/auth/keys/list.js";
import { ControlApi } from "../../../../../src/services/control-api.js";

class TestableKeysListCommand extends KeysListCommand {
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

describe("KeysListCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableKeysListCommand;
  let mockConfig: Config;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let getCurrentAppIdStub: sinon.SinonStub;
  let getCurrentKeyIdStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableKeysListCommand([], mockConfig);

    getCurrentAppIdStub = sandbox.stub(command.testConfigManager, "getCurrentAppId");
    getCurrentKeyIdStub = sandbox.stub(command.testConfigManager, "getKeyId");
    controlApiStub = sandbox.createStubInstance(ControlApi);
    sandbox.stub(command, "createControlApi" as any).returns(controlApiStub);

    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should list keys successfully", async function () {
      const keysData = [
        {
          id: "key1",
          name: "Key 1",
          appId: "test-app-id",
          key: "test-app-id.key1:secret1",
          capability: { "*": ["*"] },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        },
        {
          id: "key2",
          name: "Key 2",
          appId: "test-app-id",
          key: "test-app-id.key2:secret2",
          capability: { "channel:*": ["subscribe"] },
          created: 1640995300000,
          modified: 1640995300000,
          revocable: true,
          status: "enabled",
        },
      ];

      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      getCurrentKeyIdStub.returns("key1");
      controlApiStub.listKeys.resolves(keysData);

      await command.run();

      expect(controlApiStub.listKeys.calledWith("test-app-id")).to.be.true;
      expect(command.logOutput).to.include("Found 2 API keys:");
      expect(command.logOutput.join(" ")).to.include("Key 1");
      expect(command.logOutput.join(" ")).to.include("Key 2");
      expect(command.logOutput.join(" ")).to.include("(current)");
    });

    it("should handle empty key list", async function () {
      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      controlApiStub.listKeys.resolves([]);

      await command.run();

      expect(controlApiStub.listKeys.calledWith("test-app-id")).to.be.true;
      expect(command.logOutput).to.include("No API keys found for this app.");
    });

    it("should use current app when no app flag provided", async function () {
      const keysData = [
        {
          id: "key1",
          name: "Current App Key",
          appId: "current-app-id",
          key: "current-app-id.key1:secret",
          capability: { "*": ["*"] },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        },
      ];

      command.setParseResult({
        flags: {},
      });

      getCurrentAppIdStub.returns("current-app-id");
      controlApiStub.listKeys.resolves(keysData);

      await command.run();

      expect(controlApiStub.listKeys.calledWith("current-app-id")).to.be.true;
    });

    it("should error when no app specified and no current app", async function () {
      command.setParseResult({
        flags: {},
      });

      getCurrentAppIdStub.returns(null);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include('No app specified. Please provide --app flag or switch to an app');
      }
    });

    it("should output JSON when json flag is set", async function () {
      const keysData = [
        {
          id: "key1",
          name: "JSON Key",
          appId: "test-app-id",
          key: "test-app-id.key1:secret",
          capability: { "*": ["*"] },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        },
      ];

      command.setParseResult({
        flags: { app: "test-app-id", json: true },
      });

      controlApiStub.listKeys.resolves(keysData);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", true);
      expect(output).to.have.property("keys");
      expect(output.keys).to.have.lengthOf(1);
      expect(output.keys[0]).to.include({
        id: "key1",
        name: "JSON Key",
      });
    });

    it("should display capability information correctly", async function () {
      const keysData = [
        {
          id: "key1",
          name: "Multi Capability Key",
          appId: "test-app-id",
          key: "test-app-id.key1:secret",
          capability: {
            "channel:chat-*": ["publish", "subscribe"],
            "channel:updates": ["publish"],
          },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        },
      ];

      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      controlApiStub.listKeys.resolves(keysData);

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Multi Capability Key");
      expect(command.logOutput.join(" ")).to.include("channel:chat-*");
      expect(command.logOutput.join(" ")).to.include("channel:updates");
    });

    it("should mark current key when available", async function () {
      const keysData = [
        {
          id: "key1",
          name: "Current Key",
          appId: "test-app-id",
          key: "test-app-id.key1:secret",
          capability: { "*": ["*"] },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        },
        {
          id: "key2",
          name: "Other Key",
          appId: "test-app-id",
          key: "test-app-id.key2:secret",
          capability: { "*": ["*"] },
          created: 1640995300000,
          modified: 1640995300000,
          revocable: true,
          status: "enabled",
        },
      ];

      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      getCurrentKeyIdStub.returns("test-app-id.key1");
      controlApiStub.listKeys.resolves(keysData);

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Current Key");
      expect(command.logOutput.join(" ")).to.include("(current)");
    });

    it("should handle no current key set", async function () {
      const keysData = [
        {
          id: "key1",
          name: "Key 1",
          appId: "test-app-id",
          key: "test-app-id.key1:secret",
          capability: { "*": ["*"] },
          created: 1640995200000,
          modified: 1640995200000,
          revocable: true,
          status: "enabled",
        },
      ];

      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      getCurrentKeyIdStub.returns(null);
      controlApiStub.listKeys.resolves(keysData);

      await command.run();

      expect(command.logOutput.join(" ")).to.not.include("(current)");
    });

    it("should handle API errors gracefully", async function () {
      command.setParseResult({
        flags: { app: "test-app-id" },
      });

      const error = new Error("API request failed (401 Unauthorized): Invalid access token");
      controlApiStub.listKeys.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error listing keys: API request failed");
      }
    });

    it("should handle API errors gracefully with JSON output", async function () {
      command.setParseResult({
        flags: { app: "test-app-id", json: true },
      });

      const error = new Error("API request failed (403 Forbidden): Insufficient permissions");
      controlApiStub.listKeys.rejects(error);

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
            flags: { app: "test-app-id" },
          });

          controlApiStub.listKeys.rejects(error);

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