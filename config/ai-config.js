// AI Configuration Module
// Add this to your app.js or create a separate ai-config.js

const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI GPT-4',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4',
    costPerToken: 0.00003,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  deepseek: {
    name: 'DeepSeek',
    apiUrl: 'https://api.deepseek.com/v1/chat/completions',
    model: 'deepseek-chat',
    costPerToken: 0.000002,
    headers: (apiKey) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    })
  },
  anthropic: {
    name: 'Claude',
    apiUrl: 'https://api.anthropic.com/v1/messages',
    model: 'claude-3-haiku-20240307',
    costPerToken: 0.000001,
    headers: (apiKey) => ({
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    })
  }
};

// AI Configuration Storage
const AI_CONFIG_PATH = path.join(__dirname, 'ai-config.json');

function loadAIConfig() {
  try {
    if (fs.existsSync(AI_CONFIG_PATH)) {
      return fs.readJsonSync(AI_CONFIG_PATH);
    }
  } catch (err) {
    console.error('Error loading AI config:', err);
  }
  
  return {
    selectedProvider: 'openai',
    apiKeys: {},
    companyInfo: {
      name: '',
      industry: 'electrical',
      jurisdiction: 'victoria',
      standards: ['ISO45001', 'WorkSafeVic']
    },
    documentTemplates: {
      useCompanyBranding: true,
      includeRegulations: true,
      autoPopulateFields: true
    }
  };
}

function saveAIConfig(config) {
  try {
    fs.writeJsonSync(AI_CONFIG_PATH, config, { spaces: 2 });
    return true;
  } catch (err) {
    console.error('Error saving AI config:', err);
    return false;
  }
}

// Document Generation Prompts
const DOCUMENT_GENERATION_PROMPTS = {
  'SWMS': {
    template: `Create a Safe Work Method Statement (SWMS) for {{activityName}} in accordance with {{standards}}.

Company: {{companyName}}
Industry: {{industry}}
Jurisdiction: {{jurisdiction}}

Requirements:
- Include all hazard identification and risk assessment
- Detail step-by-step work procedures
- Specify required PPE and safety equipment
- Include emergency procedures
- Ensure compliance with {{regulations}}
- Use {{jurisdiction}} specific terminology and requirements

Format as a professional document with clear sections and Australian safety terminology.`,
    
    fields: ['activityName', 'specificHazards', 'equipment', 'location']
  },
  
  'Risk Assessment': {
    template: `Create a comprehensive Risk Assessment for {{activityName}} in accordance with {{standards}}.

Company: {{companyName}}
Industry: {{industry}}
Jurisdiction: {{jurisdiction}}

Requirements:
- Use risk matrix methodology
- Identify all foreseeable hazards
- Assess likelihood and consequence
- Provide risk control measures following hierarchy of control
- Include residual risk assessment
- Ensure compliance with {{regulations}}
- Reference relevant Australian Standards

Format as a professional risk assessment document suitable for {{jurisdiction}} regulatory requirements.`,
    
    fields: ['activityName', 'workLocation', 'personnelInvolved', 'equipment']
  },
  
  'Emergency Procedure': {
    template: `Create an Emergency Response Procedure for {{emergencyType}} in accordance with {{standards}}.

Company: {{companyName}}
Industry: {{industry}}
Jurisdiction: {{jurisdiction}}

Requirements:
- Clear emergency response steps
- Contact information and escalation procedures
- Evacuation procedures if applicable
- First aid and medical response
- Incident reporting requirements
- Compliance with {{regulations}}
- Include {{jurisdiction}} specific emergency service contacts

Format as a clear, actionable emergency procedure suitable for workplace display.`,
    
    fields: ['emergencyType', 'facilityLocation', 'keyPersonnel', 'specificRisks']
  },
  
  'Training Material': {
    template: `Create training material for {{trainingTopic}} in accordance with {{standards}}.

Company: {{companyName}}
Industry: {{industry}}
Jurisdiction: {{jurisdiction}}

Requirements:
- Learning objectives clearly defined
- Practical examples relevant to {{industry}}
- Assessment criteria
- Compliance requirements for {{regulations}}
- References to relevant Australian Standards
- Include competency requirements for {{jurisdiction}}

Format as comprehensive training material suitable for workplace delivery.`,
    
    fields: ['trainingTopic', 'targetAudience', 'competencyLevel', 'deliveryMethod']
  }
};

