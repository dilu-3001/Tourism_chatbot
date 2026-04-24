require('dotenv').config();
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Data state ────────────────────────────────────────────────────────────────
let rawData = [];
let dataIndex = {};   // key: "Area||Property||Measure" -> array of {Month, Value}
let dataMetadata = {
  fileName: null,
  rowCount: 0,
  loadedAt: null,
  areas: [],
  areaTypes: [],
  properties: [],
  measures: [],
  months: []
};

// ── Excel loader ──────────────────────────────────────────────────────────────
function loadData(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

  rawData = rows;
  dataIndex = {};

  rows.forEach(row => {
    const key = `${row.Area}||${row.Property}||${row.Measure}`;
    if (!dataIndex[key]) dataIndex[key] = [];
    dataIndex[key].push({ Month: row.Month, Value: row.Value, AreaType: row['Area type'] });
  });

  const unique = field => [...new Set(rows.map(r => r[field]).filter(Boolean))].sort();

  dataMetadata = {
    fileName: path.basename(filePath),
    rowCount: rows.length,
    loadedAt: new Date().toISOString(),
    areas: unique('Area'),
    areaTypes: unique('Area type'),
    properties: unique('Property'),
    measures: unique('Measure'),
    months: unique('Month')
  };

  console.log(`Loaded: ${rows.length} rows from ${dataMetadata.fileName}`);
}

// ── Relevance scoring for a query ─────────────────────────────────────────────
function getRelevantSeries(query, maxSeries = 15) {
  const q = query.toLowerCase();

  const scored = Object.keys(dataIndex).map(key => {
    const [area, property, measure] = key.split('||').map(s => s.toLowerCase());
    let score = 0;
    if (q.includes(area)) score += 10;
    if (q.includes(property)) score += 8;
    if (q.includes(measure)) score += 6;

    // Partial word matches
    area.split(' ').forEach(w => { if (w.length > 3 && q.includes(w)) score += 3; });
    property.split(' ').forEach(w => { if (w.length > 3 && q.includes(w)) score += 2; });
    measure.split(' ').forEach(w => { if (w.length > 3 && q.includes(w)) score += 2; });

    return { key, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, maxSeries);

  return top.map(({ key }) => {
    const [Area, Property, Measure] = key.split('||');
    const series = dataIndex[key];
    // Send last 24 months to keep context concise
    const recent = series.slice(-24);
    return { Area, Property, Measure, data: recent };
  });
}

// ── Claude client ─────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Chat endpoint ─────────────────────────────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  if (rawData.length === 0) {
    return res.status(503).json({ error: 'Data not loaded. Please ask the administrator to upload a data file.' });
  }

  const relevantSeries = getRelevantSeries(message.trim());
  const dataContext = JSON.stringify(relevantSeries, null, 2);

  const systemPrompt = `You are the Rotorua NZ accommodation data assistant for Rotorua NZ, an economic development agency and regional tourism organisation based in Rotorua, New Zealand.

DATASET OVERVIEW:
- File: ${dataMetadata.fileName}
- Period covered: ${dataMetadata.months[0]} to ${dataMetadata.months[dataMetadata.months.length - 1]}
- Areas: ${dataMetadata.areas.join(', ')}
- Property types: ${dataMetadata.properties.join(', ')}
- Measures available: ${dataMetadata.measures.join(', ')}

RELEVANT DATA FOR THIS QUERY:
${dataContext}

ANSWERING RULES:
- Answer using ONLY the data provided above. Do not use any external knowledge or invent figures.
- If the data does not contain what the user is asking about, say so clearly and suggestto go to the link for more information https://www.rotoruanz.com/do-business/insights/tourism-sector-data-and-research 
- Use NZ spelling (e.g. "utilisation", "organisation").
- Format numbers clearly: percentages with %, large numbers with commas.
- "Last month" = most recent month available in that dataset.
- Format numbers with commas (e.g. 191,600). Spend as $NZD.
- Year-on-year = same calendar month, one year prior.
- Only key bullet points not more than 4, 
- Do not share a lot of data with tables
- Be concise and business-friendly — suited for tourism decision-makers.
- Do not use em dashes. Use commas, periods or parentheses instead.
- Do not start responses with filler phrases like "Great question" or "Certainly".`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: message.trim() }]
    });

    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Could not get a response. Please try again.' });
  }
});

// ── Admin: status ─────────────────────────────────────────────────────────────
app.get('/api/admin/status', (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }
  res.json(dataMetadata);
});

// ── Admin: refresh data ───────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'data');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Preserve original filename, timestamped backup handled separately
    cb(null, file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Only .xlsx and .xls files are accepted.'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB max
});

app.post('/api/admin/refresh', (req, res) => {
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorised.' });
  }

  upload.single('datafile')(req, res, err => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      loadData(req.file.path);
      res.json({ success: true, metadata: dataMetadata });
    } catch (loadErr) {
      console.error('Data load error:', loadErr.message);
      res.status(422).json({ error: 'Could not parse the uploaded file. Check the format matches the expected columns: Month, Area type, Area, Property, Measure, Value.' });
    }
  });
});

// ── Initial load ──────────────────────────────────────────────────────────────
const candidates = [
  path.join(__dirname, 'Feb2026.xlsx'),
  ...fs.readdirSync(path.join(__dirname)).filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
    .map(f => path.join(__dirname, f))
];

const dataDir = path.join(__dirname, 'data');
if (fs.existsSync(dataDir)) {
  fs.readdirSync(dataDir)
    .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
    .forEach(f => candidates.push(path.join(dataDir, f)));
}

const initialFile = candidates.find(f => fs.existsSync(f));
if (initialFile) {
  loadData(initialFile);
} else {
  console.warn('No initial data file found. Upload one via the admin panel.');
}

app.listen(PORT, () => {
  console.log(`Rotorua NZ Chatbot running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});
