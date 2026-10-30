import type { FilmInput } from "./agent";

export type Sample = FilmInput & { key: string; tag: string; replay?: string };

export const SAMPLES: Sample[] = [
  {
    key: "drama",
    tag: "Awards drama · winter 26",
    title: "The Long Quiet",
    logline: "A grieving sound engineer restores her late father's tapes and uncovers the life he hid from her.",
    comps: ["Past Lives", "Aftersun", "Manchester by the Sea"],
    start: "2026-11-06",
    end: "2027-01-29",
  },
  {
    key: "horror",
    tag: "Indie horror · spring 27",
    title: "Hollow Hours",
    logline: "A night-shift nurse realizes the patients on the empty fourth floor are asking for her by name.",
    comps: ["Hereditary", "Talk to Me", "The Witch"],
    start: "2027-02-05",
    end: "2027-04-30",
  },
  {
    key: "family",
    tag: "Animated family · summer 27",
    title: "Moss & Pebble",
    logline: "Two tiny forest spirits cross a city to bring spring back to their park.",
    comps: ["The Wild Robot", "Encanto", "Elemental"],
    start: "2027-05-07",
    end: "2027-08-27",
  },
  {
    key: "oppenheimer",
    tag: "Replay · Oppenheimer 2023",
    replay: "Illustrative replay of a 2023 release with today's Qloo data. Does the agent see Barbie as a different crowd?",
    title: "Oppenheimer",
    logline: "The story of J. Robert Oppenheimer and the making of the atomic bomb.",
    comps: ["Dunkirk", "Interstellar", "The Imitation Game"],
    start: "2023-06-23",
    end: "2023-08-25",
  },
  {
    key: "dnd",
    tag: "Replay · D&D 2023",
    replay: "Illustrative replay. Dungeons & Dragons opened one week before The Super Mario Bros. Movie.",
    title: "Dungeons & Dragons: Honor Among Thieves",
    logline: "A charming thief and a band of adventurers undertake an epic heist to retrieve a lost relic.",
    comps: ["Jumanji: Welcome to the Jungle", "Guardians of the Galaxy", "The Princess Bride"],
    start: "2023-03-10",
    end: "2023-04-28",
  },
];
