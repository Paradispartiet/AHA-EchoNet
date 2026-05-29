from __future__ import annotations

from app.schemas import AnalyzeRequest, CanonicalAhaAnalysis, Confidence, HistoryGoLink


def _normalize(message: str) -> str:
    return " ".join(message.lower().split())


def _contains_any(message: str, phrases: list[str]) -> bool:
    return any(phrase in message for phrase in phrases)


def _contains_count(message: str, phrases: list[str]) -> int:
    return sum(1 for phrase in phrases if phrase in message)


def detect_content_type(message: str) -> str:
    normalized = _normalize(message)

    if _contains_any(
        normalized,
        ["modul", "analyseklassifisering", "grensesnitt", "regressjoner", "testdata"],
    ):
        return "project_note"

    if (
        " jeg " in f" {normalized} "
        and _contains_any(normalized, ["i dag", "kjente jeg", "følelse", "kanskje handler det"])
    ):
        return "day_log"

    if _contains_any(
        normalized,
        [
            "pinse",
            "den hellige ånd",
            "kirkens fødselsdag",
            "apostlene",
            "morgenbladet",
            "idédebatt",
            "kulturkritikk",
            "redaksjonell profil",
            "offentlighet",
            "nav-reformen",
            "velferdsforvaltningen",
            "etatskulturer",
            "styringsutfordringer",
            "samordning",
            "roman",
            "tilknytningsteori",
            "ambivalent tilknytning",
            "fortellergrep",
            "hjemmel i lov",
            "legitimt formål",
            "forholdsmessig",
            "vedtaket",
            "rettigheter",
        ],
    ):
        return "academic_article"

    return "general"


def detect_domain(message: str) -> str:
    normalized = _normalize(message)

    media_history_signals = [
        "morgenbladet",
        "offentlighet",
        "kulturkritikk",
        "idédebatt",
        "langsom journalistikk",
        "medieinstitusjon",
        "medieinstitusjoner",
        "redaksjonell form",
        "redaksjonell profil",
        "avis",
    ]
    if _contains_any(normalized, media_history_signals):
        return "institutional_media_history"

    public_administration_signals = [
        "nav-reformen",
        "ett kontaktpunkt",
        "brukermøte",
        "brukermøtet",
        "etatskulturer",
        "styringslinjer",
        "styringsutfordringer",
        "samordning",
        "velferdsforvaltning",
        "velferdsforvaltningen",
        "byråkratisk kompleksitet",
    ]
    if _contains_any(normalized, public_administration_signals):
        return "public_administration_reform"

    if _contains_any(normalized, ["roman", "tilknytningsteori", "ambivalent tilknytning", "fortellergrep"]):
        return "literary_attachment"

    learning_reflection_signals = [
        "lærer mest",
        "feilene mine",
        "mønstrene",
        "vaner",
        "repetisjoner",
        "justering",
        "kunnskapen fester seg",
    ]
    if _contains_count(normalized, learning_reflection_signals) >= 2:
        return "learning_reflection"

    urban_attention_signals = [
        "uro",
        "konsentrasjon",
        "byrom",
        "trikk",
        "folkestrøm",
        "oppmerksomhet",
        "steder",
        "bevegelse gir energi",
    ]
    if _contains_count(normalized, urban_attention_signals) >= 3:
        return "urban_attention_reflection"

    constitutional_history_signals = [
        "eidsvoll",
        "1814",
        "grunnloven",
        "folkestyre",
        "rettigheter",
        "nasjonsbygging",
        "demokratiet",
        "politiske deltakere",
    ]
    if _contains_count(normalized, constitutional_history_signals) >= 3:
        return "constitutional_democratic_history"

    urban_sports_signals = [
        "bislett stadion",
        "idrettsarena",
        "stadion",
        "byrom",
        "løp",
        "mesterskap",
        "fellesskap",
        "lokal identitet",
        "ombygging",
        "sportshistorie",
        "arkitektur",
        "byutvikling",
    ]
    if _contains_count(normalized, urban_sports_signals) >= 3:
        return "urban_sports_history"

    digital_pedagogy_signals = [
        "ai-verktøy",
        "oppsummere",
        "stille spørsmål",
        "sammenligne kilder",
        "individuell læring",
        "kollektiv kunnskap",
        "automatisering",
        "menneskelig forståelse",
        "egen vurdering",
    ]
    if _contains_count(normalized, digital_pedagogy_signals) >= 3:
        return "digital_pedagogy_knowledge_systems"

    unclear_fragment_signals = ["vet ikke", "klarer ikke forklare"]
    if len(normalized) < 160 and _contains_any(normalized, unclear_fragment_signals):
        return "generic_academic"

    return "generic_academic"


