FROM postgres:18.6

RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata-legacy \
  && rm -rf /var/lib/apt/lists/*
