import { expect } from "chai";
import sinon from "sinon";
import * as readline from "node:readline";
import { execSync } from "node:child_process";
import AccountsLogin from "../../../../src/commands/accounts/login.js";
import { ConfigManager } from "../../../../src/services/config-manager.js";
import { ControlApi } from "../../../../src/services/control-api.js";
import { BaseFlags } from "../../../../src/types/cli.js";

describe("AccountsLogin", function() {
  let command: AccountsLogin;
  let sandbox: sinon.SinonSandbox;
  let configManagerStub: sinon.SinonStubbedInstance<ConfigManager>;
  let controlApiStub: sinon.SinonStubbedInstance<ControlApi>;
  let readlineStub: sinon.SinonStub;
  let execSyncStub: sinon.SinonStub;
  let logStub: sinon.SinonStub;
  let errorStub: sinon.SinonStub;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    
    // Stub external dependencies
    readlineStub = sandbox.stub(readline, "createInterface");
    execSyncStub = sandbox.stub(require("node:child_process"), "execSync");
    
    // Create stubs for dependencies
    configManagerStub = sandbox.createStubInstance(ConfigManager);
    controlApiStub = sandbox.createStubInstance(ControlApi);
    
    // Create command instance
    command = new AccountsLogin([], {} as any);
    
    // Replace dependencies with stubs
    (command as any).configManager = configManagerStub;
    
    // Stub command methods
    logStub = sandbox.stub(command, "log");
    errorStub = sandbox.stub(command, "error");
    sandbox.stub(command, "parse").resolves({ args: {}, flags: {} });
    
    // Stub ControlApi constructor
    sandbox.stub(require("../../../../src/services/control-api.js"), "ControlApi").returns(controlApiStub);
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe("constructor", function() {
    it("should create instance successfully", function() {
      expect(command).to.be.instanceOf(AccountsLogin);
    });
  });

  describe("run", function() {
    beforeEach(function() {
      // Setup default mocks
      controlApiStub.getMe.resolves({
        account: {
          id: "test-account-id",
          name: "Test Account"
        },
        user: {
          email: "test@example.com"
        }
      });
      
      configManagerStub.listAccounts.returns([]);
    });

    describe("with token argument", function() {
      it("should authenticate with provided token", async function() {
        const parseStub = sandbox.stub(command, "parse").resolves({
          args: { token: "test-access-token" },
          flags: {}
        });
        
        await command.run();

        expect(controlApiStub.getMe.calledOnce).to.be.true;
        expect(configManagerStub.storeAccount.calledOnce).to.be.true;
        expect(configManagerStub.switchAccount.calledOnce).to.be.true;
        expect(logStub.calledWith(sinon.match(/Successfully logged in/))).to.be.true;
      });

      it("should use provided alias", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-access-token" },
          flags: { alias: "mycompany" }
        });
        
        await command.run();

        expect(configManagerStub.storeAccount.calledWith(
          "test-access-token",
          "mycompany",
          sinon.match.any
        )).to.be.true;
        expect(configManagerStub.switchAccount.calledWith("mycompany")).to.be.true;
      });

      it("should handle JSON output", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-access-token" },
          flags: { json: true }
        });
        sandbox.stub(command, "shouldOutputJson").returns(true);
        sandbox.stub(command, "formatJsonOutput").returns('{"success": true}');
        
        await command.run();

        expect(logStub.calledWith('{"success": true}')).to.be.true;
      });
    });

    describe("interactive token prompt", function() {
      let rlMock: any;

      beforeEach(function() {
        rlMock = {
          question: sandbox.stub(),
          close: sandbox.stub()
        };
        readlineStub.returns(rlMock);
      });

      it("should prompt for token when not provided", async function() {
        sandbox.stub(command, "parse").resolves({
          args: {},
          flags: {}
        });
        
        // Mock token prompt
        rlMock.question.withArgs(sinon.match(/Enter your access token/)).callsArgWith(1, "prompted-token");
        
        await command.run();

        expect(rlMock.question.calledWith(sinon.match(/Enter your access token/))).to.be.true;
        expect(controlApiStub.getMe.calledOnce).to.be.true;
      });

      it("should open browser by default", async function() {
        sandbox.stub(command, "parse").resolves({
          args: {},
          flags: {}
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        rlMock.question.callsArgWith(1, "token-from-browser");
        
        await command.run();

        expect(execSyncStub.calledOnce).to.be.true;
        expect(logStub.calledWith(sinon.match(/Opening browser/))).to.be.true;
      });

      it("should not open browser with --no-browser flag", async function() {
        sandbox.stub(command, "parse").resolves({
          args: {},
          flags: { "no-browser": true }
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        rlMock.question.callsArgWith(1, "manual-token");
        
        await command.run();

        expect(execSyncStub.notCalled).to.be.true;
        expect(logStub.calledWith(sinon.match(/Please visit.*to create an access token/))).to.be.true;
      });

      it("should handle browser open failure gracefully", async function() {
        sandbox.stub(command, "parse").resolves({
          args: {},
          flags: {}
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        const warnStub = sandbox.stub(command, "warn");
        execSyncStub.throws(new Error("Browser not found"));
        rlMock.question.callsArgWith(1, "fallback-token");
        
        await command.run();

        expect(warnStub.calledWith(sinon.match(/Failed to open browser/))).to.be.true;
        expect(logStub.calledWith(sinon.match(/Please visit.*manually/))).to.be.true;
      });

      it("should use custom control host for token URL", async function() {
        sandbox.stub(command, "parse").resolves({
          args: {},
          flags: { "control-host": "custom.ably.net" }
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        rlMock.question.callsArgWith(1, "custom-host-token");
        
        await command.run();

        expect(logStub.calledWith(sinon.match(/custom\.ably\.net/))).to.be.true;
      });

      it("should handle local control host for development", async function() {
        sandbox.stub(command, "parse").resolves({
          args: {},
          flags: { "control-host": "localhost:3000" }
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        rlMock.question.callsArgWith(1, "local-token");
        
        await command.run();

        expect(logStub.calledWith(sinon.match(/localhost:3000/))).to.be.true;
        // Should use http for local development
        const urlCall = execSyncStub.getCall(0);
        expect(urlCall?.args[0]).to.include("http://localhost:3000");
      });
    });

    describe("alias management", function() {
      let rlMock: any;

      beforeEach(function() {
        rlMock = {
          question: sandbox.stub(),
          close: sandbox.stub()
        };
        readlineStub.returns(rlMock);
        
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: {}
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
      });

      it("should prompt for alias when no default account exists", async function() {
        configManagerStub.listAccounts.returns([]);
        
        // Mock yes/no prompt - user wants to provide alias
        rlMock.question.withArgs(sinon.match(/Would you like to provide an alias/)).callsArgWith(1, "y");
        // Mock alias prompt
        rlMock.question.withArgs(sinon.match(/Enter an alias/)).callsArgWith(1, "myalias");
        
        await command.run();

        expect(rlMock.question.calledWith(sinon.match(/Would you like to provide an alias/))).to.be.true;
        expect(rlMock.question.calledWith(sinon.match(/Enter an alias/))).to.be.true;
        expect(configManagerStub.storeAccount.calledWith(
          "test-token",
          "myalias",
          sinon.match.any
        )).to.be.true;
      });

      it("should warn about overwriting default account", async function() {
        configManagerStub.listAccounts.returns([
          { alias: "default", account: {} as any }
        ]);
        
        // Mock yes/no prompt - user doesn't want to provide alias
        rlMock.question.withArgs(sinon.match(/Would you like to provide an alias/)).callsArgWith(1, "n");
        
        await command.run();

        expect(logStub.calledWith(sinon.match(/existing default account configuration will be overwritten/))).to.be.true;
        expect(configManagerStub.storeAccount.calledWith(
          "test-token",
          "default",
          sinon.match.any
        )).to.be.true;
      });

      it("should validate alias format", async function() {
        configManagerStub.listAccounts.returns([]);
        
        rlMock.question.withArgs(sinon.match(/Would you like to provide an alias/)).callsArgWith(1, "y");
        
        // Mock invalid alias first, then valid alias
        rlMock.question.withArgs(sinon.match(/Enter an alias/))
          .onFirstCall().callsArgWith(1, "123invalid") // starts with number
          .onSecondCall().callsArgWith(1, "valid-alias");
        
        await command.run();

        expect(logStub.calledWith(sinon.match(/must start with a letter/))).to.be.true;
        expect(configManagerStub.storeAccount.calledWith(
          "test-token",
          "valid-alias",
          sinon.match.any
        )).to.be.true;
      });

      it("should handle various invalid alias formats", async function() {
        configManagerStub.listAccounts.returns([]);
        
        rlMock.question.withArgs(sinon.match(/Would you like to provide an alias/)).callsArgWith(1, "y");
        
        const invalidAliases = [
          "",              // empty
          " ",             // whitespace only
          "123abc",        // starts with number
          "test space",    // contains space
          "test@company"   // contains special characters
        ];
        
        invalidAliases.forEach((invalid, index) => {
          rlMock.question.withArgs(sinon.match(/Enter an alias/))
            .onCall(index).callsArgWith(1, invalid);
        });
        
        // Finally provide valid alias
        rlMock.question.withArgs(sinon.match(/Enter an alias/))
          .onCall(invalidAliases.length).callsArgWith(1, "valid");
        
        await command.run();

        expect(configManagerStub.storeAccount.calledWith(
          "test-token",
          "valid",
          sinon.match.any
        )).to.be.true;
      });

      it("should handle yes/no prompt variations", async function() {
        configManagerStub.listAccounts.returns([]);
        
        const validResponses = ["y", "yes", "Y", "YES"];
        
        for (const response of validResponses) {
          // Reset stubs for each iteration
          rlMock.question.resetHistory();
          configManagerStub.storeAccount.resetHistory();
          
          rlMock.question.withArgs(sinon.match(/Would you like to provide an alias/)).callsArgWith(1, response);
          rlMock.question.withArgs(sinon.match(/Enter an alias/)).callsArgWith(1, "testalias");
          
          await command.run();
          
          expect(rlMock.question.calledWith(sinon.match(/Enter an alias/))).to.be.true;
        }
      });
    });

    describe("error handling", function() {
      it("should handle authentication failure", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "invalid-token" },
          flags: {}
        });
        
        controlApiStub.getMe.rejects(new Error("Unauthorized"));
        
        await command.run();

        expect(errorStub.calledWith(sinon.match(/Failed to authenticate/))).to.be.true;
      });

      it("should handle authentication failure with JSON output", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "invalid-token" },
          flags: { json: true }
        });
        sandbox.stub(command, "shouldOutputJson").returns(true);
        sandbox.stub(command, "formatJsonOutput").returns('{"success": false, "error": "Unauthorized"}');
        
        controlApiStub.getMe.rejects(new Error("Unauthorized"));
        
        await command.run();

        expect(logStub.calledWith('{"success": false, "error": "Unauthorized"}')).to.be.true;
      });

      it("should handle network errors", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: {}
        });
        
        controlApiStub.getMe.rejects(new Error("Network error"));
        
        await command.run();

        expect(errorStub.calledWith(sinon.match(/Failed to authenticate.*Network error/))).to.be.true;
      });

      it("should handle control API errors", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: {}
        });
        
        const apiError = new Error("API Error");
        (apiError as any).code = 40100;
        controlApiStub.getMe.rejects(apiError);
        
        await command.run();

        expect(errorStub.calledWith(sinon.match(/Failed to authenticate/))).to.be.true;
      });
    });

    describe("account information storage", function() {
      it("should store complete account information", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: { alias: "complete" }
        });
        
        controlApiStub.getMe.resolves({
          account: {
            id: "acc-123",
            name: "Complete Account"
          },
          user: {
            email: "complete@example.com"
          }
        });
        
        await command.run();

        expect(configManagerStub.storeAccount.calledWith(
          "test-token",
          "complete",
          {
            accountId: "acc-123",
            accountName: "Complete Account",
            tokenId: "unknown",
            userEmail: "complete@example.com"
          }
        )).to.be.true;
      });

      it("should handle missing account information gracefully", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: {}
        });
        
        controlApiStub.getMe.resolves({
          account: {
            id: "acc-456"
            // name missing
          },
          user: {
            // email missing
          }
        } as any);
        
        await command.run();

        expect(configManagerStub.storeAccount.calledWith(
          "test-token",
          "default",
          sinon.match({
            accountId: "acc-456"
          })
        )).to.be.true;
      });
    });

    describe("output formatting", function() {
      it("should display success message in human-readable format", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: { alias: "mycompany" }
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        await command.run();

        expect(logStub.calledWith(sinon.match(/Successfully logged in to Test Account/))).to.be.true;
        expect(logStub.calledWith(sinon.match(/Account stored with alias: mycompany/))).to.be.true;
        expect(logStub.calledWith(sinon.match(/Account mycompany is now the current account/))).to.be.true;
      });

      it("should not show alias message for default account", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: {}
        });
        sandbox.stub(command, "shouldOutputJson").returns(false);
        
        configManagerStub.listAccounts.returns([]);
        
        // Mock declining to provide alias
        const rlMock = {
          question: sandbox.stub(),
          close: sandbox.stub()
        };
        readlineStub.returns(rlMock);
        rlMock.question.withArgs(sinon.match(/Would you like to provide an alias/)).callsArgWith(1, "n");
        
        await command.run();

        expect(logStub.calledWith(sinon.match(/Successfully logged in/))).to.be.true;
        expect(logStub.neverCalledWith(sinon.match(/Account stored with alias/))).to.be.true;
      });

      it("should format JSON output correctly", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: { json: true, alias: "jsontest" }
        });
        sandbox.stub(command, "shouldOutputJson").returns(true);
        
        const formatJsonStub = sandbox.stub(command, "formatJsonOutput");
        formatJsonStub.returns('{"formatted": "output"}');
        
        await command.run();

        expect(formatJsonStub.calledWith(
          sinon.match({
            account: sinon.match({
              alias: "jsontest",
              id: "test-account-id",
              name: "Test Account"
            }),
            success: true
          }),
          sinon.match({ json: true, alias: "jsontest" })
        )).to.be.true;
        expect(logStub.calledWith('{"formatted": "output"}')).to.be.true;
      });
    });

    describe("integration with other components", function() {
      it("should use custom control host for API calls", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: { "control-host": "staging.ably.io" }
        });
        
        const ControlApiConstructor = require("../../../../src/services/control-api.js").ControlApi;
        
        await command.run();

        expect(ControlApiConstructor.calledWith(sinon.match({
          accessToken: "test-token",
          controlHost: "staging.ably.io"
        }))).to.be.true;
      });

      it("should not display logo in JSON mode", async function() {
        sandbox.stub(command, "parse").resolves({
          args: { token: "test-token" },
          flags: { json: true }
        });
        sandbox.stub(command, "shouldOutputJson").returns(true);
        
        // Mock displayLogo function
        const displayLogoStub = sandbox.stub(require("../../../../src/utils/logo.js"), "displayLogo");
        
        await command.run();

        expect(displayLogoStub.notCalled).to.be.true;
      });
    });
  });

  describe("helper methods", function() {
    describe("openBrowser", function() {
      it("should use correct command for macOS", function() {
        Object.defineProperty(process, "platform", { value: "darwin" });
        
        (command as any).openBrowser("https://example.com");
        
        expect(execSyncStub.calledWith("open https://example.com")).to.be.true;
      });

      it("should use correct command for Windows", function() {
        Object.defineProperty(process, "platform", { value: "win32" });
        
        (command as any).openBrowser("https://example.com");
        
        expect(execSyncStub.calledWith("start https://example.com")).to.be.true;
      });

      it("should use correct command for Linux", function() {
        Object.defineProperty(process, "platform", { value: "linux" });
        
        (command as any).openBrowser("https://example.com");
        
        expect(execSyncStub.calledWith("xdg-open https://example.com")).to.be.true;
      });
    });

    describe("promptYesNo", function() {
      let rlMock: any;

      beforeEach(function() {
        rlMock = {
          question: sandbox.stub(),
          close: sandbox.stub()
        };
        readlineStub.returns(rlMock);
      });

      it("should handle 'yes' responses", async function() {
        rlMock.question.callsArgWith(1, "yes");
        
        const result = await (command as any).promptYesNo("Test question?");
        
        expect(result).to.be.true;
      });

      it("should handle 'no' responses", async function() {
        rlMock.question.callsArgWith(1, "no");
        
        const result = await (command as any).promptYesNo("Test question?");
        
        expect(result).to.be.false;
      });

      it("should re-prompt for invalid responses", async function() {
        rlMock.question
          .onFirstCall().callsArgWith(1, "maybe")
          .onSecondCall().callsArgWith(1, "yes");
        
        const result = await (command as any).promptYesNo("Test question?");
        
        expect(rlMock.question.calledTwice).to.be.true;
        expect(logStub.calledWith("Please answer with yes/y or no/n")).to.be.true;
        expect(result).to.be.true;
      });
    });
  });
});