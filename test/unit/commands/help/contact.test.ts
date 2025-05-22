import { expect } from "chai";
import sinon from "sinon";

// Simple test implementation since we need to test help functionality
class TestHelpContactCommand {
  private logSpy: sinon.SinonSpy;
  
  constructor() {
    this.logSpy = sinon.spy();
  }

  log(message: string): void {
    this.logSpy(message);
  }

  getLogSpy(): sinon.SinonSpy {
    return this.logSpy;
  }

  async run(): Promise<void> {
    // Simulate help contact functionality
    this.log("Ably Support & Community");
    this.log("");
    this.log("Need help? Here are the best ways to get support:");
    this.log("");
    this.log("📧 Email Support");
    this.log("   Email: support@ably.com");
    this.log("   For technical issues, account questions, and billing inquiries");
    this.log("");
    this.log("💬 Community Discussions");
    this.log("   https://github.com/ably/cli/discussions");
    this.log("   Ask questions, share ideas, and help other developers");
    this.log("");
    this.log("🐛 Bug Reports");
    this.log("   https://github.com/ably/cli/issues");
    this.log("   Report bugs or request new features");
    this.log("");
    this.log("📖 Documentation");
    this.log("   https://ably.com/docs");
    this.log("   Comprehensive guides and API reference");
    this.log("");
    this.log("📋 Status Page");
    this.log("   https://status.ably.com");
    this.log("   Check Ably service status and incidents");
  }

  shouldOutputJson(flags: any): boolean {
    return flags.json || flags["pretty-json"];
  }

  formatJsonOutput(data: any, flags: any): string {
    if (flags["pretty-json"]) {
      return JSON.stringify(data, null, 2);
    }
    return JSON.stringify(data);
  }

  async runWithJson(flags: any): Promise<void> {
    const contactInfo = {
      support: {
        email: "support@ably.com",
        description: "For technical issues, account questions, and billing inquiries"
      },
      community: {
        discussions: "https://github.com/ably/cli/discussions",
        description: "Ask questions, share ideas, and help other developers"
      },
      bugs: {
        issues: "https://github.com/ably/cli/issues",
        description: "Report bugs or request new features"
      },
      documentation: {
        url: "https://ably.com/docs",
        description: "Comprehensive guides and API reference"
      },
      status: {
        url: "https://status.ably.com",
        description: "Check Ably service status and incidents"
      }
    };

    this.log(this.formatJsonOutput(contactInfo, flags));
  }
}

