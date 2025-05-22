import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";
import * as Ably from "ably";

import SpacesMembers from "../../../../src/commands/spaces/members.js";

// Lightweight testable subclass to intercept parsing and client creation
class TestableSpacesMembers extends SpacesMembers {
  private _parseResult: any;
  public mockRealtimeClient: any;
  public mockSpacesClient: any;
  public mockSpace: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  public async createAblyClient(_flags: any) {
    return this.mockRealtimeClient as unknown as Ably.Realtime;
  }

  public async setupSpacesClient(_flags: any, _spaceName: string) {
    return {
      realtimeClient: this.mockRealtimeClient,
      spacesClient: this.mockSpacesClient,
      space: this.mockSpace,
    };
  }

  protected async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  protected interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

describe("spaces members", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableSpacesMembers;
  let mockConfig: Config;
  let enterStub: sinon.SinonStub;
  let getStub: sinon.SinonStub;
  let subscribeStub: sinon.SinonStub;
  let leaveStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableSpacesMembers([], mockConfig);

    enterStub = sandbox.stub().resolves();
    getStub = sandbox.stub().resolves([]);
    subscribeStub = sandbox.stub().returns({ unsubscribe: sandbox.stub() });
    leaveStub = sandbox.stub().resolves();

    // Mock Space
    command.mockSpace = {
      members: {
        enter: enterStub,
        get: getStub,
        subscribe: subscribeStub,
        leave: leaveStub,
      },
      cursors: {
        set: sandbox.stub(),
        get: sandbox.stub().resolves([]),
        subscribe: sandbox.stub(),
      },
      locations: {
        set: sandbox.stub(),
        get: sandbox.stub().resolves([]),
        subscribe: sandbox.stub(),
      },
      locks: {
        acquire: sandbox.stub(),
        release: sandbox.stub(),
        get: sandbox.stub().resolves([]),
        subscribe: sandbox.stub(),
      },
    };

    // Mock Spaces Client
    command.mockSpacesClient = {
      get: sandbox.stub().resolves(command.mockSpace),
    };

    // Mock Realtime Client
    command.mockRealtimeClient = {
      connection: {
        on: sandbox.stub(),
        state: "connected",
        close: sandbox.stub(),
      },
      close: sandbox.stub(),
    };

    command.setParseResult({
      flags: {
        json: false,
        "pretty-json": false,
        "no-prompt": false,
      },
      args: { 
        spaceName: "test-space"
      },
      argv: [],
      raw: [],
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("should enter space members successfully", async function () {
    // Mock process.stdin to simulate user pressing Ctrl+C
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    // Simulate immediate exit to avoid hanging test
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 100);

    await command.run();

    expect(enterStub).to.have.been.calledOnce;
    expect(subscribeStub).to.have.been.calledOnce;
    expect(getStub).to.have.been.calledOnce;
  });

  it("should enter space with profile data", async function () {
    command.setParseResult({
      flags: {
        json: false,
        "no-prompt": true,
        "profile-data": '{"name": "Test User", "role": "admin"}',
      },
      args: { spaceName: "test-space" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(enterStub).to.have.been.calledWith({
      name: "Test User",
      role: "admin",
    });
  });

  it("should handle invalid profile data JSON", async function () {
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: {
        json: true,
        "profile-data": 'invalid-json',
      },
      args: { spaceName: "test-space" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(enterStub).to.not.have.been.called;
    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        const parsed = JSON.parse(output);
        return parsed.error.includes("Invalid profile data JSON") && parsed.success === false;
      })
    );
  });

  it("should handle member updates subscription", async function () {
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    const logStub = sandbox.stub(command, "log");

    // Mock member update being received
    subscribeStub.callsFake((listener: any) => {
      setTimeout(() => {
        listener({
          action: "enter",
          member: {
            clientId: "test-client",
            profileData: { name: "Test User" },
            lastEvent: { timestamp: new Date() },
          },
        });
      }, 50);
      return { unsubscribe: sandbox.stub() };
    });

    // Exit after receiving update
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 150);

    await command.run();

    expect(subscribeStub).to.have.been.calledOnce;
    expect(logStub).to.have.been.called;
  });

  it("should output JSON format when requested", async function () {
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: { json: true },
      args: { spaceName: "test-space" },
      argv: [],
      raw: [],
    });

    // Mock existing members
    getStub.resolves([
      {
        clientId: "client-1",
        profileData: { name: "User 1" },
        lastEvent: { timestamp: new Date() },
      },
      {
        clientId: "client-2",
        profileData: { name: "User 2" },
        lastEvent: { timestamp: new Date() },
      },
    ]);

    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    // Immediate exit
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 50);

    await command.run();

    expect(logStub).to.have.been.calledWith(
      sinon.match((output: string) => {
        try {
          const parsed = JSON.parse(output);
          return Array.isArray(parsed.members) && parsed.members.length === 2;
        } catch {
          return false;
        }
      })
    );
  });

  it("should handle space enter failure", async function () {
    enterStub.rejects(new Error("Failed to enter space"));
    
    const logStub = sandbox.stub(command, "log");

    command.setParseResult({
      flags: { json: true },
      args: { spaceName: "test-space" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(enterStub).to.have.been.calledOnce;
    expect(subscribeStub).to.not.have.been.called;
  });

  it("should clean up resources in finally block", async function () {
    const mockStdin = {
      setRawMode: sandbox.stub(),
      on: sandbox.stub(),
      resume: sandbox.stub(),
      pause: sandbox.stub(),
    };
    sandbox.stub(process, "stdin").value(mockStdin);

    // Immediate exit
    setTimeout(() => {
      const sigintHandler = mockStdin.on.getCalls().find(call => call.args[0] === 'data')?.args[1];
      if (sigintHandler) {
        sigintHandler(Buffer.from('\u0003')); // Ctrl+C
      }
    }, 50);

    await command.run();

    expect(leaveStub).to.have.been.calledOnce;
    expect(command.mockRealtimeClient.close).to.have.been.calledOnce;
  });

  it("should handle no-prompt flag", async function () {
    command.setParseResult({
      flags: {
        json: false,
        "no-prompt": true,
      },
      args: { spaceName: "test-space" },
      argv: [],
      raw: [],
    });

    await command.run();

    expect(enterStub).to.have.been.calledOnce;
    expect(subscribeStub).to.have.been.calledOnce;
    expect(leaveStub).to.have.been.calledOnce;
  });
});