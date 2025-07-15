// migrate-project.js
// Run this script to organize your existing files into proper structure

const fs = require('fs-extra');
const path = require('path');

async function migrateProject() {
  console.log('🚀 Starting SafetySync Pro project migration...');
  
  try {
    // Create directory structure
    const directories = [
      'config',
      'routes', 
      'views/partials',
      'public/css',
      'public/js',
      'public/images',
      'data',
      'temp',
      'docs',
      'AI Generated'
    ];
    
    for (const dir of directories) {
      await fs.ensureDir(dir);
      console.log(`✅ Created directory: ${dir}`);
    }
    
    // Create package.json if it doesn't exist
    if (!fs.existsSync('package.json')) {
      const packageJson = {
        "name": "safetysync-pro",
        "version": "1.0.0",
        "description": "EHS Compliance Intelligence Platform",
        "main": "app.js",
        "scripts": {
          "start": "node app.js",
          "dev": "nodemon app.js",
          "test": "echo \"Error: no test specified\" && exit 1"
        },
        "keywords": ["safety", "compliance", "EHS", "management"],
        "author": "Your Name",
        "license": "ISC",
        "dependencies": {
          "express": "^4.18.2",
          "ejs": "^3.1.9",
          "fs-extra": "^11.1.1",
          "moment": "^2.29.4",
          "lunr": "^2.3.9",
          "chokidar": "^3.5.3",
          "multer": "^1.4.5-lts.1",
          "node-fetch": "^2.6.7",
          "docx": "^8.2.2"
        },
        "devDependencies": {
          "nodemon": "^2.0.22"
        }
      };
      
      await fs.writeJson('package.json', packageJson, { spaces: 2 });
      console.log('✅ Created package.json');
    }
    
    // Create .env.example
    const envExample = `# SafetySync Pro Configuration
# Copy this file to .env and update with your values

# Server Configuration
PORT=3000
NODE_ENV=development

# Document Root Path
DOCUMENTS_ROOT=I:/IMS

# AI Configuration (Optional)
# OPENAI_API_KEY=your_openai_key_here
# DEEPSEEK_API_KEY=your_deepseek_key_here
# ANTHROPIC_API_KEY=your_anthropic_key_here

# Company Information
COMPANY_NAME=Your Company Name
COMPANY_INDUSTRY=electrical
COMPANY_JURISDICTION=victoria

# Security
AIR_GAPPED_MODE=false
DATA_RETENTION_DAYS=30
`;
    
    await fs.writeFile('.env.example', envExample);
    console.log('✅ Created .env.example');
    
    // Create README.md
    const readme = `# SafetySync Pro - EHS Compliance Intelligence Platform

## Overview
SafetySync Pro is an intelligent document management and compliance analysis system designed for EHS (Environment, Health & Safety) professionals.

## Features
- 📁 Document indexing and organization
- 🤖 AI-powered document generation
- 📊 Executive compliance reporting
- 🔍 Gap analysis and risk assessment
- 📋 Mandatory records tracking
- 🏗️ Industry-specific compliance (Electrical, Construction, Mining)
- 🇦🇺 Australian jurisdiction support (Victoria, NSW, QLD)

## Quick Start
1. Install Node.js (v16 or higher)
2. Clone this repository
3. Run \`npm install\`
4. Copy \`.env.example\` to \`.env\` and configure
5. Run \`npm start\`
6. Open http://localhost:3000

## Configuration
Update the \`.env\` file with your:
- Document root path
- Company information
- AI API keys (optional)

## Usage
1. **Document Analysis**: Upload or scan existing safety documents
2. **Compliance Check**: Review gaps against industry standards
3. **AI Generation**: Create missing documents automatically
4. **Executive Reports**: Generate professional compliance reports

## Support
For technical support or consulting services, contact: [your-email]

## License
© 2024 SafetySync Pro. All rights reserved.
`;
    
    await fs.writeFile('README.md', readme);
    console.log('✅ Created README.md');
    
    // Move files to proper locations (if they exist)
    const fileMapping = {
      'styles.css': 'public/css/styles.css',
      'main.js': 'public/js/main.js',
      'ims-index.js': 'public/js/ims-index.js'
    };
    
    for (const [oldPath, newPath] of Object.entries(fileMapping)) {
      if (fs.existsSync(oldPath)) {
        await fs.move(oldPath, newPath);
        console.log(`✅ Moved ${oldPath} to ${newPath}`);
      }
    }
    
    // Create development configuration files
    const vscodeSettings = {
      "editor.formatOnSave": true,
      "editor.codeActionsOnSave": {
        "source.fixAll.eslint": true
      },
      "files.associations": {
        "*.ejs": "html"
      },
      "emmet.includeLanguages": {
        "ejs": "html"
      }
    };
    
    await fs.ensureDir('.vscode');
    await fs.writeJson('.vscode/settings.json', vscodeSettings, { spaces: 2 });
    console.log('✅ Created VS Code settings');
    
    // Create launch configuration for debugging
    const launchConfig = {
      "version": "0.2.0",
      "configurations": [
        {
          "name": "Launch SafetySync Pro",
          "type": "node",
          "request": "launch",
          "program": "${workspaceFolder}/app.js",
          "console": "integratedTerminal",
          "env": {
            "NODE_ENV": "development"
          }
        }
      ]
    };
    
    await fs.writeJson('.vscode/launch.json', launchConfig, { spaces: 2 });
    console.log('✅ Created VS Code debug configuration');
    
    console.log('\n🎉 Migration complete!');
    console.log('\nNext steps:');
    console.log('1. Open this folder in VS Code');
    console.log('2. Run: npm install');
    console.log('3. Copy .env.example to .env and configure');
    console.log('4. Run: git add .');
    console.log('5. Run: git commit -m "Initial commit"');
    console.log('6. Start development with: npm start');
    
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

// Run migration
migrateProject();