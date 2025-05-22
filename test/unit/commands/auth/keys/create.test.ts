import { expect } from "chai";
import { Config } from "@oclif/core";
import nock from "nock";
import sinon from "sinon";
import KeysCreateCommand from "../../../../../src/commands/auth/keys/create.js";
import { ControlApi } from "../../../../../src/services/control-api.js";

class TestableKeysCreateCommand extends KeysCreateCommand {
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
      flags: { name: "Test Key" },
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

describe("KeysCreateCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableKeysCreateCommand;
  let mockConfig: Config;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let getCurrentAppIdStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableKeysCreateCommand([], mockConfig);

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
    it("should create a key successfully with default capabilities", async function () {
      const keyData = {
        id: "test-key-id",
        name: "Test Key",
        appId: "test-app-id",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["*"] },
        created: 1640995200000,
        modified: 1640995200000,
        revocable: true,
        status: "enabled",
      };

      command.setParseResult({
        flags: { name: "Test Key", app: "test-app-id" },
      });

      controlApiStub.createKey.resolves(keyData);

      await command.run();

      expect(controlApiStub.createKey.calledOnce).to.be.true;
      expect(controlApiStub.createKey.firstCall.args[0]).to.equal("test-app-id");
      expect(controlApiStub.createKey.firstCall.args[1]).to.deep.equal({
        name: "Test Key",
        capability: { "*": ["*"] },
      });

      expect(command.logOutput).to.include('Creating key "Test Key" for app test-app-id...');
      expect(command.logOutput).to.include("Key created successfully!");
      expect(command.logOutput).to.include("Key Name: test-app-id.test-key-id");
      expect(command.logOutput).to.include("Full key: test-app-id.test-key-id:secret");
    });

    it("should create a key with custom capabilities", async function () {
      const keyData = {
        id: "test-key-id",
        name: "Custom Key",
        appId: "test-app-id",
        key: "test-app-id.test-key-id:secret",
        capability: { "channel:*": ["publish", "subscribe"] },
        created: 1640995200000,
        modified: 1640995200000,
        revocable: true,
        status: "enabled",
      };

      command.setParseResult({
        flags: {
          name: "Custom Key",
          app: "test-app-id",
          capabilities: '{"channel:*":["publish","subscribe"]}',
        },
      });

      controlApiStub.createKey.resolves(keyData);

      await command.run();

      expect(controlApiStub.createKey.firstCall.args[1]).to.deep.equal({
        name: "Custom Key",
        capability: { "channel:*": ["publish", "subscribe"] },
      });

      expect(command.logOutput).to.include("channel:* → publish, subscribe");
    });

    it("should use current app when no app flag provided", async function () {
      const keyData = {
        id: "test-key-id",
        name: "Current App Key",
        appId: "current-app-id",
        key: "current-app-id.test-key-id:secret",
        capability: { "*": ["*"] },
        created: 1640995200000,
        modified: 1640995200000,
        revocable: true,
        status: "enabled",
      };

      command.setParseResult({
        flags: { name: "Current App Key" },
      });

      getCurrentAppIdStub.returns("current-app-id");
      controlApiStub.createKey.resolves(keyData);

      await command.run();

      expect(controlApiStub.createKey.calledWith("current-app-id")).to.be.true;
    });

    it("should error when no app specified and no current app", async function () {
      command.setParseResult({
        flags: { name: "Test Key" },
      });

      getCurrentAppIdStub.returns(null);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include('No app specified. Please provide --app flag or switch to an app');
      }
    });

    it("should error when no app specified and no current app with JSON output", async function () {
      command.setParseResult({
        flags: { name: "Test Key", json: true },
      });

      getCurrentAppIdStub.returns(null);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", false);
      expect(output.error).to.include('No app specified. Please provide --app flag or switch to an app');
    });

    it("should error with invalid capabilities JSON", async function () {
      command.setParseResult({
        flags: {
          name: "Invalid Key",
          app: "test-app-id",
          capabilities: "invalid json",
        },
      });

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Invalid capabilities JSON format");
      }
    });

    it("should error with invalid capabilities JSON and JSON output", async function () {
      command.setParseResult({
        flags: {
          name: "Invalid Key",
          app: "test-app-id",
          capabilities: "invalid json",
          json: true,
        },
      });

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", false);
      expect(output.error).to.include("Invalid capabilities JSON format");
    });

    it("should output JSON when json flag is set", async function () {
      const keyData = {
        id: "test-key-id",
        name: "JSON Key",
        appId: "test-app-id",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["*"] },
        created: 1640995200000,
        modified: 1640995200000,
        revocable: true,
        status: "enabled",
      };

      command.setParseResult({
        flags: { name: "JSON Key", app: "test-app-id", json: true },
      });

      controlApiStub.createKey.resolves(keyData);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.have.property("success", true);
      expect(output).to.have.property("key");
      expect(output.key).to.include({
        id: "test-key-id",
        name: "JSON Key",
        keyName: "test-app-id.test-key-id",
      });
    });

    it("should display multiple capabilities correctly", async function () {
      const keyData = {
        id: "test-key-id",
        name: "Multi Capability Key",
        appId: "test-app-id",
        key: "test-app-id.test-key-id:secret",
        capability: {
          "channel:chat-*": ["publish", "subscribe"],
          "channel:updates": ["publish"],
          "presence:*": ["enter", "leave"],
        },
        created: 1640995200000,
        modified: 1640995200000,
        revocable: true,
        status: "enabled",
      };

      command.setParseResult({
        flags: {
          name: "Multi Capability Key",
          app: "test-app-id",
          capabilities: '{"channel:chat-*":["publish","subscribe"],"channel:updates":["publish"],"presence:*":["enter","leave"]}',
        },
      });

      controlApiStub.createKey.resolves(keyData);

      await command.run();

      expect(command.logOutput).to.include("Capabilities:");
      expect(command.logOutput.join(" ")).to.include("channel:chat-* → publish, subscribe");
      expect(command.logOutput.join(" ")).to.include("channel:updates → publish");
      expect(command.logOutput.join(" ")).to.include("presence:* → enter, leave");
    });

    it("should handle API errors gracefully", async function () {
      command.setParseResult({
        flags: { name: "Failed Key", app: "test-app-id" },
      });

      const error = new Error("API request failed (400 Bad Request): Invalid key name");
      controlApiStub.createKey.rejects(error);

      try {
        await command.run();
        expect.fail("Should have thrown an error");
      } catch (err) {
        expect(command.errorOutput).to.include("Error creating key: API request failed");
      }
    });

    it("should handle API errors gracefully with JSON output", async function () {
      command.setParseResult({
        flags: { name: "Failed Key", app: "test-app-id", json: true },
      });

      const error = new Error("API request failed (400 Bad Request): Invalid key name");
      controlApiStub.createKey.rejects(error);

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
            flags: { name: "Test Key", app: "test-app-id" },
          });

          controlApiStub.createKey.rejects(error);

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