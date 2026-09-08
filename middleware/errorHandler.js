// Centralized error handling middleware
function errorHandler(err, req, res, next) {
  console.error('[Error Handler]:', err.stack || err.message);

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

// 404 Not Found middleware
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: `API Route ${req.originalUrl} not found`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
