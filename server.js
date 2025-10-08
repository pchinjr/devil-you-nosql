const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Serve static files
app.use(express.static('.'));
app.use(express.json());

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Execute Node.js scripts
app.post('/api/run-script', (req, res) => {
  const { script, args = [] } = req.body;
  
  const allowedScripts = [
    'setup.js',
    'demo.js',
    'benchmark.js',
    'seedSmall.js',
    'seedLarge.js',
    'verifyDatabases.js',
    'validate.js'
  ];

  if (!allowedScripts.includes(script)) {
    return res.status(400).json({ error: 'Script not allowed' });
  }

  const scriptPath = path.join(__dirname, 'scripts', script);
  
  // Sanitize args to prevent command injection
  const sanitizedArgs = args.map(arg => arg.replace(/[;&|`$()]/g, ''));
  const command = `node ${scriptPath} ${sanitizedArgs.join(' ')}`;
  
  console.log(`Executing: ${command}`);
  
  const startTime = Date.now();
  exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
    const duration = Date.now() - startTime;
    
    if (error) {
      console.error(`Error: ${error}`);
      return res.status(500).json({ 
        error: error.message,
        stderr,
        duration 
      });
    }

    res.json({
      success: true,
      stdout,
      stderr,
      duration,
      timestamp: new Date().toISOString()
    });
  });
});

// Get benchmark results
app.get('/api/benchmark-results', (req, res) => {
  const files = fs.readdirSync('.')
    .filter(file => file.startsWith('benchmark-results-') || file.startsWith('contrast-benchmark-'))
    .sort((a, b) => {
      const aTime = fs.statSync(a).mtime;
      const bTime = fs.statSync(b).mtime;
      return bTime - aTime;
    });

  const results = files.slice(0, 5).map(file => {
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      return {
        filename: file,
        timestamp: content.timestamp,
        summary: content.summary || content.scenarios,
        size: fs.statSync(file).size
      };
    } catch (error) {
      return {
        filename: file,
        error: 'Failed to parse'
      };
    }
  });

  res.json(results);
});

// Get specific benchmark result
app.get('/api/benchmark-results/:filename', (req, res) => {
  const filename = req.params.filename;
  
  if (!filename.match(/^(benchmark-results-|contrast-benchmark-)\d+\.json$/)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  try {
    const content = JSON.parse(fs.readFileSync(filename, 'utf8'));
    res.json(content);
  } catch (error) {
    res.status(404).json({ error: 'File not found' });
  }
});

// Get environment configuration
app.get('/api/config', (req, res) => {
  res.json({ 
    dsqlEndpoint: process.env.DSQL_ENDPOINT || '',
    awsRegion: process.env.AWS_REGION || 'us-east-1',
    status: 'ok',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Devil You NoSQL Server running at http://localhost:${PORT}`);
  console.log(`📊 Open your browser to interact with the demos`);
});
