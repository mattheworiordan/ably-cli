/**
 * ConfigManager unit tests
 *
 * Explicitly sets NODE_TEST_CONTEXT to isolate this test file
 * from other tests that might be using Ably connections.
 */

// Set test isolation marker to prevent Ably connection conflicts
process.env.NODE_TEST_CONTEXT = 'config-manager-only';

import { expect } from "chai";
import * as chai from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";
import sinonChai from "sinon-chai";
import { ConfigManager } from "../../../src/services/config-manager.js";

chai.use(sinonChai);

// Simple mock config content
const DEFAULT_CONFIG = `
[current]
account = "default"

[accounts.default]
accessToken = "testaccesstoken"
accountId = "testaccountid"
accountName = "Test Account"
currentAppId = "testappid"

[accounts.default.apps.testappid]
apiKey = "testappid.keyid:keysecret"
appName = "Test App"
keyId = "testappid.keyid"
keyName = "Test Key"
`;

// Config with help context
const CONFIG_WITH_HELP_CONTEXT = `
[current]
account = "default"

[accounts.default]
accessToken = "testaccesstoken"

[[helpContext.conversation.messages]]
role = "user"
content = "How do I publish a message?"

[[helpContext.conversation.messages]]
role = "assistant"
content = "You can publish using ably channels:publish"
`;

