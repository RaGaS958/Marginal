# Use the official Python slim image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the application source code
COPY . .

# Expose the port (Render uses the PORT environment variable)
EXPOSE 8000

# Run the application
CMD ["sh", "-c", "uvicorn analyzer.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
