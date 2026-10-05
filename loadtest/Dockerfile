FROM node:24-trixie-slim AS node

FROM postgres:18
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata-legacy procps \
 && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY start.sh cluster.cjs /
ENTRYPOINT ["/start.sh"]
