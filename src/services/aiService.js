const sendOpenAIMessage = async (messages, model, apiKey, customInstruction, onStream) => {
  try {
    const messagePayload = [...messages];
    if (customInstruction) {
      messagePayload.unshift({ role: 'system', content: customInstruction.content });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messagePayload.map(({ role, content }) => ({ role, content })),
        stream: Boolean(onStream),
        temperature: getAISettings().openai.modelSettings[model]?.temperature,
        ...(getAISettings().openai.modelSettings[model]?.reasoningEffort !== 'none' && {
          reasoning_effort: getAISettings().openai.modelSettings[model].reasoningEffort
        }),
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    if (onStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(5));
              const content = json.choices[0]?.delta?.content;
              if (content) onStream(content);
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }
      return { role: 'assistant', content: '' };
    }

    const data = await response.json();
    return data.choices[0].message;
  } catch (error) {
    console.error('OpenAI API error:', error);
    throw error;
  }
};

const sendGroqMessage = async (messages, model, apiKey, customInstruction, onStream) => {
  try {
    const messagePayload = [...messages];
    if (customInstruction) {
      messagePayload.unshift({ role: 'system', content: customInstruction.content });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: messagePayload.map(({ role, content }) => ({ role, content })),
        stream: Boolean(onStream),
        temperature: getAISettings().groq.modelSettings[model]?.temperature,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    if (onStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(5));
              const content = json.choices[0]?.delta?.content;
              if (content) onStream(content);
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }
      return { role: 'assistant', content: '' };
    }

    const data = await response.json();
    return {
      role: 'assistant',
      content: data.choices[0].message.content,
    };
  } catch (error) {
    console.error('Error in Groq API call:', error);
    throw error;
  }
};

const sendDeepSeekMessage = async (messages, model, apiKey, customInstruction, onStream) => {
  try {
    const messagePayload = [...messages];
    if (customInstruction) {
      messagePayload.unshift({ role: 'system', content: customInstruction.content });
    }

    const bodyConfig = {
      model,
      messages: messagePayload.map(({ role, content }) => ({ role, content })),
      stream: Boolean(onStream),
      temperature: getAISettings().deepseek.modelSettings[model]?.temperature,
    };

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(bodyConfig),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    if (onStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const json = JSON.parse(line.slice(5));
              const content = json.choices[0]?.delta?.content;
              const reasoningContent = json.choices[0]?.delta?.reasoning_content;
              if (content) onStream(content);
              if (reasoningContent) onStream(reasoningContent);
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }
      return { role: 'assistant', content: '' };
    }

    const data = await response.json();
    const responseMessage = {
      role: 'assistant',
      content: data.choices[0].message.content,
    };

    if (model === 'deepseek-reasoner' && data.choices[0].message.reasoning_content) {
      responseMessage.reasoning_content = data.choices[0].message.reasoning_content;
    }

    return responseMessage;
  } catch (error) {
    console.error('DeepSeek API error:', error);
    throw error;
  }
};

const sendAnthropicMessage = async (messages, model, apiKey, customInstruction, onStream) => {
  try {
    const formattedMessages = messages.map(({ role, content }) => {
      const formattedContent = Array.isArray(content) ? content : [{ type: 'text', text: content }];

      if (Array.isArray(content)) {
        return {
          role: role === 'assistant' ? 'assistant' : 'user',
          content: content.map(item => {
            return item;
          })
        };
      }

      return {
        role: role === 'assistant' ? 'assistant' : 'user',
        content: formattedContent
      };
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model,
        messages: formattedMessages,
        system: customInstruction ? customInstruction.content : undefined,
        max_tokens: 5000,
        temperature: getAISettings().anthropic.modelSettings[model]?.temperature,
        stream: Boolean(onStream),
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Anthropic API error: ${response.statusText}`);
    }

    if (onStream) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value);
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(5));
              if (json.type === 'content_block_delta' && json.delta?.text) {
                onStream(json.delta.text);
              }
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      }
      return { role: 'assistant', content: '' };
    }

    const data = await response.json();
    return {
      role: 'assistant',
      content: data.content[0].text,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw error;
  }
};

const sendGeminiMessage = async (messages, model, apiKey, customInstruction) => {
  try {
    const messagePayload = messages.map(({ role, content }) => {
      const parts = [];
      const formattedContent = Array.isArray(content) ? content : [{ type: 'text', text: content }];

      formattedContent.forEach(item => {
        if (item.type === 'image') {
          parts.push({
            inlineData: {
              mimeType: item.source.media_type,
              data: item.source.data,
            }
          });
        } else if (item.type === 'text') {
          parts.push({ text: item.text });
        }
      });

      return {
        role: role === 'assistant' ? 'model' : 'user',
        parts
      };
    });

    if (customInstruction) {
      messagePayload.unshift({ role: 'user', parts: [{ text: customInstruction.content }] });
    }

    const generateRequestBody = (model, messagePayload) => {
      const baseConfig = {
        contents: messagePayload,
        generationConfig: {
          temperature: getAISettings().gemini.modelSettings[model]?.temperature,
          maxOutputTokens: 8000,
        }
      };

      // Only add tools for the specific model
      if (model === 'gemini-2.0-flash-exp') {
        baseConfig.tools = {
          "google_search": {}
        };
        baseConfig.generationConfig.response_modalities = ["TEXT"];
      }

      return baseConfig;
    };

    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(generateRequestBody(model, messagePayload)),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No response from Gemini API');
    }

    return {
      role: 'assistant',
      content: data.candidates[0].content.parts.map(part => part.text).join(''),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Gemini API error:', error);
    throw error;
  }
};

const getAISettings = () => {
  const settings = localStorage.getItem('ai_settings');
  if (!settings) {
    return {
      openai: { key: '', models: [], selectedModel: '', temperature: 0, modelSettings: {} },
      anthropic: { key: '', models: [], selectedModel: '', temperature: 0, modelSettings: {} },
      gemini: { key: '', models: [], selectedModel: '', temperature: 0, modelSettings: {} },
      deepseek: { key: '', models: [], selectedModel: '', temperature: 0, modelSettings: {} },
      groq: { key: '', models: [], selectedModel: '', temperature: 0, modelSettings: {} },
    };
  }
  return JSON.parse(settings);
};

const getAvailableProviders = () => {
  const settings = getAISettings();
  return Object.entries(settings)
    .filter(([_, config]) => config.key && config.models.length > 0)
    .map(([name, config]) => ({
      name,
      models: config.models,
      selectedModel: config.selectedModel,
    }));
};

export {
  sendOpenAIMessage,
  sendGroqMessage,
  sendDeepSeekMessage,
  sendAnthropicMessage,
  sendGeminiMessage,
  getAISettings,
  getAvailableProviders,
};