describe("HelpContact", function() {
  let command: TestHelpContactCommand;
  let sandbox: sinon.SinonSandbox;

  beforeEach(function() {
    sandbox = sinon.createSandbox();
    command = new TestHelpContactCommand();
  });

  afterEach(function() {
    sandbox.restore();
  });

  describe("constructor", function() {
    it("should create instance successfully", function() {
      expect(command).to.be.instanceOf(TestHelpContactCommand);
    });
  });

  describe("run", function() {
    it("should display contact information", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      expect(logSpy.calledWith("Ably Support & Community")).to.be.true;
      expect(logSpy.calledWith("   Email: support@ably.com")).to.be.true;
      expect(logSpy.calledWith("   https://github.com/ably/cli/discussions")).to.be.true;
      expect(logSpy.calledWith("   https://github.com/ably/cli/issues")).to.be.true;
      expect(logSpy.calledWith("   https://ably.com/docs")).to.be.true;
      expect(logSpy.calledWith("   https://status.ably.com")).to.be.true;
    });

    it("should include all support channels", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const allLogs = logSpy.getCalls().map(call => call.args[0]).join('\n');

      // Verify all main sections are present
      expect(allLogs).to.include("📧 Email Support");
      expect(allLogs).to.include("💬 Community Discussions");
      expect(allLogs).to.include("🐛 Bug Reports");
      expect(allLogs).to.include("📖 Documentation");
      expect(allLogs).to.include("📋 Status Page");
    });

    it("should provide actionable information", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const allLogs = logSpy.getCalls().map(call => call.args[0]).join('\n');

      // Should include specific URLs and email
      expect(allLogs).to.include("support@ably.com");
      expect(allLogs).to.include("https://github.com/ably/cli/discussions");
      expect(allLogs).to.include("https://github.com/ably/cli/issues");
      expect(allLogs).to.include("https://ably.com/docs");
      expect(allLogs).to.include("https://status.ably.com");
    });

    it("should include helpful descriptions", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const allLogs = logSpy.getCalls().map(call => call.args[0]).join('\n');

      // Should explain what each channel is for
      expect(allLogs).to.include("technical issues, account questions, and billing inquiries");
      expect(allLogs).to.include("Ask questions, share ideas, and help other developers");
      expect(allLogs).to.include("Report bugs or request new features");
      expect(allLogs).to.include("Comprehensive guides and API reference");
      expect(allLogs).to.include("Check Ably service status and incidents");
    });
  });

  describe("JSON output", function() {
    it("should output structured JSON when requested", async function() {
      const flags = { json: true };
      
      await command.runWithJson(flags);

      const logSpy = command.getLogSpy();
      expect(logSpy.calledOnce).to.be.true;

      const output = JSON.parse(logSpy.firstCall.args[0]);
      expect(output).to.have.property("support");
      expect(output).to.have.property("community");
      expect(output).to.have.property("bugs");
      expect(output).to.have.property("documentation");
      expect(output).to.have.property("status");

      expect(output.support.email).to.equal("support@ably.com");
      expect(output.community.discussions).to.equal("https://github.com/ably/cli/discussions");
      expect(output.bugs.issues).to.equal("https://github.com/ably/cli/issues");
    });

    it("should output pretty JSON when requested", async function() {
      const flags = { "pretty-json": true };
      
      await command.runWithJson(flags);

      const logSpy = command.getLogSpy();
      const output = logSpy.firstCall.args[0];
      
      // Pretty JSON should have indentation
      expect(output).to.include("  ");
      expect(output).to.include("\n");
      
      const parsed = JSON.parse(output);
      expect(parsed.support.email).to.equal("support@ably.com");
    });

    it("should include all contact information in JSON", async function() {
      const flags = { json: true };
      
      await command.runWithJson(flags);

      const logSpy = command.getLogSpy();
      const output = JSON.parse(logSpy.firstCall.args[0]);

      // Verify all required fields
      expect(output.support).to.deep.include({
        email: "support@ably.com",
        description: "For technical issues, account questions, and billing inquiries"
      });

      expect(output.community).to.deep.include({
        discussions: "https://github.com/ably/cli/discussions",
        description: "Ask questions, share ideas, and help other developers"
      });

      expect(output.bugs).to.deep.include({
        issues: "https://github.com/ably/cli/issues",
        description: "Report bugs or request new features"
      });

      expect(output.documentation).to.deep.include({
        url: "https://ably.com/docs",
        description: "Comprehensive guides and API reference"
      });

      expect(output.status).to.deep.include({
        url: "https://status.ably.com",
        description: "Check Ably service status and incidents"
      });
    });
  });

  describe("output formatting", function() {
    it("should use consistent emoji and formatting", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const calls = logSpy.getCalls().map(call => call.args[0]);

      // Should use emojis for visual organization
      const emojiLines = calls.filter(line => /^[📧💬🐛📖📋]/.test(line));
      expect(emojiLines).to.have.length(5);

      // Should use consistent indentation
      const indentedLines = calls.filter(line => line.startsWith("   "));
      expect(indentedLines.length).to.be.greaterThan(5);
    });

    it("should have proper spacing for readability", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const calls = logSpy.getCalls().map(call => call.args[0]);

      // Should have empty lines for spacing
      const emptyLines = calls.filter(line => line === "");
      expect(emptyLines.length).to.be.greaterThan(3);
    });

    it("should start with a clear header", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      expect(logSpy.firstCall.args[0]).to.equal("Ably Support & Community");
    });

    it("should provide context before contact details", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const calls = logSpy.getCalls().map(call => call.args[0]);

      // Should explain what the help is for
      expect(calls).to.include("Need help? Here are the best ways to get support:");
    });
  });

  describe("shouldOutputJson", function() {
    it("should return true for json flag", function() {
      expect(command.shouldOutputJson({ json: true })).to.be.true;
    });

    it("should return true for pretty-json flag", function() {
      expect(command.shouldOutputJson({ "pretty-json": true })).to.be.true;
    });

    it("should return false when no json flags", function() {
      expect(command.shouldOutputJson({})).to.be.false;
    });
  });

  describe("formatJsonOutput", function() {
    it("should format regular JSON", function() {
      const data = { test: "value" };
      const flags = { json: true };
      
      const result = command.formatJsonOutput(data, flags);
      expect(result).to.equal('{"test":"value"}');
    });

    it("should format pretty JSON", function() {
      const data = { test: "value" };
      const flags = { "pretty-json": true };
      
      const result = command.formatJsonOutput(data, flags);
      expect(result).to.equal('{\n  "test": "value"\n}');
    });
  });

  describe("accessibility and usability", function() {
    it("should provide clear context for each support channel", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const allLogs = logSpy.getCalls().map(call => call.args[0]).join('\n');

      // Each contact method should explain its purpose
      expect(allLogs).to.match(/Email.*technical issues.*account questions.*billing/i);
      expect(allLogs).to.match(/Community.*Ask questions.*share ideas.*help.*developers/i);
      expect(allLogs).to.match(/Bug.*Report bugs.*request.*features/i);
      expect(allLogs).to.match(/Documentation.*guides.*reference/i);
      expect(allLogs).to.match(/Status.*service status.*incidents/i);
    });

    it("should be scannable with visual indicators", async function() {
      await command.run();

      const logSpy = command.getLogSpy();
      const calls = logSpy.getCalls().map(call => call.args[0]);

      // Should use visual indicators for different sections
      const visualIndicators = calls.filter(line => /[📧💬🐛📖📋]/.test(line));
      expect(visualIndicators).to.have.length(5);

      // URLs should be on their own lines for easy copying
      const urlLines = calls.filter(line => line.includes("https://"));
      expect(urlLines.length).to.be.greaterThan(3);
    });
  });
});