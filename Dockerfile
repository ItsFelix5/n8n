ARG NODE_VERSION=24.12

FROM node:${NODE_VERSION}-alpine3.23 AS base

RUN apk --no-cache add --virtual .build-deps-fonts msttcorefonts-installer fontconfig && \
    update-ms-fonts && \
    fc-cache -f && \
    apk del .build-deps-fonts && \
    find /usr/share/fonts/truetype/msttcorefonts/ -type l -delete && \
    apk add --no-cache \
        git \
        openssh \
        openssl \
        graphicsmagick=1.3.46-r0 \
        tini \
        tzdata \
        ca-certificates \
        libc6-compat && \
    rm -rf /tmp/* /root/.npm /root/.cache/node /opt/yarn*

WORKDIR /home/node

FROM base

ARG N8N_RELEASE_TYPE=dev
ENV NODE_ENV=production
ENV N8N_RELEASE_TYPE=${N8N_RELEASE_TYPE}

COPY ./compiled /usr/local/lib/node_modules/n8n
RUN	mkdir -p /home/node/.n8n && chown -R node:node /home/node

EXPOSE 5678/tcp
USER node
ENTRYPOINT ["tini", "--", "/usr/local/lib/node_modules/n8n/bin/n8n"]
