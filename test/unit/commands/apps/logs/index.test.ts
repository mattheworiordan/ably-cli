import { expect } from "chai";
import { Config } from "@oclif/core";
import sinon from "sinon";
import AppsLogsCommand from "../../../../../src/commands/apps/logs/index.js";

class TestableAppsLogsCommand extends AppsLogsCommand {
  public logOutput: string[] = [];

  public override log(message?: string): void {
    if (message) {
      this.logOutput.push(message);
    }
  }
}

describe("AppsLogsCommand", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableAppsLogsCommand;
  let mockConfig: Config;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = {} as Config;
    command = new TestableAppsLogsCommand([], mockConfig);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe("#run", function () {
    it("should display available log commands", async function () {
      await command.run();

      const fullOutput = command.logOutput.join(" ");
      expect(fullOutput).to.include("App logs commands:");
      expect(fullOutput).to.include("ably apps logs subscribe");
      expect(fullOutput).to.include("Stream logs from the app-wide meta channel");
      expect(fullOutput).to.include("ably apps logs history");
      expect(fullOutput).to.include("View historical app logs");
    });

    it("should display help text correctly", async function () {
      await command.run();

      const fullOutput = command.logOutput.join("\n");
      expect(fullOutput).to.include("subscribe");
      expect(fullOutput).to.include("history");
      expect(fullOutput).to.include("Stream logs");
      expect(fullOutput).to.include("View historical");
    });
  });
});