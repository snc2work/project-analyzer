# Project Analyzer

A VS Code extension that analyzes project structure and records terminal activities. This tool is designed to help developers efficiently share project overviews when consulting with AI about coding issues.

## Features

### 1. Project Structure Analysis (`projectAnalyzer.generateStructure`)

Analyzes the entire project structure and generates detailed documentation.

- Generates `project-structure.md` in the project's root directory
- Excludes files listed in .gitignore
- Documentation structure includes:
  - Project information (name, version, description)
  - Configuration files content (e.g., package.json)
  - Detailed file structure with:
    - Directory hierarchy using icons (📁 for directories, 📄 for files)
    - For JavaScript (.js), TypeScript (.ts), and Python (.py) files:
      - Import statements
      - Exports
      - Functions
      - Components
      - Methods
      - Classes

Example output structure:

```markdown
# Workspace Structure

Files listed in .gitignore will be excluded.

## Project Info

- Name: [project name]
- Version: [version]
- Description: [description]

## Configuration Files

[Content of important configuration files]

## File Structure

- 📄 file.ts
  - Imports: [list of imports]
  - Exports: [list of exports]
  - Functions: [list of functions]
  - Components: [list of components]
```

### 2. Terminal Activity Logging

A terminal operation logging feature that can be controlled via the "Terminal Log" button in the status bar.

- Records all operations in the active terminal
- Start/stop recording with a single click of the button
- Logs are saved as `terminal.log` in the project's root directory

Note:

- Some command outputs are not recorded (e.g., node -v, ls, etc.)

## Installation

1. Open VS Code
2. Open Quick Open (Ctrl+P)
3. Run the following command:
   ```
   ext install project-analyzer
   ```

## Usage

### Project Structure Analysis

1. Open the Command Palette (Ctrl+Shift+P)
2. Select `Project Analyzer: Generate Structure`
3. `project-structure.md` will be generated in the root directory

### Terminal Logging

1. Click the "Terminal Log" button in the status bar
2. The button will be highlighted while recording
3. Click again to stop recording
4. Logs are saved in `terminal.log`

## Primary Use Cases

- Reference material for AI coding consultations
- Understanding project structure
- Recording and reproducing terminal operations
- Debugging assistance

## Contributing

Bug reports and feature improvement suggestions are welcome on our GitHub Issues page.

## License

[MIT License](LICENSE)

## Release Notes

### 0.0.1

- Initial release
- Project structure analysis feature with detailed code analysis
- Terminal logging feature