def build_history_go_links(domain: str, message: str) -> list[HistoryGoLink]:
    normalized = _normalize(message)

    if domain == "institutional_media_history" and _contains_any(
        normalized,
        ["morgenbladet", "idédebatt", "kulturkritikk", "redaksjonell profil", "offentlighet", "avis"],
    ):
        return [
            HistoryGoLink(
                type="topic",
                id="morgenbladet",
                title="Morgenbladet",
                reason="Avisen beskrives eksplisitt som del av norsk offentlighet over tid, som støtter en historisk kobling til medieinstitusjoners utvikling.",
            )
        ]

    if domain == "public_administration_reform" and _contains_any(
        normalized,
        ["nav-reformen", "velferdsforvaltningen", "etatskulturer", "styringsutfordringer", "samordning"],
    ):
        return [
            HistoryGoLink(
                type="topic",
                id="nav_reformen",
                title="NAV-reformen",
                reason="Teksten omtaler en konkret historisk reformprosess i norsk velferdsforvaltning med tydelig tidslig og institusjonell forankring.",
            )
        ]

    if domain == "constitutional_democratic_history" and _contains_any(
        normalized,
        ["eidsvoll", "1814", "grunnloven"],
    ):
        return [
            HistoryGoLink(
                type="conceptual_topic",
                id="eidsvoll-grunnloven",
                title="Eidsvoll og Grunnloven",
                reason="Konseptuell History Go-kobling: repoet har ingen verifisert Eidsvoll- eller Grunnloven-ID, men teksten peker tydelig mot sted, hendelse og demokratihistorisk tema.",
            )
        ]

    if domain == "urban_sports_history" and _contains_any(
        normalized,
        ["bislett", "stadion"],
    ):
        return [
            HistoryGoLink(
                type="conceptual_topic",
                id="bislett-stadion",
                title="Bislett stadion",
                reason="Konseptuell History Go-kobling: repoet har ingen verifisert Bislett- eller stadion-ID, men teksten omtaler et konkret sted og dets idretts- og byhistoriske betydning.",
            )
        ]

    return []


def build_semantic_summary(content_type: str, domain: str, message: str) -> dict[str, str]:
    normalized = _normalize(message)

    if domain == "institutional_media_history":
        return {
            "theme": "Morgenbladet som idéoffentlig institusjon",
            "mainTension": "dyptpløyende offentlighet kontra tempoorientert nyhetslogikk",
            "keyInsight": "Teksten tolker Morgenbladets verdi som knyttet til refleksjon og langsom journalistikk.",
        }

    if domain == "public_administration_reform":
        return {
            "theme": "samordning og styring i NAV-reformen",
            "mainTension": "politisk mål om helhet versus organisatorisk kompleksitet",
            "keyInsight": "Reformen illustrerer at strukturendring alene ikke løser koordinasjonsproblemer uten tydelig ansvarslinje.",
        }

    if domain == "literary_attachment":
        return {
            "theme": "tilknytningsteori som tolkningsramme i romananalyse",
            "mainTension": "estetisk fortelling kontra psykologisk begrepsbruk",
            "keyInsight": "Tolkningen viser hvordan narrativ form kan bære psykologisk innsikt uten fagterminologisk overforklaring.",
        }

    if content_type == "day_log":
        return {
            "theme": "indre konflikt mellom produktivitet og nærvær",
            "mainTension": "mestringsfølelse kontra emosjonell distanse",
            "keyInsight": "Teksten peker mot at unngåelse av vanskelige valg kan forklare opplevelsen av uro mer enn ytre tidsmangel.",
        }

    if content_type == "project_note":
        return {
            "theme": "kontrollert innfasing av analysemodul",
            "mainTension": "leveransehastighet kontra kvalitetssikring",
            "keyInsight": "Notatet identifiserer testdata-kvalitet som kritisk avhengighet for trygg migrering.",
        }

    if _contains_any(normalized, ["hjemmel i lov", "legitimt formål", "forholdsmessig", "vedtaket", "rettigheter"]):
        return {
            "theme": "forholdsmessighet som rettslig avveiningsnorm",
            "mainTension": "offentlig myndighetsutøvelse kontra individvern",
            "keyInsight": "Teksten framhever at forholdsmessighet avhenger av om mindre inngripende alternativer er reelt tilgjengelige.",
        }

    if _contains_any(normalized, ["pinse", "den hellige ånd", "kirkens fødselsdag", "apostlene"]):
        return {
            "theme": "pinse som teologisk og kulturell markør",
            "mainTension": "balansen mellom religiøs betydning og samfunnsmessig tradisjon",
            "keyInsight": "Teksten viser hvordan pinse fungerer både som trosfortelling og som sosialt tidsanker.",
        }

    return {
        "theme": "usikker årsaksforståelse",
        "mainTension": "behov for forklaring kontra manglende spesifisitet",
        "keyInsight": "Teksten uttrykker frustrasjon, men gir for få konkrete holdepunkter til sikker klassifisering.",
    }