// AI Document Generation Function
async function generateDocument(documentType, missingDocName, customInputs = {}) {
  const aiConfig = loadAIConfig();
  const provider = AI_PROVIDERS[aiConfig.selectedProvider];
  
  if (!provider || !aiConfig.apiKeys[aiConfig.selectedProvider]) {
    throw new Error('AI provider not configured. Please set up API keys in settings.');
  }
  
  const prompt = DOCUMENT_GENERATION_PROMPTS[documentType];
  if (!prompt) {
    throw new Error(`Document type "${documentType}" not supported`);
  }
  
  // Replace template variables
  let finalPrompt = prompt.template
    .replace(/{{companyName}}/g, aiConfig.companyInfo.name || 'Your Company')
    .replace(/{{industry}}/g, aiConfig.companyInfo.industry || 'electrical')
    .replace(/{{jurisdiction}}/g, aiConfig.companyInfo.jurisdiction || 'Victoria')
    .replace(/{{standards}}/g, aiConfig.companyInfo.standards.join(', '))
    .replace(/{{regulations}}/g, getRelevantRegulations(aiConfig.companyInfo))
    .replace(/{{activityName}}/g, customInputs.activityName || missingDocName);
  
  // Add custom inputs
  Object.keys(customInputs).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    finalPrompt = finalPrompt.replace(regex, customInputs[key] || '');
  });
  
  console.log('Generating document with AI provider:', aiConfig.selectedProvider);
  console.log('Estimated tokens:', estimateTokens(finalPrompt));
  
  try {
    const response = await callAIProvider(provider, aiConfig.apiKeys[aiConfig.selectedProvider], finalPrompt);
    
    return {
      success: true,
      content: response.content,
      metadata: {
        provider: aiConfig.selectedProvider,
        model: provider.model,
        tokensUsed: response.tokensUsed || estimateTokens(finalPrompt + response.content),
        estimatedCost: (response.tokensUsed || estimateTokens(finalPrompt + response.content)) * provider.costPerToken,
        generatedAt: new Date().toISOString(),
        documentType: documentType,
        companyInfo: aiConfig.companyInfo
      }
    };
  } catch (error) {
    console.error('AI generation error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// AI Provider API Calls
async function callAIProvider(provider, apiKey, prompt) {
  const fetch = require('node-fetch'); // You'll need to: npm install node-fetch
  
  let requestBody;
  
  if (provider.name.includes('OpenAI') || provider.name.includes('DeepSeek')) {
    requestBody = {
      model: provider.model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert EHS (Environment, Health & Safety) consultant specializing in Australian workplace safety regulations and documentation. Create professional, compliant safety documents.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 4000,
      temperature: 0.3
    };
  } else if (provider.name.includes('Claude')) {
    requestBody = {
      model: provider.model,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: `You are an expert EHS consultant. ${prompt}`
        }
      ]
    };
  }
  
  const response = await fetch(provider.apiUrl, {
    method: 'POST',
    headers: provider.headers(apiKey),
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`AI API Error: ${response.status} - ${errorData}`);
  }
  
  const data = await response.json();
  
  // Extract content based on provider
  let content;
  let tokensUsed;
  
  if (data.choices && data.choices[0]) {
    content = data.choices[0].message.content;
    tokensUsed = data.usage?.total_tokens;
  } else if (data.content && data.content[0]) {
    content = data.content[0].text;
    tokensUsed = data.usage?.output_tokens + data.usage?.input_tokens;
  } else {
    throw new Error('Unexpected API response format');
  }
  
  return { content, tokensUsed };
}

// Helper Functions
function getRelevantRegulations(companyInfo) {
  const regulations = [];
  
  if (companyInfo.jurisdiction === 'victoria') {
    regulations.push('Occupational Health and Safety Act 2004 (Vic)');
    regulations.push('Occupational Health and Safety Regulations 2017 (Vic)');
  }
  
  if (companyInfo.industry === 'electrical') {
    regulations.push('Electricity Safety Act 1998 (Vic)');
    regulations.push('AS/NZS 3000 Wiring Rules');
  }
  
  if (companyInfo.standards.includes('ISO45001')) {
    regulations.push('ISO 45001:2018 Occupational Health and Safety Management Systems');
  }
  
  return regulations.join(', ');
}

function estimateTokens(text) {
  // Rough estimation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Export functions
module.exports = {
  loadAIConfig,
  saveAIConfig,
  generateDocument,
  AI_PROVIDERS,
  DOCUMENT_GENERATION_PROMPTS
};