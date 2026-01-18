const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy - required when behind a proxy/load balancer (AWS Lambda, API Gateway, etc.)
// Note: Disabled for local development due to express-rate-limit conflicts
// app.set('trust proxy', true);

// Middleware
// CORS configuration with support for development and production
const allowedOrigins = [
  'http://localhost:3000',           // Local development
  'http://localhost:59030',          // Flutter web development
  'http://localhost:8080',           // Alternative local dev
  'http://127.0.0.1:59030',          // Localhost loopback
  'http://127.0.0.1:3000',           // Localhost loopback
  'https://brighthex-dream-24-7.vercel.app',        // Production frontend
  'https://brighthex-dream-24-7-psi.vercel.app',    // Production frontend (alternative)
  'https://localhost:59030',         // HTTPS localhost
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g., Postman, mobile apps, curl requests)
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (process.env.NODE_ENV === 'development') {
      // In development, allow any origin for easier testing
      console.warn(`[CORS] Access from origin: ${origin}`);
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Internal-Secret'],
  exposedHeaders: ['Content-Length', 'X-JSON-Response'],
  maxAge: 86400,
  optionsSuccessStatus: 200 // Some legacy browsers (IE11) choke on 204
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Explicit OPTIONS handler for preflight requests
app.options('*', cors(corsOptions));

// Additional CORS headers middleware (redundant but helps with some clients)
app.use((req, res, next) => {
  const origin = req.get('origin');
  if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
    res.header('Access-Control-Allow-Origin', origin || '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH, HEAD');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-Internal-Secret');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Expose-Headers', 'Content-Length, X-JSON-Response');
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/';
  }
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'BrightHex Shop Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payments');
const shiprocketRoutes = require('./routes/shiprocket');
const walletRoutes = require('./routes/wallet');

app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/shiprocket', shiprocketRoutes);
app.use('/api/wallet', walletRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  // CORS error
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
      origin: req.get('origin')
    });
  }
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Debug middleware - log all requests in debug mode
if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
    }
    if (req.query && Object.keys(req.query).length > 0) {
      console.log('Query Params:', JSON.stringify(req.query, null, 2));
    }
    next();
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  if (process.env.DEBUG) {
    console.log(`🐛 Debug mode enabled: ${process.env.DEBUG}`);
  }
});

module.exports = app;
