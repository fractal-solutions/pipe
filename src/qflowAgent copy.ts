import { AsyncFlow, AsyncNode, Node } from '@fractal-solutions/qflow';
import { AgentNode, DeepSeekLLMNode, ShellCommandNode, ReadFileNode, WriteFileNode, ListDirectoryNode, UserInputNode, SystemNotificationNode } from '@fractal-solutions/qflow/nodes';

// Define a type for the messages that the agent will process
interface AgentMessage {
  type: 'user' | 'agent' | 'tool' | 'thought' | 'debug' | 'llm_response';
  content?: string;
  thoughts?: string;
  toolCalls?: { tool: string; args: Record<string, any> }[];
  toolResults?: { toolName: string; args: Record<string, any>; result: any }[];
}

// Custom Tool to get user input via the TUI
// class CustomUserInputTool extends AsyncNode {
//   private onAgentQuery: (prompt: string) => Promise<string>;

//   constructor(onAgentQuery: (prompt: string) => Promise<string>) {
//     super();
//     this.onAgentQuery = onAgentQuery;
//   }

//   // The tool name that the AgentNode will use
//   name = 'user_input_tool';
//   description = 'Prompts the user for input and waits for their response.';
//   parameters = {
//     type: 'object',
//     properties: {
//       prompt: {
//         type: 'string',
//         description: 'The message to display to the user when asking for input.',
//       },
//     },
//     required: ['prompt'],
//   };

//   async execAsync(prepRes: any, shared: any): Promise<any> {
//     const { prompt } = this.params; // Access parameters set by the AgentNode
//     if (!prompt) {
//       throw new Error('Prompt is required for user_input_tool.');
//     }
//     // Call the external function to get user input from the TUI
//     const userInput = await this.onAgentQuery(prompt);
//     return { userInput };
//   }
// }

// RobustAgentNode with custom parseLLMResponse logic
// class RobustAgentNode extends AgentNode {
//   private onAgentMessage: (message: AgentMessage) => void;

//   constructor(llm: any, tools: any, onAgentMessage: (message: AgentMessage) => void) {
//     super(llm, tools);
//     this.onAgentMessage = onAgentMessage;
//   }

//   parseLLMResponse(llmResponse: any) {
//     this.onAgentMessage({ type: 'agent', content: 'DEBUG: Custom parseLLMResponse was called! (Forcing shell_command)' });
//     return {
//       thought: "Forcing shell_command to test AgentNode behavior.",
//       toolCalls: [{
//         tool: 'shell_command',
//         parameters: { command: 'ls -la' }
//       }],
//       parallel: false
//     };
//   }
// }

// Custom LoggingDeepSeekLLMNode
class LoggingDeepSeekLLMNode extends DeepSeekLLMNode {
  private onAgentMessage: (message: AgentMessage) => void;

  constructor(onAgentMessage: (message: AgentMessage) => void) {
    super();
    this.onAgentMessage = onAgentMessage;
  }

  // Implement preparePrompt as required by AgentNode
  override preparePrompt(shared: any): string {
    // The AgentNode sets the prompt in this.params.prompt
    const prompt = this.params.prompt;
    if (!prompt) {
      this.onAgentMessage({ type: 'agent', content: 'LLM Error: preparePrompt received empty prompt.' });
      return ''; // Return empty string or throw error
    }
    return prompt;
  }

  override async execAsync(prepRes: any, shared: any): Promise<any> {
    const prompt = this.params.prompt; // Assuming prompt is set in params
    this.onAgentMessage({ type: 'debug', content: JSON.stringify({ prompt }) });

    try {
      const llmResponse = await super.execAsync(prepRes, shared);
      this.onAgentMessage({ type: 'debug', content: `Raw LLM Response from super.execAsync: ${JSON.stringify(llmResponse)}` });
      const parsedLlmResponse = JSON.parse(llmResponse); // Re-introduce JSON.parse
      // Transform the LLM's response to the format expected by AgentNode
      const transformedResponse = {
        choices: [
          {
            message: {
              content: parsedLlmResponse.thought,
              tool_calls: parsedLlmResponse.tool_calls.map((tc: any) => ({
                function: {
                  name: tc.tool,
                  arguments: JSON.stringify(tc.parameters)
                }
              }))
            }
          }
        ]
      };
      this.onAgentMessage({ type: 'llm_response', content: JSON.stringify(transformedResponse) }); // Use transformedResponse here
      this.onAgentMessage({ type: 'debug', content: `Transformed response: ${JSON.stringify(transformedResponse)}` });
      return transformedResponse;
    } catch (error: any) {
      this.onAgentMessage({ type: 'agent', content: `LLM Error: ${error.message}` });
      throw error; // Re-throw to propagate the error
    }
  }
}

