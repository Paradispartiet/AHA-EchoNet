// ahaFieldProfiles.js
// Felt-profiler fra History Go-merker – brukes som linse i AHA
// themeId = samme som kategori/merke: "historie", "vitenskap", "subkultur", "litteratur", ...

window.HG_FIELD_PROFILES = {
  historie: {
    id: "historie",
    label: "Historie",
    ingress:
      "Historie handler om hvordan fortiden tolkes, ordnes og brukes i nåtid – hvem som får definere hva som teller som historie.",
    coreConcepts: [
      "Kilder",
      "Narrativ",
      "Epoker",
      "Minnesteder",
      "Makt over fortiden"
    ],
    dimensions: [
      "normativ",
      "doxa",
      "metodisk",
      "materiell",
      "sosial",
      "geografisk",
      "temporal",
      "blindsoner"
    ]
  },

  vitenskap: {
    id: "vitenskap",
    label: "Vitenskap",
    ingress:
      "Vitenskap er produksjon av forklaringer gjennom måling, testing og modellering – et system som gjør verden målbar og sammenlignbar.",
    coreConcepts: [
      "Observasjon",
      "Evidens",
      "Hypotese",
      "Modell",
      "Kalibrering",
      "Replikasjon",
      "Paradigme",
      "Standardisering"
    ],
    dimensions: [
      "normativ: objektivitet, reproduserbarhet, standardisering",
      "doxa: «det som kan måles er sant»",
      "metodisk: eksperiment, kontroll, statistikk",
      "materiell: laboratorier, instrumenter, datasett",
      "sosial: institusjoner, finansiering, fagmiljøer",
      "geografisk: laboratorier, observatorier, kunnskapskart i byen",
      "temporal: paradigmeskifter og vitenskapelige brudd",
      "blindsoner: det som ikke kan tallfestes, makt og hierarkier"
    ]
  },

  kunst: {
    id: "kunst",
    label: "Kunst & kultur",
    ingress:
      "Kunstfeltet handler om estetiske uttrykk, institusjoner og hvordan bilder, lyd og rom former blikket vårt.",
    coreConcepts: [
      "Estetikk",
      "Institusjon",
      "Publikum",
      "Materialitet",
      "Tolkning"
    ],
    dimensions: [
      "normativ: kvalitet, originalitet, autentisitet",
      "doxa: «kunst snakker for seg selv»",
      "metodisk: analyse av form, medier og blikk",
      "materiell: museer, gallerier, scener",
      "sosial: kunstfelt, kritikere, samlere",
      "geografisk: kunstakser og parker i byen",
      "temporal: retninger, ismer, brudd",
      "blindsoner: marginaliserte uttrykk og kropper"
    ]
  },

  natur: {
    id: "natur",
    label: "Natur & miljø",
    ingress:
      "Natur-merket ser på natur som både økosystem, rekreasjon, ressurs og kampplass for miljøpolitikk.",
    coreConcepts: [
      "Økologi",
      "Ressurser",
      "Landskap",
      "Forvaltning",
      "Bærekraft"
    ],
    dimensions: [
      "normativ: vern, bruk, bærekraft",
      "doxa: «naturen er der ute»",
      "metodisk: kart, målinger, forvaltningsplaner",
      "materiell: parker, skog, vann, infrastruktur",
      "sosial: friluftsliv, konflikt om areal",
      "geografisk: bynatur, marka, kyst",
      "temporal: klimaendring, historisk bruk",
      "blindsoner: ikke-menneskelige perspektiver"
    ]
  },

  musikk: {
    id: "musikk",
    label: "Musikk",
    ingress:
      "Musikk handler om rytme, kropp, teknologi og fellesskap – hvordan lyd organiserer tid, identitet og tilhørighet.",
    coreConcepts: [
      "Rytme",
      "Klang",
      "Scene",
      "Publikum",
      "Affekt",
      "Sjanger"
    ],
    dimensions: [
      "normativ: smak, kvalitet, «ekte» vs «kommers»",
      "doxa: hvem som regnes som seriøse musikere",
      "metodisk: analyse av rytme, lyd, produksjon",
      "materiell: konsertscener, studier, instrumenter",
      "sosial: fans, subkulturer, bransje",
      "geografisk: klubber, festivaler, byrom",
      "temporal: epoker, bølger, trender",
      "blindsoner: uformelle miljøer, ubetalt arbeid"
    ]
  },

  populaerkultur: {
    id: "populaerkultur",
    label: "Populærkultur",
    ingress:
      "Populærkultur er det store, delte underholdnings- og medielandskapet – serier, sosiale medier, kjendiser, memer og felles referanser.",
    coreConcepts: [
      "Underholdning",
      "Fandom",
      "Medier",
      "Symboler",
      "Identitet"
    ],
    dimensions: [
      "normativ: «finkultur» vs «lavkultur»",
      "doxa: «det er bare underholdning»",
      "metodisk: medieanalyse, representasjon, merkevarebygging",
      "materiell: skjermer, plattformer, arenaer",
      "sosial: fans, influencer-økonomi, algoritmer",
      "geografisk: byrom brukt til arrangementer og promo",
      "temporal: trender, virale øyeblikk",
      "blindsoner: hvem som eier plattformene og dataene"
    ]
  },

  subkultur: {
    id: "subkultur",
    label: "Subkultur",
    ingress:
      "Subkultur handler om miljøer som går på tvers av, eller i opposisjon til, det etablerte – byoriginaler, miljøer, scener og motkultur.",
    coreConcepts: [
      "Motstand",
      "Tilgjengelighet",
      "Stil",
      "Tilholdssted",
      "Fellesskap"
    ],
    dimensions: [
      "normativ: «innenfor» og «utenfor» normalitet",
      "doxa: stereotypier om subkulturer",
      "metodisk: feltarbeid, miljøstudier, kulturhistorie",
      "materiell: kneiper, klubber, gater, plakater",
      "sosial: koder, ritualer, interne hierarkier",
      "geografisk: byrom, hjørner, plasser, t-banestopp",
      "temporal: bølger, scener som kommer og går",
      "blindsoner: hegemoniets blikk, kriminalisering, usynlig arbeid"
    ]
  },

  sport: {
    id: "sport",
    label: "Sport",
    ingress:
      "Sport handler om kropp, konkurranse, prestasjon og fellesskap – men også om penger, medier og nasjonal identitet.",
    coreConcepts: [
      "Konkurranse",
      "Prestasjon",
      "Ritual",
      "Supporter",
      "Profesjonalisering"
    ],
    dimensions: [
      "normativ: fair play, disiplin, vinnerkultur",
      "doxa: «sport er apolitisk»",
      "metodisk: trening, statistikk, analyse",
      "materiell: stadioner, utstyr, infrastruktur",
      "sosial: lag, supportere, klubber",
      "geografisk: idrettsanlegg, løypenett, byrom",
      "temporal: karrierer, mesterskap, rekorder",
      "blindsoner: doping, klasse, kjønn, tilgjengelighet"
    ]
  },

  by: {
    id: "by",
    label: "By & arkitektur",
    ingress:
      "By-merket handler om hvordan byen formes av planlegging, arkitektur, økonomi og hverdagsliv.",
    coreConcepts: [
      "Infrastruktur",
      "Offentlig rom",
      "Planlegging",
      "Bolig",
      "Gentrifisering"
    ],
    dimensions: [
      "normativ: «god byutvikling», trygghet, effektivitet",
      "doxa: teknisk nøytralitet i planlegging",
      "metodisk: kart, reguleringsplaner, simuleringer",
      "materiell: bygg, gater, transport, parker",
      "sosial: nabolag, klasseskiller, møteplasser",
      "geografisk: sentrum, periferi, soner",
      "temporal: byutvidelse, sanering, vern",
      "blindsoner: de som skyves ut, uformelle rom"
    ]
  },

  politikk: {
    id: "politikk",
    label: "Politikk & samfunn",
    ingress:
      "Politikk-merket ser på hvordan makt fordeles, beslutninger tas og hvem som får definere «det normale».",
    coreConcepts: [
      "Makt",
      "Institusjon",
      "Fordeling",
      "Offentlighet",
      "Ideologi"
    ],
    dimensions: [
      "normativ: rettferdighet, demokrati, lovlighet",
      "doxa: «sånn er bare systemet»",
      "metodisk: statistikk, utredninger, høringer",
      "materiell: parlament, kontorer, dokumenter",
      "sosial: partier, lobby, grasrot, medier",
      "geografisk: maktens akser i byen",
      "temporal: reformer, kriser, styrtskifter",
      "blindsoner: de uten stemme eller representasjon"
    ]
  },

  naeringsliv: {
    id: "naeringsliv",
    label: "Næringsliv",
    ingress:
      "Næringsliv handler om kapital, arbeid, infrastruktur og nettverk – hvordan verdier skapes, fordeles og konsentreres.",
    coreConcepts: [
      "Kapital",
      "Arbeid",
      "Marked",
      "Logistikk",
      "Eierskap"
    ],
    dimensions: [
      "normativ: vekst, lønnsomhet, effektivitet",
      "doxa: «markedet vet best»",
      "metodisk: regnskap, prognoser, KPI-er",
      "materiell: kontorer, havner, logistikk-knutepunkt",
      "sosial: klasser, profesjoner, styrerom",
      "geografisk: business-distrikter, industriområder",
      "temporal: boomer, kriser, restrukturering",
      "blindsoner: ubetalt arbeid, miljøkostnader"
    ]
  },

  litteratur: {
    id: "litteratur",
    label: "Litteratur",
    ingress:
      "Litteratur er produksjon av mening gjennom språk – fortelling, estetikk, symbolbruk og hvordan tekster former verdensforståelse.",
    coreConcepts: [
      "Fortelling",
      "Språk",
      "Symbolsk makt",
      "Estetikk",
      "Perspektiv",
      "Tolkning"
    ],
    dimensions: [
      "normativ: estetisk kvalitet, originalitet, kulturell verdi",
      "doxa: «litteratur er bare tekst»",
      "metodisk: tekstanalyse, sjangerstudier, diskursanalyse",
      "materiell: bøker, forlag, bibliotek, scener",
      "sosial: forfattere, kritikere, lesere, institusjoner",
      "geografisk: kafeer, bibliotek, hjem, scener i byen",
      "temporal: epoker, kanon, språkhistorie",
      "blindsoner: hvem som ikke kommer til orde, undertrykte språk"
    ]
  }
};
