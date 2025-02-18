import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";

export class TerminalLogger implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private isLogging = false;
  private recordedData: string[] = [];
  private readonly MAX_LINES = 1000;
  private lastSaveTimeout: NodeJS.Timeout | undefined;
  private hasUnsavedChanges = false;
  private trackedTerminals = new Set<vscode.Terminal>();
  private shellIntegrationDisposables = new Map<
    vscode.Terminal,
    vscode.Disposable[]
  >();
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.statusBarItem.command = "projectAnalyzer.toggleLogging";
    this.statusBarItem.text = "$(terminal) Terminal Log";
    this.statusBarItem.tooltip = "Click to start/stop terminal logging";
    this.statusBarItem.show();

    // Register terminal open event
    this.context.subscriptions.push(
      vscode.window.onDidOpenTerminal((terminal) => {
        console.log(`Terminal opened: ${terminal.name}`);
        this.trackedTerminals.add(terminal);
        if (this.isLogging) {
          this.setupShellIntegration(terminal);
        }
      })
    );

    this.context.subscriptions.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        this.trackedTerminals.delete(terminal);
        this.disposeTerminalResources(terminal);
        if (this.trackedTerminals.size === 0 && this.isLogging) {
          this.stopLogging();
        }
      })
    );

    // Setup shell integration for existing terminals on activation
    vscode.window.terminals.forEach((terminal) => {
      this.trackedTerminals.add(terminal);
    });
  }

  public async toggleLogging() {
    if (this.isLogging) {
      this.stopLogging();
    } else {
      await this.startLogging();
    }
  }

  private setupShellIntegration(terminal: vscode.Terminal) {
    if (this.shellIntegrationDisposables.has(terminal)) {
      return; // Already setup
    }

    console.log(`Setting up shell integration for terminal: ${terminal.name}`);
    const disposables: vscode.Disposable[] = [];

    disposables.push(
      vscode.window.onDidStartTerminalShellExecution(async (e) => {
        if (!this.isLogging || e.terminal !== terminal) {
          return;
        }

        console.log("Command execution detected");
        const timestamp = new Date().toISOString();

        if (e.execution) {
          const commandLine = e.execution.commandLine?.value;
          if (commandLine?.startsWith("ls")) {
            console.log("Skipping ls command output");
            return;
          }

          try {
            const stream = e.execution.read();
            let commandOutput = "";

            for await (const data of stream) {
              commandOutput += data;
            }

            commandOutput = commandOutput
              .replace(
                /[\x1b\x9b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
                ""
              )
              .replace(/\]633;[^\x07]*\x07/g, "")
              .replace(/\[(\?2004[hl]|\?2004l)\]/g, "")
              .replace(/\[1m\[7m%\[27m\[1m\[0m/g, "")
              .replace(/[ \t]+$/gm, "")
              .trim();

            let logEntry = `[${timestamp}] Execution detected`;
            if (e.execution?.commandLine?.value) {
              logEntry = `[${timestamp}] Command: ${e.execution.commandLine.value}`;
            }
            if (commandOutput) {
              logEntry += `\n${commandOutput}`;
            }

            console.log("Recording:", logEntry);
            this.recordedData.push(logEntry);
            this.hasUnsavedChanges = true;
            void this.scheduleLogSave();
          } catch (error) {
            console.error("Error reading execution stream:", error);
          }
        } else {
          let logEntry = `[${timestamp}] Execution detected (no execution object)`;
          console.log("Recording:", logEntry);
          this.recordedData.push(logEntry);
          this.hasUnsavedChanges = true;
          void this.scheduleLogSave();
        }
      })
    );

    disposables.push(
      vscode.window.onDidEndTerminalShellExecution((e) => {
        if (this.isLogging && e.terminal === terminal) {
          const timestamp = new Date().toISOString();
          const exitCode =
            e.exitCode !== undefined
              ? `Exit code: ${e.exitCode}`
              : "No exit code";
          console.log(`Command completed: ${exitCode}`);
          this.recordedData.push(`[${timestamp}] ${exitCode}`);
          this.hasUnsavedChanges = true;
          void this.scheduleLogSave();
        }
      })
    );

    this.shellIntegrationDisposables.set(terminal, disposables);
  }

  private async startLogging() {
    console.log("Starting logging...");
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("No workspace opened");
      return;
    }

    try {
      const logFileName =
        vscode.workspace
          .getConfiguration("terminal-logger")
          .get<string>("logFileName") || "terminal.log";
      const logPath = path.join(workspaceFolder.uri.fsPath, logFileName);
      console.log(`Log file path: ${logPath}`);

      try {
        const content = await fs.readFile(logPath, "utf-8");
        this.recordedData = content.split("\n").filter((entry) => entry.trim());
        if (this.recordedData.length > this.MAX_LINES) {
          this.recordedData = this.recordedData.slice(-this.MAX_LINES);
        }
      } catch (error: any) {
        if (error.code !== "ENOENT") {
          console.error("Error loading existing log:", error);
        }
        this.recordedData = [];
      }

      this.isLogging = true;
      this.updateStatusBar();
      console.log("Logging started, status bar updated");
      vscode.window.showInformationMessage(
        "Started recording terminal commands"
      );

      // Setup shell integration for all existing terminals
      vscode.window.terminals.forEach((terminal) => {
        if (!this.trackedTerminals.has(terminal)) {
          this.trackedTerminals.add(terminal);
        }
        this.setupShellIntegration(terminal);
      });
    } catch (error) {
      console.error("Error starting logging:", error);
      vscode.window.showErrorMessage("Failed to start logging");
    }
  }

  private stopLogging() {
    console.log("Stopping logging...");
    if (this.hasUnsavedChanges) {
      void this.scheduleLogSave();
    }
    this.isLogging = false;
    this.updateStatusBar();
    console.log("Logging stopped, status bar updated");
    vscode.window.showInformationMessage("Stopped recording terminal commands");

    for (const terminal of this.trackedTerminals) {
      this.disposeTerminalResources(terminal);
    }
  }

  private updateStatusBar() {
    if (this.isLogging) {
      this.statusBarItem.text = "$(record) Logging Terminal";
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.errorBackground"
      );
      this.statusBarItem.tooltip = "Click to stop logging";
    } else {
      this.statusBarItem.text = "$(terminal) Terminal Log";
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = "Click to start logging";
    }
    this.statusBarItem.show();
  }

  private async scheduleLogSave() {
    console.log("Scheduling log save...");
    if (this.lastSaveTimeout) {
      clearTimeout(this.lastSaveTimeout);
    }

    this.lastSaveTimeout = setTimeout(async () => {
      console.log("Save timeout triggered");
      if (this.hasUnsavedChanges && this.recordedData.length > 0) {
        console.log(`Saving ${this.recordedData.length} records`);
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
          const logFileName =
            vscode.workspace
              .getConfiguration("terminal-logger")
              .get<string>("logFileName") || "terminal.log";
          const logPath = path.join(workspaceFolder.uri.fsPath, logFileName);
          console.log(`Saving to: ${logPath}`);

          try {
            await fs.appendFile(logPath, this.recordedData.join("\n") + "\n");
            console.log("File saved successfully");
            this.recordedData = [];
            this.hasUnsavedChanges = false;
          } catch (error) {
            console.error("Error saving log file:", error);
            const errorMessage =
              error instanceof Error ? error.message : "Unknown error occurred";
            vscode.window.showErrorMessage(
              `Failed to save log file: ${errorMessage}`
            );
          }
        } else {
          console.error("No workspace folder found");
        }
      } else {
        console.log("No unsaved changes or records to save");
      }
      this.lastSaveTimeout = undefined;
    }, 2000);
  }

  private disposeTerminalResources(terminal: vscode.Terminal) {
    const disposables = this.shellIntegrationDisposables.get(terminal);
    if (disposables) {
      disposables.forEach((d) => d.dispose());
      this.shellIntegrationDisposables.delete(terminal);
    }
  }

  dispose() {
    this.stopLogging();
    if (this.lastSaveTimeout) {
      clearTimeout(this.lastSaveTimeout);
    }

    for (const terminal of this.trackedTerminals) {
      this.disposeTerminalResources(terminal);
    }
    this.shellIntegrationDisposables.clear();
    this.statusBarItem.dispose();
  }
}
