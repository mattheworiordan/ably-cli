import { expect } from "chai";
import sinon from "sinon";
import { Config } from "@oclif/core";

import StartServer from "../../../../src/commands/mcp/start-server.js";

// Lightweight testable subclass to intercept parsing and client creation
class TestableStartServer extends StartServer {
  private _parseResult: any;
  public mockStdio: any;

  public setParseResult(result: any) {
    this._parseResult = result;
  }

  public override async parse() {
    return this._parseResult;
  }

  protected override async ensureAppAndKey(_flags: any) {
    return { apiKey: "fake:key", appId: "fake-app" } as const;
  }

  protected override interactiveHelper = {
    confirm: sinon.stub().resolves(true),
    promptForText: sinon.stub().resolves("fake-input"),
    promptToSelect: sinon.stub().resolves("fake-selection"),
  } as any;
}

describe("mcp start-server", function () {
  let sandbox: sinon.SinonSandbox;
  let command: TestableStartServer;
  let mockConfig: Config;
  let stdinStub: sinon.SinonStub;
  let stdoutStub: sinon.SinonStub;
  let processExitStub: sinon.SinonStub;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    mockConfig = { runHook: sinon.stub() } as unknown as Config;
    command = new TestableStartServer([], mockConfig);

    // Mock stdio streams
    stdinStub = sandbox.stub();
    stdoutStub = sandbox.stub();
    
    command.mockStdio = {
      stdin: {
        on: stdinStub,
        setEncoding: sandbox.stub(),
        resume: sandbox.stub(),
        pause: sandbox.stub(),
      },
      stdout: {
        write: stdoutStub,
      },
    };

    // Mock process.exit to prevent test from actually exiting
    processExitStub = sandbox.stub(process, "exit");

    command.setParseResult({
      flags: {
        json: false,
        "pretty-json": false,
        transport: "stdio",
      },
      args: {},
      argv: [],
      raw: [],
    });
  });

  afterEach(function () {
    sandbox.restore();
  });

  it("should start MCP server successfully", async function () {
    // Mock stdin to send MCP initialization
    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          // Send MCP initialize request
          const initRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: {
                name: "test-client",
                version: "1.0.0",
              },
            },
          }) + "\n";
          callback(initRequest);

          // Send shutdown after init
          setTimeout(() => {
            const shutdownRequest = JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "shutdown",
              params: {},
            }) + "\n";
            callback(shutdownRequest);
          }, 50);
        }, 10);
      }
    });

    await command.run();

    expect(stdinStub).to.have.been.calledWith("data");
    expect(stdoutStub).to.have.been.called;
  });

  it("should handle MCP initialize request correctly", async function () {
    let responseData = "";
    
    stdoutStub.callsFake((data: string) => {
      responseData += data;
    });

    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          const initRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: {
                name: "test-client",
                version: "1.0.0",
              },
            },
          }) + "\n";
          callback(initRequest);

          // Shutdown immediately after init
          setTimeout(() => {
            const shutdownRequest = JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "shutdown",
              params: {},
            }) + "\n";
            callback(shutdownRequest);
          }, 50);
        }, 10);
      }
    });

    await command.run();

    // Check that initialize response was sent
    const responses = responseData.split("\n").filter(line => line.trim());
    const initResponse = responses.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.id === 1 && parsed.result;
      } catch {
        return false;
      }
    });

    expect(initResponse).to.not.be.undefined;
    
    if (initResponse) {
      const parsed = JSON.parse(initResponse);
      expect(parsed.result).to.have.property("capabilities");
      expect(parsed.result).to.have.property("serverInfo");
    }
  });

  it("should handle MCP tools/list request", async function () {
    let responseData = "";
    
    stdoutStub.callsFake((data: string) => {
      responseData += data;
    });

    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          // First initialize
          const initRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          }) + "\n";
          callback(initRequest);

          // Then list tools
          setTimeout(() => {
            const toolsRequest = JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/list",
              params: {},
            }) + "\n";
            callback(toolsRequest);

            // Then shutdown
            setTimeout(() => {
              const shutdownRequest = JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "shutdown",
                params: {},
              }) + "\n";
              callback(shutdownRequest);
            }, 50);
          }, 50);
        }, 10);
      }
    });

    await command.run();

    // Check that tools/list response was sent
    const responses = responseData.split("\n").filter(line => line.trim());
    const toolsResponse = responses.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.id === 2 && parsed.result && parsed.result.tools;
      } catch {
        return false;
      }
    });

    expect(toolsResponse).to.not.be.undefined;
    
    if (toolsResponse) {
      const parsed = JSON.parse(toolsResponse);
      expect(parsed.result.tools).to.be.an("array");
    }
  });

  it("should handle MCP tools/call request", async function () {
    let responseData = "";
    
    stdoutStub.callsFake((data: string) => {
      responseData += data;
    });

    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          // Initialize first
          const initRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: {
              protocolVersion: "2024-11-05",
              capabilities: {},
              clientInfo: { name: "test-client", version: "1.0.0" },
            },
          }) + "\n";
          callback(initRequest);

          // Then call a tool
          setTimeout(() => {
            const toolCallRequest = JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "tools/call",
              params: {
                name: "channels_list",
                arguments: {
                  limit: 10,
                },
              },
            }) + "\n";
            callback(toolCallRequest);

            // Then shutdown
            setTimeout(() => {
              const shutdownRequest = JSON.stringify({
                jsonrpc: "2.0",
                id: 3,
                method: "shutdown",
                params: {},
              }) + "\n";
              callback(shutdownRequest);
            }, 50);
          }, 50);
        }, 10);
      }
    });

    await command.run();

    // Check that tools/call response was sent
    const responses = responseData.split("\n").filter(line => line.trim());
    const toolCallResponse = responses.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.id === 2 && (parsed.result || parsed.error);
      } catch {
        return false;
      }
    });

    expect(toolCallResponse).to.not.be.undefined;
  });

  it("should handle invalid JSON gracefully", async function () {
    let responseData = "";
    
    stdoutStub.callsFake((data: string) => {
      responseData += data;
    });

    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          // Send invalid JSON
          callback("invalid json\n");

          // Then shutdown properly
          setTimeout(() => {
            const shutdownRequest = JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "shutdown",
              params: {},
            }) + "\n";
            callback(shutdownRequest);
          }, 50);
        }, 10);
      }
    });

    await command.run();

    // Server should continue running despite invalid JSON
    expect(stdoutStub).to.have.been.called;
  });

  it("should handle unknown methods with error response", async function () {
    let responseData = "";
    
    stdoutStub.callsFake((data: string) => {
      responseData += data;
    });

    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          // Send unknown method
          const unknownRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "unknown/method",
            params: {},
          }) + "\n";
          callback(unknownRequest);

          // Then shutdown
          setTimeout(() => {
            const shutdownRequest = JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              method: "shutdown",
              params: {},
            }) + "\n";
            callback(shutdownRequest);
          }, 50);
        }, 10);
      }
    });

    await command.run();

    // Check that error response was sent
    const responses = responseData.split("\n").filter(line => line.trim());
    const errorResponse = responses.find(line => {
      try {
        const parsed = JSON.parse(line);
        return parsed.id === 1 && parsed.error;
      } catch {
        return false;
      }
    });

    expect(errorResponse).to.not.be.undefined;
    
    if (errorResponse) {
      const parsed = JSON.parse(errorResponse);
      expect(parsed.error).to.have.property("code");
      expect(parsed.error).to.have.property("message");
    }
  });

  it("should handle transport flag variations", async function () {
    command.setParseResult({
      flags: {
        transport: "stdio",
      },
      args: {},
      argv: [],
      raw: [],
    });

    // Mock quick shutdown
    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          const shutdownRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "shutdown",
            params: {},
          }) + "\n";
          callback(shutdownRequest);
        }, 10);
      }
    });

    await command.run();

    expect(stdinStub).to.have.been.called;
  });

  it("should shutdown cleanly", async function () {
    stdinStub.callsFake((event: string, callback: any) => {
      if (event === "data") {
        setTimeout(() => {
          const shutdownRequest = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "shutdown",
            params: {},
          }) + "\n";
          callback(shutdownRequest);
        }, 10);
      }
    });

    await command.run();

    // Should not call process.exit during normal shutdown
    expect(processExitStub).to.not.have.been.called;
  });
});