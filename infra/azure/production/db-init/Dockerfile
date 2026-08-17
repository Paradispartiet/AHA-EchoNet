FROM postgres:16-alpine
RUN apk add --no-cache ca-certificates openssl
WORKDIR /aha
COPY supabase/migrations /aha/migrations
COPY infra/azure/production/db-init/roles.sql /aha/roles.sql
COPY infra/azure/production/db-init/run.sh /aha/run.sh
RUN chmod 0555 /aha/run.sh \
  && find /aha/migrations -type f -name '*.sql' -exec chmod 0444 {} \; \
  && chmod 0444 /aha/roles.sql
USER postgres
ENTRYPOINT ["/aha/run.sh"]
