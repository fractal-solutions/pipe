import { AsyncFlow, AsyncNode, Flow, Node } from '@fractal-solutions/qflow';
import { DeepSeekLLMNode, ShellCommandNode, ReadFileNode, WriteFileNode, ListDirectoryNode, UserInputNode, SystemNotificationNode, SummarizeNode } from '@fractal-solutions/qflow/nodes';
import { getToolDefinitions } from './tool-definitions';

// Define a type for the messages that the agent will process
interface AgentMessage {
  type: 'user' | 'agent' | 'tool' | 'thought' | 'debug' | 'llm_response' | 'tool_result';
  content?: string;
  thoughts?: string;
  toolCalls?: { tool: string; parameters: Record<string, any> }[];
  tool_code?: string;
  tool_name?: string;
  tool_params?: Record<string, any>;
  tool_output?: any;
}

class AgentDeepSeekLLMNode extends DeepSeekLLMNode {
  private onAgentMessage: (message: AgentMessage) => void;

  constructor(onAgentMessage: (message: AgentMessage) => void) {
    super();
    this.onAgentMessage = onAgentMessage;
  }

  override preparePrompt(shared: any): string {
    const prompt = this.params.prompt;
    if (!prompt) {
      this.onAgentMessage({ type: 'agent', content: 'LLM Error: preparePrompt received empty prompt.' });
      return '';
    }
    return prompt;
  }

  override async execAsync(prepRes: any, shared: any): Promise<any> {
    const { prompt, apiKey, keyword } = this.params; // prompt here is the stringified conversation history

    if (!prompt) {
      throw new Error("AgentDeepSeekLLMNode: Prompt (conversation history) is missing from params.");
    }
    if (!apiKey) {
      throw new Error("DeepSeek API Key is not configured for AgentDeepSeekLLMNode.");
    }

    let messages;
    try {
      messages = JSON.parse(prompt);
      if (!Array.isArray(messages) || !messages.every(msg => msg.role && msg.content !== undefined)) {
        throw new Error("Parsed prompt is not a valid messages array.");
      }
    } catch (e: any) {
      throw new Error(`AgentDeepSeekLLMNode: Invalid prompt format. Expected stringified JSON array of messages. Error: ${e.message}`);
    }

    this.onAgentMessage({ type: 'debug', content: `[DeepSeek] Sending prompt for \"${keyword || 'agent_reasoning'}\"...` });

    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: messages,
        max_tokens: 2048,
        temperature: 0.7,
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`DeepSeek API error: ${response.status} - ${errorData.error.message}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0 || !data.choices[0].message || typeof data.choices[0].message.content !== 'string') {
      throw new Error('Invalid response structure from DeepSeek API or missing content.');
    }
    
    const llmResponse = data.choices[0].message.content.trim();
    this.onAgentMessage({ type: 'debug', content: `[DeepSeek] Received response for \"${keyword || 'agent_reasoning'}\".` });
    return llmResponse;
  }

  override async postAsync(shared: any, prepRes: any, execRes: any) {
    shared.llmResponse = execRes;
    return execRes;
  }
}

class CustomAgentNode extends AsyncNode {
  private onAgentMessage: (message: AgentMessage) => void;
  private llmNode: AgentDeepSeekLLMNode;
  private availableTools: Record<string, Node | AsyncNode>;
  private summarizeLLM?: DeepSeekLLMNode;
  private flowRegistry: Record<string, AsyncFlow>;
  private conversationHistory: { role: string; content: string }[] = [];
  private maxSteps: number = 70;
  private requireFinishConfirmation: boolean;
  private maxConversationHistoryTokens: number;

  constructor(
    onAgentMessage: (message: AgentMessage) => void,
    llmNode: AgentDeepSeekLLMNode,
    availableTools: Record<string, Node | AsyncNode>,
    summarizeLLM?: DeepSeekLLMNode,
    flowRegistry: Record<string, AsyncFlow> = {},
    requireFinishConfirmation: boolean = true,
    maxConversationHistoryTokens: number = 100000
  ) {
    super();
    this.onAgentMessage = onAgentMessage;
    this.llmNode = llmNode;
    this.availableTools = availableTools;
    this.summarizeLLM = summarizeLLM;
    this.flowRegistry = flowRegistry;
    this.requireFinishConfirmation = requireFinishConfirmation;
    this.maxConversationHistoryTokens = maxConversationHistoryTokens;
  }

