// Precise genres. Each subgenre is defined by the Discogs styles that describe it (curated per album by Discogs
// editors, so "Hard Bop" really means hard bop) and by the Last.fm listener tags people use for it. A song only
// counts as part of a subgenre when its artist passes one of those checks (see genre.ts), so loosely applied
// tags ("jazz fusion" on anything with a saxophone) no longer let unrelated music in.
//
// Shared by server and client: no imports.

export interface Subgenre {
  id: string;
  name: string;
  family: string;
  /** Last.fm tags, most specific first. The first is the main one. */
  lastfm: string[];
  /** Discogs style names (exact spelling). Empty when Discogs has no matching style. */
  discogs: string[];
  /** One short line for the picker. */
  hint?: string;
  /** Discogs genre the styles must be under, for styles shared by several genres ("Psychedelic", "Minimal"). */
  dgGenre?: string;
  /** Discogs release country, for styles that span several countries ("Chanson"). */
  dgCountry?: string;
}

export interface Family {
  id: string;
  name: string;
}

export const FAMILIES: Family[] = [
  { id: "jazz", name: "Jazz" },
  { id: "soul", name: "Soul, Funk & R&B" },
  { id: "hiphop", name: "Hip-hop" },
  { id: "electronic", name: "Electronic" },
  { id: "dance", name: "House, Techno & Dance" },
  { id: "ambient", name: "Ambient & Experimental" },
  { id: "rock", name: "Rock" },
  { id: "indie", name: "Indie & Alternative" },
  { id: "punk", name: "Punk & Hardcore" },
  { id: "metal", name: "Metal" },
  { id: "pop", name: "Pop" },
  { id: "folk", name: "Folk & Country" },
  { id: "blues", name: "Blues" },
  { id: "reggae", name: "Reggae & Caribbean" },
  { id: "latin", name: "Latin" },
  { id: "brazil", name: "Brazilian" },
  { id: "africa", name: "African" },
  { id: "world", name: "Asia & Middle East" },
  { id: "classical", name: "Classical" },
];

