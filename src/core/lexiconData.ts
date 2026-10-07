// Built-in free-text mood lexicon (offline). Format per line:
//   "term1, term2, multi word phrase : mood=w mood=w | b=brightness t=tension c=chromaticism s=stability e=energy | modes"
// moods use the KB mood ids; dims: b in -1..1, others 0..1; modes are ModeIds.
// Can be extended/overridden at runtime by research/theory/mood_lexicon.json (see lexicon.ts).
export const LEXICON_LINES = `
happy, joyful, joy, cheerful, glad, merry, jolly, upbeat, feel good, feel-good, good vibes : bright=1 playful=0.4 | b=0.8 t=0.15 e=0.65 s=0.6
bright, sunny, sunshine, sunlit, radiant, shiny, sparkling, sparkly, summer, summery : bright=1 hopeful=0.3 | b=0.85 e=0.6
uplifting, inspiring, inspirational, encouraging, motivational, rising : hopeful=1 triumphant=0.4 | b=0.6 e=0.6
hopeful, optimistic, hope, aspirational, new beginning, sunrise, dawn, morning : hopeful=1 bright=0.3 | b=0.55 s=0.5
triumphant, victorious, victory, winning, champion, celebration, celebratory, celebrate, fanfare, glorious, glory : triumphant=1 epic=0.3 | b=0.7 e=0.9 s=0.7
heroic, hero, brave, courage, courageous, valiant, noble, bold : epic=0.8 triumphant=0.6 | b=0.4 e=0.85
epic, cinematic, grand, majestic, huge, massive, monumental, sweeping, larger than life, trailer, blockbuster : epic=1 | e=0.9 c=0.4
anthemic, anthem, stadium, arena : triumphant=0.8 epic=0.6 | b=0.6 e=0.9 s=0.6
powerful, mighty, strong, forceful, intense, fierce : epic=0.7 dramatic=0.5 | e=0.95 t=0.5
warm, cozy, cosy, comforting, comfort, homely, home, hug, tender, gentle, soft : warm=1 | b=0.4 t=0.1 s=0.7 e=0.25
peaceful, calm, serene, tranquil, still, quiet, relaxed, relaxing, chill, mellow, laid back, laid-back, easy : warm=0.6 floating=0.5 resolved=0.3 | t=0.05 e=0.15 s=0.7
safe, secure, settled, grounded, stable, solid, resolved, final, conclusive, closure, ending, finished, arrival, arrive, homecoming : resolved=1 | s=0.95 t=0.05
romantic, love, loving, in love, lush, sensual, intimate, passionate, sweet, sweetness, valentine : romantic=1 warm=0.3 | b=0.4 t=0.25 c=0.35
nostalgic, nostalgia, memories, memory, remember, reminiscent, childhood, old photos, vintage, retro, throwback, yesteryear : nostalgic=1 bittersweet=0.3 | b=0.1 e=0.3
bittersweet, poignant, mixed feelings, happy sad, happy-sad, sad but hopeful, tearful smile : bittersweet=1 | b=0 t=0.3
wistful, pensive, reflective, contemplative, thoughtful, introspective, musing, daydream : nostalgic=0.5 bittersweet=0.5 dreamy=0.3 | b=-0.1 e=0.2
sad, sadness, unhappy, sorrow, sorrowful, sorrowing, crying, tears, tearful, weeping, blue, down, downcast : melancholy=1 | b=-0.7 e=0.2
melancholy, melancholic, gloomy, somber, sombre, mournful, mourning, lament, elegy, elegiac, funeral, grief, grieving, heartbroken, heartbreak, broken heart : melancholy=1 dark=0.2 | b=-0.75 e=0.15 s=0.4
lonely, loneliness, alone, isolated, empty, emptiness, abandoned, solitary : melancholy=0.7 floating=0.3 | b=-0.5 e=0.1 s=0.3
regret, guilt, remorse, apology, sorry : melancholy=0.7 yearning=0.4 | b=-0.5
yearning, longing, longing for, aching, pining, desire, wanting, missing you, miss you, homesick, reaching : yearning=1 | b=-0.1 t=0.5 s=0.25
dark, darkness, shadow, shadows, shadowy, night, midnight, black, bleak, grim, gothic, goth : dark=1 | b=-0.85 e=0.4
heavy, crushing, doom, doomy, grave, serious, brooding, moody : dark=0.9 dramatic=0.3 | b=-0.7 e=0.6
ominous, menacing, threatening, sinister, foreboding, villain, villainous, evil, danger, dangerous, dread, impending : ominous=1 dark=0.4 | b=-0.85 t=0.8 c=0.55
scary, spooky, creepy, horror, haunted, frightening, fear, afraid, nightmare, terror, terrifying : ominous=0.7 uncanny=0.7 | b=-0.8 t=0.85 c=0.7
haunting, eerie, ghostly, ghost, spectral, phantom, otherworldly, unearthly, uncanny, strange, weird, alien, liminal : uncanny=0.8 mystical=0.5 | b=-0.35 t=0.55 c=0.75
tense, tension, suspense, suspenseful, anxious, anxiety, nervous, uneasy, edgy, on edge, restless, thriller, chase : tense=1 | t=0.9 s=0.15 e=0.75
dramatic, drama, tragic, tragedy, theatrical, operatic, pathos, desperate, desperation, climax : dramatic=1 | t=0.7 e=0.85 b=-0.3
angry, anger, rage, furious, aggressive, violent, hostile, war, battle, fight, fighting : dramatic=0.6 ominous=0.5 tense=0.4 | b=-0.6 t=0.85 e=1
mysterious, mystery, enigmatic, cryptic, secret, secrets, hidden, unknown, puzzle, riddle, noir : mystical=0.8 uncanny=0.3 | b=-0.2 t=0.45 c=0.6 | dorian
mystical, magical, magic, enchanted, enchanting, spell, spells, wizard, witch, fairy, fairytale, fae, arcane, sorcery : mystical=1 wonder=0.4 | b=0.1 c=0.6 | lydian
spiritual, sacred, holy, divine, heavenly, prayer, hymn, church, cathedral, temple, meditation, meditative, zen, transcendent : mystical=0.6 floating=0.4 warm=0.3 | s=0.6 e=0.2 t=0.15
ancient, old world, medieval, mythic, myth, legend, legendary, ruins, tomb, desert, pharaoh : mystical=0.6 epic=0.4 earthy=0.3 | c=0.55 b=-0.2 | dorian phrygianDominant
exotic, middle eastern, arabian, flamenco, spanish, gypsy, bazaar : mystical=0.6 dramatic=0.4 | c=0.7 | phrygianDominant
dreamy, dream, dreaming, dreamlike, hazy, haze, foggy, fog, misty, mist, cloud, clouds, cloudy, soft focus, reverie, lullaby, sleepy, drowsy : dreamy=1 floating=0.4 | b=0.2 t=0.15 e=0.15 c=0.4
ethereal, airy, weightless, floating, float, drifting, drift, hovering, suspended, spacey, spacious, ambient, atmospheric : floating=1 dreamy=0.5 | t=0.2 s=0.3 e=0.15 c=0.4
wonder, awe, awestruck, amazed, amazement, sublime, majesty, stars, starry, starlight, galaxy, cosmic, space, universe, sky, aurora, discovery, discovering : wonder=1 mystical=0.3 | b=0.55 c=0.5 e=0.55 | lydian
surprise, surprising, unexpected, twist, sudden, plot twist, shock, shocking : surprising=1 | c=0.75 t=0.5
playful, fun, funny, silly, cheeky, whimsical, quirky, bouncy, cartoon, cartoonish, goofy, mischievous, toy, toys, kids, childish : playful=1 bright=0.4 | b=0.7 e=0.75 t=0.2
bluesy, blues, gritty, grit, raw, swagger, funky, funk, groovy, groove, soul, soulful, gospel : bluesy=1 earthy=0.3 | e=0.6 c=0.4 | mixolydian
jazzy, jazz, sophisticated, smooth, classy, urbane, lounge, cocktail, cool, suave, noir jazz, bossa : jazzy=1 | c=0.55 t=0.35
earthy, folk, folky, rustic, country, rural, pastoral, campfire, acoustic, roots, rootsy, rock, rocky, celtic, irish, scottish : earthy=1 | b=0.2 c=0.2 | mixolydian dorian
forest, woods, woodland, trees, moss, mossy, nature, river, meadow, mountain, mountains : earthy=0.6 mystical=0.4 floating=0.2 | b=0 c=0.35 | dorian
ocean, sea, waves, tide, beach, rain, rainy, raining, storm, stormy, thunder, snow, snowy, winter, cold, icy, ice, frost : floating=0.5 melancholy=0.3 dreamy=0.3 | b=-0.2 e=0.35
autumn, fall, falling leaves, dusk, twilight, sunset, evening : nostalgic=0.6 bittersweet=0.5 | b=-0.1 e=0.25
spring, blossom, bloom, flowers, garden, fresh, breeze : hopeful=0.7 bright=0.5 | b=0.6 e=0.45
city, urban, neon, street, streets, downtown, nightlife, rain-soaked : jazzy=0.5 dark=0.3 bluesy=0.3 | c=0.45 e=0.55
video game, 8-bit, chiptune, arcade, retro game : playful=0.7 bright=0.5 | b=0.6 e=0.8
lofi, lo-fi, study, studying, cafe, coffee shop : jazzy=0.5 warm=0.5 nostalgic=0.4 | e=0.2 t=0.2 c=0.4
film noir, detective, spy, heist : mystical=0.4 tense=0.5 jazzy=0.4 | b=-0.4 c=0.65 t=0.6
cyberpunk, dystopian, dystopia, apocalypse, apocalyptic, wasteland : dark=0.7 ominous=0.5 epic=0.3 | b=-0.7 c=0.65 e=0.7
sci-fi, science fiction, futuristic, robot, robots : wonder=0.5 uncanny=0.5 | c=0.7 | lydian
adventure, adventurous, journey, quest, explore, exploring, voyage, travel, road trip : epic=0.6 hopeful=0.5 wonder=0.3 | b=0.45 e=0.7 | lydian mixolydian
energetic, energy, exciting, excited, excitement, driving, pumping, hype, hyped, party, dance, dancing, wild : triumphant=0.4 playful=0.4 | e=1 b=0.4
slow, sluggish, lazy, dragging : floating=0.5 melancholy=0.3 | e=0.1
fast, quick, rush, rushing, racing, frantic, urgent, urgency, hurry : tense=0.6 | e=1 t=0.7
unresolved, open-ended, open ended, question, questioning, unfinished, hanging, cliffhanger, ambiguous, ambiguity, uncertain, uncertainty : floating=0.6 yearning=0.4 | s=0.1 t=0.5
confident, proud, pride, determined, determination, defiant, unstoppable : triumphant=0.7 epic=0.4 | b=0.5 e=0.8 s=0.7
innocent, pure, naive, simple, childlike, lullaby-like : bright=0.6 warm=0.5 | b=0.6 c=0.05 t=0.05
complex, complicated, sophisticated harmony, unusual, weird chords, colorful, colourful, chromatic, quirky harmony, experimental, avant-garde : surprising=0.5 jazzy=0.4 | c=0.9
plain, simple chords, basic, classic, traditional, conventional, safe, predictable, familiar, pop, poppy, catchy : resolved=0.4 bright=0.3 | c=0.1 s=0.7
dissonant, harsh, clashing, crunchy, grating, abrasive : tense=0.8 uncanny=0.3 | t=0.95 c=0.85
haunted forest, foggy forest, misty forest, enchanted forest, dark forest : mystical=0.7 dreamy=0.4 uncanny=0.3 | b=-0.3 c=0.6 | dorian
starry night, night sky : wonder=0.7 dreamy=0.5 | b=0.3 c=0.45 | lydian
rainy day, rainy night, grey day, gray day, overcast : melancholy=0.7 nostalgic=0.4 dreamy=0.3 | b=-0.4 e=0.2
victory lap, final boss : epic=0.8 dramatic=0.6 | e=1 t=0.6
sunday morning, lazy sunday : warm=0.8 bright=0.4 | b=0.5 e=0.2 t=0.05
heartwarming, wholesome, touching, moving, emotional, sentimental : warm=0.7 bittersweet=0.4 romantic=0.3 | b=0.3 e=0.35
cold-hearted, cruel, ruthless, merciless : ominous=0.8 dark=0.5 | b=-0.85 t=0.75
bored, boring, dull, monotonous : floating=0.3 | e=0.05 c=0.05
determined struggle, struggle, struggling, overcome, overcoming, rise up, rising up : dramatic=0.5 hopeful=0.5 triumphant=0.3 | e=0.8 t=0.55
royal, regal, king, queen, castle, kingdom, coronation : triumphant=0.6 epic=0.6 | b=0.5 e=0.7 s=0.7
pirate, sea shanty, tavern, shanty : earthy=0.6 playful=0.5 | b=0.3 e=0.7 | dorian mixolydian
dreamscape, surreal, psychedelic, trippy, kaleidoscope : dreamy=0.7 uncanny=0.4 surprising=0.3 | c=0.8 | lydian
majestic sadness, noble sadness : melancholy=0.6 epic=0.6 | b=-0.4 e=0.6
`;

