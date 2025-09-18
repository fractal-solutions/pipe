# Project Plan: Qflow CLI Agent with OpenTUI Interface

## 1. Project Goal

To develop an interactive Command-Line Interface (CLI) agent powered by the `qflow` library, running on `bun`, and featuring a custom Terminal User Interface (TUI) built with `opentui`'s React adaptation. The agent will leverage `qflow`'s robust workflow and agent capabilities, with all user interactions (initial goal setting, subsequent queries, and agent outputs) managed directly through the OpenTUI interface, bypassing `UserInputNode` and `InteractiveInputNode`.

## 2. Core Technologies

*   **Runtime:** Bun
*   **Agent/Workflow Library:** Qflow
*   **Terminal User Interface (TUI):** OpenTUI (using its React reconciler)

## 3. Architecture Overview

The application will follow a client-server-like architecture within a single CLI process:

*   **Bun:** Serves as the high-performance runtime environment for the entire application, executing both the OpenTUI frontend and the Qflow backend logic.
*   **OpenTUI (React Frontend):** Responsible for rendering the interactive TUI, capturing user input, and displaying agent outputs. It acts as the "view" and "controller" for user interaction.
*   **Qflow (Backend Logic):** Houses the core agent intelligence, workflow definitions, and tool execution. It receives commands/goals from the OpenTUI frontend, processes them, and returns results or queries back to the frontend for display.
*   **Communication:** Direct function calls or a simple event-driven mechanism will facilitate communication between the OpenTUI React components and the Qflow agent instance. The OpenTUI input component will send user commands to the Qflow agent, and the Qflow agent will send its outputs/queries back to the OpenTUI chat display component.

## 4. OpenTUI Interface Design

The TUI will feature a split-panel layout:

### Panel 1: File Explorer

*   **Purpose:** Display the contents of the current working directory, allowing the user to browse files and folders relevant to the agent's tasks.
*   **Features:**
    *   List files and subdirectories.
    *   Indicate file types (e.g., directory, file).
    *   Allow navigation into directories and back up.
    *   Highlight selected files/folders.
    *   Potentially integrate with `qflow`'s `FileSystemNode` for displaying file content on selection or for agent actions.

### Panel 2: Chat Interface

*   **Purpose:** Facilitate natural language interaction between the user and the Qflow agent.
*   **Features:**
    *   **User Input Field:** A persistent input area at the bottom for the user to type commands, goals, or responses to agent queries.
    *   **Conversation Log:** A scrollable display area showing:
        *   User's initial goal/commands.
        *   Agent's "thoughts" (if enabled for debugging/transparency).
        *   Agent's actions (tool calls and their parameters).
        *   Agent's outputs (results from tool calls, final answers).
        *   Agent's queries to the user (e.g., "Please confirm action X," "What value should I use for Y?").
    *   **Status Indicators:** Potentially show agent status (e.g., "thinking," "executing tool," "waiting for input").

## 5. Qflow Agent Implementation

### Core Agent Logic

*   **`AgentNode`:** The central component. It will be instantiated with a suitable LLM (e.g., `AgentDeepSeekLLMNode` or `AgentOpenRouterLLMNode` depending on configuration) and a set of available tools.
*   **Tool Integration:** A comprehensive set of `qflow` nodes will be exposed as tools to the `AgentNode`. Initial candidates include:
    *   `ShellCommandNode`: For executing system commands.
    *   `ReadFileNode`, `WriteFileNode`, `ListDirectoryNode`: For file system interactions.
    *   `DuckDuckGoSearchNode` / `GoogleSearchNode`: For web search.
    *   `HttpRequestNode`: For generic API calls.
    *   `WebScraperNode`: For extracting web content.
    *   `CodeInterpreterNode`: For executing code (e.g., Python).
    *   `MemoryNode` / `SemanticMemoryNode`: For persistent memory and RAG.
    *   `TransformNode`: For data manipulation.
*   **Goal Handling:** The initial goal for the `AgentNode` will be passed from the OpenTUI chat input field.
*   **Custom User Interaction Loop:**
    *   Instead of `UserInputNode`, the `AgentNode` will be configured to "output" its queries for user input in a structured format (e.g., a specific JSON object or string pattern) that the OpenTUI chat panel can parse.
    *   The OpenTUI chat panel will then display this query to the user and wait for a response in its input field.
    *   The user's response will be fed back into the `AgentNode` to continue its execution.
    *   This requires careful handling of the `AgentNode`'s `postAsync` or a custom tool that mimics `UserInputNode` but interfaces with the TUI.

### State Management

*   The `shared` object in `qflow` will manage the agent's internal state, conversation history, and data passed between nodes.
*   The OpenTUI frontend will need to subscribe to updates from the `qflow` agent to refresh the chat log and file explorer (if file system changes occur).

## 6. Development Steps (High-Level)

1.  **Project Setup:**
    *   Initialize a new Bun project.
    *   Install `@opentui/react` and `@fractal-solutions/qflow` dependencies.
    *   Configure `tsconfig.json` for React and Bun.
2.  **Basic OpenTUI Layout:**
    *   Create a root React component for the TUI.
    *   Implement a basic split-panel layout using OpenTUI components.
3.  **File Explorer Panel Implementation:**
    *   Develop a React component to list directory contents.
    *   Integrate `qflow`'s `ListDirectoryNode` (or a direct Bun `fs` call) to fetch directory data.
    *   Implement basic navigation (up, down, enter, back).
4.  **Chat Panel (User Input & Display):**
    *   Create a React component for the chat log display.
    *   Implement an input field component for user commands.
    *   Set up state management within the React app to hold the conversation history.
5.  **Integrate Qflow Agent Core:**
    *   Instantiate an `AsyncFlow` containing an `AgentNode`.
    *   Configure the `AgentNode` with a basic set of `qflow` tools (e.g., `ShellCommandNode`, `ReadFileNode`).
    *   Set up the LLM for the `AgentNode` (e.g., `AgentDeepSeekLLMNode`).
6.  **Connect TUI to Qflow Agent:**
    *   Establish a mechanism for the TUI's input field to send user commands/goals to the `qflow` agent.
    *   Implement a callback or event listener in the TUI to receive and display agent outputs/queries. This will involve modifying the `AgentNode`'s interaction to output to the TUI instead of using `UserInputNode`.
7.  **Refine Agent Interaction:**
    *   Develop a custom `qflow` node or modify the `AgentNode`'s `postAsync` to handle agent-to-user queries via the TUI.
    *   Ensure the TUI correctly parses and displays these queries and feeds user responses back to the agent.
8.  **Expand Agent Tools:**
    *   Incrementally add more `qflow` tools to the `AgentNode` as needed, testing each integration.
9.  **Testing and Debugging:**
    *   Write unit tests for individual `qflow` nodes and React components.
    *   Implement integration tests for the full TUI-agent interaction loop.
    *   Utilize Bun's debugging capabilities.
