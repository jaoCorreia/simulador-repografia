// Sound design prompts for the repography's small, tactile office world.
// Durations are kept short for responsive game input and predictable generation cost.
const dry = ' Isolated close-mic game Foley, dry recording, clean background, no voices, no music. Start the sound immediately, no leading silence.';
export const audioCatalog = [
  { id: 'stapler-press', seconds: .5, prompt: 'One single firm press of a heavy vintage metal office stapler: tactile spring tension, sharp ka-chunk and a tiny spring release. One quick impact, not a sequence.' + dry },
  { id: 'stapler-jam', seconds: .85, prompt: 'A metal office stapler jams: two tense spring creaks, a dry mechanical rattle, a stuck metallic clack. Short, slightly comic mechanical failure.' + dry },
  { id: 'paper-shuffle', seconds: .75, prompt: 'A small stack of clean paper shuffled and tapped square against a wooden desk, crisp soft paper flutter and a gentle final tap.' + dry },
  { id: 'clock-in', seconds: 1.6, prompt: 'A vintage mechanical employee punch clock: at first a paper time card slides into a slot, at half a second the lever makes one firm metallic stamp clunk, followed by a short friendly confirmation bell and the card ejecting. A single compact sequence.' + dry },
  { id: 'ceramic-break', seconds: 1, prompt: 'One small ceramic coffee mug breaks on a wooden tabletop: a clear ceramic crack, followed by small pottery shards scattering and settling. Playful scale, not an explosion.' + dry },
  { id: 'object-pick', seconds: .5, prompt: 'A small wooden and plastic desk object gently lifted and set down, one soft tactile tap and tiny handling rustle. Subtle, warm, close.' + dry },
  { id: 'object-throw', seconds: .5, prompt: 'One small object quickly thrown through the air, a very short light whoosh. Only the throw whoosh, no impact.' + dry },
  { id: 'coffee-sip', seconds: 1.2, prompt: 'One small comfortable sip of hot coffee from a ceramic cup, gentle liquid sip then a delicate cup clink. No exaggerated mouth noises, no sigh, no speech.' + dry },
  { id: 'pencil-write', seconds: .85, prompt: 'A graphite pencil drawing a quick tiny smiley on a paper sticky note: short dry graphite scratches on paper, three distinct little strokes.' + dry },
  { id: 'eraser', seconds: .85, prompt: 'A rubber eraser gently rubbing a small pencil drawing off paper with three quick short back and forth strokes. Soft rubber friction and paper texture.' + dry },
  { id: 'stamp', seconds: .5, prompt: 'One wooden office rubber stamp pressed firmly onto a sheet of paper on a wooden desk. A satisfying short cushioned thump and tiny release click.' + dry },
  { id: 'desk-rattle', seconds: .8, prompt: 'A small metal pencil cup shaken once, a few wooden pencils and pens gently rattling against its rim then settling.' + dry },
  { id: 'ui-click', seconds: .5, prompt: 'One single very short soft mechanical pushbutton click from a vintage office machine. Warm tactile tick, pleasant and understated, instant attack and fast decay.' + dry },
  { id: 'success', seconds: .9, prompt: 'A tiny cheerful three-note ascending office reception bell chime, warm muted metal and playful satisfaction, clean game success cue. Short and modest, not dramatic.' + dry },
  { id: 'error', seconds: .55, prompt: 'One short soft low mechanical office buzzer, a gentle comic wrong-answer notification, rounded and muted, not harsh or alarming.' + dry },
  { id: 'complete', seconds: 1.8, prompt: 'A charming short achievement flourish made from warm office reception bells and light typewriter clicks, ascending five-note celebration for finishing a day of paperwork. Small cozy game victory cue, no orchestra.' + dry },
  { id: 'office-ambience', seconds: 8, loop: true, prompt: 'Seamlessly looping quiet small stationery office room tone: steady low ventilation fan, distant soft photocopier motor and very faint occasional wall clock ticks. Cozy calm office, unobtrusive consistent texture with no distinct beginning or ending. No speech, no people talking, no music, no loud impacts.' },
];
