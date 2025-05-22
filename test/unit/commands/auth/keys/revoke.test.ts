import { expect } from "chai";
import { Config } from "@oclif/core";
import sinon from "sinon";
import nock from "nock";
import KeysRevokeCommand from "../../../../../src/commands/auth/keys/revoke.js";

class TestableKeysRevokeCommand extends KeysRevokeCommand {
  public logOutput: string[] = [];
  public errorOutput: string = "";
  private _parseResult: any;
  private _confirmResponse: boolean = true;

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

  public setConfirmResponse(response: boolean): void {
    this._confirmResponse = response;
  }

  public get testConfigManager() {
    return this.configManager;
  }

  public get testInteractiveHelper() {
    return this.interactiveHelper;
  }
}

describe("KeysRevokeCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableKeysRevokeCommand;
  let mockConfig: Config;
  let getCurrentAppIdStub: sinon.SinonStub;
  let getApiKeyStub: sinon.SinonStub;
  let removeApiKeyStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  const baseUrl = "https://control.ably.io";

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableKeysRevokeCommand([], mockConfig);

    // Stub config manager methods
    getCurrentAppIdStub = sandbox.stub(command.testConfigManager, "getCurrentAppId").returns("test-app-id");
    getApiKeyStub = sandbox.stub(command.testConfigManager, "getApiKey").returns(undefined);
    removeApiKeyStub = sandbox.stub(command.testConfigManager, "removeApiKey");
    
    // Stub interactive helper
    confirmStub = sandbox.stub(command.testInteractiveHelper, "confirm").resolves(true);
    
    // Clear any previous nock interceptors
    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should revoke key successfully with confirmation", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish", "subscribe"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: {},
      });

      // Mock getting key details
      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      // Mock revoking key
      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(command.logOutput).to.include("Key to revoke:");
      expect(command.logOutput).to.include("Key Name: test-app-id.test-key-id");
      expect(command.logOutput).to.include("Key Label: Test Key");
      expect(command.logOutput).to.include("Key test-app-id.test-key-id has been revoked.");
    });

    it("should revoke key with force flag without confirmation", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(confirmStub.called).to.be.false;
      expect(command.logOutput).to.include("Key test-app-id.test-key-id has been revoked.");
    });

    it("should output JSON when json flag is set", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { json: true, force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.deep.include({
        keyName: "test-app-id.test-key-id",
        message: "Key has been revoked",
        success: true,
      });
    });

    it("should handle cancellation by user", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: {},
      });

      confirmStub.resolves(false);

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      await command.run();

      expect(command.logOutput).to.include("Revocation cancelled.");
    });

    it("should handle cancellation with JSON output", async function () {
      const mockKey = {
        id: "test-key-id", 
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { json: true },
      });

      confirmStub.resolves(false);

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      await command.run();

      expect(command.logOutput).to.have.lengthOf(1);
      const output = JSON.parse(command.logOutput[0]);
      expect(output).to.deep.include({
        error: "Revocation cancelled by user",
        keyName: "test-app-id.test-key-id",
        success: false,
      });
    });

    it("should use key ID when provided without app ID", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(command.logOutput).to.include("Key test-app-id.test-key-id has been revoked.");
    });

    it("should use app flag when provided", async function () {
      const mockKey = {
        id: "key-123",
        appId: "different-app",
        name: "Test Key",
        key: "different-app.key-123:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "key-123" },
        flags: { app: "different-app", force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/different-app/keys/key-123")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/different-app/keys/key-123")
        .reply(204);

      await command.run();

      expect(command.logOutput).to.include("Key different-app.key-123 has been revoked.");
    });

    it("should handle keys with no capabilities", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: {},
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Capabilities: None");
    });

    it("should handle keys with undefined capabilities", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Capabilities: None");
    });

    it("should handle keys with unnamed label", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Key Label: Unnamed key");
    });

    it("should format complex capabilities", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: {
          "channel1": ["publish", "subscribe"],
          "channel2": ["presence"],
          "*": ["stats"],
        },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      const output = command.logOutput.join(" ");
      expect(output).to.include("Capabilities:");
      expect(output).to.include("channel1");
      expect(output).to.include("channel2");
    });

    it("should remove current key from config when revoked key matches", async function () {
      const mockKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Current Key",
        key: "test-app-id.test-key-id:current-secret",
        capability: { "*": ["publish"] },
      };

      getApiKeyStub.returns("test-app-id.test-key-id:current-secret");

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { force: true },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, mockKey);

      nock(baseUrl)
        .delete("/v1/apps/test-app-id/keys/test-key-id")
        .reply(204);

      await command.run();

      expect(confirmStub.calledTwice).to.be.true;
      expect(removeApiKeyStub.calledWith("test-app-id")).to.be.true;
      expect(command.logOutput.join(" ")).to.include("Key removed from configuration");
    });

    describe("error handling", function () {
      it("should error when no app ID is available", async function () {
        getCurrentAppIdStub.returns(undefined);

        command.setParseResult({
          args: { keyName: "test-key-id" },
          flags: {},
        });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("No app specified");
        }
      });

      it("should output JSON error when no app ID available with json flag", async function () {
        getCurrentAppIdStub.returns(undefined);

        command.setParseResult({
          args: { keyName: "test-key-id" },
          flags: { json: true },
        });

        await command.run();

        expect(command.logOutput).to.have.lengthOf(1);
        const output = JSON.parse(command.logOutput[0]);
        expect(output.success).to.be.false;
        expect(output.error).to.include("No app specified");
      });

      it("should handle key not found error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.nonexistent-key" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/nonexistent-key")
          .reply(404, { error: "Key not found" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error revoking key");
        }
      });

      it("should handle unauthorized error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(401, { error: "Unauthorized" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error revoking key");
        }
      });

      it("should handle forbidden error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(403, { error: "Forbidden" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error revoking key");
        }
      });

      it("should handle server error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(500, { error: "Internal server error" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error revoking key");
        }
      });

      it("should handle revoke operation errors", async function () {
        const mockKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, mockKey);

        nock(baseUrl)
          .delete("/v1/apps/test-app-id/keys/test-key-id")
          .reply(400, { error: "Cannot revoke key" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error revoking key");
        }
      });

      it("should handle JSON error output for revocation errors", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { json: true, force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(404, { error: "Key not found" });

        await command.run();

        expect(command.logOutput).to.have.lengthOf(1);
        const output = JSON.parse(command.logOutput[0]);
        expect(output.success).to.be.false;
        expect(output.error).to.be.a("string");
        expect(output.appId).to.equal("test-app-id");
        expect(output.keyId).to.equal("test-key-id");
      });
    });

    describe("key name parsing", function () {
      it("should parse app_id.key_id format correctly", async function () {
        const mockKey = {
          id: "key-with-periods.123",
          appId: "app-123",
          name: "Test Key",
          key: "app-123.key-with-periods.123:secret",
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "app-123.key-with-periods.123" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/app-123/keys/key-with-periods.123")
          .reply(200, mockKey);

        nock(baseUrl)
          .delete("/v1/apps/app-123/keys/key-with-periods.123")
          .reply(204);

        await command.run();

        expect(command.logOutput).to.include("Key app-123.key-with-periods.123 has been revoked.");
      });

      it("should not parse keys with colons as app_id.key_id", async function () {
        const mockKey = {
          id: "key:with:colons",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.key:with:colons:secret",
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "key:with:colons" },
          flags: { force: true },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/key:with:colons")
          .reply(200, mockKey);

        nock(baseUrl)
          .delete("/v1/apps/test-app-id/keys/key:with:colons")
          .reply(204);

        await command.run();

        expect(command.logOutput).to.include("Key test-app-id.key:with:colons has been revoked.");
      });
    });
  });
});