class QflowAgent {
  private agentFlow: AsyncFlow;
  private agentNode: AgentNode; // Use AgentNode
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

    // Initialize tools
    this.tools = {
      shell_command: new ShellCommandNode(),
      read_file: new ReadFileNode(),
      write_file: new WriteFileNode(),
      list_directory: new ListDirectoryNode(),
      user_input: new UserInputNode(), // Use UserInputNode directly
      system_notification: new SystemNotificationNode(),
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

    const systemPrompt = `You are a helpful AI assistant. Your primary goal is to assist the user by executing tasks using the available tools. Once you have completed the task or gathered the necessary information, use the 'finish' tool to provide the summarized findings or answer.\n\nAvailable Tools:\n${toolDescriptions}\n\nCRITICAL: Your response MUST be a single JSON object with 'thought' and 'tool_calls'. If you are providing a final answer, use the 'finish' tool. DO NOT generate code, prose, or any other text outside of the JSON structure. DO NOT use the 'llm_reasoning' tool.\n\nExample response for tool call:\n{\n  "thought": "I need to search for information.",\n  "tool_calls": [\n    {\n      "tool": "duckduckgo_search",\n      "parameters": {\n        "query": "latest AI research"\n      }\n    }\n  ]\n}\n\nExample response for final answer:\n{\n  "thought": "I have completed the task.",\n  "tool_calls": [\n    {\n      "tool": "finish",\n      "parameters": {\n        "output": "The answer to your question is..."\n      }\n    }\n  ]\n}\n\nWhen you have completed the task, use the 'finish' tool.`;

    this.agentNode = new AgentNode(this.llm, this.tools, null); // Use AgentNode directly
    this.agentNode.setParams({ systemPrompt: systemPrompt }); // Set the system prompt

    this.onAgentMessage({ type: 'debug', content: 'Assigning onThought callback.' });
    // Custom onThought callback to send agent's thoughts to the TUI
    this.agentNode.onThought = (thought: string) => {
      this.onAgentMessage({ type: 'debug', content: `onThought callback triggered with thought: ${thought}` });
      this.onAgentMessage({ type: 'agent', thoughts: thought }); // Send thoughts as part of an agent message
    };

    this.agentNode.onToolCall = (toolCall: { tool: string; args: Record<string, any> }) => {
      this.onAgentMessage({ type: 'debug', content: `onToolCall callback triggered with toolCall: ${JSON.stringify(toolCall)}` });
      this.onAgentMessage({ type: 'agent', toolCalls: [toolCall] });
    };

    this.agentNode.onToolResult = (toolName: string, args: Record<string, any>, result: any) => {
      this.onAgentMessage({ type: 'debug', content: `onToolResult callback triggered with toolName: ${toolName}, args: ${JSON.stringify(args)}, result: ${JSON.stringify(result)}` });
      this.onAgentMessage({ type: 'agent', toolResults: [{ toolName, args, result }] });
    };

    // Custom postAsync to handle agent's final output and send it to the TUI
    this.agentNode.postAsync = async (shared: any, prepRes: any, execRes: any) => {
      this.onAgentMessage({ type: 'debug', content: `postAsync execRes: ${JSON.stringify(execRes)}` });
      // The AgentNode's execRes will contain the final answer
      if (execRes && execRes.tool === 'finish') {
        this.onAgentMessage({ type: 'agent', content: `Agent finished: ${execRes.output}` });
      } else {
        // Generic agent output, if any, not covered by onThought, onToolCall, or onToolResult
        this.onAgentMessage({ type: 'debug', content: `Generic agent output in postAsync: ${JSON.stringify(execRes)}` });
      }
      return 'default';
    };

    this.agentFlow = new AsyncFlow(this.agentNode);
  }

  async run(goal: string) {
    // Remove all onAgentMessage calls from here
    const sharedState = { goal };
    this.agentNode.setParams({ goal: goal });
    try {
      await this.agentFlow.runAsync(sharedState);
    } catch (error: any) {
      this.onAgentMessage({ type: 'agent', content: `Error during AsyncFlow execution: ${error.message}` });
      console.error('Error during AsyncFlow execution:', error); // Log to console for more detail
    }
  }
}

export default QflowAgent;

