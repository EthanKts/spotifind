// Tag categories used to approximate "musical character" from Last.fm community tags.
// No free API exposes audio analysis (groove, bassline, harmony), so these curated groups
// are how Spotifind separates rhythm/genre/instrumentation signals from mood signals.

const list = (s: string) => new Set(s.split(",").map((x) => x.trim()).filter(Boolean));

/** Rhythm, genre feel and instrumentation — "how it moves and what it's played on". */
export const GROOVE = list(`
funk, funky, groove, groovy, jazz-funk, jazz funk, jazz fusion, fusion, soul, neo-soul, neo soul, r&b, rnb, rhythm and blues,
motown, northern soul, disco, nu disco, boogie, post-disco, house, deep house, french house, tech house, techno, minimal techno,
electro, electronic, electronica, idm, breakbeat, breaks, drum and bass, dnb, jungle, dubstep, uk garage, garage, 2-step, grime,
hip-hop, hip hop, rap, boom bap, trap, g-funk, jazz rap, abstract hip-hop, instrumental hip-hop, lo-fi hip hop, trip-hop, trip hop,
downtempo, afrobeat, afrobeats, afro-funk, highlife, reggae, dub, dancehall, ska, rocksteady, latin, salsa, latin jazz, bossa nova,
samba, mpb, tropicalia, cumbia, swing, big band, bebop, hard bop, cool jazz, modal jazz, post-bop, free jazz, spiritual jazz,
jazz, smooth jazz, acid jazz, soul jazz, gospel, blues, blues rock, rock, hard rock, classic rock, psychedelic rock, garage rock,
punk, post-punk, punk rock, new wave, synthpop, synth-pop, dance, dance-punk, indie, indie rock, indie pop, alternative,
alternative rock, shoegaze, dream pop, math rock, post-rock, progressive rock, krautrock, metal, heavy metal, folk, indie folk,
folk rock, country, americana, bluegrass, singer-songwriter, pop, art pop, k-pop, j-pop, city pop, soft rock, yacht rock, edm,
ambient, experimental, avant-garde, classical, minimalism, soundtrack, instrumental, acoustic, guitar, piano, rhodes, synth,
synthesizer, saxophone, sax, trumpet, brass, horns, strings, organ, hammond, bass, slap bass, drums, percussion, 808, vocoder,
talk box, beats, sampling, chopped and screwed, phonk, vaporwave, chillwave, hyperpop, emo, grunge, britpop, madchester,
latin funk, brazilian, japanese, french, african, ethio-jazz, desert blues, flamenco
`);

/** Emotional colour and energy. */
export const MOOD = list(`
chill, chillout, chill out, mellow, relaxing, relax, calm, peaceful, soothing, smooth, laid back, laid-back, easy listening,
melancholic, melancholy, sad, bittersweet, nostalgic, wistful, emotional, introspective, moody, dark, brooding, haunting,
atmospheric, dreamy, ethereal, hypnotic, psychedelic, trippy, spacey, cosmic, lush, warm, cozy, romantic, sensual, sexy, sultry,
happy, upbeat, uplifting, feel good, feel-good, joyful, fun, party, energetic, high energy, euphoric, epic, intense,
aggressive, angry, raw, gritty, heavy, playful, quirky, late night, night, summer, sunny, rainy day, sleep, driving,
groovy vibes, vibes, catchy, anthemic, cinematic
`);

/** Vocal delivery. */
export const VOCAL = list(`
female vocalists, female vocals, female vocalist, male vocalists, male vocals, male vocalist, falsetto, soulful, crooner,
spoken word, a cappella, harmonies, choir, vocal, vocal jazz, rapping, singer-songwriter, instrumental
`);

/** Era and production texture. */
export const PRODUCTION = list(`
lo-fi, lofi, hi-fi, analog, analogue, warm production, polished, raw, bedroom pop, home recording, live, 50s, 60s, 70s, 80s,
90s, 00s, 2000s, 2010s, 2020s, retro, vintage, modern, futuristic, minimal, maximalist, wall of sound, reverb, tape
`);

/** Instruments you can filter on, with the Last.fm tags that mean "this features it". */
export const INSTRUMENTS: { id: string; label: string; tags: string[] }[] = [
  { id: "guitar", label: "Guitar", tags: ["guitar", "electric guitar", "acoustic guitar", "guitarist", "guitar virtuoso", "jazz guitar", "blues guitar", "fingerstyle", "surf", "surf rock", "shred"] },
  { id: "piano", label: "Piano / keys", tags: ["piano", "pianist", "solo piano", "jazz piano", "rhodes", "fender rhodes", "keys", "keyboard", "electric piano", "neo-classical", "neoclassical"] },
  { id: "saxophone", label: "Saxophone", tags: ["saxophone", "sax", "tenor sax", "alto sax", "tenor saxophone", "saxophonist"] },
  { id: "brass", label: "Brass / horns", tags: ["trumpet", "brass", "horns", "horn section", "brass band", "trombone", "trumpeter"] },
  { id: "strings", label: "Strings", tags: ["strings", "violin", "cello", "string quartet", "orchestral", "orchestra", "chamber music", "chamber pop"] },
  { id: "synth", label: "Synths", tags: ["synth", "synthesizer", "synths", "analog synth", "synthpop", "synth-pop", "synthwave", "modular synth", "electronic", "electronica"] },
  { id: "bass", label: "Bass", tags: ["bass", "bassline", "slap bass", "funk bass", "bassist", "dub", "jazz-funk"] },
  { id: "drums", label: "Drums / percussion", tags: ["drums", "percussion", "drummer", "breakbeat", "breaks", "drum and bass", "afrobeat", "latin percussion"] },
  { id: "organ", label: "Organ", tags: ["organ", "hammond", "hammond organ", "soul jazz"] },
  { id: "instrumental", label: "Instrumental (no vocals)", tags: ["instrumental", "instrumental hip-hop", "post-rock"] },
  { id: "acoustic", label: "Acoustic", tags: ["acoustic", "unplugged", "folk", "singer-songwriter", "acoustic guitar"] },
];

/** Tags that suggest high / low energy. Only used for songs whose audio couldn't be measured. */
export const HIGH_ENERGY = list(`
energetic, high energy, upbeat, party, dance, edm, drum and bass, dnb, jungle, techno, hardcore, punk, punk rock, metal,
heavy metal, hard rock, thrash metal, aggressive, intense, euphoric, anthemic, house, electro, big beat, garage rock, ska,
dancehall, disco, funk, grime, trap, hyperpop, rave, workout, running
`);
export const LOW_ENERGY = list(`
chill, chillout, chill out, mellow, relaxing, relax, calm, peaceful, soothing, ambient, sleep, slow, ballad, ballads,
downtempo, lo-fi, lofi, acoustic, singer-songwriter, sad, melancholic, melancholy, dreamy, ethereal, minimalism, new age,
meditation, lullaby, quiet, soft, easy listening, smooth jazz, bossa nova, slowcore, dream pop
`);

export type TagCategory = "groove" | "mood" | "vocal" | "production" | "other";

export function categorize(tag: string): TagCategory {
  if (MOOD.has(tag)) return "mood";
  if (VOCAL.has(tag)) return "vocal";
  if (PRODUCTION.has(tag)) return "production";
  if (GROOVE.has(tag)) return "groove";
  return "other";
}
