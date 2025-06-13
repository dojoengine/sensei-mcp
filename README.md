# Sensei MCP

Sensei MCP is a Model Context Protocol (MCP) server that provides expert guidance for Dojo and Cairo development on Starknet. It serves as your personal Dojo Sensei, offering specialized knowledge and assistance for building onchain worlds using the Dojo Entity Component System (ECS) framework.

## Features

- **Expert Cairo Guidance**: Get help with Cairo's unique ownership, memory, and type systems
- **Dojo ECS Architecture**: Learn about Models, Systems, and World patterns
- **Smart Contract Development**: Best practices for Starknet smart contracts
- **Specialized Tools**: Access topic-specific tools for models, systems, testing, and more

## Using with Cursor

### Installation

> See the [official Cursor docs](https://docs.cursor.com/context/model-context-protocol#manual-configuration) for more information on installing and using MCP servers.

To add Sensei to your Cursor IDE:

1. Open Cursor command palette (⌘+Shift+P)
2. Type in "Cursor Settings" to open up the settings menu
3. Navigate to "MCP Tools" and click "New MCP Server"
4. Add the following configuration to `mcp.json`:
```json
{
  "mcpServers": {
    "sensei": {
      "type": "command",
      "command": "npx github:dojoengine/sensei-mcp",
      "enabled": true
    }
  }
}
```
5. Save the file

Cursor will attempt to initialise the server.
Once initialised, the menu should look like this:

<img width="647" alt="Screenshot 2025-06-12 at 6 04 39 PM" src="https://github.com/user-attachments/assets/4c42ad84-39ce-49a3-bb92-bf3573693e8b" />

> Note: you may need to install the server manually by running `npx github:dojoengine/sensei-mcp` in your terminal before Cursor will pick it up.

### Use

Once installed, Cursor Agent will **automatically query Sensei** when appropriate.
Follow these best practices for optimal results:

1. **Always mention the specialized tools**: Explicitly ask the agent to use Sensei's specialized tools (e.g., "Please use the dojo_model tool to help me create a model").

2. **Follow the incremental development approach**:
   - Start with project setup using `dojo_101`
   - Define models first using `dojo_model`
   - Implement systems next using `dojo_logic`
   - Configure the project last using `dojo_config`
   - Add tests using `dojo_test`

3. **Be specific in your requests**: For example, instead of asking "Help me with my Dojo game," say "Please use the dojo_model tool to help me create a Position model for my game."

4. **Break down complex tasks**: Ask for help with one component at a time rather than requesting an entire game implementation at once.

Example prompt:
```
I'm building a Dojo game. First, please use the dojo_101 tool to help me set up the project structure.
After that, I'll need help creating the models using the dojo_model tool.
```

### Running Directly

You can also run Sensei MCP directly:

```bash
npx github:dojoengine/sensei-mcp
```

## Available Tools

Sensei provides specialized tools for different aspects of Dojo development:

- **dojo_101**: Beginner-friendly introduction to Dojo development
- **dojo_config**: Essential guidance for configuring Dojo projects
- **dojo_logic**: Expert guidance on implementing Dojo systems and game logic
- **dojo_model**: Specialized guidance for creating and working with Dojo models
- **dojo_test**: Comprehensive guide for writing tests for Dojo applications
- **dojo_token**: Detailed guidance on implementing token standards in Dojo

### How to Use Tools

When chatting with Sensei, you can ask for specific guidance by mentioning the tool name:

```
Can you help me understand how to create a model in Dojo?
```

Sensei will automatically use the appropriate tool (in this case, `dojo_model`) to provide specialized guidance.

### Recommended Development Workflow

For the best results, follow this incremental development approach:

1. **Project Setup** (use `dojo_101`)
   - Initialize your project with `sozo init`
   - Understand the project structure
   - Remove or replace boilerplate code

2. **Define Models** (use `dojo_model`)
   - Create your game state models
   - Ensure proper trait derivation
   - Set up key fields correctly

3. **Implement Systems** (use `dojo_logic`)
   - Create system contracts
   - Implement game mechanics
   - Handle state changes

4. **Project Configuration** (use `dojo_config`)
   - Set up Scarb.toml
   - Configure Dojo profiles
   - Manage dependencies

5. **Testing** (use `dojo_test`)
   - Write comprehensive tests
   - Verify game logic

This workflow ensures you build your Dojo application in a structured, methodical way, leveraging the specialized knowledge of each tool at the appropriate stage of development.

## Core Expertise

Sensei has deep expertise in:

- Cairo programming language (including its unique ownership, memory, and type system)
- Dojo ECS architecture (Models, Systems, and World)
- Smart contract development on Starknet
- Best practices for onchain game development

## Development

### Project Structure

- `bin/`: Contains the executable script
- `src/`: Source code for the MCP server
- `prompts/`: Text prompts for different aspects of Dojo development
- `resources/`: Additional resources used by the prompts

### Building from Source

```bash
# Clone the repository
git clone https://github.com/dojoengine/sensei-mcp.git
cd sensei-mcp

# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm start
```