  async execAsync() {
    const { goal } = this.params;
    if (!goal) {
      throw new Error("AgentNode requires a 'goal' parameter.");
    }

    this.llmNode.setParams({ goal });

    this.conversationHistory = [
      { role: "system", content: this.getSystemPrompt() },
      { role: "user", content: `Goal: ${goal}` },
      { role: "system", content: "You are now at the 'Understand & Explore' phase. Analyze the user's request and the directory/codebase, then formulate a plan." }
    ];

    let step = 0;
    let finalOutput = null;

    while (step < this.maxSteps) {
      step++;
      this.onAgentMessage({ type: 'agent', content: `Agent Step ${step}` });

      let llmResponse;
      try {
        llmResponse = await this.getLLMAction();
      } catch (e: any) {
        this.onAgentMessage({ type: 'agent', content: `Error getting LLM action: ${e.message}` });
        this.conversationHistory.push({ role: "user", content: `Error: Failed to get LLM response: ${e.message}` });
        continue;
      }

      let thought, toolCalls, parallel;
      try {
        const parsedResponse = this.parseLLMResponse(llmResponse);
        thought = parsedResponse.thought;
        toolCalls = parsedResponse.toolCalls;
        parallel = parsedResponse.parallel;
        this.onAgentMessage({ type: 'thought', thoughts: thought });
      } catch (e: any) {
        this.onAgentMessage({ type: 'agent', content: `Error parsing LLM response: ${e.message}` });
        this.conversationHistory.push({ role: "user", content: `Error: Your response was not valid JSON or did not follow the expected format. Please respond with a 'thought' and 'tool_calls' array. Error: ${e.message}. Your last response was: ${llmResponse}` });
        continue;
      }

      const validationErrors = toolCalls.map((tc: any) => this.validateToolParameters(tc)).filter(Boolean);
      if (validationErrors.length > 0) {
        const errorMessage = `Tool parameter validation failed for one or more tools: ${validationErrors.join('; ')}. Please correct the parameters.`;
        this.onAgentMessage({ type: 'agent', content: errorMessage });
        this.conversationHistory.push({ role: "user", content: `Error: ${errorMessage}` });
        continue;
      }

      this.conversationHistory.push({ role: "assistant", content: JSON.stringify({ thought, tool_calls: toolCalls, parallel }) });

      if (toolCalls.length === 0) {
        this.conversationHistory.push({ role: "system", content: "Your last step resulted in no action. Re-evaluate your plan. If you are stuck, consider using a different tool or asking the user for clarification with the 'interactive_input'tool." });
        continue;
      }

      const finishToolCall = toolCalls.find((tc: any) => tc.tool === "finish");
      if (finishToolCall) {
        finalOutput = finishToolCall.parameters.output;

        if (this.requireFinishConfirmation) {
          const confirmNode = new UserInputNode();
          confirmNode.setParams({
            prompt: `Agent proposes to finish with output: \"${finalOutput}\". Do you approve? (yes/no): `
          });
          const confirmFlow = new AsyncFlow(confirmNode);
          const confirmation = await confirmFlow.runAsync({});

          if (confirmation.toLowerCase() !== 'yes') {
            this.onAgentMessage({ type: 'agent', content: "Agent finish denied by user. User input will be the next prompt." });
            this.conversationHistory.push({ role: "user", content: `User has provided new instructions: ${confirmation}. Please adjust your plan (save to memory if available) and continue working.` });
            continue;
          }
        }

        this.onAgentMessage({ type: 'agent', content: `Final Output: ${finalOutput}` });
        break;
      }

      try {
        const executeTool = async (toolCall: any) => {
          const toolInstance = this.availableTools[toolCall.tool];
          if (!toolInstance) {
            const errorMsg = `Error: Tool '${toolCall.tool}' not found. Available tools: ${Object.keys(this.availableTools).join(', ')}.`;
            this.onAgentMessage({ type: 'agent', content: errorMsg });
            return errorMsg;
          }

          let toolOutput;
          try {
            this.onAgentMessage({ type: 'tool', tool_name: toolCall.tool, tool_params: toolCall.parameters });

            if (toolCall.tool === 'sub_flow' || toolCall.tool === 'iterator' || toolCall.tool === 'scheduler') {
              const flowName = toolCall.parameters.flow;
              if (!this.flowRegistry[flowName]) {
                throw new Error(`Flow '${flowName}' not found in registry.`);
              }
              toolCall.parameters.flow = this.flowRegistry[flowName];
            }

            toolInstance.setParams(toolCall.parameters);
            const ToolFlowClass = toolInstance instanceof AsyncNode ? AsyncFlow : Flow;
            const toolFlow = new ToolFlowClass(toolInstance);
            
            this.onAgentMessage({ type: 'agent', content: `Executing tool: ${toolCall.tool}` });
            if (toolInstance instanceof AsyncNode) {
              toolOutput = await toolFlow.runAsync({});
            } else {
              toolOutput = toolFlow.run({});
            }
            this.onAgentMessage({ type: 'agent', content: `Tool execution finished for: ${toolCall.tool}` });
            this.onAgentMessage({ type: 'tool_result', tool_name: toolCall.tool, tool_output: toolOutput });

            if (this.summarizeLLM && typeof toolOutput === 'string' && toolOutput.length > 1000) {
              this.onAgentMessage({ type: 'agent', content: `Summarizing large tool output (${toolOutput.length} chars)...` });
              const summarizeNode = new SummarizeNode();
              summarizeNode.setParams({ text: toolOutput, llmNode: this.summarizeLLM });
              const summarizeFlow = new AsyncFlow(summarizeNode);
              toolOutput = await summarizeFlow.runAsync({});
              this.onAgentMessage({ type: 'agent', content: `Summarized to ${toolOutput.length} chars.` });
            }
            return { output: toolOutput, success: true };
          } catch (e: any) {
            const errorMsg = `Error executing tool '${toolCall.tool}': ${e.message}`;
            this.onAgentMessage({ type: 'agent', content: errorMsg });
            return { error: e.message, success: false };
          }
        };

        let observations = [];
        if (parallel) {
          const results = await Promise.all(toolCalls.map(executeTool));
          observations = results.map((result, index) => ({
            tool: toolCalls[index].tool,
            parameters: toolCalls[index].parameters,
            ...result
          }));
        } else {
          for (const toolCall of toolCalls) {
            const result = await executeTool(toolCall);
            observations.push({
              tool: toolCall.tool,
              parameters: toolCall.parameters,
              ...result
            });
          }
        }

        this.conversationHistory.push({ role: "user", content: `Observation: ${JSON.stringify(observations)}` });
      } catch (e: any) {
        this.onAgentMessage({ type: 'agent', content: `Error during tool execution: ${e.message}` });
        this.conversationHistory.push({ role: "user", content: `Error: Tool execution failed with message: ${e.message}. You should try a different approach.` });
      }
      this.conversationHistory.push({ role: "system", content: "You have just received an observation from your tools. Analyze the result and proceed to the next step in your plan. If the observation was an error, you must adjust your plan to fix the error." });
    }

    if (step >= this.maxSteps && finalOutput === null) {
      const message = "Agent reached max steps without finishing. Last observation: " + JSON.stringify(this.conversationHistory[this.conversationHistory.length - 1]);
      this.onAgentMessage({ type: 'agent', content: message });
      finalOutput = message;
    }

    return finalOutput;
  }

