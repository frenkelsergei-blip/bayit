# My Hero virtual home assets

Original generated Bayit artwork, made with the built-in image_gen tool. These are fictional game characters and scenes, with no downloaded character pack or replacement emoji artwork. Existing Nunito Sans/Heebo, Phosphor and OpenMoji notices remain in assets/ATTRIBUTION.md.

- `room.png`: the 1200×800 room; `room-care.png`: matching compositing room with empty bed/shower positions so an animated scene does not create duplicate furniture. Full original sources are retained.
- Twelve new inventory sprites: crown, pirate, space, explorer, flowers, robot, wand, magnifier, kite, paintbrush, telescope and headphones. The existing generated collection supplies the other shop items.
- `care/`: all eight children × eating/showering/sleeping × three frames = 72 production frames, exported as 24 RGBA PNG strips (768×256). The child is seated behind a table, behind a shower curtain, or covered to the chin in bed. Equipment remains owned and is displayed beside the care scene.
- `meal-rice.png`, `meal-vegetables.png`, `meal-yogurt.png`: three generic meal examples. The player’s purchased food determines the example; the initial rice bowl is not a fixed cake.
- The care source atlas and props atlas have a flat magenta background. FFmpeg RGB colorkey removes the actual sampled matte; alpha, remaining magenta, three distinct frame positions and clipping are verified in the browser. See [FFmpeg’s colorkey reference](https://www.ffmpeg.org/ffmpeg-filters.html#colorkey).
- Prompts: [prompts.md](prompts.md). Processing: work/prepare-hero-care-scenes.mjs and work/prepare-hero-care-props.mjs. Runtime copies live in app/public/assets/generated/hero-home.
- `market*` and `moon-garden*` are retained studies for the separately requested games, deferred until the Tamagotchi review. They are not enabled game features in this increment.

This provenance notice does not assert exclusive copyright in generated output. No asset license or attribution was removed.


The later supermarket, puzzle and rhythm increment is excluded from version1.18.0 pending visual review. The production virtual home and its original care assets remain included. Product studies do not imply an enabled game feature.
