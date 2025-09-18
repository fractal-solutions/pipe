import { AsyncFlow, AsyncNode, Node } from '@fractal-solutions/qflow';
import { AgentNode, DeepSeekLLMNode, ShellCommandNode, ReadFileNode, WriteFileNode, ListDirectoryNode } from '@fractal-solutions/qflow/nodes';

// Define a type for the messages that the agent will process
interface AgentMessage {
  type: 'user' | 'agent' | 'tool' | 'thought' | 'llm_input' | 'llm_output'; // Added llm_input/output types
  content: string;
}

// Custom Tool to get user input via the TUI
class CustomUserInputTool extends AsyncNode {
  private onAgentQuery: (prompt: string) => Promise<string>;

  constructor(onAgentQuery: (prompt: string) => Promise<string>) {
    super();
    this.onAgentQuery = onAgentQuery;
  }

  // The tool name that the AgentNode will use
  name = 'user_input_tool';
  description = 'Prompts the user for input and waits for their response.';
  parameters = {
    type: 'object',
    properties: {
      prompt: {
        type: 'string',
        description: 'The message to display to the user when asking for input.',
      },
    },
    required: ['prompt'],
  };

  async execAsync(prepRes: any, shared: any): Promise<any> {
    const { prompt } = this.params; // Access parameters set by the AgentNode
    if (!prompt) {
      throw new Error('Prompt is required for user_input_tool.');
    }
    // Call the external function to get user input from the TUI
    const userInput = await this.onAgentQuery(prompt);
    return { userInput };
  }
}

// RobustAgentNode with custom parseLLMResponse logic
class RobustAgentNode extends AgentNode {
  parseLLMResponse(llmResponse: any) {
    // Log raw LLM response for debugging
    // console.log('RAW LLM RESPONSE:', llmResponse);

    // If it's a string, try to parse it as JSON. If not, treat as thought.
    if (typeof llmResponse === 'string') {
      // Attempt to extract JSON from string if it's embedded
      const firstBrace = llmResponse.indexOf('{');
      const lastBrace = llmResponse.lastIndexOf('}');
      let jsonString = llmResponse;

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonString = llmResponse.substring(firstBrace, lastBrace + 1);
      } else {
        // If no braces found, it's definitely not JSON, treat as thought
        return { thought: llmResponse, toolCalls: [], parallel: false };
      }

      // Now, try to parse the extracted string as JSON
      try {
        const parsed = JSON.parse(jsonString);
        if (parsed.thought !== undefined && Array.isArray(parsed.tool_calls)) {
          return {
            thought: parsed.thought,
            toolCalls: parsed.tool_calls,
            parallel: parsed.parallel || false,
          };
        }
      } catch (e) {
        // JSON parsing failed, or not in expected format.
        // Fall through to treat the original llmResponse as a plain text thought.
      }
      // If parsing failed or not in expected format, treat the original string as a thought
      return { thought: llmResponse, toolCalls: [], parallel: false };
    }

    // If it's an object, assume it's an OpenAI-like response and process it.
    const rawData = llmResponse;
    if (rawData.choices && rawData.choices.length > 0 && rawData.choices[0] && rawData.choices[0].message) {
      const message = rawData.choices[0].message;

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCalls = message.tool_calls.map((tc: any) => ({
          tool: tc.function.name,
          parameters: JSON.parse(tc.function.arguments)
        }));
        const thought = message.reasoning_content || `Calling tool(s): ${toolCalls.map((tc: any) => tc.tool).join(', ')}`;
        return { thought, toolCalls, parallel: false };
      } else if (typeof message.content === 'string') {
        // Recursively call parseLLMResponse for the content string
        return this.parseLLMResponse(message.content);
      }
    }

    // Fallback for unexpected LLM response structures
    return { thought: JSON.stringify(llmResponse), toolCalls: [], parallel: false };
  }
}

// Custom LoggingDeepSeekLLMNode
class LoggingDeepSeekLLMNode extends DeepSeekLLMNode {
  private onAgentMessage: (message: AgentMessage) => void;

  constructor(onAgentMessage: (message: AgentMessage) => void) {
    super();
    this.onAgentMessage = onAgentMessage;
  }

  // Implement preparePrompt as required by AgentNode
  preparePrompt(shared: any): string {
    // The AgentNode sets the prompt in this.params.prompt
    const prompt = this.params.prompt;
    if (!prompt) {
      this.onAgentMessage({ type: 'agent', content: 'LLM Error: preparePrompt received empty prompt.' });
      return ''; // Return empty string or throw error
    }
    return prompt;
  }

  async execAsync(prepRes: any, shared: any): Promise<any> {
    const prompt = this.params.prompt; // Assuming prompt is set in params
    this.onAgentMessage({ type: 'llm_input', content: `Sending prompt to LLM: ${prompt}` });

    try {
      const llmResponse = await super.execAsync(prepRes, shared);
      this.onAgentMessage({ type: 'llm_output', content: `Received raw LLM response: ${JSON.stringify(llmResponse)}` });
      return llmResponse;
    } catch (error: any) {
      this.onAgentMessage({ type: 'agent', content: `LLM Error: ${error.message}` });
      throw error; // Re-throw to propagate the error
    }
  }
}

