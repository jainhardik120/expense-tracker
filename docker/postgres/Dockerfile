FROM postgres:18@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6

# Browsers can return legacy IANA names such as Asia/Calcutta. Debian 13
# ships these aliases separately from the canonical timezone database.
RUN apt-get update \
    && apt-get install -y --no-install-recommends tzdata-legacy \
    && rm -rf /var/lib/apt/lists/*