const S = (family: string, name: string, lastfm: string[], discogs: string[], hint?: string, dgGenre?: string): Subgenre => ({
  id: `${family}-${name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
  name,
  family,
  lastfm,
  discogs,
  hint,
  dgGenre,
});

export const SUBGENRES: Subgenre[] = [
  // Jazz
  S("jazz", "Bebop", ["bebop", "bop"], ["Bop"], "Fast, virtuosic 1940s small groups"),
  S("jazz", "Hard Bop", ["hard bop"], ["Hard Bop"], "Bluesy, driving 1950s–60s Blue Note sound"),
  S("jazz", "Cool Jazz", ["cool jazz", "west coast jazz"], ["Cool Jazz"], "Relaxed, airy, understated"),
  S("jazz", "Modal Jazz", ["modal jazz"], ["Modal"], "Built on scales rather than chord changes"),
  S("jazz", "Post-Bop", ["post-bop", "post bop"], ["Post Bop"], "1960s onward, open harmony"),
  S("jazz", "Free Jazz", ["free jazz", "avant-garde jazz"], ["Free Jazz", "Avant-garde Jazz"], "Free form, avant-garde"),
  S("jazz", "Spiritual Jazz", ["spiritual jazz"], ["Spiritual Jazz"], "Meditative, cosmic, devotional"),
  S("jazz", "Soul-Jazz", ["soul jazz", "soul-jazz"], ["Soul-Jazz"], "Organ grooves, gospel and blues feel"),
  S("jazz", "Jazz-Funk", ["jazz funk", "jazz-funk"], ["Jazz-Funk"], "Funk rhythms, electric keys"),
  S("jazz", "Jazz-Rock & Fusion", ["jazz fusion", "jazz-rock", "fusion"], ["Fusion", "Jazz-Rock"], "Electric, rock energy, complex"),
  S("jazz", "Latin Jazz", ["latin jazz", "afro-cuban jazz"], ["Latin Jazz", "Afro-Cuban Jazz"], "Afro-Cuban rhythms"),
  S("jazz", "Vocal Jazz", ["vocal jazz", "jazz vocal"], ["Vocal"], "Singers and standards", "Jazz"),
  S("jazz", "Big Band & Swing", ["big band", "swing"], ["Big Band", "Swing"], "1930s–40s orchestras"),
  S("jazz", "Smooth Jazz", ["smooth jazz"], ["Smooth Jazz"], "Polished, radio-friendly"),
  S("jazz", "Contemporary Jazz", ["contemporary jazz", "modern jazz"], ["Contemporary Jazz"], "Today's jazz"),
  S("jazz", "Nu Jazz & Acid Jazz", ["nu jazz", "acid jazz"], ["Future Jazz", "Acid Jazz"], "Jazz meets club music"),
  S("jazz", "Ethio-Jazz", ["ethio-jazz", "ethiojazz"], [], "Ethiopian scales, 1970s Addis"),
  S("jazz", "Dixieland & Early Jazz", ["dixieland", "early jazz", "new orleans jazz"], ["Dixieland"], "New Orleans, 1920s"),

  // Soul, funk & R&B
  S("soul", "Classic Soul", ["soul", "classic soul"], ["Soul"], "1960s–70s soul"),
  S("soul", "Northern Soul", ["northern soul"], [], "Uptempo, Motown-style rarities"),
  S("soul", "Southern Soul", ["southern soul", "memphis soul"], ["Southern Soul"], "Stax, Muscle Shoals"),
  S("soul", "Psychedelic Soul", ["psychedelic soul"], ["Psychedelic"], "Late-60s experimental soul", "Funk / Soul"),
  S("soul", "Funk", ["funk"], ["Funk"], "Tight grooves, the one"),
  S("soul", "P-Funk", ["p-funk", "p funk"], ["P.Funk"], "Parliament-Funkadelic universe"),
  S("soul", "Boogie", ["boogie", "post-disco"], ["Boogie"], "Early-80s synth funk"),
  S("soul", "Disco", ["disco"], ["Disco"], "Four-on-the-floor, strings"),
  S("soul", "Neo-Soul", ["neo-soul", "neo soul"], ["Neo Soul"], "90s onward, jazz and hip-hop touches"),
  S("soul", "Contemporary R&B", ["rnb", "r&b", "contemporary r&b"], ["Contemporary R&B"], "Modern R&B"),
  S("soul", "New Jack Swing", ["new jack swing"], ["Swingbeat"], "Late-80s R&B meets hip-hop"),
  S("soul", "Rhythm & Blues", ["rhythm and blues"], ["Rhythm & Blues"], "1940s–50s R&B"),
  S("soul", "Gospel", ["gospel"], ["Gospel"], "Church music"),
  S("soul", "Afro-Funk", ["afro-funk", "afrofunk"], ["Afrobeat"], "Funk with African rhythms", "Funk / Soul"),

  // Hip-hop
  S("hiphop", "Boom Bap", ["boom bap"], ["Boom Bap"], "Sampled drums, 90s East Coast"),
  S("hiphop", "Jazz Rap", ["jazz rap", "jazz hop", "jazzy hip-hop"], ["Jazzy Hip-Hop"], "Jazz samples, laid back"),
  S("hiphop", "Conscious Hip-hop", ["conscious hip hop", "conscious"], ["Conscious"], "Socially aware lyrics"),
  S("hiphop", "Gangsta & G-Funk", ["g-funk", "gangsta rap", "west coast rap"], ["G-Funk", "Gangsta"], "West Coast, synth bass"),
  S("hiphop", "Hardcore Hip-hop", ["hardcore hip hop"], ["Hardcore Hip-Hop"], "Aggressive, raw"),
  S("hiphop", "Trap", ["trap"], ["Trap"], "808s, hi-hat rolls"),
  S("hiphop", "Drill", ["drill", "uk drill"], ["Drill"], "Dark, sliding 808s"),
  S("hiphop", "Cloud Rap", ["cloud rap"], ["Cloud Rap"], "Hazy, atmospheric"),
  S("hiphop", "Instrumental Hip-hop", ["instrumental hip-hop", "instrumental hip hop", "beats"], ["Instrumental"], "Beats without vocals", "Hip Hop"),
  S("hiphop", "Abstract Hip-hop", ["abstract hip-hop", "abstract hip hop", "experimental hip hop"], ["Abstract"], "Leftfield, experimental", "Hip Hop"),
  S("hiphop", "Grime", ["grime"], ["Grime"], "UK, 140 bpm"),
  S("hiphop", "Southern Hip-hop", ["southern rap", "dirty south"], ["Crunk", "Bounce"], "Atlanta, Houston, New Orleans"),
  S("hiphop", "Pop Rap", ["pop rap"], ["Pop Rap"], "Radio hip-hop"),

  // Electronic (listening)
  S("electronic", "Downtempo", ["downtempo", "chillout"], ["Downtempo"], "Slow, mellow beats"),
  S("electronic", "Trip-hop", ["trip-hop", "trip hop"], ["Trip Hop"], "Bristol, dark breakbeats"),
  S("electronic", "IDM", ["idm"], ["IDM"], "Warp-style, intricate"),
  S("electronic", "Synth-pop", ["synthpop", "synth-pop"], ["Synth-pop"], "Synthesizers and hooks"),
  S("electronic", "Darkwave & Coldwave", ["darkwave", "coldwave", "minimal wave"], ["Darkwave", "Coldwave", "Minimal Wave"], "Cold, gothic synths"),
  S("electronic", "Electro", ["electro"], ["Electro"], "Robotic funk, 808s"),
  S("electronic", "Chillwave", ["chillwave"], ["Chillwave"], "Hazy, nostalgic synths"),
  S("electronic", "Vaporwave", ["vaporwave"], ["Vaporwave"], "Slowed 80s samples"),
  S("electronic", "Synthwave", ["synthwave", "retrowave", "outrun"], ["Synthwave"], "80s soundtrack revival"),
  S("electronic", "Glitch", ["glitch"], ["Glitch"], "Clicks, cuts, errors"),
  S("electronic", "Leftfield", ["leftfield", "electronica"], ["Leftfield"], "Experimental electronic"),
  S("electronic", "Krautrock & Kosmische", ["krautrock", "kosmische musik"], ["Krautrock", "Berlin-School"], "German motorik and cosmic synths"),

  // House, techno & dance
  S("dance", "Deep House", ["deep house"], ["Deep House"], "Warm, soulful house"),
  S("dance", "Chicago House", ["chicago house"], ["House"], "The original house sound"),
  S("dance", "Acid House", ["acid house"], ["Acid House"], "TB-303 squelch"),
  S("dance", "Tech House", ["tech house"], ["Tech House"], "House with techno drive"),
  S("dance", "Techno", ["techno", "detroit techno"], ["Techno"], "Detroit, Berlin, the machine groove"),
  S("dance", "Minimal Techno", ["minimal techno", "minimal"], ["Minimal"], "Stripped back, hypnotic", "Electronic"),
  S("dance", "Dub Techno", ["dub techno"], ["Dub Techno"], "Echoing chords, Basic Channel"),
  S("dance", "Drum and Bass", ["drum and bass", "dnb", "liquid funk"], ["Drum n Bass"], "Fast breakbeats, heavy bass"),
  S("dance", "Jungle", ["jungle"], ["Jungle"], "Chopped breaks, ragga"),
  S("dance", "UK Garage", ["uk garage", "2-step", "speed garage"], ["UK Garage", "Speed Garage"], "Shuffling 2-step"),
  S("dance", "Dubstep", ["dubstep"], ["Dubstep"], "Half-step, sub bass"),
  S("dance", "Breakbeat", ["breakbeat", "big beat"], ["Breakbeat", "Big Beat"], "Broken beats"),
  S("dance", "Footwork", ["footwork", "juke"], ["Footwork", "Juke"], "Chicago, 160 bpm"),
  S("dance", "Trance", ["trance", "progressive trance"], ["Trance", "Progressive Trance"], "Euphoric builds"),
  S("dance", "Nu-Disco & Disco House", ["nu disco", "nu-disco", "disco house"], ["Nu-Disco", "Disco"], "Modern disco"),
  S("dance", "Italo-Disco", ["italo disco", "italo-disco"], ["Italo-Disco"], "80s European synth disco"),
  S("dance", "Hardcore & Gabber", ["hardcore techno", "gabber"], ["Hardcore", "Gabber"], "Very fast and hard", "Electronic"),

  // Ambient & experimental
  S("ambient", "Ambient", ["ambient"], ["Ambient"], "Atmosphere over rhythm"),
  S("ambient", "Dark Ambient", ["dark ambient"], ["Dark Ambient"], "Ominous, cinematic"),
  S("ambient", "Drone", ["drone"], ["Drone"], "Sustained tones"),
  S("ambient", "New Age", ["new age"], ["New Age"], "Calm, meditative"),
  S("ambient", "Modern Classical", ["modern classical", "neoclassical", "contemporary classical"], ["Neo-Classical", "Contemporary"], "Piano and strings, today", "Classical"),
  S("ambient", "Minimalism", ["minimalism", "minimal music"], ["Minimal"], "Reich, Glass, repetition", "Classical"),
  S("ambient", "Musique Concrète", ["musique concrete", "sound collage"], ["Musique Concrète", "Sound Collage"], "Recorded sounds as music"),
  S("ambient", "Noise", ["noise", "harsh noise"], ["Noise"], "Texture and volume"),
  S("ambient", "Industrial", ["industrial"], ["Industrial"], "Mechanical, abrasive"),

  // Rock
  S("rock", "Classic Rock", ["classic rock"], ["Classic Rock"], "60s–70s rock radio"),
  S("rock", "Hard Rock", ["hard rock"], ["Hard Rock"], "Big riffs"),
  S("rock", "Psychedelic Rock", ["psychedelic rock", "psychedelic"], ["Psychedelic Rock"], "Trippy, 60s onward", "Rock"),
  S("rock", "Progressive Rock", ["progressive rock", "prog rock"], ["Prog Rock"], "Long, complex compositions"),
  S("rock", "Art Rock", ["art rock"], ["Art Rock"], "Ambitious, experimental"),
  S("rock", "Garage Rock", ["garage rock", "garage"], ["Garage Rock"], "Raw, lo-fi, 60s spirit"),
  S("rock", "Blues Rock", ["blues rock"], ["Blues Rock"], "Electric blues, louder"),
  S("rock", "Southern Rock", ["southern rock"], ["Southern Rock"], "Twin guitars, the American South"),
  S("rock", "Stoner Rock", ["stoner rock", "desert rock"], ["Stoner Rock"], "Fuzzed-out, heavy and slow"),
  S("rock", "Surf Rock", ["surf rock", "surf"], ["Surf"], "Reverb guitar"),
  S("rock", "Rock & Roll", ["rock and roll", "rockabilly"], ["Rock & Roll", "Rockabilly"], "1950s"),
  S("rock", "Glam Rock", ["glam rock"], ["Glam"], "Glitter, stomp"),

  // Indie & alternative
  S("indie", "Indie Rock", ["indie rock"], ["Indie Rock"], "Guitar bands, independent spirit"),
  S("indie", "Indie Pop", ["indie pop"], ["Indie Pop"], "Melodic, jangly"),
  S("indie", "Alternative Rock", ["alternative rock", "alternative"], ["Alternative Rock"], "90s college radio onward"),
  S("indie", "Shoegaze", ["shoegaze"], ["Shoegaze"], "Walls of guitar haze"),
  S("indie", "Dream Pop", ["dream pop"], ["Dream Pop"], "Ethereal, reverb-drenched"),
  S("indie", "Post-Punk", ["post-punk", "post punk"], ["Post-Punk"], "Angular, dark, 1978 onward"),
  S("indie", "New Wave", ["new wave"], ["New Wave"], "Late 70s–80s"),
  S("indie", "Post-Rock", ["post-rock", "post rock"], ["Post Rock"], "Instrumental crescendos"),
  S("indie", "Math Rock", ["math rock"], ["Math Rock"], "Odd time signatures"),
  S("indie", "Grunge", ["grunge"], ["Grunge"], "Seattle, early 90s"),
  S("indie", "Britpop", ["britpop"], ["Britpop"], "90s British guitar pop"),
  S("indie", "Lo-fi", ["lo-fi", "lofi"], ["Lo-Fi"], "Home recorded"),
  S("indie", "Slowcore", ["slowcore", "sadcore"], ["Slowcore"], "Slow, quiet, sad"),
  S("indie", "Noise Rock", ["noise rock"], ["Noise"], "Abrasive guitars", "Rock"),

  // Punk & hardcore
  S("punk", "Punk Rock", ["punk rock", "punk"], ["Punk"], "Fast, loud, short"),
  S("punk", "Hardcore Punk", ["hardcore punk", "hardcore"], ["Hardcore"], "Faster and harder", "Rock"),
  S("punk", "Pop Punk", ["pop punk"], ["Pop Punk"], "Punk with hooks"),
  S("punk", "Emo", ["emo", "midwest emo"], ["Emo"], "Emotional, 90s basements"),
  S("punk", "Post-Hardcore", ["post-hardcore"], ["Post-Hardcore"], "Hardcore, more dynamic"),
  S("punk", "Ska Punk", ["ska punk"], ["Ska"], "Punk with ska upstrokes", "Rock"),

  // Metal
  S("metal", "Heavy Metal", ["heavy metal"], ["Heavy Metal"], "Classic metal"),
  S("metal", "Thrash Metal", ["thrash metal"], ["Thrash"], "Fast riffing, 80s Bay Area"),
  S("metal", "Death Metal", ["death metal"], ["Death Metal"], "Growled, down-tuned"),
  S("metal", "Black Metal", ["black metal"], ["Black Metal"], "Tremolo riffs, raw"),
  S("metal", "Doom Metal", ["doom metal"], ["Doom Metal"], "Slow and crushing"),
  S("metal", "Sludge Metal", ["sludge metal", "sludge"], ["Sludge Metal"], "Doom meets hardcore"),
  S("metal", "Progressive Metal", ["progressive metal"], [], "Technical, long-form"),
  S("metal", "Post-Metal", ["post-metal"], ["Post-Metal"], "Heavy and atmospheric"),
  S("metal", "Metalcore", ["metalcore"], ["Metalcore"], "Metal meets hardcore"),
  S("metal", "Nu Metal", ["nu metal"], ["Nu Metal"], "Late-90s downtuned rap-metal"),
  S("metal", "Power Metal", ["power metal"], ["Power Metal"], "Fast, melodic, epic"),

  // Pop
  S("pop", "Dance-pop", ["dance-pop", "dance pop"], [], "Club-ready pop"),
  S("pop", "Art Pop", ["art pop"], [], "Experimental pop"),
  S("pop", "Baroque Pop", ["baroque pop", "chamber pop"], ["Baroque Pop", "Chamber Pop"], "Strings, harpsichord, orchestration"),
  S("pop", "Sunshine & Sixties Pop", ["sunshine pop", "60s pop"], ["Sunshine Pop"], "Harmonies, bright"),
  S("pop", "Hyperpop", ["hyperpop"], ["Hyperpop"], "Maximal, glitchy"),
  S("pop", "Bedroom Pop", ["bedroom pop"], [], "Home-made, intimate"),
  S("pop", "City Pop", ["city pop"], ["City Pop"], "80s Japan, glossy"),
  S("pop", "J-pop", ["j-pop", "jpop"], ["J-pop"], "Japanese pop"),
  S("pop", "K-pop", ["k-pop", "kpop"], ["K-pop"], "Korean pop"),
  { ...S("pop", "Chanson", ["chanson", "chanson francaise"], ["Chanson"], "French song"), dgCountry: "France" },
  { ...S("pop", "Yé-yé & French Pop", ["french pop", "ye-ye", "yé-yé"], ["Chanson"], "60s French pop"), dgCountry: "France" },
  S("pop", "Soft Rock & Yacht Rock", ["soft rock", "yacht rock"], ["Soft Rock", "AOR"], "Smooth late-70s"),

  // Folk & country
  S("folk", "Folk", ["folk", "contemporary folk"], ["Folk"], "Acoustic songs and storytelling"),
  S("folk", "Singer-Songwriter", ["singer-songwriter"], [], "Intimate, lyric-first"),
  S("folk", "Folk Rock", ["folk rock"], ["Folk Rock"], "Folk with a band"),
  S("folk", "Psychedelic Folk", ["psychedelic folk", "psych folk", "freak folk"], ["Psychedelic"], "Trippy acoustic", "Folk, World, & Country"),
  S("folk", "Indie Folk", ["indie folk"], [], "Modern, hushed folk"),
  S("folk", "Country", ["country", "classic country"], ["Country"], "Nashville tradition"),
  S("folk", "Outlaw & Alt-Country", ["alt-country", "outlaw country", "americana"], ["Country Rock"], "Rougher, rootsier country"),
  S("folk", "Bluegrass", ["bluegrass"], ["Bluegrass"], "Banjo, fiddle, harmonies"),
  S("folk", "Celtic", ["celtic", "irish folk"], ["Celtic"], "Irish and Scottish tradition"),

  // Blues
  S("blues", "Delta Blues", ["delta blues"], ["Delta Blues"], "Acoustic, Mississippi"),
  S("blues", "Chicago Blues", ["chicago blues"], ["Chicago Blues"], "Electric, amplified"),
  S("blues", "Electric Blues", ["electric blues"], ["Electric Blues"], "Guitar-led"),
  S("blues", "Country Blues", ["country blues", "acoustic blues"], ["Country Blues"], "Rural, acoustic"),
  S("blues", "Desert Blues", ["desert blues", "tuareg"], [], "Tuareg guitar from the Sahara"),

  // Reggae & Caribbean
  S("reggae", "Roots Reggae", ["roots reggae"], ["Roots Reggae"], "Conscious 70s reggae"),
  S("reggae", "Dub", ["dub"], ["Dub"], "Echo, bass, remixes"),
  S("reggae", "Ska", ["ska"], ["Ska"], "Early 60s Jamaica"),
  S("reggae", "Rocksteady", ["rocksteady"], ["Rocksteady"], "Slower, soulful, late 60s"),
  S("reggae", "Dancehall", ["dancehall"], ["Dancehall"], "Digital riddims"),
  S("reggae", "Lovers Rock", ["lovers rock"], ["Lovers Rock"], "Romantic UK reggae"),
  S("reggae", "Calypso & Soca", ["calypso", "soca"], ["Calypso", "Soca"], "Trinidad"),

  // Latin
  S("latin", "Salsa", ["salsa"], ["Salsa"], "New York and Cuban dance music"),
  S("latin", "Boogaloo", ["boogaloo", "latin soul"], ["Boogaloo"], "Latin soul, 60s New York"),
  S("latin", "Cuban Son", ["son cubano", "cuban"], ["Son", "Afro-Cuban"], "Cuba's roots"),
  S("latin", "Cumbia", ["cumbia"], ["Cumbia"], "Colombian rhythm, everywhere"),
  S("latin", "Bolero", ["bolero"], ["Bolero"], "Romantic ballads"),
  S("latin", "Tango", ["tango", "nuevo tango"], ["Tango"], "Argentina"),
  S("latin", "Reggaeton", ["reggaeton"], ["Reggaeton"], "Dembow rhythm"),
  S("latin", "Bachata & Merengue", ["bachata", "merengue"], ["Bachata", "Merengue"], "Dominican"),
  S("latin", "Chicha & Psychedelic Cumbia", ["chicha", "psychedelic cumbia"], [], "Peruvian surf-guitar cumbia"),

  // Brazilian
  S("brazil", "Bossa Nova", ["bossa nova"], ["Bossa Nova"], "Gentle, late-50s Rio"),
  S("brazil", "MPB", ["mpb"], ["MPB"], "Brazilian popular song"),
  S("brazil", "Samba", ["samba"], ["Samba"], "Brazil's rhythm"),
  S("brazil", "Tropicália", ["tropicalia", "tropicália"], [], "Late-60s psychedelic Brazil"),
  S("brazil", "Samba-Funk & Brazilian Boogie", ["samba soul", "brazilian funk"], [], "70s Brazilian grooves"),
  S("brazil", "Baile Funk", ["baile funk", "funk carioca"], [], "Rio favela bass"),

  // African
  S("africa", "Afrobeat", ["afrobeat"], ["Afrobeat"], "Fela, horns, long grooves"),
  S("africa", "Afrobeats", ["afrobeats", "afropop"], [], "Modern West African pop"),
  S("africa", "Highlife", ["highlife"], ["Highlife"], "Ghana and Nigeria, guitars and horns"),
  S("africa", "Juju", ["juju"], [], "Yoruba guitar music"),
  S("africa", "Soukous & Congolese Rumba", ["soukous", "congolese rumba"], ["Soukous", "Rumba"], "Sweet Congolese guitars"),
  S("africa", "Mbalax", ["mbalax"], ["Mbalax"], "Senegal"),
  S("africa", "Amapiano", ["amapiano"], ["Amapiano"], "South African log drums"),
  S("africa", "Mandé & Malian", ["mande", "malian", "mali"], [], "Mali, Guinea, kora"),

  // Asia & Middle East
  S("world", "Anatolian Rock", ["anatolian rock", "turkish psychedelic"], [], "Turkish psych"),
  S("world", "Bollywood & Filmi", ["bollywood", "filmi"], ["Bollywood"], "Indian film songs"),
  S("world", "Hindustani Classical", ["hindustani classical", "indian classical"], ["Hindustani"], "Ragas, sitar, tabla"),
  S("world", "Arabic & Raï", ["rai", "arabic"], ["Raï"], "North Africa and the Middle East"),
  S("world", "Thai Funk & Luk Thung", ["luk thung", "thai funk"], ["Luk Thung", "Mo Lam"], "Thai country and funk"),
  S("world", "Enka & Kayōkyoku", ["enka", "kayokyoku"], ["Enka", "Kayōkyoku"], "Japanese song"),

  // Classical
  S("classical", "Baroque", ["baroque"], ["Baroque"], "Bach, Vivaldi, 1600–1750"),
  S("classical", "Classical Period", ["classical period"], ["Classical"], "Mozart, Haydn", "Classical"),
  S("classical", "Romantic", ["romantic", "romanticism"], ["Romantic"], "Chopin, Brahms, Tchaikovsky", "Classical"),
  S("classical", "Impressionist", ["impressionism", "impressionist"], ["Impressionist"], "Debussy, Ravel"),
  S("classical", "20th-Century Classical", ["20th century classical", "modern classical"], ["Modern"], "Stravinsky onward", "Classical"),
  S("classical", "Opera", ["opera"], ["Opera"], "Voices and drama"),
  S("classical", "Soundtracks & Score", ["soundtrack", "film score"], ["Score", "Soundtrack"], "Film and TV music"),
];

const BY_ID = new Map(SUBGENRES.map((s) => [s.id, s]));

export function subgenre(id: string): Subgenre | undefined {
  return BY_ID.get(id);
}

/**
 * Turns what was saved or typed into subgenres. Accepts ids ("jazz-hard-bop"), names ("Hard Bop") and plain Last.fm
 * tags ("hard bop"). Anything unknown becomes an ad-hoc genre checked with its Last.fm tag only.
 */
export function resolveGenre(input: string): Subgenre {
  const q = input.trim().toLowerCase();
  const hit =
    BY_ID.get(q) ??
    SUBGENRES.find((s) => s.name.toLowerCase() === q) ??
    SUBGENRES.find((s) => s.lastfm[0] === q) ??
    SUBGENRES.find((s) => s.lastfm.includes(q));
  return hit ?? { id: q, name: q.replace(/\b\w/g, (c) => c.toUpperCase()), family: "", lastfm: [q], discogs: [] };
}

/** Old saved settings had one free-text genre; new ones have up to 5 ids. */
export function genresOf(s: { genres?: string[]; genre?: string }): string[] {
  if (s.genres?.length) return s.genres;
  return s.genre?.trim() ? [resolveGenre(s.genre).id] : [];
}

export function genreNames(ids: string[]): string {
  const names = ids.map((id) => resolveGenre(id).name);
  return names.length <= 2 ? names.join(" & ") : `${names.slice(0, 2).join(", ")} + ${names.length - 2} more`;
}
