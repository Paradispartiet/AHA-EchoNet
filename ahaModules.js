// ahaModules.js

(function () {
  "use strict";

  const AHA_MODULES = [
    {
      id: "profile",
      title: "AHA Profil",
      type: "core",
      status: "shell",
      href: "profile.html",
      description: "Brukerens personlige representasjonslag: profil, innlogging, progresjon, galleri og innsikter.",
      phase: 1
    },
    { id: "chat", title: "AHA Chat", type: "core", status: "active", href: "chat.html", description: "Refleksjon, samtale og innsiktsmotor via eksisterende AHAIngest-flyt.", phase: 1 },
    { id: "insights", title: "Innsikter", type: "core", status: "shell", href: "insights.html", description: "Samlet innsiktsarkiv med sporbarhet fra source events og meta-mønstre.", phase: 1 },
    { id: "lists", title: "Lister", type: "shell", status: "shell", href: "lists.html", description: "Favoritter, gjøremål og AI-støttede lister koblet til innsikter.", phase: 1 },
    { id: "paths", title: "Stier", type: "shell", status: "shell", href: "paths.html", description: "Læringsreiser over tid: samtale → innsikt → handling.", phase: 1 },
    { id: "mindmap", title: "Tankekart", type: "shell", status: "shell", href: "mindmap.html", description: "Visuell graf for sammenhenger mellom samtaler, innsikter og begreper.", phase: 1 },
    { id: "historygo", title: "History Go", type: "bridge", status: "active", href: "historygo.html", description: "Importbro og oversikt mellom History Go og AHA uten å blande motorene.", phase: 1 },
    { id: "gallery", title: "Galleri", type: "core", status: "active", href: "gallery.html", description: "Personlig bildegalleri, minner og visuelle uttrykk som kan ingestes.", phase: 1 },
    { id: "notes", title: "Notes", type: "core", status: "active", href: "notes.html", description: "Egne notater og tekster sendt gjennom AHAIngest.", phase: 1 },
    { id: "insta", title: "AHA Insta", type: "core", status: "active", href: "insta.html", description: "Bilde- og videostrøm med personlig kontekst.", phase: 1 },
    { id: "feed", title: "Feed", type: "core", status: "active", href: "feed.html", description: "Korte poster og delte refleksjoner i AHA.", phase: 1 },
    { id: "meet", title: "Meet", type: "shell", status: "shell", href: "meet.html", description: "Møtepunkt for samtaler, avtaler og samarbeidsflater.", phase: 2 },
    { id: "music", title: "Music", type: "shell", status: "shell", href: "music.html", description: "Musikkflater, lydspor og personlig lydarkiv.", phase: 2 },
    { id: "avisa", title: "AHAavisa", type: "shell", status: "shell", href: "avisa.html", description: "Kuraterte historier og personlige oppsummeringer basert på innsikter.", phase: 2 },
    { id: "groups", title: "Grupper", type: "shell", status: "shell", href: "groups.html", description: "Fellesrom for samarbeid, deling og kollektiv EchoNet-bygging.", phase: 2 },
    { id: "search", title: "Søk", type: "shell", status: "shell", href: "search.html", description: "Tverrgående søk i samtaler, notater, galleri, feed og importerte kilder.", phase: 2 },
    { id: "privacy", title: "Personvern", type: "core", status: "shell", href: "privacy.html", description: "Transparens, datakontroll og samtykke for hele AHA-laget.", phase: 1 }
  ];

  window.AHA_MODULES = AHA_MODULES;
})();
