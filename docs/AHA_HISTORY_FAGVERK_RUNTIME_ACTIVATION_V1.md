# AHA History Fagverk runtime activation v1

Historie er aktivert som et fagvis runtime-subject fra den reviewgodkjente History Go-releasen `c16a187453d16a40f9cab4ca694c32e96014f31b`.

## Aktiv pakke

- 23 Historie-kapitler
- 69 registrerte modulfiler i kildepakken
- egen materialisert runtime-corpus og runtime-policy
- terskler: minimumscore 7, minst 2 bevis og tvetydighetsmargin 3
- obligatorisk tidsport: årstall eller eksplisitt historisk tidsuttrykk

## Avgrensning

Aktiveringen overstyrer bare det ene gamle Historie-seedkapitlet. Politikk forblir aktivt med sin eksisterende 13-kapitlers policy, Natur-seedet beholdes, og ingen andre kandidater blir runtimeinput. Full release er fortsatt deaktivert.

Runtime leser bare materialiserte filer under `data/integrations/runtime/` og den eksplisitte runtimepekeren. Review- og approvalfiler leses ikke av motoren.
