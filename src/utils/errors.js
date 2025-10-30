export function notFound(req, res, next) {
  res.status(404).json({ error: "Not Found" });
}

export function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  console.error(err);

  const payload = {
    error: err.message || "Server error"
  };

  if (err.details && process.env.NODE_ENV !== "production") {
    payload.details = err.details;
  }

  res.status(status).json(payload);
}