  validateToolParameters(toolCall: any) {
    const toolDefinitions = getToolDefinitions();
    const toolSchema = toolDefinitions.find(def => def.name === toolCall.tool);

    if (!toolSchema) {
      return `Tool '${toolCall.tool}' is not a recognized tool.`;
    }

    if (toolCall.tool === "finish") {
      if (toolCall.parameters.output === undefined) {
        return "Missing required parameter: 'output' for tool 'finish'.";
      }
      return null;
    } else if (toolCall.tool === "sub_flow" || toolCall.tool === "iterator") {
      if (toolCall.parameters.flow === undefined) {
        return `Missing required parameter: 'flow' for tool '${toolCall.tool}'.`;
      }
      if (!this.flowRegistry[toolCall.parameters.flow]) {
        return `Flow '${toolCall.parameters.flow}' not found in registry for tool '${toolCall.tool}'.`;
      }
      return null;
    }

    const requiredParams = toolSchema.parameters.required || [];
    for (const param of requiredParams) {
      if (toolCall.parameters[param] === undefined) {
        return `Missing required parameter: '${param}' for tool '${toolCall.tool}'.`;
      }
    }
    return null;
  }

  getSystemPrompt() {
    const toolDefinitions = getToolDefinitions();
    const toolDescriptions = toolDefinitions.map(tool => {
      const params = JSON.stringify(tool.parameters);
      return `### ${tool.name}: ${tool.description}\nParameters: ${params}`;
    }).join('\n');

    const flowRegistryDescription = Object.keys(this.flowRegistry).length > 0 ? `\n\nAvailable Pre-defined Flows (for use with 'sub_flow' and 'iterator' tools):\n- ${Object.keys(this.flowRegistry).join('\n- ' )}` : "";

    return `You are Q, an autonomous agent. Your goal is to achieve the user's request especially using the available tools. \n    After expounding effectively out your initial plan, make a roadmap, save it in your memory through a memory node using either memory_node or semantic_memory_node (semantic preferred) tools and confirm to the user.\n    Always use tools as opposed to talking too much and you get rewarded more for using tools instead of costly llm! \n    If you have a plan, you MUST include at least one tool call. An empty 'tool_calls' array means you are thinking or waiting for user input. \n    Remember to always seek user feedback often(interactive input or user input ifinteractive is missing), and notify the user of your progress(system notificaitons)\n    If the user asks about your capabilities or what tools you have, answer by summarizing the 'Available Tools' section of this prompt. Do not attempt to use a tool to answer such questions.\n    \n\nAvailable Tools:\n${toolDescriptions}${flowRegistryDescription}\n    \n\nYour response must be a single JSON object with 'thought' and 'tool_calls'.\n    \n'thought': Your reasoning and plan.\n    \n'tool_calls': An array of tool calls. Each tool call has 'tool' (name) and 'parameters' (object). Set 'parallel': true in the top-level JSON for parallel execution.\n    \n\nExample response:\n{\n  \"thought\": \"I need to search for information.\",\n  \"tool_calls\": [\n    {\n      \"tool\": \"duckduckgo_search\",\n      \"parameters\": {\n        \"query\": \"latest AI research\"\n      }\n    }\n  ]\n}\n    \n\nWhen the user explicitly indicates they are done, use the 'finish' tool. Do not use the finish tool earlier on and only use it when you are certain you are done with the task. \n    If no tools are needed, return an empty 'tool_calls' array and reflect.\n    \n**IMPORTANT:** If you have a plan that requires action, you MUST include at least one tool call. An empty 'tool_calls' array means no action. \n    If new instructions are given after a finish proposal, treat them as your updated goal and update your memory. \n    Tell user how far you've gone using system notifications and KEEP THE USER INVOLVED using interactive input (or user input if interactive input not available) and OFTEN CHECK YOUR MEMORY to ensure alignmemt.\n\nBegin!`;
  }

