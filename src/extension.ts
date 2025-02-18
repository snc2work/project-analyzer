import * as vscode from "vscode";
import { WorkspaceAnalyzer } from "./workspace/analyzer";
import { TerminalLogger } from "./terminal/logger";

export function activate(context: vscode.ExtensionContext) {
  console.log('Extension "project-analyzer" is now active!');

  // Initialize components
  const workspaceAnalyzer = new WorkspaceAnalyzer();
  const terminalLogger = new TerminalLogger(context);

  // Register commands
  const workspaceAnalyzerCommand = vscode.commands.registerCommand(
    "projectAnalyzer.generateStructure",
    async () => {
      try {
        await workspaceAnalyzer.generateStructure();
      } catch (error) {
        console.error("Error in generate structure:", error);
        vscode.window.showErrorMessage(
          `Failed to generate structure: ${error}`
        );
      }
    }
  );

  const terminalLoggerCommand = vscode.commands.registerCommand(
    "projectAnalyzer.toggleLogging",
    async () => {
      try {
        await terminalLogger.toggleLogging();
      } catch (error) {
        console.error("Error in toggle logging:", error);
        vscode.window.showErrorMessage(`Failed to toggle logging: ${error}`);
      }
    }
  );

  // Add to subscriptions
  context.subscriptions.push(
    workspaceAnalyzerCommand,
    terminalLoggerCommand,
    terminalLogger
  );
}

export function deactivate() {}
