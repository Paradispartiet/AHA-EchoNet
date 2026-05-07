# AHA Architecture

## Prinsipp

```text
AHA = jeg
History Go = det jeg samler
EchoNet = den kollektive overbygningen
AHA-EchoNet = den overordnede personlige AHA-motoren
```

AHA-EchoNet eier den personlige AHA-flaten. History Go er en separat samlings- og læringsmotor som kan sende data til AHA som valgfri import.

## Eksisterende canonical motor

AHA-EchoNet har allerede en motor. Den skal beholdes.

```text
insightsChamber.js
= selve innsiktsmotoren

metaInsightsEngine.js
= metanivået / mønstre på tvers

ahaChat.js
= eksisterende chatkobling til motoren
```

Ingen nye moduler skal lage egen innsiktsmotor. De skal sende kildemateriale inn via felles source/ingest-lag.

## Source → Ingest → Insight

Ny felles flyt:

```text
source event
→ AHASources
→ AHAIngest
→ InsightsEngine.createSignalFromMessage(...)
→ InsightsEngine.addSignalToChamber(...)
→ aha_insight_chamber_v1
→ MetaInsightsEngine
```

## Nye komponenter

```text
index.html
= AHA Dashboard

chat.html
= AHA Chat

notes.html
= AHA Notes

gallery.html
= AHA Galleri

feed.html
= AHA Feed / Twitter

insta.html
= AHA Insta
```

## LocalStorage-kontrakt

```text
aha_insight_chamber_v1
= eksisterende innsiktskammer

aha_source_events_v1
= rå kildelogg

aha_notes_v1
= personlige notater

aha_gallery_v1
= personlig galleri

aha_feed_posts_v1
= korte tekstposter

aha_insta_posts_v1
= bilde-/videoposter
```

## Ansvarsdeling

AHA-EchoNet skal kunne fungere uten History Go. Primære kilder er brukerens egne chatmeldinger, notater, galleriobjekter, feedposter og Insta-poster.

History Go-import er valgfri og skal merkes tydelig som importert materiale.