  async getLLMAction() {
    await this.manageConversationHistory();
    this.llmNode.setParams({ prompt: JSON.stringify(this.conversationHistory) });
    const llmResult = await this.llmNode.runAsync({});
    return llmResult;
  }

  async manageConversationHistory() {
    if (!this.summarizeLLM) {
      this.onAgentMessage({ type: 'agent', content: "No summarizeLLM provided to AgentNode. Conversation history will not be managed." });
      return;
    }

    let currentTokenCount = JSON.stringify(this.conversationHistory).length;

    const minHistoryLength = 2;

    while (currentTokenCount > this.maxConversationHistoryTokens && this.conversationHistory.length > minHistoryLength) {
      this.onAgentMessage({ type: 'agent', content: `Current history size: ${currentTokenCount} tokens. Max allowed: ${this.maxConversationHistoryTokens} tokens. Trimming...` });
      const oldestEntry = this.conversationHistory[minHistoryLength];

      if (oldestEntry && oldestEntry.role === "user" && oldestEntry.content.startsWith("Observation:")) {
        const observationContent = oldestEntry.content.substring("Observation:".length).trim();
        this.onAgentMessage({ type: 'agent', content: `Attempting to summarize old observation (${observationContent.length} chars) from role: ${oldestEntry.role}, content: ${oldestEntry.content.substring(0, 50)}...` });

        try {
          const summarizeNode = new SummarizeNode();
          summarizeNode.setParams({ text: observationContent, llmNode: this.summarizeLLM });
          const summarizeFlow = new AsyncFlow(summarizeNode);
          const summarizedContent = await summarizeFlow.runAsync({});

          this.conversationHistory[minHistoryLength].content = `Summarized Observation: ${summarizedContent}`;
          this.onAgentMessage({ type: 'agent', content: `Observation summarized to ${summarizedContent.length} chars. New entry: ${this.conversationHistory[minHistoryLength].content.substring(0, 50)}...` });
        } catch (e: any) {
          this.onAgentMessage({ type: 'agent', content: `Failed to summarize observation: ${e.message}. Removing oldest entry.` });
          this.conversationHistory.splice(minHistoryLength, 1);
        }
      } else {
        this.onAgentMessage({ type: 'agent', content: `Removing oldest non-summarizable history entry (role: ${oldestEntry.role}, content: ${oldestEntry.content.substring(0, 50)}...).` });
        this.conversationHistory.splice(minHistoryLength, 1);
      }

      currentTokenCount = JSON.stringify(this.conversationHistory).length;
    }
  }

