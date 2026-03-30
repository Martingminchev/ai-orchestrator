import { createParser } from 'eventsource-parser';

const MOONSHOT_API_URL = 'https://api.moonshot.ai/v1/chat/completions';
const DEFAULT_MODEL = 'kimi-k2.5';

// Moonshot API limit is 4MB, use 3.5MB as safe threshold
const MAX_MESSAGE_SIZE = 3500000;

// Default max output tokens - Kimi K2.5 supports up to 96K for reasoning tasks
const DEFAULT_MAX_TOKENS = 16384;

/**
 * Calculate approximate message size for API request
 * @param {Array} messages - Chat messages array
 * @returns {number} Estimated size in bytes
 */
function estimateMessageSize(messages) {
  return JSON.stringify(messages).length;
}

/**
 * Attempt to reduce message size by truncating large content in older messages.
 * Preserves system prompt and most recent messages.
 * @param {Array} messages - Messages array to potentially modify
 * @returns {Array} Modified messages array (new array, original not modified)
 */
function reduceMessageSize(messages) {
  // Work on a deep copy
  const reduced = JSON.parse(JSON.stringify(messages));
  
  // Process from oldest to newest, but skip system and last few messages
  const protectedCount = 3; // Keep last 3 messages intact
  
  for (let i = 0; i < reduced.length - protectedCount; i++) {
    const msg = reduced[i];
    
    // Skip system messages - they're usually small and important
    if (msg.role === 'system') {
      continue;
    }
    
    // Truncate tool results (role: 'tool')
    if (msg.role === 'tool' && msg.content) {
      try {
        const content = typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content;
        let modified = false;
        
        // Truncate large content field
        if (content.content && typeof content.content === 'string' && content.content.length > 5000) {
          content.content = content.content.substring(0, 2000) + 
            '\n...[Truncated for API limit: ' + Math.round(content.content.length/1024) + 'KB]...\n' + 
            content.content.slice(-1000);
          modified = true;
        }
        
        // Truncate files array content
        if (content.files && Array.isArray(content.files)) {
          content.files = content.files.map(f => {
            if (f.content && typeof f.content === 'string' && f.content.length > 3000) {
              return { 
                path: f.path, 
                size: f.size,
                relevance: f.relevance,
                content: f.content.substring(0, 1500) + '\n...[Truncated]...\n' + f.content.slice(-500),
                _apiTruncated: true 
              };
            }
            return f;
          });
          modified = true;
        }
        
        // Truncate matches array
        if (content.matches && Array.isArray(content.matches) && content.matches.length > 20) {
          content.matches = content.matches.slice(0, 20);
          content._matchesTruncated = true;
          modified = true;
        }
        
        if (modified) {
          msg.content = JSON.stringify(content);
        }
      } catch (e) {
        // If not valid JSON, truncate as string
        if (typeof msg.content === 'string' && msg.content.length > 5000) {
          msg.content = msg.content.substring(0, 2000) + 
            '\n...[Truncated for API limit]...\n' + 
            msg.content.slice(-1000);
        }
      }
    }
    
    // Truncate assistant messages with large content
    if (msg.role === 'assistant' && msg.content && msg.content.length > 5000) {
      msg.content = msg.content.substring(0, 2000) + 
        '\n...[Truncated for API limit]...\n' + 
        msg.content.slice(-1000);
    }
    
    // Check if we're under limit now
    if (estimateMessageSize(reduced) < MAX_MESSAGE_SIZE * 0.9) { // 90% of limit
      break;
    }
  }
  
  return reduced;
}

/**
 * Call Moonshot Kimi API
 * @param {string} apiKey - Moonshot API key
 * @param {Array} messages - Chat messages array
 * @param {Object} options - Additional options
 * @returns {Promise<{content: string, toolCalls: Array|null, message: Object, usage: Object, finishReason: string}>}
 */
