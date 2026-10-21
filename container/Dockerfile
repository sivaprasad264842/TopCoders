FROM node:22-bookworm-slim

ENV NODE_ENV=production \
    TEMP_DIR=/tmp/oj-jobs

# Compilers / interpreters for the supported languages.
# util-linux provides prlimit, used to cap file sizes written by user code.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        openjdk-17-jdk-headless \
        g++ \
        util-linux \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node . .
RUN mkdir -p /tmp/oj-jobs && chown -R node:node /tmp/oj-jobs

EXPOSE 5001

# User code runs as this unprivileged user, never as root.
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:5001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