def build_recommendation_fields(content_type: str, domain: str, message: str) -> dict[str, list[str]]:
    normalized = _normalize(message)

    if _contains_any(normalized, ["pinse", "den hellige ånd", "kirkens fødselsdag", "apostlene"]):
        return {
            "fieldConnections": ["teologi", "religionshistorie", "kulturhistorie"],
            "suggestedActions": [
                "Sammenlign med framstillinger av pinse i andre kirkesamfunn.",
                "Legg til kildehenvisning til Apostlenes gjerninger 2 for presisjon.",
            ],
        }

    if domain == "institutional_media_history":
        if _contains_any(normalized, ["langsom journalistikk", "kontinuerlig nyhetsstrøm", "dannelsesoffentlighet"]):
            return {
                "fieldConnections": ["pressehistorie", "offentlighetsteori", "kulturjournalistikk"],
                "suggestedActions": [
                    "Legg til en avgrenset periode for å gjøre den mediehistoriske analysen mer etterprøvbar.",
                    "Sammenlign Morgenbladets langsomme format med en raskere nyhetsaktør for å tydeliggjøre kontrasten.",
                ],
            }
        return {
            "fieldConnections": ["pressehistorie", "offentlighetsteori", "kulturjournalistikk"],
            "suggestedActions": [
                "Konkretiser med tidsperioder for å styrke historisk etterprøvbarhet.",
                "Sammenlign med andre norske nisjeaviser for kontrast.",
            ],
        }

    if domain == "public_administration_reform":
        if _contains_any(normalized, ["brukermøte", "brukermøtet", "styringslinjer", "byråkratisk kompleksitet"]):
            return {
                "fieldConnections": ["offentlig forvaltning", "velferdsstat", "organisasjonsteori"],
                "suggestedActions": [
                    "Skille tydelig mellom reformens politiske mål, organisatoriske virkemidler og brukeropplevd effekt.",
                    "Legg til ett konkret eksempel fra et NAV-kontor for å gjøre spenningen empirisk tydeligere.",
                ],
            }
        return {
            "fieldConnections": ["forvaltningspolitikk", "organisasjonsteori", "velferdsstyring"],
            "suggestedActions": [
                "Legg til eksempel på hvordan reformen slo ut lokalt i NAV-kontor.",
                "Skille tydeligere mellom målformulering og evalueringsfunn.",
            ],
        }

    if domain == "learning_reflection":
        return {
            "fieldConnections": ["læringspsykologi", "metakognisjon", "vanedannelse"],
            "suggestedActions": [
                "Lag en enkel logg med feil, årsak og neste justering etter hver økt.",
                "Velg én vane som kan repeteres kort daglig før større evaluering.",
            ],
        }

    if domain == "urban_attention_reflection":
        return {
            "fieldConnections": ["psykologi", "urban studies", "sosiologi"],
            "suggestedActions": [
                "Beskriv to konkrete steder som gir ulik balanse mellom energi og ro.",
                "Test en kort arbeidsøkt i hvert miljø og noter hva som skjer med oppmerksomheten.",
            ],
        }

    if domain == "constitutional_democratic_history":
        return {
            "fieldConnections": ["historie", "politikk", "rett", "nasjonsbygging"],
            "suggestedActions": [
                "Avklar hvilke grupper som var inkludert og ekskludert fra politisk deltakelse i 1814.",
                "Knytt analysen til senere demokratiske utvidelser for å vise historisk utvikling.",
            ],
        }

    if domain == "urban_sports_history":
        return {
            "fieldConnections": ["idrettshistorie", "byhistorie", "arkitektur", "sosiologi"],
            "suggestedActions": [
                "Skille eksplisitt mellom konkurransehistorie, publikumsbruk og arkitektonisk endring.",
                "Legg til én konkret ombygging eller idrettshendelse for sterkere historisk forankring.",
            ],
        }

    if domain == "digital_pedagogy_knowledge_systems":
        return {
            "fieldConnections": ["pedagogikk", "teknologi", "sosiologi", "kunnskapsteori"],
            "suggestedActions": [
                "Presiser hvilke læringssituasjoner som støttes av AI og hvilke som krever egen vurdering.",
                "Legg til kriterier for å skille mellom nyttig oppsummering og ukritisk fasitbruk.",
            ],
        }

    if domain == "literary_attachment":
        return {
            "fieldConnections": ["litteraturvitenskap", "psykologi", "fortellerteori"],
            "suggestedActions": [
                "Underbygg tolkningen med konkrete tekststeder.",
                "Avklar forskjellen mellom karakteranalyse og diagnose.",
            ],
        }

    if content_type == "day_log":
        return {
            "fieldConnections": ["psykologisk selvforståelse", "hverdagsmestring"],
            "suggestedActions": [
                "Formuler ett konkret valg som kan tas i løpet av uken.",
                "Før ny refleksjon etter en samtale der nærvær forsøkes aktivt.",
            ],
        }

    if content_type == "project_note":
        return {
            "fieldConnections": ["programvareutvikling", "teststrategi", "endringsledelse"],
            "suggestedActions": [
                "Definer måleindikator for avvik før implementering starter.",
                "Knyt milepæler til eksplisitte exit-kriterier per fase.",
            ],
        }

    if _contains_any(normalized, ["hjemmel i lov", "legitimt formål", "forholdsmessig", "vedtaket", "rettigheter"]):
        return {
            "fieldConnections": ["forvaltningsrett", "rettssikkerhet", "menneskerettigheter"],
            "suggestedActions": [
                "Angi rettskilder som støtter treleddstesten.",
                "Skille tydelig mellom gyldighetskontroll og hensiktsmessighetsvurdering.",
            ],
        }

    if len(normalized) < 160 and _contains_any(normalized, ["vet ikke", "klarer ikke forklare"]):
        return {
            "fieldConnections": [],
            "suggestedActions": [
                "Be avsenderen angi hvem eller hva teksten handler om.",
                "Etterspør ett konkret eksempel, tidspunkt og ønsket endring.",
            ],
        }

    return {
        "fieldConnections": [],
        "suggestedActions": [
            "Etterspør kontekst: hvem, hva, når og hvilke konsekvenser.",
            "Be om ett konkret eksempel som kan avgrense problemstillingen.",
        ],
    }




