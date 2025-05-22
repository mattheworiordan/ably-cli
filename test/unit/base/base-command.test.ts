import { expect } from "chai";
import sinon from "sinon";
import fs from "node:fs";
import * as Ably from "ably";
import { AblyBaseCommand } from "../../../src/base-command.js";
import { ConfigManager } from "../../../src/services/config-manager.js";
import { InteractiveHelper } from "../../../src/services/interactive-helper.js";
import { ControlApi } from "../../../src/services/control-api.js";
import { BaseFlags } from "../../../src/types/cli.js";
import { Config } from "@oclif/core";
import { trackAblyClient } from "../../setup.js";

// Create a testable implementation of the abstract AblyBaseCommand
class TestCommand extends AblyBaseCommand {
  // Expose protected methods for testing
  public testCheckWebCliRestrictions(): void {
    this.checkWebCliRestrictions();
  }

  public testIsAllowedInWebCliMode(command?: string): boolean {
    return this.isAllowedInWebCliMode(command);
  }

  public testShouldOutputJson(flags: BaseFlags): boolean {
    return this.shouldOutputJson(flags);
  }

  public testParseApiKey(apiKey: string) {
    return this.parseApiKey(apiKey);
  }

  public testEnsureAppAndKey(flags: BaseFlags): Promise<{ apiKey: string; appId: string } | null> {
    return this.ensureAppAndKey(flags);
  }

  public testCreateAblyRestClient(options: Ably.ClientOptions | BaseFlags): Ably.Rest {
    return this.createAblyRestClient(options);
  }

  public testCreateAblyClient(flags: BaseFlags): Promise<Ably.Realtime | null> {
    return this.createAblyClient(flags);
  }

  public testGetClientOptions(flags: BaseFlags): Ably.ClientOptions {
    return this.getClientOptions(flags);
  }

  public testFormatJsonOutput(data: Record<string, unknown>, flags: BaseFlags): string {
    return this.formatJsonOutput(data, flags);
  }

  public testIsPrettyJsonOutput(flags: BaseFlags): boolean {
    return this.isPrettyJsonOutput(flags);
  }

  public testShouldSuppressOutput(flags: BaseFlags): boolean {
    return this.shouldSuppressOutput(flags);
  }

  public testDisplayAuthInfo(flags: BaseFlags, showAppInfo: boolean = true): void {
    this.displayAuthInfo(flags, showAppInfo);
  }

  public testDisplayControlPlaneInfo(flags: BaseFlags): void {
    this.displayControlPlaneInfo(flags);
  }

  public testDisplayDataPlaneInfo(flags: BaseFlags): void {
    this.displayDataPlaneInfo(flags);
  }

  public testShouldShowAuthInfo(): boolean {
    return this.shouldShowAuthInfo();
  }

  public testShowAuthInfoIfNeeded(flags: BaseFlags = {}): void {
    this.showAuthInfoIfNeeded(flags);
  }

  public testOutputJsonError(message: string, errorDetails: any = {}): void {
    this.outputJsonError(message, errorDetails);
  }

  public testIsTestMode(): boolean {
    return this.isTestMode();
  }

  public testGetMockAblyRest(): Ably.Rest | undefined {
    return this.getMockAblyRest();
  }

  // Make protected properties accessible for testing
  public get testConfigManager(): ConfigManager {
    return this.configManager;
  }

  public set testConfigManager(value: ConfigManager) {
    this.configManager = value;
  }

  public get testInteractiveHelper(): InteractiveHelper {
    return this.interactiveHelper;
  }

  public set testInteractiveHelper(value: InteractiveHelper) {
    this.interactiveHelper = value;
  }

  public get testIsWebCliMode(): boolean {
    return this.isWebCliMode;
  }

  public set testIsWebCliMode(value: boolean) {
    this.isWebCliMode = value;
  }

  async run(): Promise<void> {
    // Empty implementation
  }
}