class QflowAgent {
  private agentFlow: AsyncFlow;
  private agentNode: RobustAgentNode; // Use RobustAgentNode
  private llm: LoggingDeepSeekLLMNode; // Use LoggingDeepSeekLLMNode
  private tools: Record<string, Node | AsyncNode>;
  private onAgentMessage: (message: AgentMessage) => void;

  constructor(onAgentMessage: (message: AgentMessage) => void, onAgentQuery: (prompt: string) => Promise<string>) {
    this.onAgentMessage = onAgentMessage;

    // Verify DEEPSEEK_API_KEY
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      this.onAgentMessage({ type: 'agent', content: 'WARNING: DEEPSEEK_API_KEY is not set. Agent LLM functionality will be limited or fail.' });
    }

    // Initialize LLM
    this.llm = new LoggingDeepSeekLLMNode(onAgentMessage); // Pass onAgentMessage to LoggingLLMNode
    this.llm.setParams({ apiKey: deepseekApiKey || '' });

    // Initialize tools, including our custom user input tool
    this.tools = {
      shell_command: new ShellCommandNode(),
      read_file: new ReadFileNode(),
      write_file: new WriteFileNode(),
      list_directory: new ListDirectoryNode(),
      user_input_tool: new CustomUserInputTool(onAgentQuery),
      // Add other tools as needed
    };

    // Generate system prompt based on available tools
    const toolDefinitions = Object.values(this.tools).map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    const toolDescriptions = toolDefinitions.map(tool => {
      const params = JSON.stringify(tool.parameters);
      return `### ${tool.name}: ${tool.description}\nParameters: ${params}`;
    }).join('\n');

    const systemPrompt = `You are a helpful AI assistant. Your primary goal is to assist the user by executing tasks using the available tools. Once you have completed the task or gathered the necessary information, use the 'finish' tool to provide the summarized findings or answer.\n\nAvailable Tools:\n${toolDescriptions}\n\nCRITICAL: Your response MUST be a single JSON object with 'thought' and 'tool_calls'. DO NOT generate code, prose, or any other text outside of the JSON structure. DO NOT use the 'llm_reasoning' tool. Use the 'finish' tool when you have the final answer.\n\nExample response:\n{\n  "thought": "I need to search for information.",\n  "tool_calls": [\n    {\n      "tool": "duckduckgo_search",\n      "parameters": {\n        "query": "latest AI research"\n      }\n    }\n  ]\n}\n\nWhen you have completed the task, use the 'finish' tool.`;

    this.agentNode = new RobustAgentNode(this.llm, this.tools);
    this.agentNode.setParams({ systemPrompt: systemPrompt }); // Set the system prompt

    // Custom onThought callback to send agent's thoughts to the TUI
    this.agentNode.onThought = (thought: string) => {
      this.onAgentMessage({ type: 'thought', content: thought });
    };

    // Custom onLLMInput and onLLMOutput for detailed logging
    // These are now handled by LoggingDeepSeekLLMNode
    // this.agentNode.onLLMInput = (input: any) => {
    //   this.onAgentMessage({ type: 'llm_input', content: `LLM Input: ${JSON.stringify(input)}` });
    // };

    // this.agentNode.onLLMOutput = (output: any) => {
    //   this.onAgentMessage({ type: 'llm_output', content: `LLM Output: ${JSON.stringify(output)}` });
    // };

    // Custom postAsync to handle agent's output and send it to the TUI
    this.agentNode.postAsync = async (shared: any, prepRes: any, execRes: any) => {
      // The AgentNode's execRes will contain the final answer or tool outputs
      if (execRes && execRes.tool === 'finish') {
        this.onAgentMessage({ type: 'agent', content: `Agent finished: ${execRes.output}` });
      } else if (execRes && execRes.tool) {
        // This is a tool execution, we can log it as an agent action
        this.onAgentMessage({ type: 'tool', content: `Agent used tool: ${execRes.tool} with args: ${JSON.stringify(execRes.args)}` });
      } else {
        // Generic agent output
        this.onAgentMessage({ type: 'agent', content: `Agent output: ${JSON.stringify(execRes)}` });
      }
      return 'default';
    };

    this.agentFlow = new AsyncFlow(this.agentNode);
  }

  async run(goal: string) {
    // DEBUG: QflowAgent.run called.
    this.onAgentMessage({ type: 'agent', content: 'DEBUG: QflowAgent.run called with goal: ' + goal });
    const sharedState = { goal };
    // Set the goal directly on the agentNode before running the flow
    this.agentNode.setParams({ goal: goal }); // FIX: Set goal here
    try {
      // DEBUG: AsyncFlow.runAsync started.
      this.onAgentMessage({ type: 'agent', content: 'DEBUG: AsyncFlow.runAsync started.' });
      await this.agentFlow.runAsync(sharedState);
      // DEBUG: AsyncFlow.runAsync finished.
      this.onAgentMessage({ type: 'agent', content: 'DEBUG: AsyncFlow.runAsync finished.' });
    } catch (error: any) {
      this.onAgentMessage({ type: 'agent', content: `Error: ${error.message}` });
    }
  }
}

export default QflowAgent;
