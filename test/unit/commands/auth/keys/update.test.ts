import { expect } from "chai";
import { Config } from "@oclif/core";
import sinon from "sinon";
import nock from "nock";
import KeysUpdateCommand from "../../../../../src/commands/auth/keys/update.js";
import { ControlApi } from "../../../../../src/services/control-api.js";

class TestableKeysUpdateCommand extends KeysUpdateCommand {
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

  public get testConfigManager() {
    return this.configManager;
  }
}

describe("KeysUpdateCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableKeysUpdateCommand;
  let mockConfig: Config;
  let getCurrentAppIdStub: sinon.SinonStub;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  const baseUrl = "https://control.ably.io";

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableKeysUpdateCommand([], mockConfig);

    // Stub config manager methods
    getCurrentAppIdStub = sandbox.stub(command.testConfigManager, "getCurrentAppId").returns("test-app-id");
    
    // Create control API stub
    controlApiStub = sandbox.createStubInstance(ControlApi);
    sandbox.stub(command, "createControlApi" as any).returns(controlApiStub);
    
    // Clear any previous nock interceptors
    nock.cleanAll();
  });

  afterEach(function () {
    sandbox.restore();
    nock.cleanAll();
  });

  describe("#run", function () {
    it("should update key name successfully", async function () {
      const originalKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Old Name",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish", "subscribe"] },
        created: 1640995200000,
        modified: 1640995200000,
        revocable: true,
        status: "enabled",
      };

      const updatedKey = {
        ...originalKey,
        name: "New Name",
        modified: 1640995300000,
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { name: "New Name" },
      });

      controlApiStub.getKey.resolves(originalKey);
      controlApiStub.updateKey.resolves(updatedKey);

      await command.run();

      expect(controlApiStub.getKey.calledWith("test-app-id", "test-key-id")).to.be.true;
      expect(controlApiStub.updateKey.calledWith("test-app-id", "test-key-id", { name: "New Name" })).to.be.true;
      expect(command.logOutput).to.include("Key Name: test-app-id.test-key-id");
      expect(command.logOutput.join(" ")).to.include('Key Label: "Old Name" → "New Name"');
    });

    it("should update key capabilities successfully", async function () {
      const originalKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      const updatedKey = {
        ...originalKey,
        capability: { "*": ["publish", "subscribe", "presence"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { capabilities: "publish,subscribe,presence" },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, originalKey);

      nock(baseUrl)
        .patch("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, updatedKey);

      await command.run();

      expect(command.logOutput.join(" ")).to.include("Capabilities:");
      expect(command.logOutput.join(" ")).to.include("Before:");
      expect(command.logOutput.join(" ")).to.include("After:");
    });

    it("should update both name and capabilities", async function () {
      const originalKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Old Name",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      const updatedKey = {
        ...originalKey,
        name: "New Name",
        capability: { "*": ["publish", "subscribe"] },
      };

      command.setParseResult({
        args: { keyName: "test-app-id.test-key-id" },
        flags: { name: "New Name", capabilities: "publish,subscribe" },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, originalKey);

      nock(baseUrl)
        .patch("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, updatedKey);

      await command.run();

      expect(command.logOutput.join(" ")).to.include('Key Label: "Old Name" → "New Name"');
      expect(command.logOutput.join(" ")).to.include("Capabilities:");
    });

    it("should use key ID when provided without app ID", async function () {
      const originalKey = {
        id: "test-key-id",
        appId: "test-app-id",
        name: "Test Key",
        key: "test-app-id.test-key-id:secret",
        capability: { "*": ["publish"] },
      };

      const updatedKey = {
        ...originalKey,
        name: "Updated Name",
      };

      command.setParseResult({
        args: { keyName: "test-key-id" },
        flags: { name: "Updated Name" },
      });

      nock(baseUrl)
        .get("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, originalKey);

      nock(baseUrl)
        .patch("/v1/apps/test-app-id/keys/test-key-id")
        .reply(200, updatedKey);

      await command.run();

      expect(command.logOutput).to.include("Key Name: test-app-id.test-key-id");
    });

    it("should use app flag when provided", async function () {
      const originalKey = {
        id: "key-123",
        appId: "different-app",
        name: "Test Key",
        key: "different-app.key-123:secret",
        capability: { "*": ["publish"] },
      };

      const updatedKey = {
        ...originalKey,
        name: "Updated Name",
      };

      command.setParseResult({
        args: { keyName: "key-123" },
        flags: { app: "different-app", name: "Updated Name" },
      });

      nock(baseUrl)
        .get("/v1/apps/different-app/keys/key-123")
        .reply(200, originalKey);

      nock(baseUrl)
        .patch("/v1/apps/different-app/keys/key-123")
        .reply(200, updatedKey);

      await command.run();

      expect(command.logOutput).to.include("Key Name: different-app.key-123");
    });

    it("should parse complex key names with periods", async function () {
      const originalKey = {
        id: "key.with.periods",
        appId: "app-id",
        name: "Test Key",
        key: "app-id.key.with.periods:secret",
        capability: { "*": ["publish"] },
      };

      const updatedKey = {
        ...originalKey,
        name: "Updated Name",
      };

      command.setParseResult({
        args: { keyName: "app-id.key.with.periods" },
        flags: { name: "Updated Name" },
      });

      nock(baseUrl)
        .get("/v1/apps/app-id/keys/key.with.periods")
        .reply(200, originalKey);

      nock(baseUrl)
        .patch("/v1/apps/app-id/keys/key.with.periods")
        .reply(200, updatedKey);

      await command.run();

      expect(command.logOutput).to.include("Key Name: app-id.key.with.periods");
    });

    describe("error handling", function () {
      it("should error when no app ID is available", async function () {
        getCurrentAppIdStub.returns(null);

        command.setParseResult({
          args: { keyName: "test-key-id" },
          flags: { name: "New Name" },
        });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("No app specified");
        }
      });

      it("should error when no update flags are provided", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: {},
        });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("No updates specified");
        }
      });

      it("should handle key not found error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.nonexistent-key" },
          flags: { name: "New Name" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/nonexistent-key")
          .reply(404, { error: "Key not found" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error updating key");
        }
      });

      it("should handle unauthorized error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { name: "New Name" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(401, { error: "Unauthorized" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error updating key");
        }
      });

      it("should handle forbidden error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { name: "New Name" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(403, { error: "Forbidden" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error updating key");
        }
      });

      it("should handle server error", async function () {
        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { name: "New Name" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(500, { error: "Internal server error" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error updating key");
        }
      });

      it("should handle update operation errors", async function () {
        const originalKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { name: "New Name" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, originalKey);

        nock(baseUrl)
          .patch("/v1/apps/test-app-id/keys/test-key-id")
          .reply(400, { error: "Invalid update data" });

        try {
          await command.run();
          expect.fail("Should have thrown an error");
        } catch {
          expect(command.errorOutput).to.include("Error updating key");
        }
      });
    });

    describe("capability formatting", function () {
      it("should format simple capabilities", async function () {
        const originalKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
          capability: { "*": ["publish"] },
        };

        const updatedKey = {
          ...originalKey,
          capability: { "*": ["publish", "subscribe"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { capabilities: "publish,subscribe" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, originalKey);

        nock(baseUrl)
          .patch("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, updatedKey);

        await command.run();

        expect(command.logOutput.join(" ")).to.include("* → publish");
        expect(command.logOutput.join(" ")).to.include("* → publish, subscribe");
      });

      it("should handle keys with no capabilities", async function () {
        const originalKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
          capability: {},
        };

        const updatedKey = {
          ...originalKey,
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { capabilities: "publish" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, originalKey);

        nock(baseUrl)
          .patch("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, updatedKey);

        await command.run();

        expect(command.logOutput.join(" ")).to.include("Before: None");
        expect(command.logOutput.join(" ")).to.include("After:  * → publish");
      });

      it("should handle undefined capabilities", async function () {
        const originalKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
        };

        const updatedKey = {
          ...originalKey,
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { capabilities: "publish" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, originalKey);

        nock(baseUrl)
          .patch("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, updatedKey);

        await command.run();

        expect(command.logOutput.join(" ")).to.include("Before: None");
      });
    });

    describe("capabilities parsing", function () {
      it("should trim whitespace from capabilities", async function () {
        const originalKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
          capability: { "*": ["publish"] },
        };

        const updatedKey = {
          ...originalKey,
          capability: { "*": ["publish", "subscribe", "presence"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { capabilities: " publish , subscribe , presence " },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, originalKey);

        nock(baseUrl)
          .patch("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, updatedKey);

        await command.run();

        expect(command.logOutput.join(" ")).to.include("publish, subscribe, presence");
      });

      it("should handle single capability", async function () {
        const originalKey = {
          id: "test-key-id",
          appId: "test-app-id",
          name: "Test Key",
          key: "test-app-id.test-key-id:secret",
          capability: { "*": ["publish", "subscribe"] },
        };

        const updatedKey = {
          ...originalKey,
          capability: { "*": ["publish"] },
        };

        command.setParseResult({
          args: { keyName: "test-app-id.test-key-id" },
          flags: { capabilities: "publish" },
        });

        nock(baseUrl)
          .get("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, originalKey);

        nock(baseUrl)
          .patch("/v1/apps/test-app-id/keys/test-key-id")
          .reply(200, updatedKey);

        await command.run();

        expect(command.logOutput.join(" ")).to.include("After:  * → publish");
      });
    });
  });
});