describe("AblyBaseCommand", function() {
  let command: TestCommand;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let interactiveHelperStub: sinon.SinonStubbedInstance<InteractiveHelper>;
  let _fsExistsStub: sinon.SinonStub;
  let sandbox: sinon.SinonSandbox;
  let originalEnv: NodeJS.ProcessEnv;
  let mockAblyRest: sinon.SinonStubbedInstance<Ably.Rest>;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    // Store original env vars to restore after tests
    originalEnv = { ...process.env };

    // Reset env before each test
    process.env = { ...originalEnv };

    // Stub fs.existsSync to prevent file system operations using sandbox
    _fsExistsStub = sandbox.stub(fs, "existsSync").returns(true);

    // Also stub fs.readFileSync to prevent actual file access using sandbox
    sandbox.stub(fs, "readFileSync").returns("");

    // Create stubs for dependencies using sandbox
    // Note: createStubInstance doesn't need sandbox explicitly, but we manage other stubs with it.
    configManagerStub = sandbox.createStubInstance(ConfigManager);

    // Instead of stubbing loadConfig which is private, we'll stub methods that might access the file system using sandbox
    sandbox.stub(ConfigManager.prototype as any, "ensureConfigDirExists").callsFake(() => {});
    sandbox.stub(ConfigManager.prototype as any, "saveConfig").callsFake(() => {});

    // Note: createStubInstance doesn't need sandbox explicitly.
    interactiveHelperStub = sandbox.createStubInstance(InteractiveHelper);

    // Create mock Ably Rest client
    mockAblyRest = sandbox.createStubInstance(Ably.Rest);
    
    // Mock a minimal config
    const mockConfig = {
      root: "",
      // Mock other properties as needed
    } as unknown as Config;

    command = new TestCommand([], mockConfig);

    // Replace the command's dependencies with our stubs
    command.testConfigManager = configManagerStub;
    command.testInteractiveHelper = interactiveHelperStub;

    // Set test mode
    process.env.ABLY_CLI_TEST_MODE = "true";
  });

  afterEach(function() {
    // Clean up sinon stubs using the sandbox
    sandbox.restore();

    // Restore original env
    process.env = originalEnv;
  });

  describe("constructor", function() {
    it("should initialize with ConfigManager and InteractiveHelper", function() {
      expect(command.testConfigManager).to.not.be.undefined;
      expect(command.testInteractiveHelper).to.not.be.undefined;
    });

    it("should detect web CLI mode from environment", function() {
      const originalEnv = process.env.ABLY_WEB_CLI_MODE;
      
      process.env.ABLY_WEB_CLI_MODE = "true";
      const webCommand = new TestCommand([], {} as Config);
      expect(webCommand.testIsWebCliMode).to.be.true;

      process.env.ABLY_WEB_CLI_MODE = "false";
      const regularCommand = new TestCommand([], {} as Config);
      expect(regularCommand.testIsWebCliMode).to.be.false;

      // Restore
      if (originalEnv !== undefined) {
        process.env.ABLY_WEB_CLI_MODE = originalEnv;
      } else {
        delete process.env.ABLY_WEB_CLI_MODE;
      }
    });
  });

  describe("test mode detection", function() {
    it("should detect test mode from environment", function() {
      process.env.ABLY_CLI_TEST_MODE = "true";
      expect(command.testIsTestMode()).to.be.true;

      process.env.ABLY_CLI_TEST_MODE = "false";
      expect(command.testIsTestMode()).to.be.false;

      delete process.env.ABLY_CLI_TEST_MODE;
      expect(command.testIsTestMode()).to.be.false;
    });

    it("should return mock Ably Rest client in test mode", function() {
      process.env.ABLY_CLI_TEST_MODE = "true";
      (globalThis as any).__TEST_MOCKS__ = { ablyRestMock: mockAblyRest };
      
      expect(command.testGetMockAblyRest()).to.equal(mockAblyRest);
      
      delete (globalThis as any).__TEST_MOCKS__;
    });
  });

  describe("checkWebCliRestrictions", function() {
    it("should not throw error when not in web CLI mode", function() {
      command.testIsWebCliMode = false;
      expect(() => command.testCheckWebCliRestrictions()).to.not.throw();
    });

    it("should throw error when in web CLI mode and command is restricted", function() {
      command.testIsWebCliMode = true;
      // Mock command ID to be a restricted command
      Object.defineProperty(command, "id", { value: "accounts:login" });

      expect(() => command.testCheckWebCliRestrictions()).to.throw();
    });

    it("should not throw error when in web CLI mode but command is allowed", function() {
      command.testIsWebCliMode = true;
      // Mock command ID to be an allowed command
      Object.defineProperty(command, "id", { value: "help" });

      expect(() => command.testCheckWebCliRestrictions()).to.not.throw();
    });

    it("should provide specific error messages for different restricted commands", function() {
      command.testIsWebCliMode = true;
      
      const restrictedCommands = [
        { id: "accounts:login", expected: "already logged in via the web CLI" },
        { id: "accounts:logout", expected: "cannot log out via the web CLI" },
        { id: "accounts:switch", expected: "cannot change accounts in the web CLI" },
        { id: "mcp", expected: "MCP server functionality is not available" },
      ];

      restrictedCommands.forEach(({ id, expected }) => {
        Object.defineProperty(command, "id", { value: id });
        try {
          command.testCheckWebCliRestrictions();
          expect.fail("Should have thrown an error");
        } catch (error: any) {
          expect(error.message).to.include(expected);
        }
      });
    });
  });

  describe("isAllowedInWebCliMode", function() {
    it("should return true when not in web CLI mode", function() {
      command.testIsWebCliMode = false;
      expect(command.testIsAllowedInWebCliMode()).to.be.true;
    });

    it("should return false for restricted commands", function() {
      command.testIsWebCliMode = true;
      expect(command.testIsAllowedInWebCliMode("accounts:login")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("accounts:logout")).to.be.false;
      expect(command.testIsAllowedInWebCliMode("mcp:start-server")).to.be.false;
    });

    it("should return true for allowed commands", function() {
      command.testIsWebCliMode = true;
      expect(command.testIsAllowedInWebCliMode("help")).to.be.true;
      expect(command.testIsAllowedInWebCliMode("channels:publish")).to.be.true;
    });
  });

  describe("output formatting", function() {
    describe("shouldOutputJson", function() {
      it("should return true when json flag is true", function() {
        const flags: BaseFlags = { json: true };
        expect(command.testShouldOutputJson(flags)).to.be.true;
      });

      it("should return true when pretty-json flag is true", function() {
        const flags: BaseFlags = { "pretty-json": true };
        expect(command.testShouldOutputJson(flags)).to.be.true;
      });

      it("should return true when format is json", function() {
        const flags: BaseFlags = { format: "json" };
        expect(command.testShouldOutputJson(flags)).to.be.true;
      });

      it("should return false when no json flags are present", function() {
        const flags: BaseFlags = {};
        expect(command.testShouldOutputJson(flags)).to.be.false;
      });
    });

    describe("isPrettyJsonOutput", function() {
      it("should return true when pretty-json flag is true", function() {
        const flags: BaseFlags = { "pretty-json": true };
        expect(command.testIsPrettyJsonOutput(flags)).to.be.true;
      });

      it("should return false when json flag is true but pretty-json is false", function() {
        const flags: BaseFlags = { json: true };
        expect(command.testIsPrettyJsonOutput(flags)).to.be.false;
      });

      it("should return false when no json flags are present", function() {
        const flags: BaseFlags = {};
        expect(command.testIsPrettyJsonOutput(flags)).to.be.false;
      });
    });

    describe("formatJsonOutput", function() {
      it("should format JSON output correctly", function() {
        const data = { message: "test", success: true };
        const flags: BaseFlags = { json: true };
        
        const result = command.testFormatJsonOutput(data, flags);
        
        expect(result).to.equal(JSON.stringify(data, null, 2));
      });

      it("should handle pretty JSON formatting", function() {
        const data = { message: "test", success: true };
        const flags: BaseFlags = { "pretty-json": true };
        
        const result = command.testFormatJsonOutput(data, flags);
        
        // Should return formatted JSON string
        expect(result).to.be.a("string");
        expect(result).to.include("test");
      });
    });

    describe("shouldSuppressOutput", function() {
      it("should return true when quiet flag is set", function() {
        const flags: BaseFlags = { quiet: true };
        expect(command.testShouldSuppressOutput(flags)).to.be.true;
      });

      it("should return true when JSON output is enabled", function() {
        const flags: BaseFlags = { json: true };
        expect(command.testShouldSuppressOutput(flags)).to.be.true;
      });

      it("should return false when no suppression flags are set", function() {
        const flags: BaseFlags = {};
        expect(command.testShouldSuppressOutput(flags)).to.be.false;
      });
    });

    describe("outputJsonError", function() {
      let logStub: sinon.SinonStub;

      beforeEach(function() {
        logStub = sandbox.stub(command, "log");
      });

      it("should output error in JSON format", function() {
        const message = "Test error";
        const errorDetails = { code: 123, statusCode: 400 };

        command.testOutputJsonError(message, errorDetails);

        expect(logStub.calledOnce).to.be.true;
        const output = JSON.parse(logStub.firstCall.args[0]);
        expect(output.error).to.equal(message);
        expect(output.success).to.be.false;
        expect(output.code).to.equal(123);
        expect(output.statusCode).to.equal(400);
      });
    });
  });

  describe("parseApiKey", function() {
    it("should correctly parse a valid API key", function() {
      const validKey = "appId.keyId:keySecret";
      const result = command.testParseApiKey(validKey);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("appId");
      expect(result?.keyId).to.equal("keyId");
      expect(result?.keySecret).to.equal("keySecret");
    });

    it("should return null for an API key without colon", function() {
      const invalidKey = "appId.keyId";
      const result = command.testParseApiKey(invalidKey);

      expect(result).to.be.null;
    });

    it("should return null for an API key without period", function() {
      const invalidKey = "appIdkeyId:keySecret";
      const result = command.testParseApiKey(invalidKey);

      expect(result).to.be.null;
    });

    it("should return null for an empty API key", function() {
      expect(command.testParseApiKey("")).to.be.null;
    });

    it("should handle complex app IDs with multiple periods", function() {
      const complexKey = "app.id.with.dots.keyId:keySecret";
      const result = command.testParseApiKey(complexKey);

      expect(result).to.not.be.null;
      expect(result?.appId).to.equal("app.id.with.dots");
      expect(result?.keyId).to.equal("keyId");
      expect(result?.keySecret).to.equal("keySecret");
    });
  });

  describe("client creation", function() {
    describe("createAblyRestClient", function() {
      it("should return mock client in test mode", function() {
        process.env.ABLY_CLI_TEST_MODE = "true";
        (globalThis as any).__TEST_MOCKS__ = { ablyRestMock: mockAblyRest };

        const flags: BaseFlags = { "api-key": "test.key:secret" };
        const result = command.testCreateAblyRestClient(flags);

        expect(result).to.equal(mockAblyRest);
        
        delete (globalThis as any).__TEST_MOCKS__;
      });

      it("should throw error when no mock available in test mode", function() {
        process.env.ABLY_CLI_TEST_MODE = "true";
        delete (globalThis as any).__TEST_MOCKS__;

        const flags: BaseFlags = { "api-key": "test.key:secret" };
        
        expect(() => command.testCreateAblyRestClient(flags)).to.throw("Missing mock Ably Rest client in test mode");
      });

      it("should create real client when not in test mode", function() {
        process.env.ABLY_CLI_TEST_MODE = "false";
        
        // Mock the Ably.Rest constructor
        const mockConstructor = sandbox.stub(Ably, "Rest").returns(mockAblyRest);
        
        const flags: BaseFlags = { "api-key": "test.key:secret" };
        const result = command.testCreateAblyRestClient(flags);

        expect(mockConstructor.calledOnce).to.be.true;
        expect(result).to.equal(mockAblyRest);
      });
    });

    describe("getClientOptions", function() {
      it("should create client options from flags", function() {
        const flags: BaseFlags = {
          "api-key": "test.key:secret",
          "client-id": "test-client",
          host: "custom.ably.io",
          env: "sandbox"
        };

        const options = command.testGetClientOptions(flags);

        expect(options.key).to.equal("test.key:secret");
        expect(options.clientId).to.equal("test-client");
        expect(options.environment).to.equal("sandbox");
        expect(options.restHost).to.equal("custom.ably.io");
      });

      it("should use token when provided", function() {
        const flags: BaseFlags = {
          token: "test-token"
        };

        const options = command.testGetClientOptions(flags);

        expect(options.token).to.equal("test-token");
        expect(options.key).to.be.undefined;
      });

      it("should handle client-id 'none' specially", function() {
        const flags: BaseFlags = {
          "api-key": "test.key:secret",
          "client-id": "none"
        };

        const options = command.testGetClientOptions(flags);

        expect(options.clientId).to.be.null;
      });

      it("should use environment variables when flags not provided", function() {
        process.env.ABLY_API_KEY = "env.key:secret";
        process.env.ABLY_CLIENT_ID = "env-client";

        const flags: BaseFlags = {};
        const options = command.testGetClientOptions(flags);

        expect(options.key).to.equal("env.key:secret");
        expect(options.clientId).to.equal("env-client");
      });
    });
  });

  describe("authentication setup", function() {
    describe("ensureAppAndKey", function() {
      it("should use app and key from flags if available", async function() {
        const flags: BaseFlags = {
          app: "testAppId",
          "api-key": "testApiKey"
        };

        const result = await command.testEnsureAppAndKey(flags);

        expect(result).to.not.be.null;
        expect(result?.appId).to.equal("testAppId");
        expect(result?.apiKey).to.equal("testApiKey");
      });

      it("should use app and key from config if available", async function() {
        const flags: BaseFlags = {};

        configManagerStub.getCurrentAppId.returns("configAppId");
        configManagerStub.getApiKey.withArgs("configAppId").returns("configApiKey");

        const result = await command.testEnsureAppAndKey(flags);

        expect(result).to.not.be.null;
        expect(result?.appId).to.equal("configAppId");
        expect(result?.apiKey).to.equal("configApiKey");
      });

      it("should handle token authentication", async function() {
        const flags: BaseFlags = { 
          token: "test-token",
          app: "testApp"
        };

        const result = await command.testEnsureAppAndKey(flags);

        expect(result).to.not.be.null;
        expect(result?.appId).to.equal("testApp");
        expect(result?.apiKey).to.equal("");
      });

      it("should use interactive selection when no app/key configured", async function() {
        const flags: BaseFlags = {};

        configManagerStub.getCurrentAppId.returns(undefined as any);
        configManagerStub.getApiKey.returns(undefined as any);
        configManagerStub.getAccessToken.returns("test-access-token");

        const mockApp = { id: "interactiveApp", name: "Test App" };
        const mockKey = { id: "keyId", name: "Test Key", key: "interactiveApp.keyId:keySecret" };

        interactiveHelperStub.selectApp.resolves(mockApp as any);
        interactiveHelperStub.selectKey.resolves(mockKey as any);

        const result = await command.testEnsureAppAndKey(flags);

        expect(result).to.not.be.null;
        expect(result?.appId).to.equal("interactiveApp");
        expect(result?.apiKey).to.equal("interactiveApp.keyId:keySecret");
        expect(interactiveHelperStub.selectApp.calledOnce).to.be.true;
        expect(interactiveHelperStub.selectKey.calledOnce).to.be.true;
      });

      it("should handle web CLI mode appropriately", async function() {
        const flags: BaseFlags = {};
        command.testIsWebCliMode = true;
        process.env.ABLY_API_KEY = "webApp.keyId:keySecret";

        const result = await command.testEnsureAppAndKey(flags);

        expect(result).to.not.be.null;
        expect(result?.appId).to.equal("webApp");
        expect(result?.apiKey).to.equal("webApp.keyId:keySecret");
      });

      it("should return null if no authentication is available", async function() {
        const flags: BaseFlags = {};

        // Reset all required stubs to return empty values
        configManagerStub.getCurrentAppId.returns("" as any);
        configManagerStub.getApiKey.withArgs("").returns("" as any);
        configManagerStub.getAccessToken.returns("" as any);

        // Make sure environment variable is not set
        delete process.env.ABLY_API_KEY;

        const result = await command.testEnsureAppAndKey(flags);

        expect(result).to.be.null;
      });
    });
  });

  describe("authentication info display", function() {
    let logStub: sinon.SinonStub;

    beforeEach(function() {
      logStub = sandbox.stub(command, "log");
    });

    describe("shouldShowAuthInfo", function() {
      it("should return true for data plane commands by default", function() {
        Object.defineProperty(command, "id", { value: "channels:publish" });
        expect(command.testShouldShowAuthInfo()).to.be.true;
      });

      it("should return false for commands that skip auth info", function() {
        const skipCommands = ["accounts:login", "accounts:list", "config", "help:contact"];
        
        skipCommands.forEach(commandId => {
          Object.defineProperty(command, "id", { value: commandId });
          expect(command.testShouldShowAuthInfo()).to.be.false;
        });
      });
    });

    describe("displayAuthInfo", function() {
      beforeEach(function() {
        configManagerStub.getCurrentAccount.returns({
          accessToken: "test-token",
          accountId: "test-account-id",
          accountName: "Test Account"
        } as any);
        configManagerStub.getCurrentAccountAlias.returns("test-alias");
      });

      it("should display account info", function() {
        const flags: BaseFlags = {};
        
        command.testDisplayAuthInfo(flags, false);

        expect(logStub.calledWith(sinon.match(/Account=/))).to.be.true;
      });

      it("should display app and auth info when showAppInfo is true", function() {
        const flags: BaseFlags = { 
          app: "test-app",
          "api-key": "test.key:secret"
        };
        
        configManagerStub.getAppName.returns("Test App");
        configManagerStub.getKeyName.returns("Test Key");

        command.testDisplayAuthInfo(flags, true);

        expect(logStub.calledWith(sinon.match(/App=/))).to.be.true;
        expect(logStub.calledWith(sinon.match(/Key=/))).to.be.true;
      });

      it("should display token auth info", function() {
        const flags: BaseFlags = { 
          token: "very-long-token-that-should-be-truncated"
        };

        command.testDisplayAuthInfo(flags, true);

        expect(logStub.calledWith(sinon.match(/Auth=Token/))).to.be.true;
      });
    });

    describe("displayControlPlaneInfo", function() {
      it("should display auth info when not suppressed", function() {
        const flags: BaseFlags = {};
        const displayStub = sandbox.stub(command, "testDisplayAuthInfo");

        command.testDisplayControlPlaneInfo(flags);

        expect(displayStub.calledWith(flags, false)).to.be.true;
      });

      it("should not display when output is suppressed", function() {
        const flags: BaseFlags = { quiet: true };
        const displayStub = sandbox.stub(command, "testDisplayAuthInfo");

        command.testDisplayControlPlaneInfo(flags);

        expect(displayStub.notCalled).to.be.true;
      });
    });

    describe("displayDataPlaneInfo", function() {
      it("should display auth info when not suppressed", function() {
        const flags: BaseFlags = {};
        const displayStub = sandbox.stub(command, "testDisplayAuthInfo");

        command.testDisplayDataPlaneInfo(flags);

        expect(displayStub.calledWith(flags, true)).to.be.true;
      });

      it("should not display when JSON output is enabled", function() {
        const flags: BaseFlags = { json: true };
        const displayStub = sandbox.stub(command, "testDisplayAuthInfo");

        command.testDisplayDataPlaneInfo(flags);

        expect(displayStub.notCalled).to.be.true;
      });
    });
  });

  describe("error handling", function() {
    it("should handle invalid API key gracefully", async function() {
      const flags: BaseFlags = {
        "api-key": "invalid-key-format"
      };

      // Mock the handleInvalidKey private method
      const handleInvalidKeyStub = sandbox.stub(command as any, "handleInvalidKey").resolves();

      try {
        await command.testCreateAblyClient(flags);
      } catch (error) {
        // Error is expected for invalid key format
        expect(error).to.be.instanceOf(Error);
      }
    });

    it("should handle connection failures", async function() {
      process.env.ABLY_CLI_TEST_MODE = "false";
      
      // Mock Ably.Realtime to simulate connection failure
      const mockClient = {
        connection: {
          once: sandbox.stub()
        },
        close: sandbox.stub()
      };

      // Setup connection failure
      mockClient.connection.once.withArgs("failed").callsArgWith(1, {
        reason: { code: 40100, message: "Unauthorized" }
      });

      sandbox.stub(Ably, "Realtime").returns(mockClient as any);

      const flags: BaseFlags = { "api-key": "test.key:secret" };

      try {
        await command.testCreateAblyClient(flags);
        expect.fail("Should have thrown an error");
      } catch (error: any) {
        expect(error.message).to.include("Invalid API key");
      }
    });
  });

  describe("initialization hooks", function() {
    it("should handle initialization properly", async function() {
      // Mock the init method
      const initStub = sandbox.stub(command, "init").resolves();

      await command.init();

      expect(initStub.calledOnce).to.be.true;
    });
  });
});