export async function callKimi(apiKey, messages, options = {}) {
  const {
    model = DEFAULT_MODEL,
    stream = false,
    onChunk = null,
    abortSignal = null,
    tools = null,        // Array of tool definitions
    toolChoice = 'auto',  // 'auto' | 'none' | 'required' | { type: 'function', function: { name: '...' } }
    maxTokens = DEFAULT_MAX_TOKENS
  } = options;

  // Check message size before sending
  let messageSize = estimateMessageSize(messages);
  if (messageSize > 2000000) {
    console.warn(`[Kimi] WARNING: Message size (${Math.round(messageSize/1024)}KB) approaching 3.5MB limit`);
  }
  
  // Attempt to reduce if over limit
  if (messageSize > MAX_MESSAGE_SIZE) {
    console.log(`[Kimi] Message too large (${Math.round(messageSize/1024)}KB), attempting auto-reduction...`);
    messages = reduceMessageSize(messages);
    messageSize = estimateMessageSize(messages);
    console.log(`[Kimi] Reduced message size to ${Math.round(messageSize/1024)}KB`);
    
    if (messageSize > MAX_MESSAGE_SIZE) {
      throw new Error(
        `Message size (${messageSize} bytes) exceeds limit (${MAX_MESSAGE_SIZE} bytes) even after reduction. ` +
        `Please simplify your request or break it into smaller tasks. The API limit is 4MB.`
      );
    }
  }
  
  console.log(`[Kimi] Sending request with ${messages.length} messages, ~${Math.round(messageSize / 1024)}KB`);

  // kimi-k2.5 does not allow temperature, top_p, n, presence_penalty, frequency_penalty
  const requestBody = {
    model,
    messages,
    stream,
    max_tokens: maxTokens,
  };

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice;
  }

  const response = await fetch(MOONSHOT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    
    // Handle tool-related errors specifically
    if (errorData.error?.code === 'invalid_tools') {
      throw new Error(`Moonshot API tool error: Invalid tool definition - ${errorMessage}`);
    }
    if (errorData.error?.code === 'tool_call_failed') {
      throw new Error(`Moonshot API tool error: Tool call failed - ${errorMessage}`);
    }
    
    throw new Error(
      `Moonshot API error: ${response.status} - ${errorMessage}`
    );
  }

  if (stream) {
    return handleStreamingResponse(response, onChunk);
  } else {
    return handleNonStreamingResponse(response);
  }
}

/**
 * Handle non-streaming response
 */
async function handleNonStreamingResponse(response) {
  const data = await response.json();
  const message = data.choices[0]?.message;
  
  return {
    content: message?.content || '',
    toolCalls: message?.tool_calls || null,
    message: message || null,
    usage: data.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    finishReason: data.choices[0]?.finish_reason || null,
  };
}

/**
 * Handle streaming response using eventsource-parser
 */
async function handleStreamingResponse(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let content = '';
  let usage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  
  // Tool calls accumulator - indexed by tool call index
  let toolCallsAccumulator = {};
  let finishReason = null;

  return new Promise((resolve, reject) => {
    const parser = createParser((event) => {
      if (event.type === 'event') {
        const data = event.data;
        
        if (data === '[DONE]') {
          // Build final tool calls array from accumulator
          const toolCalls = buildToolCallsFromAccumulator(toolCallsAccumulator);
          
          // Build the full message object
          const message = {
            role: 'assistant',
            content: content || null,
          };
          if (toolCalls && toolCalls.length > 0) {
            message.tool_calls = toolCalls;
          }
          
          resolve({
            content,
            toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
            message,
            usage,
            finishReason,
          });
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          
          // Extract content delta
          if (delta?.content) {
            content += delta.content;
            if (onChunk) {
              onChunk(delta.content);
            }
          }
          
          // Handle tool calls delta
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;
              
              // Initialize accumulator for this tool call if needed
              if (!toolCallsAccumulator[index]) {
                toolCallsAccumulator[index] = {
                  id: '',
                  type: 'function',
                  function: {
                    name: '',
                    arguments: '',
                  },
                };
              }
              
              const acc = toolCallsAccumulator[index];
              
              // Accumulate tool call data
              if (toolCallDelta.id) {
                acc.id = toolCallDelta.id;
              }
              if (toolCallDelta.type) {
                acc.type = toolCallDelta.type;
              }
              if (toolCallDelta.function?.name) {
                acc.function.name += toolCallDelta.function.name;
              }
              if (toolCallDelta.function?.arguments) {
                acc.function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
          
          // Track finish reason
          if (choice?.finish_reason) {
            finishReason = choice.finish_reason;
          }
          
          // Check for usage in the final chunk
          if (parsed.usage) {
            usage = parsed.usage;
          }
        } catch (e) {
          // Ignore parse errors for malformed chunks
          console.warn('Failed to parse SSE chunk:', e.message);
        }
      }
    });

    async function processStream() {
      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            // Stream ended without [DONE] - resolve with what we have
            const toolCalls = buildToolCallsFromAccumulator(toolCallsAccumulator);
            
            const message = {
              role: 'assistant',
              content: content || null,
            };
            if (toolCalls && toolCalls.length > 0) {
              message.tool_calls = toolCalls;
            }
            
            resolve({
              content,
              toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
              message,
              usage,
              finishReason,
            });
            break;
          }
          
          const chunk = decoder.decode(value, { stream: true });
          parser.feed(chunk);
        }
      } catch (error) {
        reject(error);
      }
    }

    processStream();
  });
}

