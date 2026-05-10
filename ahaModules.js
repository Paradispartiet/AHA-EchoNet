// ahaModules.js

(function () {
  "use strict";

  const AHA_MODULES = [
    {
      id: "profile",
      title: "AHA Profil",
      type: "personal",
      status: "shell",
      href: "profile.html",
      description: "Brukerens personlige representasjonslag: profil, innlogging, progresjon, galleri og innsikter.",
      phase: 1
    },
    { id: "chat", title: "AHA Chat", type: "core", status: "active", href: "chat.html", description: "Refleksjon, samtale og innsiktsmotor via eksisterende AHAIngest-flyt.", phase: 1 },
    { id: "insights", title: "Innsikter", type: "knowledge", status: "shell", href: "insights.html", description: "Samlet innsiktsarkiv med sporbarhet fra source events og meta-mønstre.", phase: 1 },
    { id: "lists", title: "Lister", type: "knowledge", status: "shell", href: "lists.html", description: "Favoritter, gjøremål og AI-støttede lister koblet til innsikter.", phase: 1 },
    { id: "paths", title: "Stier", type: "knowledge", status: "shell", href: "paths.html", description: "Læringsreiser over tid: samtale → innsikt → handling.", phase: 1 },
    { id: "mindmap", title: "Tankekart", type: "knowledge", status: "shell", href: "mindmap.html", description: "Visuell graf for sammenhenger mellom samtaler, innsikter og begreper.", phase: 1 },
    { id: "historygo", title: "History Go", type: "historygo", status: "active", href: "historygo.html", description: "Importbro og oversikt mellom History Go og AHA uten å blande motorene.", phase: 1 },
    { id: "gallery", title: "Galleri", type: "personal", status: "active", href: "gallery.html", description: "Personlig bildegalleri, minner og visuelle uttrykk som kan ingestes.", phase: 1 },
    { id: "notes", title: "Notes", type: "personal", status: "active", href: "notes.html", description: "Egne notater og tekster sendt gjennom AHAIngest.", phase: 1 },
    { id: "insta", title: "AHA Insta", type: "personal", status: "active", href: "insta.html", description: "Bilde- og videostrøm med personlig kontekst.", phase: 1 },
    { id: "feed", title: "Feed", type: "social", status: "active", href: "feed.html", description: "Korte poster og delte refleksjoner i AHA.", phase: 1 },
    { id: "meet", title: "Meet", type: "social", status: "shell", href: "meet.html", description: "Møtepunkt for samtaler, avtaler og samarbeidsflater.", phase: 2 },
    { id: "music", title: "Music", type: "personal", status: "shell", href: "music.html", description: "Musikkflater, lydspor og personlig lydarkiv.", phase: 2 },
    { id: "avisa", title: "AHAavisa", type: "publishing", status: "shell", href: "avisa.html", description: "Kuraterte historier og personlige oppsummeringer basert på innsikter.", phase: 2 },
    { id: "groups", title: "Grupper", type: "social", status: "shell", href: "groups.html", description: "Fellesrom for samarbeid, deling og kollektiv EchoNet-bygging.", phase: 2 },
    { id: "search", title: "Søk", type: "system", status: "shell", href: "search.html", description: "Tverrgående søk i samtaler, notater, galleri, feed og importerte kilder.", phase: 2 },
    { id: "privacy", title: "Personvern", type: "system", status: "shell", href: "privacy.html", description: "Transparens, datakontroll og samtykke for hele AHA-laget.", phase: 1 }
  ];

  window.AHA_MODULES = AHA_MODULES;
})();