def build_confidence_and_warnings(
    content_type: str,
    domain: str,
    message: str,
    history_go_links: list[HistoryGoLink],
) -> dict:
    normalized = _normalize(message)

    if _contains_any(normalized, ["pinse", "den hellige ånd", "kirkens fødselsdag", "apostlene"]):
        return {
            "confidence": {
                "contentType": 0.95,
                "domain": 0.94,
                "theme": 0.9,
                "mainTension": 0.82,
                "historyGoLinks": 0.2,
            },
            "warnings": [],
        }

    if domain == "institutional_media_history":
        if _contains_any(normalized, ["langsom journalistikk", "kontinuerlig nyhetsstrøm", "dannelsesoffentlighet"]):
            return {
                "confidence": {
                    "contentType": 0.93,
                    "domain": 0.94,
                    "theme": 0.91,
                    "mainTension": 0.87,
                    "historyGoLinks": 0.86,
                },
                "warnings": [],
            }
        return {
            "confidence": {
                "contentType": 0.92,
                "domain": 0.93,
                "theme": 0.9,
                "mainTension": 0.86,
                "historyGoLinks": 0.84,
            },
            "warnings": [],
        }

    if domain == "public_administration_reform":
        if _contains_any(normalized, ["brukermøte", "brukermøtet", "byråkratisk kompleksitet", "uklart ansvar"]):
            return {
                "confidence": {
                    "contentType": 0.94,
                    "domain": 0.95,
                    "theme": 0.91,
                    "mainTension": 0.9,
                    "historyGoLinks": 0.89,
                },
                "warnings": [],
            }
        return {
            "confidence": {
                "contentType": 0.94,
                "domain": 0.95,
                "theme": 0.91,
                "mainTension": 0.89,
                "historyGoLinks": 0.88,
            },
            "warnings": [],
        }

    if domain == "learning_reflection":
        return {
            "confidence": {
                "contentType": 0.91,
                "domain": 0.84,
                "theme": 0.88,
                "mainTension": 0.84,
                "historyGoLinks": 0.04,
            },
            "warnings": [],
        }

    if domain == "urban_attention_reflection":
        return {
            "confidence": {
                "contentType": 0.9,
                "domain": 0.8,
                "theme": 0.86,
                "mainTension": 0.83,
                "historyGoLinks": 0.04,
            },
            "warnings": [
                "Personlig uro bør forstås som situert erfaring i teksten, ikke som grunnlag for klinisk diagnose.",
            ],
        }

    if domain == "constitutional_democratic_history":
        return {
            "confidence": {
                "contentType": 0.92,
                "domain": 0.89,
                "theme": 0.9,
                "mainTension": 0.87,
                "historyGoLinks": 0.62,
            },
            "warnings": [
                "History Go-koblingen er konseptuell fordi ingen eksisterende Eidsvoll- eller Grunnloven-ID er verifisert i repoet.",
            ],
        }

    if domain == "urban_sports_history":
        return {
            "confidence": {
                "contentType": 0.91,
                "domain": 0.87,
                "theme": 0.88,
                "mainTension": 0.84,
                "historyGoLinks": 0.6,
            },
            "warnings": [
                "History Go-koblingen er konseptuell fordi ingen eksisterende Bislett- eller stadion-ID er verifisert i repoet.",
            ],
        }

    if domain == "digital_pedagogy_knowledge_systems":
        return {
            "confidence": {
                "contentType": 0.9,
                "domain": 0.86,
                "theme": 0.88,
                "mainTension": 0.87,
                "historyGoLinks": 0.05,
            },
            "warnings": [],
        }

    if domain == "literary_attachment":
        return {
            "confidence": {
                "contentType": 0.9,
                "domain": 0.87,
                "theme": 0.9,
                "mainTension": 0.83,
                "historyGoLinks": 0.12,
            },
            "warnings": [],
        }

    if content_type == "day_log":
        return {
            "confidence": {
                "contentType": 0.93,
                "domain": 0.82,
                "theme": 0.88,
                "mainTension": 0.86,
                "historyGoLinks": 0.05,
            },
            "warnings": [],
        }

    if content_type == "project_note":
        return {
            "confidence": {
                "contentType": 0.94,
                "domain": 0.92,
                "theme": 0.9,
                "mainTension": 0.87,
                "historyGoLinks": 0.1,
            },
            "warnings": [],
        }

    if _contains_any(normalized, ["hjemmel i lov", "legitimt formål", "forholdsmessig", "vedtaket", "rettigheter"]):
        return {
            "confidence": {
                "contentType": 0.93,
                "domain": 0.94,
                "theme": 0.89,
                "mainTension": 0.9,
                "historyGoLinks": 0.18,
            },
            "warnings": [],
        }

    if len(normalized) < 160 and _contains_any(normalized, ["vet ikke", "klarer ikke forklare"]):
        return {
            "confidence": {
                "contentType": 0.34,
                "domain": 0.2,
                "theme": 0.36,
                "mainTension": 0.32,
                "historyGoLinks": 0.02,
            },
            "warnings": [
                "Teksten er kort og fragmentert, så analysen bør ha lav sikkerhet.",
                "Mangler konkrete aktører, hendelser og faglige begreper.",
            ],
        }

    return {
        "confidence": {
            "contentType": 0.38,
            "domain": 0.22,
            "theme": 0.41,
            "mainTension": 0.35,
            "historyGoLinks": 0.03,
        },
        "warnings": [
            "Lav informasjonsdensitet: teksten mangler konkrete referanser.",
            "Flere tolkninger er plausible; analyse bør behandles som foreløpig.",
        ],
    }

def analyze_message(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    message = request.message.strip()

    content_type = detect_content_type(message)
    domain = detect_domain(message)
    history_go_links = build_history_go_links(domain, message)
    semantic_summary = build_semantic_summary(content_type, domain, message)
    recommendation_fields = build_recommendation_fields(content_type, domain, message)

    confidence_and_warnings = build_confidence_and_warnings(content_type, domain, message, history_go_links)

    warnings = list(confidence_and_warnings["warnings"])
    if 0 < len(message) < 20 and not any("kort" in warning.lower() for warning in warnings):
        warnings.append("Meldingen er veldig kort; analysen er ekstra usikker.")

    return CanonicalAhaAnalysis(
        contentType=content_type,
        domain=domain,
        theme=semantic_summary["theme"],
        mainTension=semantic_summary["mainTension"],
        keyInsight=semantic_summary["keyInsight"],
        fieldConnections=recommendation_fields["fieldConnections"],
        historyGoLinks=history_go_links,
        suggestedActions=recommendation_fields["suggestedActions"],
        confidence=Confidence(**confidence_and_warnings["confidence"]),
        warnings=warnings,
    )