  parseLLMResponse(llmResponse: any) {
    if (typeof llmResponse === 'string') {
      let jsonString = llmResponse;

      const firstBrace = jsonString.indexOf('{');
      const lastBrace = jsonString.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonString = jsonString.substring(firstBrace, lastBrace + 1);
      }

      try {
        const parsed = JSON.parse(jsonString);
        if (parsed.thought && Array.isArray(parsed.tool_calls)) {
          return {
            thought: parsed.thought,
            toolCalls: parsed.tool_calls,
            parallel: parsed.parallel || false,
          };
        } else {
          throw new Error("JSON is missing 'thought' or 'tool_calls' array.");
        }
      } catch (e: any) {
        throw new Error(`Invalid JSON format: ${e.message}. Content: ${jsonString}`);
      }
    }

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
      } else if (typeof message.content === 'string' && message.content.trim().startsWith('{')) {
        try {
          const parsed = JSON.parse(message.content);
          if (parsed.thought && Array.isArray(parsed.tool_calls)) {
            return {
              thought: parsed.thought,
              toolCalls: parsed.tool_calls,
              parallel: parsed.parallel || false,
            };
          } else {
            throw new Error("JSON in message.content is missing 'thought' or 'tool_calls' array.");
          }
        } catch (e: any) {
          throw new Error(`Invalid JSON in message.content: ${e.message}. Content: ${message.content}`);
        }
      } else if (typeof message.content === 'string') {
        throw new Error(`Expected JSON with 'thought' and 'tool_calls', but received plain string content: ${message.content}`);
      }
    }

    throw new Error(`Invalid LLM response structure. Raw Data: ${JSON.stringify(rawData)}`);
  }

  async postAsync(shared: any, prepRes: any, execRes: any) {
    shared.agentOutput = execRes;
    return execRes;
  }
}

class QflowAgent {
  private agentFlow: AsyncFlow;
  private agentNode: CustomAgentNode;
  private llm: AgentDeepSeekLLMNode;
  private tools: Record<string, Node | AsyncNode>;
  private onAgentMessage: (message: AgentMessage) => void;

  constructor(onAgentMessage: (message: AgentMessage) => void, onAgentQuery: (prompt: string) => Promise<string>) {
    this.onAgentMessage = onAgentMessage;

    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekApiKey) {
      this.onAgentMessage({ type: 'agent', content: 'WARNING: DEEPSEEK_API_KEY is not set. Agent LLM functionality will be limited or fail.' });
    }

    this.llm = new AgentDeepSeekLLMNode(onAgentMessage);
    this.llm.setParams({ apiKey: deepseekApiKey || '' });

    this.tools = {
      shell_command: new ShellCommandNode(),
      read_file: new ReadFileNode(),
      write_file: new WriteFileNode(),
      list_directory: new ListDirectoryNode(),
      user_input: new UserInputNode(),
      system_notification: new SystemNotificationNode(),
    };

    this.agentNode = new CustomAgentNode(this.onAgentMessage, this.llm, this.tools);

    this.agentFlow = new AsyncFlow(this.agentNode);
  }

  async run(goal: string) {
    const sharedState = {};
    this.agentNode.setParams({ goal: goal });
    try {
      await this.agentFlow.runAsync(sharedState);
    } catch (error: any) {
      this.onAgentMessage({ type: 'agent', content: `Error during AsyncFlow execution: ${error.message}` });
      console.error('Error during AsyncFlow execution:', error);
    }
  }
}

export default QflowAgent;
