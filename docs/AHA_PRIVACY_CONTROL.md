# AHA Personvern / Kontroll

Dette dokumentet beskriver første fungerende personvern- og kontrollflate i AHA-EchoNet.

## Formål

`privacy.html` er en lokal kontrollmodul for AHA-data. Den skal gjøre det tydelig hva som finnes i nettleserens localStorage, hva som tilhører AHA, hva som kommer fra History Go, og hvilke samtykker som er satt lokalt.

Modulen lager ikke ny motor, bygger ikke backend og endrer ikke eksisterende storage-kontrakter.

## Filer

- `privacy.html`
- `ahaPrivacy.js`
- `aha-privacy.css`

## LocalStorage

Personverninnstillinger lagres i:

```text
aha_privacy_settings_v1
```

Settings-kontrakten er:

```js
{
  id,
  localOnly,
  allowCollectiveLearning,
  allowPublicPublishing,
  allowSocialSharing,
  allowHistoryGoImport,
  allowAnalytics,
  updatedAt,
  meta
}
```

Default:

```js
{
  localOnly: true,
  allowCollectiveLearning: false,
  allowPublicPublishing: false,
  allowSocialSharing: false,
  allowHistoryGoImport: true,
  allowAnalytics: false
}
```

## Datarapport

`ahaPrivacy.js` rapporterer disse nøklene:

- `aha_insight_chamber_v1`
- `aha_source_events_v1`
- `aha_notes_v1`
- `aha_gallery_v1`
- `aha_feed_posts_v1`
- `aha_insta_posts_v1`
- `aha_lists_v1`
- `aha_paths_v1`
- `aha_articles_v1`
- `aha_privacy_settings_v1`
- `aha_import_payload_v1`
- `hg_unlocks_v1`
- `visited_places`
- `people_collected`
- `historygo_progress`

AHA-nøkler kan slettes lokalt etter tekstbekreftelsen `SLETT`. History Go-nøkler vises for transparens, men kan ikke slettes fra denne modulen i første versjon.

## Eksport

`exportAllData()` lager en lokal JSON-nedlasting med metadata:

```js
{
  exportedAt,
  app: "AHA-EchoNet",
  version: 1
}
```

Eksporten inneholder AHA-nøkler, ikke History Go-nøkler.

## Prinsipp

```text
Data finnes.
Data kan finnes igjen.
Data kan visualiseres.
Data kan kontrolleres.
```
