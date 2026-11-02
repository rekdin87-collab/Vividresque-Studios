# AGENTS.md

## Project summary and core loop
Gather resources by day, craft better gear and build a camp with fires and walls, then survive the nights against spiders, slimes, wolves and the deadly darkness. Once you're strong enough, go after a boss to win a shard and move the story on.

## How to play / controls
Gather wood, stone, berries and gold, then craft tools, weapons and armor to survive. Keep a torch or campfire lit at night. Read the lore stones to find the three guardians, beat them for their Crown Shards and bring all three shards to the Altar where you started.
Controls: WASD/arrows: move. Left-click: gather, attack or read stones. C: crafting panel (click a recipe to craft it). 1: place campfire. 2: place wall. T: torch on/off. F: eat. M: mute.

## Important files
- `/index.html` — entry point: importmap, canvas/DOM shell, script bootstrap
- `/rosebud-game-defaults.css` — project file
- `/rosebud-game-defaults.js` — game module
- `/art_direction.md` — visual direction used for generated art
- `/sound_direction.md` — audio direction used for generated sound
- `/main.js` — game bootstrap and main loop

## Assets and audio
Images: `assets/altar.webp`, `assets/berry-bush.webp`, `assets/boss-golem.webp`, `assets/boss-treant.webp`, `assets/boss-wyrm.webp`, `assets/campfire.webp`, `assets/gold-ore.webp`, `assets/icon-armor.webp`, `assets/icon-axe.webp`, `assets/icon-berries.webp`, `assets/icon-gold.webp`, `assets/icon-meat.webp`, `assets/icon-pickaxe.webp`, `assets/icon-shard.webp`, `assets/icon-spear.webp`, `assets/icon-stone.webp`, `assets/icon-sword.webp`, `assets/icon-torch.webp`, `assets/icon-wood.webp`, `assets/lore-stone.webp`, `assets/pine-tree.webp`, `assets/player.webp`, `assets/rock.webp`, `assets/slime.webp`, `assets/spider.webp`, `assets/tree.webp`, `assets/wolf.webp`, `assets/wood-wall.webp`
Audio: `assets/audio/hit.mp3`, `assets/audio/music.mp3`, `assets/audio/pickup.mp3`
Sound direction: - Music: melancholic, mysterious chiptune/lo-fi folk loop, low energy. - SFX: punchy hit/chop impact; soft bright pickup chime.
Playback note: reference media as `assets/...`; browsers start audio only after the first user gesture.

## Notes for future edits
All the code is in main.js and uses a 1920x1080 canvas. TILE=64 and WORLD=160 tiles. The world uses seeded value-noise fbm in generateWorld(). Objects are kept in a grid (world.objs) and creatures in state.enemies (bosses have boss:true). Recipes live in the RECIPES array and enemy stats in ENEMY_DEFS. A day lasts DAY_LENGTH=240s.

## Final validation status
Static: 0 blocking, 14 advisory; overall clean. Runtime behavior was not checked during generation.
Finished via the `finish` tool.
