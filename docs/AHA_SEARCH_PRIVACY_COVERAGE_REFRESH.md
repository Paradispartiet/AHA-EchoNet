# AHA Search + Privacy Coverage Refresh

Search and Privacy are local-only system surfaces.

## Search

AHA Search indexes only explicit local AHA layers.

It does not auto-discover all localStorage keys.

It must not index:

- tokens
- OAuth data
- PKCE
- API keys
- backend secrets
- raw privacy exports
- direct History Go runtime data
- Spotify token or connection secrets

Music is metadata-only.

Training and Personal AI are indexed only as local review, retrieval, preview and evaluation metadata. They are not indexed as trained model data.

Knowledge Map is indexed as a derived graph, not canonical truth.

## Privacy

AHA Privacy reports explicit AHA local keys.

It may include counts, flags and safe previews.

It must not export secrets.

It must not imply that sync, EchoNet, backend upload, model training or fine-tuning happened unless explicit flags show that in local records.

## Current rule

Search = read-only explicit local index.

Privacy = explicit local data report and safe export.

No backend, no EchoNet, no Sync Hub activation, no token export, no History Go write-back.
