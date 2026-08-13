# History Go import fixtures

`history-go-export-array-visited-v1.json` er låst direkte fra
`Paradispartiet/History-Go` sin `exportHistoryGoData()` på commit
`7ddf8847b93f18546044f30de55b210f059ce2af`. Eksporten ble kjørt med den
historiske, fortsatt støttede listeformen for `visited_places`; resten av
toppnivåfeltene kommer fra den faktiske v1-produsenten.

Fixturet er ende-til-ende-beviset for produsent → kontrakt → samtykke →
AHA-signaler. Endringer i produsentens feltformer skal først oppdateres her,
deretter i både JSON Schema og runtime-validatoren.