/** Intensifiers / diminishers / negators / contrast words. */
export const INTENSIFIERS: Record<string, number> = {
  very: 1.5, really: 1.4, super: 1.5, extremely: 1.8, so: 1.3, incredibly: 1.7, totally: 1.4, deeply: 1.5, utterly: 1.7,
  more: 1.3, most: 1.6, intensely: 1.6, ultra: 1.7, hugely: 1.6, truly: 1.3,
  slightly: 0.5, somewhat: 0.6, little: 0.5, bit: 0.5, kinda: 0.6, kind: 0.6, sort: 0.6, mildly: 0.5, faintly: 0.4, hint: 0.4, touch: 0.45, less: 0.5, barely: 0.3, gently: 0.6,
};
export const NEGATORS = new Set(['not', 'no', 'never', "isn't", "don't", 'without', 'non', 'nothing', 'avoid', 'less']);
export const CONTRAST = new Set(['but', 'yet', 'though', 'although', 'however', 'still']);
export const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'like', 'as', 'it', 'its', "it's", 'is', 'be', 'feel', 'feels', 'feeling',
  'sound', 'sounds', 'sounding', 'vibe', 'vibes', 'mood', 'that', 'this', 'some', 'something', 'me', 'my', 'i', 'want', 'make', 'more', 'of', 'kind', 'sort',
  'song', 'music', 'tune', 'chord', 'chords', 'melody', 'progression', 'by', 'from', 'into', 'through', 'over', 'under', 'about', 'very', 'bit', 'little', 'just', 'quite',
]);
