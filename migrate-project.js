// migrate-project.js - Simple version using built-in modules only
const fs = require('fs');
const path = require('path');

function createDirectory(dirPath) {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created directory: ${dirPath}`);
    } else {
      console.log(`📁 Directory already exists: ${dirPath}`);
    }
  } catch (error) {
    console.error(`❌ Error creating directory ${dirPath}:`, error.message);
  }
}

function writeFile(filePath, content) {
  try {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Created file: ${filePath}`);
  } catch (error) {
    console.error(`❌ Error creating file ${filePath}:`, error.message);
  }
}

async function migrateProject() {
  console.log('🚀 Starting SafetySync Pro project migration...');
  
  // Create directory structure
  const directories = [
    'config',
    'routes', 
    'views',
    'views/partials',
    'public',
    'public/css',
    'public/js',
    'public/images',
    'data',
    'temp',
    'docs',
    'AI Generated',
    '.vscode'
  ];
  
  directories.forEach(createDirectory);
  
  // Create package.json
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
    
    writeFile('package.json', JSON.stringify(packageJson, null, 2));
  }
  
  // Create .gitignore
  const gitignore = `# Node.js
node_modules/
npm-debug.log*

# Project specific
data/
temp/
uploads/
logs/
*.log

# AI API Keys (security)
ai-config.json
.env.local

# OS generated files
.DS_Store
Thumbs.db

# IDE files
.idea/
*.swp
*~

# Generated documents
AI Generated/
reports/
exports/
`;
  
  writeFile('.gitignore', gitignore);
  
  // Create README.md
  const readme = `# SafetySync Pro - EHS Compliance Intelligence Platform

## Quick Start
1. Run: npm install
2. Copy your existing app.js to this folder  
3. Copy your existing views/ folder to this folder
4. Run: npm start
5. Open http://localhost:3000

## Features
- Document indexing and organization
- AI-powered document generation  
- Executive compliance reporting
- Gap analysis and risk assessment
`;
  
  writeFile('README.md', readme);
  
  // Create VS Code settings
  const vscodeSettings = {
    "editor.formatOnSave": true,
    "editor.tabSize": 2,
    "editor.insertSpaces": true,
    "editor.bracketPairColorization.enabled": true,
    "files.autoSave": "afterDelay",
    "files.autoSaveDelay": 1000,
    "emmet.includeLanguages": {
      "ejs": "html"
    },
    "files.associations": {
      "*.ejs": "html"
    },
    "terminal.integrated.defaultProfile.windows": "Command Prompt"
  };
  
  writeFile('.vscode/settings.json', JSON.stringify(vscodeSettings, null, 2));
  
  console.log('\n🎉 Migration complete!');
  console.log('\nNext steps:');
  console.log('1. Copy your existing app.js to this folder');
  console.log('2. Copy your existing views/ folder to this folder');
  console.log('3. Run: c:\\nodejs\\npm.exe install');
  console.log('4. Start development with: c:\\nodejs\\node.exe app.js');
}

// Run migration
migrateProject();