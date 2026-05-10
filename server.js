const v8 = require('v8');
v8.setFlagsFromString('--max-old-space-size=1024');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./db');

dotenv.config();

connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS
app.use(cors({
  origin: 'https://mariemmaghrebi.github.io',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

app.use(express.json());

// Routes
const authRoutes = require('./authRoutes');
const voyageRoutes = require('./voyageRoutes');
const pointGeographiqueRoutes = require('./pointGeographiqueRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/voyages', voyageRoutes);
app.use('/api/points-geographiques', pointGeographiqueRoutes);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend fonctionne avec MongoDB !' });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});