export function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.statusCode || 500;
  res.status(status).json({
    data: null,
    error: err.message || 'Internal server error',
  });
}
