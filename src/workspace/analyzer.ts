import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";

interface FileAnalysis {
  imports: string[];
  functions: string[];
  classes: string[];
  exports: string[];
  methods: string[];
  components: string[];
}

export class WorkspaceAnalyzer {
  private async getWorkspaceFolder(): Promise<
    vscode.WorkspaceFolder | undefined
  > {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showErrorMessage("Please open a folder first");
      return undefined;
    }
    return folders[0];
  }

  private async loadGitignorePatterns(rootPath: string): Promise<string[]> {
    const gitignorePath = path.join(rootPath, ".gitignore");
    let patterns: string[] = [];
    let hasGitignore = false;

    try {
      const gitignoreExists = await fs
        .access(gitignorePath)
        .then(() => true)
        .catch(() => false);

      if (gitignoreExists) {
        hasGitignore = true;
        const content = await fs.readFile(gitignorePath, "utf-8");
        patterns = content
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => {
            if (!line || line.startsWith("#")) {
              return false;
            }
            if (line.startsWith("!")) {
              return false;
            }
            return true;
          });
      }
    } catch (error) {
      console.error("Error reading .gitignore:", error);
    }

    // Always exclude node_modules, .git, and Python specific files/directories
    const defaultPatterns = [
      "node_modules",
      ".git",
      "__pycache__",
      "*.pyc",
      "*.pyo",
      "*.pyd",
      ".Python",
      "*.so",
      "env",
      "venv",
      ".env",
      ".venv",
      "ENV",
      "env.bak",
      "venv.bak",
    ];

    return hasGitignore
      ? [...patterns, ...defaultPatterns]
      : [".*", ...defaultPatterns];
  }

  private isIgnored(filePath: string, patterns: string[]): boolean {
    const normalizedPath = filePath.replace(/\\/g, "/");

    return patterns.some((pattern) => {
      let normalizedPattern = pattern.trim().replace(/\\/g, "/");

      if (normalizedPattern.startsWith("/")) {
        normalizedPattern = normalizedPattern.slice(1);
      }

      if (normalizedPattern.endsWith("/")) {
        normalizedPattern = normalizedPattern.slice(0, -1);
      }

      const regexPattern = normalizedPattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/\*/g, "[^/]*")
        .replace(/\?/g, "[^/]");

      const regex = new RegExp(
        `^${regexPattern}$|` +
          `^${regexPattern}/|` +
          `^.*?/${regexPattern}$|` +
          `^.*?/${regexPattern}/.*$`
      );

      return regex.test(normalizedPath);
    });
  }

  private analyzeFileContent(content: string, ext: string): FileAnalysis {
    const analysis: FileAnalysis = {
      imports: [],
      functions: [],
      classes: [],
      exports: [],
      methods: [],
      components: [],
    };

    if ([".js", ".ts", ".jsx", ".tsx"].includes(ext)) {
      // TypeScript Imports
      const importRegex =
        /^import\s+(?:{(?:[\s\S](?!from))*\s*\}|\*\s+as\s+\w+)\s+from\s+["'][^"']+["']|^import\s+\w+\s+from\s+["'][^"']+["']/gm;
      analysis.imports = (content.match(importRegex) || []).map((imp) =>
        imp.trim()
      );

      // Functions (including arrow functions and async functions)
      const functionRegex =
        /(?:export\s+)?(?:async\s+)?(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)|(?:async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm;
      const functionMatches = content.matchAll(functionRegex);
      for (const match of functionMatches) {
        const funcName = match[1] || match[2];
        if (funcName) {
          analysis.functions.push(funcName);
        }
      }

      // Classes
      const classRegex = /(?:export\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
      const classMatches = content.matchAll(classRegex);
      for (const match of classMatches) {
        if (match[1]) {
          analysis.classes.push(match[1]);
        }
      }

      // Methods within classes
      const methodRegex =
        /(?:public|private|protected)?\s*(?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/gm;
      const methodMatches = content.matchAll(methodRegex);
      for (const match of methodMatches) {
        if (
          match[1] &&
          !["constructor", "if", "for", "while", "switch", "catch"].includes(
            match[1]
          ) &&
          !/[A-Z][a-zA-Z0-9]*/.test(match[1])
        ) {
          analysis.methods.push(match[1]);
        }
      }

      // Exports
      const exportRegex =
        /^export\s+(?:const|let|var|function|class|interface|type)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/gm;
      const exportMatches = content.matchAll(exportRegex);
      for (const match of exportMatches) {
        if (match[1]) {
          analysis.exports.push(match[1]);
        }
      }

      // React components
      const reactComponentRegex =
        /(?:const|let|var|function)\s+([A-Z][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)\s*=>|\([^)]*\)\s*\{)/gm;
      const reactComponentMatches = content.matchAll(reactComponentRegex);
      for (const match of reactComponentMatches) {
        if (match[1]) {
          analysis.components.push(match[1]);
        }
      }
    } else if (ext === ".py") {
      // Python imports
      const importRegex =
        /^(?:from\s+([^\s]+)\s+)?import\s+([^\s]+(?:,\s*[^\s]+)*)(?:\s+as\s+([^\s]+))?$/gm;
      let importMatches;
      while ((importMatches = importRegex.exec(content)) !== null) {
        const fromModule = importMatches[1]
          ? importMatches[1].trim() + "."
          : "";
        const importedNames = importMatches[2].split(",").map((s) => s.trim());
        const asName = importMatches[3] ? ` as ${importMatches[3].trim()}` : "";

        importedNames.forEach((name) => {
          analysis.imports.push(`import ${fromModule}${name}${asName}`);
        });
      }

      // Python functions
      const functionRegex = /^def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm;
      const functionMatches = content.matchAll(functionRegex);
      analysis.functions = [
        ...new Set(Array.from(functionMatches, (m) => m[1])),
      ];

      // Python classes
      const classRegex =
        /^class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\([^)]*\))?\s*:/gm;
      const classMatches = content.matchAll(classRegex);
      for (const match of classMatches) {
        if (match[1]) {
          analysis.classes.push(match[1]);
        }
      }

      // Python methods
      const methodRegex =
        /^ {4}def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*:/gm;
      const methodMatches = content.matchAll(methodRegex);
      analysis.methods = [];
      for (const match of methodMatches) {
        analysis.methods.push(match[1]);
      }
      analysis.methods = [...new Set(analysis.methods)];
    }

    return analysis;
  }

  public async generateStructure(): Promise<void> {
    const workspaceFolder = await this.getWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    try {
      const config = vscode.workspace.getConfiguration("projectAnalyzer");
      const outputDir = config.get<string>("outputPath") || "";
      const fileName =
        config.get<string>("structureFileName") || "workspace-structure.md";

      const documentation = await this.analyzeWorkspace(
        workspaceFolder.uri.fsPath
      );

      // const finalOutputPath = outputDir
      //   ? path.join(workspaceFolder.uri.fsPath, outputDir, fileName)
      //   : path.join(workspaceFolder.uri.fsPath, fileName);
      const finalOutputPath = path.join(
        workspaceFolder.uri.fsPath,
        outputDir,
        fileName
      );

      // 出力ディレクトリの作成
      const outputDirPath = path.dirname(finalOutputPath);
      try {
        await fs.mkdir(outputDirPath, { recursive: true });
      } catch (error) {
        console.error("Error creating output directory:", error);
        throw error;
      }

      // ファイルの書き込みと表示
      await fs.writeFile(finalOutputPath, documentation);
      const doc = await vscode.workspace.openTextDocument(finalOutputPath);
      await vscode.window.showTextDocument(doc);

      vscode.window.showInformationMessage(
        "Workspace structure has been generated successfully!"
      );
    } catch (error) {
      console.error("Error in workspace structure analysis:", error);
      vscode.window.showErrorMessage(
        `Failed to generate workspace structure: ${error}`
      );
    }
  }

  private async analyzeWorkspace(rootPath: string): Promise<string> {
    const ignorePatterns = await this.loadGitignorePatterns(rootPath);
    let markdown =
      "# Workspace Structure\n\nFiles listed in .gitignore will be excluded.\n\n";

    // Project Info from package.json
    try {
      const packageJsonPath = path.join(rootPath, "package.json");
      const packageJsonExists = await fs
        .access(packageJsonPath)
        .then(() => true)
        .catch(() => false);

      if (packageJsonExists) {
        const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
        const packageJson = JSON.parse(packageJsonContent);
        markdown += `## Project Info\n`;
        markdown += `- Name: ${packageJson.name}\n`;
        markdown += `- Version: ${packageJson.version}\n`;
        markdown += `- Description: ${
          packageJson.description || "No description provided"
        }\n\n`;
      }
    } catch (error) {
      console.error("Error reading package.json:", error);
    }

    // Configuration Files
    markdown += "## Configuration Files\n\n";
    const configFiles = ["requirements.txt", "pyproject.toml", "package.json"];
    for (const configFile of configFiles) {
      const configFilePath = path.join(rootPath, configFile);
      try {
        const configExists = await fs
          .access(configFilePath)
          .then(() => true)
          .catch(() => false);

        if (configExists) {
          const content = await fs.readFile(configFilePath, "utf-8");
          markdown += `### ${configFile}\n\`\`\`\n${content}\n\`\`\`\n\n`;
        }
      } catch (error) {
        console.error(`Error reading ${configFile}:`, error);
      }
    }

    // File Structure
    markdown += `## File Structure\n\n`;
    markdown += await this.scanDirectory(rootPath, ignorePatterns);

    return markdown;
  }

  private async scanDirectory(
    dirPath: string,
    ignorePatterns: string[],
    level: number = 0
  ): Promise<string> {
    let content = "";
    const indent = "  ".repeat(level);

    try {
      const files = await fs.readdir(dirPath);

      for (const file of files.sort()) {
        // ファイルを名前順にソート
        const fullPath = path.join(dirPath, file);
        const relativePath = path.relative(dirPath, fullPath);
        const stats = await fs.stat(fullPath);

        if (this.isIgnored(relativePath, ignorePatterns)) {
          continue;
        }

        if (stats.isDirectory()) {
          content += `${indent}- 📁 ${file}/\n`;
          content += await this.scanDirectory(
            fullPath,
            ignorePatterns,
            level + 1
          );
        } else {
          const ext = path.extname(file);
          content += `${indent}- 📄 ${file}\n`;

          if ([".js", ".ts", ".jsx", ".tsx", ".vue", ".py"].includes(ext)) {
            const fileContent = await fs.readFile(fullPath, "utf-8");
            const analysis = this.analyzeFileContent(fileContent, ext);
            content += this.formatAnalysis(analysis, indent);
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dirPath}:`, error);
    }

    return content;
  }

  private formatAnalysis(analysis: FileAnalysis, indent: string): string {
    let content = "";

    if (analysis.imports.length > 0) {
      content += `${indent}  - Imports:\n`;
      analysis.imports.forEach((imp: string) => {
        content += `${indent}    - ${imp}\n`;
      });
    }

    if (analysis.exports.length > 0) {
      content += `${indent}  - Exports:\n`;
      analysis.exports.forEach((exp: string) => {
        content += `${indent}    - ${exp}\n`;
      });
    }

    if (analysis.functions.length > 0) {
      content += `${indent}  - Functions:\n`;
      analysis.functions.forEach((func: string) => {
        content += `${indent}    - ${func}\n`;
      });
    }

    if (analysis.classes.length > 0) {
      content += `${indent}  - Classes:\n`;
      analysis.classes.forEach((cls: string) => {
        content += `${indent}    - ${cls}\n`;
      });
    }

    if (analysis.methods.length > 0) {
      content += `${indent}  - Methods:\n`;
      analysis.methods.forEach((method: string) => {
        content += `${indent}    - ${method}\n`;
      });
    }

    if (analysis.components.length > 0) {
      content += `${indent}  - Components:\n`;
      analysis.components.forEach((component: string) => {
        content += `${indent}    - ${component}\n`;
      });
    }

    return content;
  }
}
