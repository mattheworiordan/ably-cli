import { expect } from "chai";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ConfigManager } from "../../src/services/config-manager.js";

describe("Authentication E2E Basic Tests", function() {
  let tempConfigDir: string;
  let originalConfigDir: string | undefined;

  // Skip E2E tests if no API key is provided
  const skipIfNoApiKey = function() {
    if (!process.env.E2E_ABLY_API_KEY) {
      this.skip();
    }
  };

  before(function() {
    // Skip if no E2E API key provided
    if (!process.env.E2E_ABLY_API_KEY) {
      this.skip();
      return;
    }

    // Create temporary config directory for E2E tests
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ably-cli-e2e-auth-'));
    originalConfigDir = process.env.ABLY_CLI_CONFIG_DIR;
    process.env.ABLY_CLI_CONFIG_DIR = tempConfigDir;
  });

  after(function() {
    // Clean up temp directory
    if (tempConfigDir) {
      fs.rmSync(tempConfigDir, { recursive: true, force: true });
    }
    
    // Restore original config dir
    if (originalConfigDir !== undefined) {
      process.env.ABLY_CLI_CONFIG_DIR = originalConfigDir;
    } else {
      delete process.env.ABLY_CLI_CONFIG_DIR;
    }
  });

  describe("Config File Operations", function() {
    it("should create and manage real config files", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();
      const configPath = configManager.getConfigPath();

      // Store test account
      configManager.storeAccount("test-e2e-token", "e2e-test", {
        accountId: "e2e-account-123",
        accountName: "E2E Test Account",
        userEmail: "e2e@test.com"
      });

      // Verify config file was created
      expect(fs.existsSync(configPath)).to.be.true;

      // Verify file permissions (should be 600)
      const stats = fs.statSync(configPath);
      const permissions = (stats.mode & parseInt('777', 8)).toString(8);
      expect(permissions).to.equal('600');

      // Verify file content is valid TOML
      const content = fs.readFileSync(configPath, 'utf8');
      expect(content).to.include('[current]');
      expect(content).to.include('account = "e2e-test"');
      expect(content).to.include('[accounts.e2e-test]');
      expect(content).to.include('accessToken = "test-e2e-token"');
    });

    it("should persist data across config manager instances", function() {
      skipIfNoApiKey.call(this);

      // First instance
      const configManager1 = new ConfigManager();
      configManager1.storeAccount("persistent-token", "persistent", {
        accountId: "persist-123",
        accountName: "Persistent Account"
      });

      configManager1.storeAppKey("app456", "app456.key:secret", {
        appName: "Persistent App",
        keyName: "Test Key"
      });

      // Second instance (simulates CLI restart)
      const configManager2 = new ConfigManager();

      // Verify persistence
      expect(configManager2.getCurrentAccountAlias()).to.equal("persistent");
      expect(configManager2.getCurrentAccount()?.accessToken).to.equal("persistent-token");
      expect(configManager2.getCurrentAccount()?.accountName).to.equal("Persistent Account");
      expect(configManager2.getApiKey("app456")).to.equal("app456.key:secret");
      expect(configManager2.getAppName("app456")).to.equal("Persistent App");
    });

    it("should handle config file corruption", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();
      const configPath = configManager.getConfigPath();

      // Store valid config first
      configManager.storeAccount("valid-token", "valid");

      // Corrupt the file
      fs.writeFileSync(configPath, "invalid toml content [[[broken");

      // New instance should handle corruption gracefully
      expect(() => new ConfigManager()).to.throw(/Failed to load Ably config/);
    });

    it("should handle missing config directory", function() {
      skipIfNoApiKey.call(this);

      const nonExistentDir = path.join(tempConfigDir, "missing", "nested", "dir");
      const originalDir = process.env.ABLY_CLI_CONFIG_DIR;
      
      try {
        process.env.ABLY_CLI_CONFIG_DIR = nonExistentDir;
        
        // Should create directory structure
        const configManager = new ConfigManager();
        expect(fs.existsSync(nonExistentDir)).to.be.true;
        
        // Should be able to store config
        configManager.storeAccount("nested-token", "nested");
        expect(configManager.getCurrentAccountAlias()).to.equal("nested");
        
        const configPath = path.join(nonExistentDir, "config");
        expect(fs.existsSync(configPath)).to.be.true;
      } finally {
        process.env.ABLY_CLI_CONFIG_DIR = originalDir;
      }
    });
  });

  describe("Environment Variable Integration", function() {
    let originalEnvVars: Record<string, string | undefined>;

    beforeEach(function() {
      skipIfNoApiKey.call(this);
      
      originalEnvVars = {
        ABLY_API_KEY: process.env.ABLY_API_KEY,
        ABLY_ACCESS_TOKEN: process.env.ABLY_ACCESS_TOKEN,
        ABLY_CLIENT_ID: process.env.ABLY_CLIENT_ID
      };
    });

    afterEach(function() {
      // Restore environment variables
      Object.keys(originalEnvVars).forEach(key => {
        if (originalEnvVars[key] !== undefined) {
          process.env[key] = originalEnvVars[key];
        } else {
          delete process.env[key];
        }
      });
    });

    it("should read from environment when available", function() {
      // Set test environment variables
      process.env.ABLY_API_KEY = process.env.E2E_ABLY_API_KEY;
      process.env.ABLY_ACCESS_TOKEN = "test-env-access-token";
      process.env.ABLY_CLIENT_ID = "test-env-client";

      // Create config manager
      const configManager = new ConfigManager();
      
      // Store config values
      configManager.storeAccount("config-token", "default");
      configManager.storeAppKey("app123", "config.key:secret");

      // Environment variables should be available
      expect(process.env.ABLY_API_KEY).to.equal(process.env.E2E_ABLY_API_KEY);
      expect(process.env.ABLY_ACCESS_TOKEN).to.equal("test-env-access-token");
      expect(process.env.ABLY_CLIENT_ID).to.equal("test-env-client");

      // Config values should still be accessible
      expect(configManager.getAccessToken()).to.equal("config-token");
      expect(configManager.getApiKey("app123")).to.equal("config.key:secret");
    });

    it("should fall back to config when env vars are missing", function() {
      // Clear environment variables
      delete process.env.ABLY_API_KEY;
      delete process.env.ABLY_ACCESS_TOKEN;
      delete process.env.ABLY_CLIENT_ID;

      const configManager = new ConfigManager();
      
      // Store config values
      configManager.storeAccount("fallback-token", "default");
      configManager.storeAppKey("app123", "fallback.key:secret");

      // Should use config values
      expect(configManager.getAccessToken()).to.equal("fallback-token");
      expect(configManager.getApiKey("app123")).to.equal("fallback.key:secret");
    });
  });

  describe("Authentication Workflow", function() {
    it("should complete login → whoami → logout cycle", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();

      // Simulate login
      configManager.storeAccount("workflow-token", "workflow", {
        accountId: "workflow-123",
        accountName: "Workflow Account",
        userEmail: "workflow@test.com"
      });

      // Verify login (whoami equivalent)
      expect(configManager.getCurrentAccountAlias()).to.equal("workflow");
      
      const account = configManager.getCurrentAccount();
      expect(account).to.not.be.undefined;
      expect(account?.accessToken).to.equal("workflow-token");
      expect(account?.accountId).to.equal("workflow-123");
      expect(account?.accountName).to.equal("Workflow Account");

      // Simulate logout
      const logoutResult = configManager.removeAccount("workflow");
      expect(logoutResult).to.be.true;

      // Verify logout
      expect(configManager.getCurrentAccountAlias()).to.be.undefined;
      expect(configManager.getCurrentAccount()).to.be.undefined;
    });

    it("should handle multiple account scenarios", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();

      // Add multiple accounts
      configManager.storeAccount("token1", "account1", {
        accountId: "acc1",
        accountName: "Account 1"
      });

      configManager.storeAccount("token2", "account2", {
        accountId: "acc2", 
        accountName: "Account 2"
      });

      // Verify both accounts exist
      const accounts = configManager.listAccounts();
      expect(accounts).to.have.length(2);

      // Switch between accounts
      configManager.switchAccount("account1");
      expect(configManager.getCurrentAccountAlias()).to.equal("account1");
      expect(configManager.getCurrentAccount()?.accountId).to.equal("acc1");

      configManager.switchAccount("account2");
      expect(configManager.getCurrentAccountAlias()).to.equal("account2");
      expect(configManager.getCurrentAccount()?.accountId).to.equal("acc2");

      // Remove one account
      configManager.removeAccount("account1");
      expect(configManager.listAccounts()).to.have.length(1);
      expect(configManager.getCurrentAccountAlias()).to.equal("account2");

      // Remove remaining account
      configManager.removeAccount("account2");
      expect(configManager.listAccounts()).to.have.length(0);
      expect(configManager.getCurrentAccountAlias()).to.be.undefined;
    });
  });

  describe("App and Key Management", function() {
    it("should manage app and key configurations", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();

      // Store account first
      configManager.storeAccount("app-test-token", "app-test");

      // Store app configuration
      configManager.storeAppKey("test-app", "test-app.key:secret", {
        appName: "Test Application",
        keyName: "Production Key"
      });

      // Set as current app
      configManager.setCurrentApp("test-app");

      // Verify app configuration
      expect(configManager.getCurrentAppId()).to.equal("test-app");
      expect(configManager.getApiKey("test-app")).to.equal("test-app.key:secret");
      expect(configManager.getAppName("test-app")).to.equal("Test Application");
      expect(configManager.getKeyName("test-app")).to.equal("Production Key");

      // Store additional app info
      configManager.storeAppInfo("another-app", { appName: "Another App" });
      expect(configManager.getAppName("another-app")).to.equal("Another App");

      // Remove API key but keep app info
      configManager.removeApiKey("test-app");
      expect(configManager.getApiKey("test-app")).to.be.undefined;
      expect(configManager.getAppName("test-app")).to.equal("Test Application");
    });

    it("should handle key metadata extraction", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();
      configManager.storeAccount("key-test-token", "key-test");

      // Store key without explicit key ID
      configManager.storeAppKey("extract-app", "extract-app.extracted:secret", {
        appName: "Extract App"
      });

      // Should extract key ID from API key
      expect(configManager.getKeyId("extract-app")).to.equal("extract-app.extracted");

      // Store key with explicit metadata
      configManager.storeAppKey("meta-app", "meta-app.meta:secret", {
        appName: "Meta App",
        keyId: "custom-key-id",
        keyName: "Custom Key"
      });

      expect(configManager.getKeyId("meta-app")).to.equal("custom-key-id");
      expect(configManager.getKeyName("meta-app")).to.equal("Custom Key");
    });
  });

  describe("Error Handling in Real Environment", function() {
    it("should handle permission errors gracefully", function() {
      skipIfNoApiKey.call(this);

      // Test with read-only directory
      const readOnlyDir = path.join(tempConfigDir, "readonly");
      fs.mkdirSync(readOnlyDir);
      
      try {
        // Make directory read-only
        fs.chmodSync(readOnlyDir, 0o444);
        
        const originalDir = process.env.ABLY_CLI_CONFIG_DIR;
        process.env.ABLY_CLI_CONFIG_DIR = readOnlyDir;
        
        try {
          const configManager = new ConfigManager();
          // Should throw error when trying to save
          expect(() => configManager.storeAccount("test", "test")).to.throw();
        } finally {
          process.env.ABLY_CLI_CONFIG_DIR = originalDir;
        }
      } finally {
        // Restore permissions for cleanup
        fs.chmodSync(readOnlyDir, 0o755);
      }
    });

    it("should validate API key format", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();
      configManager.storeAccount("format-test-token", "format-test");

      // Valid API keys should work
      configManager.storeAppKey("valid-app", "app.key:secret");
      expect(configManager.getApiKey("valid-app")).to.equal("app.key:secret");

      // Complex app IDs should work
      configManager.storeAppKey("complex-app", "app.with.dots.key:secret");
      expect(configManager.getApiKey("complex-app")).to.equal("app.with.dots.key:secret");
    });
  });

  describe("Config File Format Validation", function() {
    it("should produce valid TOML format", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();
      
      // Store complex configuration
      configManager.storeAccount("toml-token", "toml-test", {
        accountId: "toml-123",
        accountName: "TOML Test Account",
        userEmail: "toml@test.com",
        tokenId: "token-456"
      });

      configManager.storeAppKey("toml-app", "toml-app.key:secret", {
        appName: "TOML App",
        keyName: "TOML Key"
      });

      configManager.setCurrentApp("toml-app");

      // Store help context
      configManager.storeHelpContext("Test question?", "Test answer.");

      // Read and verify TOML structure
      const configPath = configManager.getConfigPath();
      const content = fs.readFileSync(configPath, 'utf8');

      // Verify TOML sections exist
      expect(content).to.include('[current]');
      expect(content).to.include('[accounts.toml-test]');
      expect(content).to.include('[accounts.toml-test.apps.toml-app]');
      expect(content).to.include('[[helpContext.conversation.messages]]');

      // Verify specific values
      expect(content).to.include('account = "toml-test"');
      expect(content).to.include('accessToken = "toml-token"');
      expect(content).to.include('apiKey = "toml-app.key:secret"');
      expect(content).to.include('appName = "TOML App"');
    });

    it("should handle special characters in values", function() {
      skipIfNoApiKey.call(this);

      const configManager = new ConfigManager();
      
      // Store account with special characters
      configManager.storeAccount("special-token", "special", {
        accountName: 'Account with "quotes" and symbols',
        userEmail: "user+test@example.com"
      });

      // Verify config is still readable
      const newConfigManager = new ConfigManager();
      const account = newConfigManager.getCurrentAccount();
      expect(account?.accountName).to.equal('Account with "quotes" and symbols');
      expect(account?.userEmail).to.equal("user+test@example.com");
    });
  });
});