/**
 * Build tool calls array from accumulator object
 * @param {Object} accumulator - Tool calls indexed by their index
 * @returns {Array|null} - Array of tool calls or null if empty
 */
function buildToolCallsFromAccumulator(accumulator) {
  const indices = Object.keys(accumulator).map(Number).sort((a, b) => a - b);
  if (indices.length === 0) {
    return null;
  }
  return indices.map(index => accumulator[index]);
}

/**
 * Build a tool result message to send back to the API
 * @param {string} toolCallId - The ID of the tool call being responded to
 * @param {string|Object} result - The result of the tool execution
 * @returns {Object} - Message object to add to conversation history
 */
export function buildToolResultMessage(toolCallId, result) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: typeof result === 'string' ? result : JSON.stringify(result),
  };
}

/**
 * Build an assistant message with tool calls (for adding to conversation history)
 * @param {string|null} content - Optional text content
 * @param {Array} toolCalls - Array of tool calls from API response
 * @returns {Object} - Message object to add to conversation history
 */
export function buildAssistantToolCallMessage(content, toolCalls) {
  const message = {
    role: 'assistant',
    content: content || null,
  };
  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls;
  }
  return message;
}

/**
 * Create a streaming generator for Kimi responses
 * Yields content chunks and returns final usage stats
 */
export async function* streamKimi(apiKey, messages, options = {}) {
  const {
    model = DEFAULT_MODEL,
    temperature = 0.7,
    maxTokens = DEFAULT_MAX_TOKENS,
    abortSignal = null,
    tools = null,
    toolChoice = 'auto',
  } = options;

  const requestBody = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  // Add tools if provided
  if (tools && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = toolChoice;
  }

  const response = await fetch(MOONSHOT_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData.error?.message || response.statusText;
    
    // Handle tool-related errors specifically
    if (errorData.error?.code === 'invalid_tools') {
      throw new Error(`Moonshot API tool error: Invalid tool definition - ${errorMessage}`);
    }
    if (errorData.error?.code === 'tool_call_failed') {
      throw new Error(`Moonshot API tool error: Tool call failed - ${errorMessage}`);
    }
    
    throw new Error(
      `Moonshot API error: ${response.status} - ${errorMessage}`
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  let usage = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
  
  // Tool calls accumulator
  let toolCallsAccumulator = {};
  let finishReason = null;

  while (true) {
    const { done, value } = await reader.read();
    
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process complete lines
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      
      const data = trimmed.slice(6); // Remove 'data: ' prefix
      
      if (data === '[DONE]') {
        const toolCalls = buildToolCallsFromAccumulator(toolCallsAccumulator);
        return {
          usage,
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
          finishReason,
        };
      }
      
      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta;
        
        // Yield content chunks
        if (delta?.content) {
          yield { type: 'content', content: delta.content };
        }
        
        // Handle tool calls delta
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;
            
            // Initialize accumulator for this tool call if needed
            if (!toolCallsAccumulator[index]) {
              toolCallsAccumulator[index] = {
                id: '',
                type: 'function',
                function: {
                  name: '',
                  arguments: '',
                },
              };
            }
            
            const acc = toolCallsAccumulator[index];
            
            // Accumulate tool call data
            if (toolCallDelta.id) {
              acc.id = toolCallDelta.id;
            }
            if (toolCallDelta.type) {
              acc.type = toolCallDelta.type;
            }
            if (toolCallDelta.function?.name) {
              acc.function.name += toolCallDelta.function.name;
            }
            if (toolCallDelta.function?.arguments) {
              acc.function.arguments += toolCallDelta.function.arguments;
              
              // Yield tool call argument chunk for progress tracking
              yield {
                type: 'tool_call_delta',
                index,
                id: acc.id,
                functionName: acc.function.name,
                argumentsDelta: toolCallDelta.function.arguments,
              };
            }
          }
        }
        
        // Track finish reason
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
        
        if (parsed.usage) {
          usage = parsed.usage;
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }

  const toolCalls = buildToolCallsFromAccumulator(toolCallsAccumulator);
  return {
    usage,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : null,
    finishReason,
  };
}

export { DEFAULT_MODEL };