// Completely isolated test suite
describe("ConfigManager", function() {
  // Variables declared at top level for test scope
  let configManager: ConfigManager;
  let envBackup: Record<string, string | undefined>;
  let sandbox: sinon.SinonSandbox;

  // Backup original env vars that might interfere with tests
  let originalConfigDirEnvVar: string | undefined;

  // Store a unique temporary directory for test config for this file
  let uniqueTestConfigDir: string;

  // Setup unique temp directory for this test file
  before(function() {
    // Create a unique temporary directory for this test suite
    uniqueTestConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ably-cli-config-test-'));
  });

  // Setup test environment for each test
  beforeEach(function() {
    // Backup potentially interfering env vars
    envBackup = {
      ABLY_CLI_TEST_MODE: process.env.ABLY_CLI_TEST_MODE,
      ABLY_API_KEY: process.env.ABLY_API_KEY,
      ABLY_ACCESS_TOKEN: process.env.ABLY_ACCESS_TOKEN,
      ABLY_CLI_CONFIG_DIR: process.env.ABLY_CLI_CONFIG_DIR
    };
    originalConfigDirEnvVar = process.env.ABLY_CLI_CONFIG_DIR;

    // Override config dir to use the unique temp dir
    process.env.ABLY_CLI_CONFIG_DIR = uniqueTestConfigDir;
    process.env.ABLY_CLI_TEST_MODE = 'true';
    delete process.env.ABLY_API_KEY;
    delete process.env.ABLY_ACCESS_TOKEN;

    // Create a sandbox for stubs
    sandbox = sinon.createSandbox();

    // Stub filesystem operations within the sandbox
    sandbox.stub(fs, "existsSync").returns(true);
    sandbox.stub(fs, "mkdirSync"); // Allow mkdirSync to be called
    sandbox.stub(fs, "readFileSync").returns(DEFAULT_CONFIG);
    sandbox.stub(fs, "writeFileSync");

    // Create new ConfigManager instance for each test
    // It will now use the uniqueTestConfigDir via the env var
    configManager = new ConfigManager();
  });

  // Clean up after each test
  afterEach(function() {
    // Restore all sinon stubs
    sandbox.restore();

    // Restore environment variables
    Object.keys(envBackup).forEach(key => {
      if (envBackup[key] !== undefined) {
        process.env[key] = envBackup[key];
      } else {
        delete process.env[key];
      }
    });
  });

  // Clean up the unique temporary directory after all tests in this file
  after(function() {
    if (uniqueTestConfigDir) {
      fs.rmSync(uniqueTestConfigDir, { recursive: true, force: true });
    }
  });

  // Tests for constructor
  describe("#constructor", function() {
    it("should attempt to create config directory if it doesn't exist", function() {
      // Need to reset the sandbox stubs for this specific test case
      sandbox.restore();
      sandbox = sinon.createSandbox();
      const mkdirStub = sandbox.stub(fs, "mkdirSync");
      const existsStub = sandbox.stub(fs, "existsSync");
      sandbox.stub(fs, "readFileSync").returns(""); // Simulate no existing config

      // Make config dir not exist initially
      existsStub.returns(false);

      // Create instance which should trigger directory creation attempt
      const _manager = new ConfigManager();

      // ConfigManager constructor now uses getConfigDirPath() which relies on ABLY_CLI_CONFIG_DIR
      // We expect mkdirSync to be called with the uniqueTestConfigDir
      expect(mkdirStub.calledOnceWith(uniqueTestConfigDir)).to.be.true;
    });

    it("should load existing config file", function() {
      // The beforeEach setup already stubs readFileSync
      // ConfigManager constructor calls loadConfig, which calls readFileSync
      const readFileStub = fs.readFileSync as sinon.SinonStub;
      expect(readFileStub?.calledOnce).to.be.true;
      // Verify it tries to read the correct file within the temp dir
      const expectedConfigPath = path.join(uniqueTestConfigDir, 'config');
      expect(readFileStub?.calledOnceWith(expectedConfigPath)).to.be.true;
    });

    it("should use custom config directory from environment", function() {
      const customDir = "/custom/config/dir";
      process.env.ABLY_CLI_CONFIG_DIR = customDir;

      // Reset stubs to capture new call
      sandbox.restore();
      sandbox = sinon.createSandbox();
      const existsStub = sandbox.stub(fs, "existsSync").returns(true);
      const readFileStub = sandbox.stub(fs, "readFileSync").returns("");
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();

      expect(readFileStub.calledWith(path.join(customDir, 'config'))).to.be.true;
    });

    it("should handle missing config file gracefully", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(false);
      sandbox.stub(fs, "mkdirSync");
      sandbox.stub(fs, "writeFileSync");

      // Should not throw error when config file doesn't exist
      expect(() => new ConfigManager()).to.not.throw();
    });

    it("should handle config parsing errors", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns("invalid toml content [\n");
      sandbox.stub(fs, "mkdirSync");
      sandbox.stub(fs, "writeFileSync");

      expect(() => new ConfigManager()).to.throw();
    });
  });

  // Tests for getCurrentAccountAlias
  describe("#getCurrentAccountAlias", function() {
    it("should return the current account alias", function() {
      expect(configManager.getCurrentAccountAlias()).to.equal("default");
    });

    it("should return undefined if no current account", function() {
      // Reset stubs and load empty config
      sandbox.restore(); // Restore stubs from beforeEach
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns("[accounts]\n"); // Empty accounts section
      sandbox.stub(fs, "writeFileSync"); // Stub writeFileSync if needed

      const manager = new ConfigManager(); // Create new instance with empty config

      expect(manager.getCurrentAccountAlias()).to.be.undefined;
    });
  });

  // Tests for getCurrentAccount
  describe("#getCurrentAccount", function() {
    it("should return the current account", function() {
      const account = configManager.getCurrentAccount();

      expect(account).to.not.be.undefined;
      expect(account?.accessToken).to.equal("testaccesstoken");
      expect(account?.accountId).to.equal("testaccountid");
      expect(account?.accountName).to.equal("Test Account");
    });

    it("should return undefined if no current account alias", function() {
      // Reset stubs and load config without current section
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`
[accounts.default]
accessToken = "testaccesstoken"
`); // No [current] section
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();

      expect(manager.getCurrentAccount()).to.be.undefined;
    });
  });

  // Tests for getCurrentAppId
  describe("#getCurrentAppId", function() {
    it("should return the current app ID", function() {
      expect(configManager.getCurrentAppId()).to.equal("testappid");
    });

    it("should return undefined if no current account", function() {
       // Reset stubs and load config without current section
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`[accounts]`); // No [current] section or account details
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.getCurrentAppId()).to.be.undefined;
    });
  });

  // Tests for getApiKey
  describe("#getApiKey", function() {
    it("should return the API key for the current app", function() {
      expect(configManager.getApiKey()).to.equal("testappid.keyid:keysecret");
    });

    it("should return the API key for a specific app", function() {
      expect(configManager.getApiKey("testappid")).to.equal("testappid.keyid:keysecret");
    });

    it("should return undefined if app doesn't exist", function() {
      expect(configManager.getApiKey("nonexistentappid")).to.be.undefined;
    });

    it("should return undefined if no current account", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.getApiKey()).to.be.undefined;
    });

    it("should return undefined if account has no apps", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`
[current]
account = "default"

[accounts.default]
accessToken = "token"
`);
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.getApiKey()).to.be.undefined;
    });
  });

  // Tests for getAppName
  describe("#getAppName", function() {
    it("should return the app name for a specific app", function() {
      expect(configManager.getAppName("testappid")).to.equal("Test App");
    });

    it("should return undefined if app doesn't exist", function() {
      expect(configManager.getAppName("nonexistentappid")).to.be.undefined;
    });

    it("should return undefined if no current account", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.getAppName("testappid")).to.be.undefined;
    });
  });

  // Tests for key metadata
  describe("key metadata methods", function() {
    describe("#getKeyId", function() {
      it("should return the key ID from metadata", function() {
        expect(configManager.getKeyId("testappid")).to.equal("testappid.keyid");
      });

      it("should extract key ID from API key if metadata not available", function() {
        // Create a config without explicit keyId but with API key
        sandbox.restore();
        sandbox = sinon.createSandbox();
        sandbox.stub(fs, "existsSync").returns(true);
        sandbox.stub(fs, "readFileSync").returns(`
[current]
account = "default"

[accounts.default]
accessToken = "token"
currentAppId = "appid"

[accounts.default.apps.appid]
apiKey = "appid.extracted:secret"
`);
        sandbox.stub(fs, "writeFileSync");

        const manager = new ConfigManager();
        expect(manager.getKeyId("appid")).to.equal("appid.extracted");
      });

      it("should return undefined if no app or key", function() {
        expect(configManager.getKeyId("nonexistent")).to.be.undefined;
      });
    });

    describe("#getKeyName", function() {
      it("should return the key name for a specific app", function() {
        expect(configManager.getKeyName("testappid")).to.equal("Test Key");
      });

      it("should return undefined if app doesn't exist", function() {
        expect(configManager.getKeyName("nonexistent")).to.be.undefined;
      });
    });
  });

  // Tests for access token methods
  describe("access token methods", function() {
    describe("#getAccessToken", function() {
      it("should return access token for current account", function() {
        expect(configManager.getAccessToken()).to.equal("testaccesstoken");
      });

      it("should return access token for specific alias", function() {
        expect(configManager.getAccessToken("default")).to.equal("testaccesstoken");
      });

      it("should return undefined if alias doesn't exist", function() {
        expect(configManager.getAccessToken("nonexistent")).to.be.undefined;
      });

      it("should return undefined if no current account", function() {
        sandbox.restore();
        sandbox = sinon.createSandbox();
        sandbox.stub(fs, "existsSync").returns(true);
        sandbox.stub(fs, "readFileSync").returns(""); // Empty config
        sandbox.stub(fs, "writeFileSync");

        const manager = new ConfigManager();
        expect(manager.getAccessToken()).to.be.undefined;
      });
    });
  });

  // Tests for help context
  describe("help context methods", function() {
    beforeEach(function() {
      // Reset stubs to use config with help context
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(CONFIG_WITH_HELP_CONTEXT);
      sandbox.stub(fs, "writeFileSync");

      configManager = new ConfigManager();
    });

    describe("#getHelpContext", function() {
      it("should return help context when available", function() {
        const context = configManager.getHelpContext();
        
        expect(context).to.not.be.undefined;
        expect(context?.conversation.messages).to.have.length(2);
        expect(context?.conversation.messages[0].role).to.equal("user");
        expect(context?.conversation.messages[0].content).to.equal("How do I publish a message?");
        expect(context?.conversation.messages[1].role).to.equal("assistant");
      });

      it("should return undefined when no help context", function() {
        sandbox.restore();
        sandbox = sinon.createSandbox();
        sandbox.stub(fs, "existsSync").returns(true);
        sandbox.stub(fs, "readFileSync").returns(DEFAULT_CONFIG);
        sandbox.stub(fs, "writeFileSync");

        const manager = new ConfigManager();
        expect(manager.getHelpContext()).to.be.undefined;
      });
    });

    describe("#storeHelpContext", function() {
      it("should store help context", function() {
        const writeFileStub = fs.writeFileSync as sinon.SinonStub;
        configManager.storeHelpContext("Test question", "Test answer");

        expect(writeFileStub.calledOnce).to.be.true;
      });

      it("should append to existing conversation", function() {
        const writeFileStub = fs.writeFileSync as sinon.SinonStub;
        configManager.storeHelpContext("Second question", "Second answer");

        expect(writeFileStub.calledOnce).to.be.true;
        
        // Should have 4 messages now (2 original + 2 new)
        const context = configManager.getHelpContext();
        expect(context?.conversation.messages).to.have.length(4);
      });
    });

    describe("#clearHelpContext", function() {
      it("should clear help context", function() {
        const writeFileStub = fs.writeFileSync as sinon.SinonStub;
        configManager.clearHelpContext();

        expect(writeFileStub.calledOnce).to.be.true;
        expect(configManager.getHelpContext()).to.be.undefined;
      });
    });
  });

  // Tests for storeAccount
  describe("#storeAccount", function() {
    it("should store a new account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAccount("newaccesstoken", "newaccount", {
        accountId: "newaccountid",
        accountName: "New Account"
      });

      expect(writeFileStub?.calledOnce).to.be.true;

      // Test that the internal state is updated
      const accounts = configManager.listAccounts();
      expect(accounts.some(a => a.alias === "newaccount")).to.be.true;

      const account = accounts.find(a => a.alias === "newaccount")?.account;
      expect(account?.accessToken).to.equal("newaccesstoken");
      expect(account?.accountId).to.equal("newaccountid");
      expect(account?.accountName).to.equal("New Account");
    });

    it("should set as current if it's the first account", function() {
      // Reset stubs and load empty config
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      const writeFileStub = sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      manager.storeAccount("firstaccesstoken", "firstaccount");

      expect(writeFileStub.calledOnce).to.be.true;
      expect(manager.getCurrentAccountAlias()).to.equal("firstaccount");
    });

    it("should preserve existing apps when updating account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      
      // Store updated account info but should preserve existing apps
      configManager.storeAccount("updatedtoken", "default", {
        accountId: "updatedaccountid",
        accountName: "Updated Account"
      });

      expect(writeFileStub.calledOnce).to.be.true;
      
      // Should still have the app
      expect(configManager.getApiKey("testappid")).to.equal("testappid.keyid:keysecret");
      expect(configManager.getCurrentAppId()).to.equal("testappid");
    });

    it("should store all optional account info", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAccount("token", "full", {
        accountId: "accid",
        accountName: "Account Name",
        tokenId: "tokenid",
        userEmail: "user@example.com"
      });

      const account = configManager.listAccounts().find(a => a.alias === "full")?.account;
      expect(account?.accountId).to.equal("accid");
      expect(account?.accountName).to.equal("Account Name");
      expect(account?.tokenId).to.equal("tokenid");
      expect(account?.userEmail).to.equal("user@example.com");
    });
  });

  // Tests for storeAppKey
  describe("#storeAppKey", function() {
    it("should store an API key for an app", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAppKey("newappid", "newappid.keyid:keysecret", {
        appName: "New App",
        keyName: "New Key"
      });

      expect(writeFileStub?.calledOnce).to.be.true;

      // Check that the key was stored
      expect(configManager.getApiKey("newappid")).to.equal("newappid.keyid:keysecret");
      expect(configManager.getAppName("newappid")).to.equal("New App");
      expect(configManager.getKeyName("newappid")).to.equal("New Key");
    });

    it("should store an API key for an app with a specific account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      // First create a new account
      configManager.storeAccount("anotheraccesstoken", "anotheraccount");

      configManager.storeAppKey("anotherappid", "anotherappid.keyid:keysecret", {
        appName: "Another App",
        keyName: "Another Key"
      }, "anotheraccount");

      // Switch to the other account
      configManager.switchAccount("anotheraccount");

      // Check that the key was stored properly
      expect(configManager.getApiKey("anotherappid")).to.equal("anotherappid.keyid:keysecret");
      expect(configManager.getAppName("anotherappid")).to.equal("Another App");
      expect(configManager.getKeyName("anotherappid")).to.equal("Another Key");

      // Expect writeFileSync to have been called multiple times (storeAccount, storeAppKey, switchAccount)
      expect(writeFileStub?.callCount).to.be.greaterThan(2);
    });

    it("should throw error if account doesn't exist", function() {
      expect(() => {
        configManager.storeAppKey("appid", "apikey", {}, "nonexistentaccount");
      }).to.throw();
    });

    it("should extract key ID if not provided in metadata", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAppKey("extractapp", "extractapp.extracted:secret", {
        appName: "Extract App"
      });

      expect(configManager.getKeyId("extractapp")).to.equal("extractapp.extracted");
    });

    it("should update existing app configuration", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      
      // First store app info
      configManager.storeAppInfo("updateapp", { appName: "Original Name" });
      
      // Then store key which should preserve app name
      configManager.storeAppKey("updateapp", "updateapp.key:secret", {
        keyName: "New Key"
      });

      expect(configManager.getAppName("updateapp")).to.equal("Original Name");
      expect(configManager.getKeyName("updateapp")).to.equal("New Key");
    });
  });

  // Tests for storeAppInfo
  describe("#storeAppInfo", function() {
    it("should store app information", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAppInfo("infoapp", { appName: "Info App" });

      expect(writeFileStub.calledOnce).to.be.true;
      expect(configManager.getAppName("infoapp")).to.equal("Info App");
    });

    it("should throw error if account doesn't exist", function() {
      expect(() => {
        configManager.storeAppInfo("app", { appName: "App" }, "nonexistent");
      }).to.throw();
    });

    it("should preserve existing app configuration", function() {
      // First store an API key
      configManager.storeAppKey("preserveapp", "preserveapp.key:secret", {
        keyName: "Preserve Key"
      });

      // Then store app info which should preserve the key
      configManager.storeAppInfo("preserveapp", { appName: "Preserve App" });

      expect(configManager.getApiKey("preserveapp")).to.equal("preserveapp.key:secret");
      expect(configManager.getKeyName("preserveapp")).to.equal("Preserve Key");
      expect(configManager.getAppName("preserveapp")).to.equal("Preserve App");
    });
  });

  // Tests for setCurrentApp
  describe("#setCurrentApp", function() {
    it("should set current app for current account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.setCurrentApp("newcurrentapp");

      expect(writeFileStub.calledOnce).to.be.true;
      expect(configManager.getCurrentAppId()).to.equal("newcurrentapp");
    });

    it("should throw error if no current account", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      
      expect(() => {
        manager.setCurrentApp("app");
      }).to.throw("No current account selected");
    });
  });

  // Tests for removeAccount
  describe("#removeAccount", function() {
    it("should remove an account and return true", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      expect(configManager.removeAccount("default")).to.be.true;
      expect(writeFileStub?.calledOnce).to.be.true;

      // The account should be gone from the list
      expect(configManager.listAccounts().some(a => a.alias === "default")).to.be.false;
    });

    it("should return false if account doesn't exist", function() {
      expect(configManager.removeAccount("nonexistentaccount")).to.be.false;
    });

    it("should clear current account if removing current account", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      // First confirm default is the current account
      expect(configManager.getCurrentAccountAlias()).to.equal("default");

      // Remove it
      configManager.removeAccount("default");

      // Current account should now be undefined
      expect(configManager.getCurrentAccountAlias()).to.be.undefined;
      expect(writeFileStub?.calledOnce).to.be.true;
    });
  });

  // Tests for removeApiKey
  describe("#removeApiKey", function() {
    it("should remove API key for an app", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      
      expect(configManager.removeApiKey("testappid")).to.be.true;
      expect(writeFileStub.calledOnce).to.be.true;
      
      // API key should be removed but other app info should remain
      expect(configManager.getApiKey("testappid")).to.be.undefined;
      expect(configManager.getAppName("testappid")).to.equal("Test App");
    });

    it("should return false if app doesn't exist", function() {
      expect(configManager.removeApiKey("nonexistent")).to.be.false;
    });

    it("should return false if no current account", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.removeApiKey("app")).to.be.false;
    });
  });

  // Tests for switchAccount
  describe("#switchAccount", function() {
    it("should switch to another account and return true", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      // First create another account
      configManager.storeAccount("anotheraccesstoken", "anotheraccount");

      expect(configManager.switchAccount("anotheraccount")).to.be.true;
      // writeFileSync called for storeAccount and switchAccount
      expect(writeFileStub?.callCount).to.equal(2);

      // Current account should be the new one
      expect(configManager.getCurrentAccountAlias()).to.equal("anotheraccount");
    });

    it("should return false if account doesn't exist", function() {
      expect(configManager.switchAccount("nonexistentaccount")).to.be.false;
    });

    it("should initialize current object if it doesn't exist", function() {
      // Create config without current section
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`
[accounts.test]
accessToken = "token"
`);
      const writeFileStub = sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      expect(manager.switchAccount("test")).to.be.true;
      expect(manager.getCurrentAccountAlias()).to.equal("test");
    });
  });

  // Tests for listAccounts
  describe("#listAccounts", function() {
    it("should return all accounts", function() {
      const accounts = configManager.listAccounts();
      
      expect(accounts).to.have.length(1);
      expect(accounts[0].alias).to.equal("default");
      expect(accounts[0].account.accessToken).to.equal("testaccesstoken");
    });

    it("should return empty array if no accounts", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(""); // Empty config
      sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      const accounts = manager.listAccounts();
      expect(accounts).to.have.length(0);
    });

    it("should return multiple accounts", function() {
      configManager.storeAccount("token1", "account1");
      configManager.storeAccount("token2", "account2");

      const accounts = configManager.listAccounts();
      expect(accounts).to.have.length(3); // default + 2 new
    });
  });

  // Tests for getConfigPath
  describe("#getConfigPath", function() {
    it("should return the correct config path", function() {
      const expectedPath = path.join(uniqueTestConfigDir, 'config');
      expect(configManager.getConfigPath()).to.equal(expectedPath);
    });
  });

  // Tests for saveConfig and file format
  describe("config file format", function() {
    it("should save config in TOML format", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAccount("token", "test");

      expect(writeFileStub.calledOnce).to.be.true;
      const writtenContent = writeFileStub.firstCall.args[1] as string;
      
      // Should contain TOML sections
      expect(writtenContent).to.include("[current]");
      expect(writtenContent).to.include("[accounts.test]");
      expect(writtenContent).to.include('accessToken = "token"');
    });

    it("should handle TOML escaping correctly", function() {
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      configManager.storeAccount('token"with"quotes', 'test"account');

      const writtenContent = writeFileStub.firstCall.args[1] as string;
      expect(writtenContent).to.include('accessToken = "token"with"quotes"');
    });

    it("should format help context correctly", function() {
      configManager.storeHelpContext("Question?", "Answer.");
      
      const writeFileStub = fs.writeFileSync as sinon.SinonStub;
      const writtenContent = writeFileStub.firstCall.args[1] as string;
      
      expect(writtenContent).to.include("[[helpContext.conversation.messages]]");
      expect(writtenContent).to.include('role = "user"');
      expect(writtenContent).to.include('content = """Question?"""');
    });
  });

  // Tests for config migration
  describe("config migration", function() {
    it("should migrate old config format", function() {
      // Create config with old format where app was in current section
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(`
[current]
account = "default"
app = "oldappid"

[accounts.default]
accessToken = "token"
`);
      const writeFileStub = sandbox.stub(fs, "writeFileSync");

      const manager = new ConfigManager();
      
      // Should migrate app to account.currentAppId
      expect(manager.getCurrentAppId()).to.equal("oldappid");
      expect(writeFileStub.calledOnce).to.be.true; // Should save migrated config
    });
  });

  // Tests for error handling
  describe("error handling", function() {
    it("should handle file system errors on save", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns(DEFAULT_CONFIG);
      sandbox.stub(fs, "writeFileSync").throws(new Error("Permission denied"));

      const manager = new ConfigManager();
      
      expect(() => {
        manager.storeAccount("token", "test");
      }).to.throw("Failed to save Ably config");
    });

    it("should handle malformed TOML config", function() {
      sandbox.restore();
      sandbox = sinon.createSandbox();
      sandbox.stub(fs, "existsSync").returns(true);
      sandbox.stub(fs, "readFileSync").returns("[invalid toml");
      sandbox.stub(fs, "writeFileSync");

      expect(() => {
        new ConfigManager();
      }).to.throw("Failed to load Ably config");
    });
  });
});
